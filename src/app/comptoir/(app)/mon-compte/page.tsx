import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser, SESSION_COOKIE } from "@/server/admin";
import { getDb } from "@/server/db";
import { listSessions, SESSION_HOURS, SESSION_IDLE_MINUTES } from "@/server/domain/auth";
import { roleLabels } from "@/lib/permissions";
import { PageTitle, Panel } from "@/components/admin/ui";
import { PasswordForm, RevokeSessionsButton } from "@/components/admin/AccountForms";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Mon compte" };

/** Navigateur lisible à partir de l'en-tête User-Agent (indicatif). */
function device(ua: string) {
  if (!ua) return "Appareil inconnu";
  const os = /iPhone|iPad/.test(ua)
    ? "iPhone / iPad"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "Autre";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /CriOS|Chrome\//.test(ua)
      ? "Chrome"
      : /FxiOS|Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Navigateur";
  return `${browser} · ${os}`;
}

export default async function AccountPage({ searchParams }: PageProps<"/comptoir/mon-compte">) {
  // Pas de requirePage ici : c'est la seule page ouverte avec un mot de passe provisoire.
  const user = await currentUser();
  if (!user) redirect("/comptoir/connexion");
  const sp = await searchParams;
  const temporary = !!user.must_change_password;
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const sessions = await listSessions(await getDb(), user.id, token);
  return (
    <>
      <PageTitle eyebrow="Configuration" title="Mon compte">
        {user.name} · {user.email} · {roleLabels[user.role]}
      </PageTitle>
      {temporary || sp.provisoire ? (
        <p role="alert" className="mb-6 rounded-[6px] border-[1.5px] border-warn bg-warn-soft p-4 text-[15px]">
          <strong>Mot de passe provisoire.</strong> Choisissez votre propre mot de passe pour accéder au Comptoir.
        </p>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Changer mon mot de passe" id="t-mdp">
          <PasswordForm min={user.role === "owner" ? 12 : 10} redirectTo={temporary ? "/comptoir" : undefined} />
        </Panel>
        <Panel title="Appareils connectés" id="t-sessions">
          <ul className="grid gap-2 text-[14px]">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-[6px] bg-paper p-3">
                <span className="font-semibold">
                  {device(s.user_agent)} {s.current ? <span className="text-wa-ink">· cet appareil</span> : null}
                </span>
                <span className="text-[13px] text-ink-mute">
                  Connecté le {formatDateTime(s.created_at)} · actif {formatDateTime(s.last_seen_at)}
                </span>
              </li>
            ))}
          </ul>
          <p className="hint mt-3">
            Une session se ferme après {SESSION_IDLE_MINUTES / 60} h sans activité et au plus tard {SESSION_HOURS} h
            après la connexion.
          </p>
          {sessions.length > 1 ? (
            <div className="mt-3">
              <RevokeSessionsButton />
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
