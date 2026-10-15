import type { Metadata } from "next";
import { requirePage, serverEnv } from "@/server/admin";
import { healthChecks, type HealthStatus } from "@/server/domain/health";
import { listAudit } from "@/server/domain/audit";
import { formatDateTime } from "@/lib/format";
import { Badge, Forbidden, PageTitle, Panel } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Santé du Comptoir" };

const labels: Record<HealthStatus, [string, "green" | "warn" | "red" | "neutral"]> = {
  ok: ["Bon", "green"],
  warn: ["À regarder", "warn"],
  error: ["Problème", "red"],
  info: ["Info", "neutral"],
};

export default async function HealthPage() {
  const { db, allowed } = await requirePage("launch.view");
  if (!allowed) return <Forbidden what="la santé du Comptoir" />;
  const [checks, log] = await Promise.all([healthChecks(db, serverEnv()), listAudit(db, 20)]);
  const problems = checks.filter((c) => c.status === "error" || c.status === "warn").length;
  return (
    <>
      <PageTitle eyebrow="Développer" title="Santé du Comptoir">
        {problems ? `${problems} point${problems > 1 ? "s" : ""} à regarder.` : "Tout est en ordre."} Contrôles en
        lecture seule, recalculés à chaque visite.
      </PageTitle>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((c) => (
          <li key={c.key} className="kpi-card">
            <span className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-bold tracking-wide text-ink-mute uppercase">{c.label}</span>
              <Badge tone={labels[c.status][1]}>{labels[c.status][0]}</Badge>
            </span>
            <span className="mt-2 text-[22px] font-extrabold">{c.value}</span>
            <span className="mt-1 text-[14px] text-ink-soft">{c.detail}</span>
          </li>
        ))}
      </ul>
      <Panel className="mt-6" id="journal" title="Journal des actions sensibles">
        {log.length === 0 ? (
          <p className="text-ink-mute">Aucune action sensible enregistrée.</p>
        ) : (
          <ul className="divide-y divide-line-soft text-[14px]">
            {log.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  <strong>{l.action}</strong> {l.target ? `· ${l.target}` : ""}
                </span>
                <span className="text-ink-mute">
                  {l.user_name ?? "—"} · {formatDateTime(l.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
