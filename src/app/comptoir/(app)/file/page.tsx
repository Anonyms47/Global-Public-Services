import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/server/admin";
import { getSettings } from "@/server/domain/settings";
import { listQueue, queueKindLabels, type QueueView } from "@/server/domain/queue";
import { listUsers } from "@/server/domain/auth";
import { PageTitle, Panel } from "@/components/admin/ui";
import { AddTask, QueueList } from "@/components/admin/QueueList";

export const metadata: Metadata = { title: "File GPS" };

const views: [QueueView, string][] = [
  ["a-faire", "À faire"],
  ["moi", "Pour moi"],
  ["reportees", "Reportées"],
  ["resolues", "Faites"],
];

export default async function QueuePage({ searchParams }: PageProps<"/comptoir/file">) {
  const { db, user } = await requirePage("queue.manage");
  const sp = await searchParams;
  const view = (views.find(([k]) => k === sp.vue)?.[0] ?? "a-faire") as QueueView;
  const settings = await getSettings(db);
  const [{ items, counts }, users] = await Promise.all([
    listQueue(db, { view, userId: user.id, lowThreshold: settings.stock.defaultLowThreshold }),
    listUsers(db),
  ]);
  const team = users.filter((u) => u.active && u.is_demo === user.is_demo).map((u) => ({ id: u.id, name: u.name }));
  return (
    <>
      <PageTitle eyebrow="Piloter" title="File GPS">
        Tout le travail en attente au même endroit : commandes à préparer, retraits, soldes, remboursements et tâches de
        l&apos;équipe. Un élément traité disparaît de lui-même.
      </PageTitle>
      <nav aria-label="Vues de la file" className="mb-4 flex flex-wrap gap-1">
        {views.map(([k, label]) => (
          <Link
            key={k}
            href={`/comptoir/file?vue=${k}`}
            aria-current={view === k ? "page" : undefined}
            className={`chip ${view === k ? "border-ink bg-ink text-white" : ""}`}
          >
            {label} <span className="tabular">({counts[k]})</span>
          </Link>
        ))}
      </nav>
      <Panel>
        <AddTask team={team} />
      </Panel>
      <Panel className="mt-4">
        <QueueList
          team={team}
          empty={view === "a-faire" ? "Rien en attente. Belle journée !" : "Aucun élément dans cette vue."}
          items={items.map((i) => ({
            key: i.key,
            kind: i.kind,
            kindLabel: queueKindLabels[i.kind],
            title: i.title,
            detail: i.detail,
            href: i.href,
            priority: i.priority,
            assignee_id: i.assignee_id,
            assignee_name: i.assignee_name,
            note: i.note,
            snoozed_until: i.snoozed_until ? new Date(i.snoozed_until).toISOString() : null,
            resolved: !!i.resolved_at,
          }))}
        />
      </Panel>
    </>
  );
}
