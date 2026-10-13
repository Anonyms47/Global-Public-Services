"use client";

import { useState } from "react";
import { savePromotionAction, stopPromotionAction } from "@/app/comptoir/(app)/catalogue/actions";
import { ActionFeedback, useAction } from "./useAction";

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function PromotionForm({ products }: { products: { id: string; name: string }[] }) {
  const [f, setF] = useState(() => ({
    name: "",
    productId: "",
    kind: "percent" as "percent" | "amount",
    value: "",
    startsAt: local(new Date()),
    endsAt: local(new Date(Date.now() + 7 * 86400000)),
  }));
  const { run, pending, failure, success, fieldErrors } = useAction();
  return (
    <form
      className="grid content-start gap-3 rounded-[6px] border border-line bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            savePromotionAction({
              ...f,
              value: Number(f.value),
              startsAt: new Date(f.startsAt).toISOString(),
              endsAt: new Date(f.endsAt).toISOString(),
            }),
          {
            onSuccess: () => setF({ ...f, name: "", value: "" }),
          },
        );
      }}
    >
      <h2 className="font-bold">Programmer une promotion</h2>
      <div>
        <label className="label" htmlFor="pr-name">
          Nom
        </label>
        <input
          id="pr-name"
          className="field"
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          aria-invalid={!!fieldErrors.name}
        />
      </div>
      <div>
        <label className="label" htmlFor="pr-prod">
          Produit
        </label>
        <select
          id="pr-prod"
          className="field"
          value={f.productId}
          onChange={(e) => setF({ ...f, productId: e.target.value })}
          aria-invalid={!!fieldErrors.productId}
        >
          <option value="">Choisir…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="pr-kind">
            Type
          </label>
          <select
            id="pr-kind"
            className="field"
            value={f.kind}
            onChange={(e) => setF({ ...f, kind: e.target.value as "percent" | "amount" })}
          >
            <option value="percent">Pourcentage</option>
            <option value="amount">Montant (FCFA)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pr-val">
            Valeur
          </label>
          <input
            id="pr-val"
            inputMode="numeric"
            className="field"
            value={f.value}
            onChange={(e) => setF({ ...f, value: e.target.value.replace(/\D/g, "") })}
            aria-invalid={!!fieldErrors.value}
          />
          {fieldErrors.value ? <p className="error-text">{fieldErrors.value}</p> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="pr-start">
            Début
          </label>
          <input
            id="pr-start"
            type="datetime-local"
            className="field"
            value={f.startsAt}
            onChange={(e) => setF({ ...f, startsAt: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="pr-end">
            Fin
          </label>
          <input
            id="pr-end"
            type="datetime-local"
            className="field"
            value={f.endsAt}
            onChange={(e) => setF({ ...f, endsAt: e.target.value })}
            aria-invalid={!!fieldErrors.endsAt}
          />
          {fieldErrors.endsAt ? <p className="error-text">{fieldErrors.endsAt}</p> : null}
        </div>
      </div>
      <ActionFeedback failure={failure} success={success} />
      <button className="btn btn-blue" disabled={pending}>
        Programmer
      </button>
    </form>
  );
}

export function StopPromotionButton({ id }: { id: string }) {
  const { run, pending } = useAction();
  return (
    <button
      className="btn btn-danger btn-sm"
      disabled={pending}
      onClick={() => confirm("Arrêter cette promotion maintenant ?") && run(() => stopPromotionAction(id))}
    >
      Arrêter
    </button>
  );
}
