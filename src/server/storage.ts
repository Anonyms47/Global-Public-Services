/**
 * Stockage des fichiers de la médiathèque (photos et vidéos), hors de la base.
 * La base ne garde que les métadonnées (type, taille, nom, chemin, état).
 *
 * - « supabase » : Supabase Storage, compartiment privé. Aucun accès direct
 *   anonyme ; seul le serveur, avec la clé secrète, lit et écrit. Le navigateur
 *   envoie le fichier directement au stockage par une adresse d'envoi signée,
 *   à usage unique (pas de limite de taille de l'hébergeur).
 * - « local » : dossier sur le disque, pour la démonstration locale et les tests.
 * - « database » : ancien mode (octets en base), conservé pour les fichiers pas
 *   encore migrés et comme solution de retour arrière (MEDIA_STORAGE=database).
 */

export type Backend = "database" | "local" | "supabase";

export interface StoredRead {
  status: 200 | 206 | 416;
  body: ReadableStream<Uint8Array> | Uint8Array | null;
  /** Taille totale du fichier. */
  size: number;
  length: number;
  contentRange?: string;
}

export interface ObjectStore {
  backend: "local" | "supabase";
  put(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  /** Lecture, partielle si `range` (en-tête HTTP Range) est fourni. */
  read(path: string, range?: string | null): Promise<StoredRead | null>;
  /** Taille et premiers octets (contrôle du type réel). */
  head(path: string): Promise<{ size: number; start: Uint8Array } | null>;
  remove(paths: string[]): Promise<void>;
  /** Adresse d'envoi direct depuis le navigateur (Supabase uniquement). */
  uploadTarget?(path: string, mime: string): Promise<{ url: string; headers: Record<string, string> }>;
  /** Adresse de lecture temporaire (vidéos lues par plages directement depuis le stockage). */
  signedUrl?(path: string, seconds: number): Promise<string>;
  ensureReady?(): Promise<void>;
}

export const MEDIA_BUCKET_DEFAULT = "gps-media";
export const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"];

/** Plage demandée (« bytes=a-b ») ramenée à la taille du fichier. */
export function parseRange(header: string | null | undefined, size: number) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!m || (!m[1] && !m[2])) return null;
  let start = m[1] ? Number(m[1]) : size - Number(m[2]);
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(size - 1, end);
  if (start > end || start >= size) return "invalid" as const;
  return { start, end };
}

/** Lecture partielle d'un tampon (fichiers en base ou sur disque). */
export function sliceRead(bytes: Uint8Array, range?: string | null): StoredRead {
  const size = bytes.length;
  const r = parseRange(range, size);
  if (r === "invalid") return { status: 416, body: null, size, length: 0, contentRange: `bytes */${size}` };
  if (r) {
    return {
      status: 206,
      body: bytes.subarray(r.start, r.end + 1),
      size,
      length: r.end - r.start + 1,
      contentRange: `bytes ${r.start}-${r.end}/${size}`,
    };
  }
  return { status: 200, body: bytes, size, length: size };
}

// ——— Disque local ———

export function localStore(dir: string): ObjectStore {
  const full = async (path: string) => {
    if (path.includes("..")) throw new Error("Chemin refusé.");
    const { join } = await import("node:path");
    return join(dir, path);
  };
  return {
    backend: "local",
    async put(path, bytes) {
      const fs = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      const f = await full(path);
      await fs.mkdir(dirname(f), { recursive: true });
      await fs.writeFile(f, bytes);
    },
    async read(path, range) {
      const fs = await import("node:fs/promises");
      try {
        return sliceRead(new Uint8Array(await fs.readFile(await full(path))), range);
      } catch {
        return null;
      }
    },
    async head(path) {
      const fs = await import("node:fs/promises");
      try {
        const f = await full(path);
        const { size } = await fs.stat(f);
        const h = await fs.open(f, "r");
        const start = new Uint8Array(Math.min(64, size));
        await h.read(start, 0, start.length, 0);
        await h.close();
        return { size, start };
      } catch {
        return null;
      }
    },
    async remove(paths) {
      const fs = await import("node:fs/promises");
      for (const p of paths) await fs.rm(await full(p), { force: true });
    },
  };
}

// ——— Supabase Storage (API REST) ———

