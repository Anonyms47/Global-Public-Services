import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import type { Db } from "../db/client";
import { can, type Permission, type Role } from "@/lib/permissions";
import { AppError, fail, newId } from "./errors";

const scrypt = promisify(scryptCb) as (
  pw: string,
  salt: Buffer,
  len: number,
  opts?: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;
const scryptOpts = (N: number, r: number, p: number) => ({ N, r, p, maxmem: 256 * N * r });

export const SESSION_HOURS = 12;
/** Session fermée après cette inactivité, même avant son expiration. */
export const SESSION_IDLE_MINUTES = 120;
/** Limitation des connexions : échecs tolérés par identifiant et par adresse IP sur la fenêtre. */
export const LOGIN_WINDOW_MINUTES = 15;
export const LOGIN_MAX_FAILURES_PER_ID = 5;
export const LOGIN_MAX_FAILURES_PER_IP = 20;
export const MIN_PASSWORD = 10;

/** Paramètres scrypt (N = 2^15) ; les anciennes empreintes, aux paramètres par défaut, restent lisibles et sont mises à niveau à la connexion. */
const SCRYPT = { N: 32768, r: 8, p: 1 };

/** Identifiant de connexion accepté : e-mail ou identifiant simple (ex. « Ndiogou »). */
export function isLoginId(value: string) {
  const v = value.trim();
  return /^\S+@\S+\.\S+$/.test(v) || /^[\p{L}\p{N}][\p{L}\p{N}._-]{2,39}$/u.test(v);
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  is_demo: boolean;
  /** Compte de démonstration bridé (démonstration protégée en production). */
  restricted?: boolean;
  /** Mot de passe provisoire : à changer avant toute autre action. */
  must_change_password?: boolean;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const { N, r, p } = SCRYPT;
  const key = await scrypt(password, salt, 64, scryptOpts(N, r, p));
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Empreinte au format ancien (paramètres par défaut) : à recalculer. */
export const needsRehash = (stored: string) => stored.split("$").length !== 6;

export async function verifyPassword(password: string, stored: string) {
  const parts = stored.split("$");
  if (parts[0] !== "scrypt") return false;
  // Ancien format : scrypt$sel$clé (N = 16384, r = 8, p = 1).
  const [N, r, p, saltHex, keyHex] =
    parts.length === 6
      ? [Number(parts[1]), Number(parts[2]), Number(parts[3]), parts[4], parts[5]]
      : [16384, 8, 1, parts[1], parts[2]];
  if (!saltHex || !keyHex || !(N > 1 && r > 0 && p > 0) || N > 1 << 20) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64, scryptOpts(N, r, p));
  const expected = Buffer.from(keyHex, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

const DUMMY_HASH = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$00$00`;

/**
 * Limitation des connexions : au-delà de 5 échecs pour un identifiant (ou 20
 * pour une adresse IP) en 15 minutes, les essais sont refusés sans même
 * vérifier le mot de passe, jusqu'à ce que la fenêtre se libère.
 */
export async function assertNotThrottled(db: Db, identifier: string, ip: string) {
  const row = await db.one<{ by_id: number; by_ip: number; oldest: Date | null }>(
    `select count(*) filter (where identifier = $1)::int as by_id,
            count(*) filter (where ip = $2 and $2 <> '')::int as by_ip,
            min(created_at) filter (where identifier = $1 or (ip = $2 and $2 <> '')) as oldest
       from login_attempts
      where not success and created_at > now() - make_interval(mins => $3)`,
    [identifier, ip, LOGIN_WINDOW_MINUTES],
  );
  if (row && (row.by_id >= LOGIN_MAX_FAILURES_PER_ID || row.by_ip >= LOGIN_MAX_FAILURES_PER_IP)) {
    const wait = row.oldest
      ? Math.max(1, Math.ceil((new Date(row.oldest).getTime() + LOGIN_WINDOW_MINUTES * 60_000 - Date.now()) / 60_000))
      : LOGIN_WINDOW_MINUTES;
    fail("forbidden", `Trop de tentatives. Réessayez dans ${wait} minute${wait > 1 ? "s" : ""}.`);
  }
}

export async function recordAttempt(db: Db, identifier: string, ip: string, success: boolean) {
  if (success) {
    await db.query("delete from login_attempts where identifier = $1 and not success", [identifier]);
  } else {
    await db.query("insert into login_attempts (id, identifier, ip, success) values ($1, $2, $3, false)", [
      newId(),
      identifier,
      ip,
    ]);
  }
  await db.query("delete from login_attempts where created_at < now() - interval '1 day'");
}

async function openSession(db: Db, userId: string, userAgent = "") {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await db.query("insert into sessions (id, user_id, expires_at, user_agent) values ($1, $2, $3, $4)", [
    tokenHash(token),
    userId,
    expires,
    userAgent.slice(0, 200),
  ]);
  await db.query("delete from sessions where expires_at < now()");
  return { token, expires };
}

export async function login(
  db: Db,
  email: string,
  password: string,
  opts: { allowDemo: boolean; ip?: string; userAgent?: string },
) {
  const identifier = email.trim().toLowerCase();
  const ip = opts.ip ?? "";
  await assertNotThrottled(db, identifier, ip);
  const row = await db.one<User & { password_hash: string }>("select * from users where lower(email) = $1", [
    identifier,
  ]);
  // Vérification systématique pour ne pas révéler l'existence d'un compte par le temps de réponse.
  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok || !row.active) {
    await recordAttempt(db, identifier, ip, false);
    fail("validation", "Identifiant ou mot de passe incorrect.");
  }
  if (row!.is_demo && !opts.allowDemo) {
    fail("forbidden", "Les comptes de démonstration sont désactivés sur cette installation.");
  }
  await recordAttempt(db, identifier, ip, true);
  if (needsRehash(row!.password_hash)) {
    await db.query("update users set password_hash = $2 where id = $1", [row!.id, await hashPassword(password)]);
  }
  const session = await openSession(db, row!.id, opts.userAgent);
  return { ...session, mustChangePassword: !!row!.must_change_password };
}

export async function logout(db: Db, token: string) {
  await db.query("delete from sessions where id = $1", [tokenHash(token)]);
}

export async function userFromToken(db: Db, token: string | undefined, opts: { allowDemo: boolean }) {
  if (!token) return null;
  const user = await db.one<User & { touch: boolean }>(
    `select u.id, u.name, u.email, u.role, u.active, u.is_demo, u.must_change_password,
            s.last_seen_at < now() - interval '5 minutes' as touch
       from sessions s join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now() and u.active
        and s.last_seen_at > now() - make_interval(mins => $2)`,
    [tokenHash(token), SESSION_IDLE_MINUTES],
  );
  if (user?.is_demo && !opts.allowDemo) return null;
  if (!user) return null;
  // Activité enregistrée au plus toutes les 5 minutes : prolonge la session inactive.
  if (user.touch) await db.query("update sessions set last_seen_at = now() where id = $1", [tokenHash(token)]);
  const { touch: _touch, ...rest } = user;
  return rest;
}

// ——— Mon compte : mot de passe et appareils connectés ———

export interface SessionInfo {
  id: string;
  current: boolean;
  user_agent: string;
  created_at: Date;
  last_seen_at: Date;
}

export async function listSessions(db: Db, userId: string, token: string) {
  const rows = await db.query<Omit<SessionInfo, "current"> & { id: string }>(
    `select id, user_agent, created_at, last_seen_at from sessions
      where user_id = $1 and expires_at > now() and last_seen_at > now() - make_interval(mins => $2)
      order by last_seen_at desc`,
    [userId, SESSION_IDLE_MINUTES],
  );
  const mine = tokenHash(token);
  return rows.map((r) => ({ ...r, id: r.id.slice(0, 8), current: r.id === mine }));
}

/** Ferme toutes les sessions de l'utilisateur sauf celle en cours. */
export async function revokeOtherSessions(db: Db, userId: string, token: string) {
  const res = await db.query<{ id: string }>("delete from sessions where user_id = $1 and id <> $2 returning id", [
    userId,
    tokenHash(token),
  ]);
  return res.length;
}

/**
 * Changement de son propre mot de passe : l'ancien est exigé, le nouveau doit
 * être différent ; les autres appareils sont déconnectés.
 */
export async function changeOwnPassword(
  db: Db,
  user: User,
  token: string,
  input: { current: string; password: string; confirm: string },
) {
  const row = await db.one<{ password_hash: string }>("select password_hash from users where id = $1", [user.id]);
  if (!row || !(await verifyPassword(input.current, row.password_hash))) {
    fail("validation", "Mot de passe actuel incorrect.", { current: "Incorrect." });
  }
  const min = user.role === "owner" ? 12 : MIN_PASSWORD;
  if (input.password.length < min)
    fail("validation", `${min} caractères minimum.`, { password: `${min} caractères minimum.` });
  if (input.password !== input.confirm) fail("validation", "Les deux saisies diffèrent.", { confirm: "Différent." });
  if (input.password === input.current) {
    fail("validation", "Choisissez un mot de passe différent de l'actuel.", { password: "Identique à l'actuel." });
  }
  await db.tx(async (tx) => {
    await tx.query(
      "update users set password_hash = $2, must_change_password = false, password_changed_at = now() where id = $1",
      [user.id, await hashPassword(input.password)],
    );
    await tx.query("delete from sessions where user_id = $1 and id <> $2", [user.id, tokenHash(token)]);
  });
}

/** Vérifie un droit pour un utilisateur déjà authentifié. */
export function assertCan(user: User | null, permission: Permission): asserts user is User {
  if (!user) throw new AppError("session_expired", "Votre session a expiré. Reconnectez-vous pour continuer.");
  if (!can(user, permission)) {
    throw new AppError("forbidden", "Vous n'avez pas les droits nécessaires pour cette action.");
  }
}

/** Un propriétaire réel (hors démonstration) et actif existe-t-il ? */
export async function hasRealOwner(db: Db) {
  const row = await db.one<{ ok: boolean }>(
    "select exists (select 1 from users where role = 'owner' and active and not is_demo) as ok",
  );
  return !!row?.ok;
}

/**
 * Crée le premier propriétaire réel à l'aide du code d'installation défini
 * côté serveur. Refusé dès qu'un propriétaire réel existe.
 */
export async function claimOwner(
  db: Db,
  setupCode: string | undefined,
  input: { code: string; name: string; email: string; password: string },
) {
  if (!setupCode || setupCode.length < 16) {
    fail("forbidden", "L'installation n'est pas ouverte sur ce serveur.");
  }
  const a = createHash("sha256").update(String(input.code)).digest();
  const b = createHash("sha256").update(setupCode!).digest();
  if (!timingSafeEqual(a, b)) fail("validation", "Code d'installation incorrect.", { code: "Code incorrect." });
  if (input.password.length < 12) {
    fail("validation", "12 caractères minimum.", { password: "12 caractères minimum." });
  }
  return db.tx(async (tx) => {
    await tx.query("select pg_advisory_xact_lock(4747001)");
    if (await hasRealOwner(tx)) fail("conflict", "Un propriétaire existe déjà : connectez-vous avec son compte.");
    return createUser(tx, { ...input, role: "owner", isDemo: false, temporary: false });
  });
}

// ——— Équipe ———

export async function listUsers(db: Db) {
  return db.query<User & { created_at: Date }>(
    `select id, name, email, role, active, is_demo, must_change_password, created_at
       from users order by active desc, created_at`,
  );
}

export async function createUser(
  db: Db,
  input: {
    name: string;
    email: string;
    role: Role;
    password: string;
    isDemo?: boolean;
    /** Mot de passe provisoire : changement exigé à la 1re connexion (par défaut, sauf comptes d'exemple amorcés). */
    temporary?: boolean;
  },
) {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Indiquez le nom.";
  // Identifiant de connexion : une adresse e-mail ou un identifiant simple (lettres, chiffres, . _ -).
  if (!isLoginId(input.email)) {
    errors.email = "Identifiant invalide : une adresse e-mail, ou 3 à 40 lettres, chiffres, points, tirets.";
  }
  if (input.password.length < MIN_PASSWORD) errors.password = `${MIN_PASSWORD} caractères minimum.`;
  if (!["owner", "manager", "seller"].includes(input.role)) errors.role = "Rôle invalide.";
  if (Object.keys(errors).length) fail("validation", "Vérifiez les champs signalés.", errors);
  const exists = await db.one("select 1 from users where lower(email) = lower($1)", [input.email]);
  if (exists)
    fail("conflict", "Un compte existe déjà avec cette adresse.", {
      email: "Déjà utilisée.",
    });
  const id = newId();
  await db.query(
    `insert into users (id, name, email, password_hash, role, is_demo, must_change_password)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      input.name.trim(),
      input.email.trim().toLowerCase(),
      await hashPassword(input.password),
      input.role,
      !!input.isDemo,
      input.temporary ?? !input.isDemo,
    ],
  );
  return id;
}

