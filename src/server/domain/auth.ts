import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
import type { Db } from "../db/client";
import { can, type Permission, type Role } from "@/lib/permissions";
import { AppError, fail, newId } from "./errors";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_HOURS = 12;

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
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algo, saltHex, keyHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, "hex"), 64);
  const expected = Buffer.from(keyHex, "hex");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function login(db: Db, email: string, password: string, opts: { allowDemo: boolean }) {
  const row = await db.one<User & { password_hash: string }>("select * from users where lower(email) = lower($1)", [
    email.trim(),
  ]);
  // Vérification systématique pour ne pas révéler l'existence d'un compte par le temps de réponse.
  const ok = await verifyPassword(password, row?.password_hash ?? "scrypt$00$00");
  if (!row || !ok || !row.active) fail("validation", "Identifiant ou mot de passe incorrect.");
  if (row!.is_demo && !opts.allowDemo) {
    fail("forbidden", "Les comptes de démonstration sont désactivés sur cette installation.");
  }
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_HOURS * 3600_000);
  await db.query("insert into sessions (id, user_id, expires_at) values ($1, $2, $3)", [
    tokenHash(token),
    row!.id,
    expires,
  ]);
  await db.query("delete from sessions where expires_at < now()");
  return { token, expires };
}

export async function logout(db: Db, token: string) {
  await db.query("delete from sessions where id = $1", [tokenHash(token)]);
}

export async function userFromToken(db: Db, token: string | undefined, opts: { allowDemo: boolean }) {
  if (!token) return null;
  const user = await db.one<User>(
    `select u.id, u.name, u.email, u.role, u.active, u.is_demo
       from sessions s join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now() and u.active`,
    [tokenHash(token)],
  );
  if (user?.is_demo && !opts.allowDemo) return null;
  return user;
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
    return createUser(tx, { ...input, role: "owner", isDemo: false });
  });
}

// ——— Équipe ———

export async function listUsers(db: Db) {
  return db.query<User & { created_at: Date }>(
    "select id, name, email, role, active, is_demo, created_at from users order by active desc, created_at",
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
  },
) {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) errors.name = "Indiquez le nom.";
  // Identifiant de connexion : une adresse e-mail ou un identifiant simple (lettres, chiffres, . _ -).
  if (!isLoginId(input.email)) {
    errors.email = "Identifiant invalide : une adresse e-mail, ou 3 à 40 lettres, chiffres, points, tirets.";
  }
  if (input.password.length < 10) errors.password = "10 caractères minimum.";
  if (!["owner", "manager", "seller"].includes(input.role)) errors.role = "Rôle invalide.";
  if (Object.keys(errors).length) fail("validation", "Vérifiez les champs signalés.", errors);
  const exists = await db.one("select 1 from users where lower(email) = lower($1)", [input.email]);
  if (exists)
    fail("conflict", "Un compte existe déjà avec cette adresse.", {
      email: "Déjà utilisée.",
    });
  const id = newId();
  await db.query("insert into users (id, name, email, password_hash, role, is_demo) values ($1, $2, $3, $4, $5, $6)", [
    id,
    input.name.trim(),
    input.email.trim().toLowerCase(),
    await hashPassword(input.password),
    input.role,
    !!input.isDemo,
  ]);
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
    if (input.password.length < 10)
      fail("validation", "10 caractères minimum.", {
        password: "10 caractères minimum.",
      });
    await db.query("update users set password_hash = $2 where id = $1", [id, await hashPassword(input.password)]);
    if (id !== actor.id) await db.query("delete from sessions where user_id = $1", [id]);
  }
}
