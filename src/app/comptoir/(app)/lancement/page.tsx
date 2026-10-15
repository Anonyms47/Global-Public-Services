import type { Metadata } from "next";
import Link from "next/link";
import { requirePage, serverEnv } from "@/server/admin";
import { getSettings } from "@/server/domain/settings";
import {
  checkStatusLabels,
  currentMode,
  launchChecks,
  levelLabels,
  modeLabels,
  summarize,
  type CheckStatus,
} from "@/server/domain/launch";
import { listAudit } from "@/server/domain/audit";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { Badge, Forbidden, PageTitle, Panel } from "@/components/admin/ui";
import { ModeForm } from "@/components/admin/ModeForm";
import { IconArrowRight, IconInfo } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Centre de lancement" };

const tones: Record<CheckStatus, "green" | "red" | "warn" | "blue" | "neutral"> = {
  ok: "green",
  blocking: "red",
  incomplete: "warn",
  verify: "blue",
  todo: "neutral",
};

export default async function LaunchPage() {
  const { db, user, allowed } = await requirePage("launch.view");
  if (!allowed) return <Forbidden what="le centre de lancement" />;
  const env = serverEnv();
  const settings = await getSettings(db);
  const checks = await launchChecks(db, settings, env);
  const sum = summarize(checks);
  const mode = currentMode(env);
  const history = (await listAudit(db, 100)).filter((a) => a.action === "launch.target_mode").slice(0, 5);
  return (
    <>
      <PageTitle eyebrow="Piloter" title="Centre de lancement">
        Ce qui reste à faire avant d&apos;ouvrir la boutique au public, vérifié automatiquement à chaque visite.
      </PageTitle>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="kpi-card">
          <span className="text-[12.5px] font-bold tracking-wide text-ink-mute uppercase">Avancement</span>
          <span className="kpi-value">{sum.progress} %</span>
          <span className="mt-3 h-2 overflow-hidden rounded-full bg-paper-deep" aria-hidden="true">
            <span className="block h-full bg-wa" style={{ width: `${sum.progress}%` }} />
          </span>
          <span className="mt-2 text-[13px] text-ink-mute">
            {sum.ok} point{sum.ok > 1 ? "s" : ""} validé{sum.ok > 1 ? "s" : ""} sur {sum.total}
          </span>
        </div>
        <div className="kpi-card">
          <span className="text-[12.5px] font-bold tracking-wide text-ink-mute uppercase">Bloquants</span>
          <span className={`kpi-value ${sum.blocking ? "text-gps-red-ink" : "text-wa-ink"}`}>{sum.blocking}</span>
          <span className="mt-auto pt-3 text-[13px] text-ink-mute">Empêchent l&apos;ouverture publique.</span>
        </div>
        <div className="kpi-card">
          <span className="text-[12.5px] font-bold tracking-wide text-ink-mute uppercase">Mode en vigueur</span>
          <span className="kpi-value">{modeLabels[mode].label}</span>
          <span className="mt-auto pt-3 text-[13px] text-ink-mute">
            Mode visé : {modeLabels[settings.launch.targetMode].label}
          </span>
        </div>
      </div>

      {([1, 2, 3] as const).map((level) => (
        <Panel key={level} className="mt-6" id={`niveau-${level}`} title={`Niveau ${level} · ${levelLabels[level]}`}>
          <ul className="divide-y divide-line-soft">
            {checks
              .filter((c) => c.level === level)
              .map((c) => (
                <li key={c.key} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="w-24 shrink-0">
                    <Badge tone={tones[c.status]}>{checkStatusLabels[c.status]}</Badge>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{c.label}</p>
                    <p className="text-[14px] text-ink-mute">{c.detail}</p>
                  </div>
                  {c.status !== "ok" ? (
                    <Link href={c.fix} className="btn btn-outline btn-sm">
                      Corriger <IconArrowRight size={16} />
                    </Link>
                  ) : null}
                </li>
              ))}
          </ul>
        </Panel>
      ))}

      <Panel className="mt-6" id="modes" title="Modes de la boutique">
        <p className="mb-4 flex gap-2 rounded-[6px] bg-gps-blue-soft p-3 text-[14px] text-gps-blue-deep">
          <IconInfo size={18} className="mt-0.5 shrink-0" />
          <span>
            Choisir un mode ici le <strong>prépare</strong> et le journalise ; rien ne bascule. Le changement effectif
            se fait dans l&apos;hébergeur : <code>DEMO_MODE=false</code> pour quitter la démonstration (après purge des
            exemples), puis <code>SITE_INDEXABLE=true</code> pour ouvrir. Voir <code>docs/mise-en-ligne.md</code>.
          </span>
        </p>
        {can(user, "shop.mode") ? (
          <ModeForm
            target={settings.launch.targetMode}
            modes={(["demo", "test", "open"] as const).map((k) => ({ key: k, ...modeLabels[k] }))}
          />
        ) : (
          <p className="text-ink-mute">
            {user.restricted
              ? "Les comptes d'exemple ne peuvent pas changer le mode de la boutique."
              : "Seul le propriétaire peut changer le mode de la boutique."}
          </p>
        )}
        {history.length ? (
          <div className="mt-5">
            <p className="eyebrow mb-2 text-ink-mute">Historique</p>
            <ul className="grid gap-1 text-[14px] text-ink-soft">
              {history.map((h) => (
                <li key={h.id}>
                  {formatDateTime(h.created_at)} · {h.user_name ?? "Compte supprimé"} :{" "}
                  {modeLabels[String(h.detail.from) as keyof typeof modeLabels]?.label ?? "—"} →{" "}
                  {modeLabels[String(h.detail.to) as keyof typeof modeLabels]?.label ?? "—"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>
    </>
  );
}
