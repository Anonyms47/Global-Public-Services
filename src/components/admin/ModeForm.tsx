"use client";

import { useState } from "react";
import { setTargetModeAction } from "@/app/comptoir/(app)/pilotage-actions";
import { ActionFeedback, useAction } from "./useAction";

type Mode = "demo" | "test" | "open";

export function ModeForm({ modes, target }: { modes: { key: Mode; label: string; text: string }[]; target: Mode }) {
  const a = useAction();
  const [mode, setMode] = useState<Mode>(target);
  const [confirmation, setConfirmation] = useState("");
  const expected = modes.find((m) => m.key === mode)?.label.toUpperCase() ?? "";
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        a.run(() => setTargetModeAction({ mode, confirmation }), { onSuccess: () => setConfirmation("") });
      }}
    >
      <fieldset className="grid gap-2 sm:grid-cols-3">
        <legend className="mb-2 text-[14px] font-bold">Mode visé</legend>
        {modes.map((m) => (
          <label
            key={m.key}
            className={`flex cursor-pointer flex-col gap-1 rounded-[6px] border-[1.5px] p-3 ${
              mode === m.key ? "border-gps-blue bg-gps-blue-soft" : "border-line bg-card"
            }`}
          >
            <span className="flex items-center gap-2 font-bold">
              <input type="radio" name="mode" value={m.key} checked={mode === m.key} onChange={() => setMode(m.key)} />
              {m.label}
              {m.key === target ? <span className="text-[12px] font-semibold text-ink-mute">(actuel)</span> : null}
            </span>
            <span className="text-[13px] text-ink-soft">{m.text}</span>
          </label>
        ))}
      </fieldset>
      {mode !== target ? (
        <div className="grid gap-2 sm:max-w-sm">
          <label htmlFor="mode-confirm" className="label text-[13px]">
            Tapez « {expected} » pour confirmer
          </label>
          <input
            id="mode-confirm"
            className="field"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            aria-invalid={a.fieldErrors.confirmation ? true : undefined}
          />
          <button className="btn btn-primary" disabled={a.pending || confirmation.trim().toUpperCase() !== expected}>
            Enregistrer le mode visé
          </button>
        </div>
      ) : null}
      <ActionFeedback failure={a.failure} success={a.success} />
    </form>
  );
}
