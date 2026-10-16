"use client";

import Link from "next/link";
import { useState } from "react";
import { addTaskAction, queueAction } from "@/app/comptoir/(app)/pilotage-actions";
import { ActionFeedback, useAction } from "./useAction";
import { Badge } from "./ui";
import { IconArrowRight, IconCheck, IconClock, IconPlus } from "../ui/icons";

export interface QueueRow {
  key: string;
  kind: string;
  kindLabel: string;
  title: string;
  detail: string;
  href: string;
  priority: number;
  assignee_id: string | null;
  assignee_name: string | null;
  note: string;
  snoozed_until: string | null;
  resolved: boolean;
}

const tone = (p: number) => (p === 1 ? "red" : p === 2 ? "blue" : "neutral") as "red" | "blue" | "neutral";

function snoozeDate(choice: string) {
  const d = new Date();
  if (choice === "2h") return new Date(d.getTime() + 2 * 3600_000);
  if (choice === "demain") {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 8);
    return t;
  }
  return new Date(d.getTime() + 3 * 86400_000);
}

function Row({ item, team }: { item: QueueRow; team: { id: string; name: string }[] }) {
  const a = useAction();
  const [note, setNote] = useState(item.note);
  const run = (input: unknown, msg: string) => a.run(() => queueAction(item.key, input), { successMessage: msg });
  return (
    <li className="grid gap-3 py-4 md:grid-cols-[1fr_auto] md:items-start">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={tone(item.priority)}>{item.kindLabel}</Badge>
          {item.assignee_name ? <Badge>→ {item.assignee_name}</Badge> : null}
          {item.snoozed_until ? (
            <Badge tone="warn">
              Reporté au{" "}
              {new Date(item.snoozed_until).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </Badge>
          ) : null}
        </p>
        {item.href ? (
          <Link
            href={item.href}
            className="mt-1.5 inline-flex items-center gap-1 text-[17px] font-bold hover:underline"
          >
            {item.title} <IconArrowRight size={16} />
          </Link>
        ) : (
          <p className="mt-1.5 text-[17px] font-bold">{item.title}</p>
        )}
        {item.detail ? <p className="text-[14px] text-ink-mute">{item.detail}</p> : null}
        {item.note ? (
          <p className="mt-1 rounded-[6px] bg-paper-deep px-2 py-1 text-[14px] text-ink-soft">{item.note}</p>
        ) : null}
        <div className="mt-2">
          <ActionFeedback failure={a.failure} success={a.success} />
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-2 md:justify-end">
        {item.resolved ? (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={a.pending}
            onClick={() => run({ action: "reopen" }, "Élément rouvert.")}
          >
            Rouvrir
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-blue btn-sm"
              disabled={a.pending}
              onClick={() => run({ action: "resolve" }, "Marqué comme fait.")}
            >
              <IconCheck size={16} /> Fait
            </button>
            <details className="relative open:basis-full md:open:basis-auto">
              <summary className="btn btn-outline btn-sm list-none">Plus</summary>
              <div className="z-20 mt-2 grid gap-3 rounded-[6px] border border-line bg-card p-3 shadow-lg md:absolute md:right-0 md:w-72">
                <label className="grid gap-1 text-[13px] font-bold">
                  Assigner à
                  <select
                    className="field h-10 min-h-10 py-0"
                    defaultValue={item.assignee_id ?? ""}
                    onChange={(e) =>
                      run({ action: "assign", userId: e.target.value || null }, "Attribution enregistrée.")
                    }
                  >
                    <option value="">Personne</option>
                    {team.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-[13px] font-bold">
                  Reporter
                  <select
                    className="field h-10 min-h-10 py-0"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value)
                        run({ action: "snooze", until: snoozeDate(e.target.value).toISOString() }, "Élément reporté.");
                    }}
                  >
                    <option value="">Choisir…</option>
                    <option value="2h">Dans 2 heures</option>
                    <option value="demain">Demain 8 h</option>
                    <option value="3j">Dans 3 jours</option>
                  </select>
                </label>
                <label className="grid gap-1 text-[13px] font-bold">
                  Note
                  <textarea
                    className="field min-h-20"
                    value={note}
                    maxLength={1000}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={a.pending}
                  onClick={() => run({ action: "note", note }, "Note enregistrée.")}
                >
                  Enregistrer la note
                </button>
              </div>
            </details>
          </>
        )}
      </div>
    </li>
  );
}

export function QueueList({
  items,
  team,
  empty,
}: {
  items: QueueRow[];
  team: { id: string; name: string }[];
  empty: string;
}) {
  if (!items.length) {
    return (
      <p className="flex items-center gap-2 py-6 text-ink-mute">
        <IconClock size={18} /> {empty}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((i) => (
        <Row key={i.key} item={i} team={team} />
      ))}
    </ul>
  );
}

export function AddTask({ team }: { team: { id: string; name: string }[] }) {
  const a = useAction();
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_200px_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        a.run(() => addTaskAction({ title, assigneeId: assigneeId || null }), { onSuccess: () => setTitle("") });
      }}
    >
      <div>
        <label htmlFor="task-title" className="label text-[13px]">
          Nouvelle tâche
        </label>
        <input
          id="task-title"
          className="field"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex. rappeler le fournisseur"
        />
      </div>
      <div>
        <label htmlFor="task-assignee" className="label text-[13px]">
          Pour
        </label>
        <select id="task-assignee" className="field" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">Personne</option>
          {team.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <button className="btn btn-primary" disabled={a.pending || !title.trim()}>
        <IconPlus size={18} /> Ajouter
      </button>
      <div className="sm:col-span-3">
        <ActionFeedback failure={a.failure} success={a.success} />
      </div>
    </form>
  );
}