export async function updateUser(
  db: Db,
  actor: User,
  id: string,
  input: { role?: Role; active?: boolean; password?: string },
) {
  const target = await db.one<User>("select * from users where id = $1", [id]);
  if (!target) return fail("not_found", "Compte introuvable.");
  if (target.role === "owner" && ((input.role && input.role !== "owner") || input.active === false)) {
    const owners = await db.one<{ n: number }>(
      "select count(*)::int as n from users where role = 'owner' and active and id <> $1",
      [id],
    );
    if (!owners?.n) fail("conflict", "Il doit rester au moins un propriétaire actif.");
  }
  if (input.role) await db.query("update users set role = $2 where id = $1", [id, input.role]);
  if (input.active !== undefined) {
    await db.query("update users set active = $2 where id = $1", [id, input.active]);
    if (!input.active) await db.query("delete from sessions where user_id = $1", [id]);
  }
  if (input.password) {
    // Son propre mot de passe se change dans « Mon compte » (ancien mot de passe exigé).
    if (id === actor.id) fail("forbidden", "Changez votre propre mot de passe depuis « Mon compte ».");
    if (input.password.length < MIN_PASSWORD)
      fail("validation", `${MIN_PASSWORD} caractères minimum.`, {
        password: `${MIN_PASSWORD} caractères minimum.`,
      });
    // Réinitialisation par le propriétaire : mot de passe provisoire, sessions fermées.
    await db.query("update users set password_hash = $2, must_change_password = $3 where id = $1", [
      id,
      await hashPassword(input.password),
      true,
    ]);
    await db.query("delete from sessions where user_id = $1", [id]);
  }
}