export function supabaseStore(opts: {
  url: string;
  key: string;
  bucket: string;
  fetch?: typeof fetch;
  maxBytes?: number;
}): ObjectStore {
  const base = `${opts.url.replace(/\/$/, "")}/storage/v1`;
  const f = opts.fetch ?? fetch;
  const auth = { apikey: opts.key, Authorization: `Bearer ${opts.key}` };
  const obj = (path: string) => `${opts.bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const failed = async (what: string, res: Response) => {
    const text = await res.text().catch(() => "");
    // Jamais la clé dans les messages : seulement le code et la réponse du stockage.
    return new Error(`Stockage des médias : ${what} impossible (${res.status}) ${text.slice(0, 200)}`);
  };
  let ready: Promise<void> | null = null;
  return {
    backend: "supabase",
    async put(path, bytes, mime) {
      const res = await f(`${base}/object/${obj(path)}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": mime, "x-upsert": "true", "Cache-Control": "max-age=31536000" },
        body: bytes as BodyInit,
      });
      if (!res.ok) throw await failed("envoi", res);
    },
    async read(path, range) {
      const res = await f(`${base}/object/authenticated/${obj(path)}`, {
        headers: { ...auth, ...(range ? { Range: range } : {}) },
      });
      if (res.status === 400 || res.status === 404) return null;
      if (res.status === 416) {
        const total = Number(/\/(\d+)$/.exec(res.headers.get("content-range") ?? "")?.[1] ?? 0);
        return { status: 416, body: null, size: total, length: 0, contentRange: `bytes */${total}` };
      }
      if (!res.ok) throw await failed("lecture", res);
      const length = Number(res.headers.get("content-length") ?? 0);
      const cr = res.headers.get("content-range") ?? undefined;
      const size = cr ? Number(/\/(\d+)$/.exec(cr)?.[1] ?? length) : length;
      return { status: res.status === 206 ? 206 : 200, body: res.body, size, length, contentRange: cr };
    },
    async head(path) {
      const r = await this.read(path, "bytes=0-63");
      if (!r || r.status === 416) return null;
      const start = r.body instanceof Uint8Array ? r.body : new Uint8Array(await new Response(r.body).arrayBuffer());
      return { size: r.size || start.length, start: start.slice(0, 64) };
    },
    async remove(paths) {
      if (!paths.length) return;
      const res = await f(`${base}/object/${opts.bucket}`, {
        method: "DELETE",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ prefixes: paths }),
      });
      if (!res.ok && res.status !== 404) throw await failed("suppression", res);
    },
    async uploadTarget(path, mime) {
      const res = await f(`${base}/object/upload/sign/${obj(path)}`, { method: "POST", headers: auth });
      if (!res.ok) throw await failed("préparation de l'envoi", res);
      const { url } = (await res.json()) as { url: string };
      return { url: `${base}${url}`, headers: { "Content-Type": mime, "x-upsert": "false" } };
    },
    async signedUrl(path, seconds) {
      const res = await f(`${base}/object/sign/${obj(path)}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: seconds }),
      });
      if (!res.ok) throw await failed("lien de lecture", res);
      const { signedURL } = (await res.json()) as { signedURL: string };
      return `${base}${signedURL}`;
    },
    /** Compartiment privé créé au besoin (taille et types limités par le stockage lui-même). */
    ensureReady() {
      ready ??= (async () => {
        const res = await f(`${base}/bucket/${opts.bucket}`, { headers: auth });
        if (res.ok) return;
        const created = await f(`${base}/bucket`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({
            id: opts.bucket,
            name: opts.bucket,
            public: false,
            file_size_limit: opts.maxBytes ?? 50 * 1024 * 1024,
            allowed_mime_types: ALLOWED_MIME,
          }),
        });
        if (!created.ok && created.status !== 409) throw await failed("création du compartiment", created);
      })().catch((e) => {
        ready = null;
        throw e;
      });
      return ready;
    },
  };
}

// ——— Choix du stockage ———

export interface StorageConfig {
  backend: Backend | null;
  store: ObjectStore | null;
  /** Explication quand aucun stockage n'est utilisable. */
  problem?: string;
  bucket?: string;
}

const g = globalThis as unknown as { __gpsStore?: { key: string; config: StorageConfig } };

/**
 * Stockage retenu, d'après l'environnement :
 * MEDIA_STORAGE (database | local | supabase) force le choix ; sinon Supabase si
 * SUPABASE_URL et une clé secrète sont définies, le disque local sans
 * DATABASE_URL (démonstration), et rien en production non configurée.
 */
export function mediaStorage(): StorageConfig {
  const env = process.env;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  const url = env.SUPABASE_URL || "";
  const bucket = env.MEDIA_BUCKET || MEDIA_BUCKET_DEFAULT;
  const forced = env.MEDIA_STORAGE as Backend | undefined;
  const cacheKey = [forced, url, key.length, bucket, env.MEDIA_LOCAL_DIR, env.PGLITE_DIR, !!env.DATABASE_URL].join("|");
  if (g.__gpsStore?.key === cacheKey) return g.__gpsStore.config;
  let config: StorageConfig;
  const wantSupabase = forced === "supabase" || (!forced && url && key);
  if (forced === "database") config = { backend: "database", store: null };
  else if (wantSupabase) {
    config =
      url && key
        ? { backend: "supabase", store: supabaseStore({ url, key, bucket }), bucket }
        : {
            backend: null,
            store: null,
            problem: "Stockage Supabase demandé mais SUPABASE_URL ou SUPABASE_SECRET_KEY manque.",
          };
  } else if (forced === "local" || !env.DATABASE_URL) {
    const dir = env.MEDIA_LOCAL_DIR || `${env.PGLITE_DIR || ".data/pglite"}-media`;
    config = { backend: "local", store: localStore(dir) };
  } else {
    config = {
      backend: null,
      store: null,
      problem:
        "Stockage des médias non configuré : renseignez SUPABASE_URL et SUPABASE_SECRET_KEY (voir docs/medias.md).",
    };
  }
  g.__gpsStore = { key: cacheKey, config };
  return config;
}
