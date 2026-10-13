"use client";

import { useState } from "react";
import {
  createUserAction,
  purgeDemoAction,
  saveSettingsAction,
  updateUserAction,
} from "@/app/comptoir/(app)/parametres/actions";
import type { Settings } from "@/server/domain/settings";
import { roleLabels, type Role } from "@/lib/permissions";
import { ActionFeedback, useAction } from "./useAction";
import { Badge, Panel } from "./ui";
import { IconPlus, IconTrash } from "../ui/icons";

type Initial = Pick<Settings, "company" | "reception" | "policies" | "stock" | "receipt">;

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  textarea,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  textarea?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {textarea ? (
        <textarea
          id={id}
          rows={3}
          className="field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
        />
      ) : (
        <input
          id={id}
          type={type}
          className="field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
        />
      )}
      {hint ? <p className="hint">{hint}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}

export function SettingsForm({ initial }: { initial: Initial }) {
  const [s, setS] = useState(initial);
  const { run, pending, failure, success, fieldErrors } = useAction();
  const c = s.company;
  const r = s.reception;
  const setC = (p: Partial<Initial["company"]>) => setS({ ...s, company: { ...c, ...p } });
  const setR = (p: Partial<Initial["reception"]>) => setS({ ...s, reception: { ...r, ...p } });
  return (
    <form
      className="grid gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveSettingsAction(s));
      }}
    >
      <Panel title="Entreprise & contact" id="t-entreprise">
        <div className="grid gap-4 md:grid-cols-2">
          <Field id="s-name" label="Nom affiché" value={c.name} onChange={(v) => setC({ name: v })} />
          <Field
            id="s-wa"
            label="Numéro WhatsApp de GPS"
            value={c.whatsapp}
            onChange={(v) => setC({ whatsapp: v })}
            hint="Format international avec indicatif, sans + ni espaces. Vide = mode démonstration (aucun numéro contacté)."
            error={fieldErrors["company.whatsapp"]}
          />
          <Field id="s-phone" label="Téléphone (appel)" value={c.phone} onChange={(v) => setC({ phone: v })} />
          <Field
            id="s-email"
            label="E-mail"
            value={c.email}
            onChange={(v) => setC({ email: v })}
            error={fieldErrors["company.email"]}
          />
          <Field
            id="s-address"
            label="Adresse de la boutique"
            value={c.address}
            onChange={(v) => setC({ address: v })}
          />
          <Field id="s-city" label="Ville" value={c.city} onChange={(v) => setC({ city: v })} />
          <Field
            id="s-hours"
            label="Horaires"
            value={c.hours}
            onChange={(v) => setC({ hours: v })}
            hint="Ex. Lundi au samedi, 8 h – 20 h"
          />
          <Field
            id="s-maps"
            label="Lien d'itinéraire (facultatif)"
            value={c.mapsUrl}
            onChange={(v) => setC({ mapsUrl: v })}
            hint="Lien Google Maps de la boutique ; sinon calculé depuis l'adresse."
            error={fieldErrors["company.mapsUrl"]}
          />
        </div>
        <p className="hint mt-3">Slogan officiel : « {c.slogan} » (non modifiable ici).</p>
      </Panel>

      <Panel title="Réception & frais" id="t-reception">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid content-start gap-3">
            <label className="flex min-h-11 items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={r.pickupEnabled}
                onChange={(e) => setR({ pickupEnabled: e.target.checked })}
              />{" "}
              Retrait en boutique proposé
            </label>
            <Field
              id="s-pickup"
              label="Précisions sur le retrait"
              value={r.pickupDetails}
              onChange={(v) => setR({ pickupDetails: v })}
              hint="Affiché au client. Vide = « à confirmer avec GPS »."
            />
          </div>
          <div className="grid content-start gap-3">
            <label className="flex min-h-11 items-center gap-2 font-semibold">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={r.deliveryEnabled}
                onChange={(e) => setR({ deliveryEnabled: e.target.checked })}
              />{" "}
              Livraison proposée
            </label>
            <Field
              id="s-delivery"
              label="Précisions sur la livraison"
              value={r.deliveryDetails}
              onChange={(v) => setR({ deliveryDetails: v })}
            />
          </div>
        </div>
        {r.deliveryEnabled ? (
          <fieldset className="mt-4">
            <legend className="label">Zones et frais de livraison</legend>
            <p className="hint mb-2">
              Laissez les frais vides pour afficher « À confirmer avec GPS ». Sans zone, l&apos;adresse est demandée et
              les frais restent à confirmer.
            </p>
            <ul className="grid gap-2">
              {r.zones.map((z, i) => (
                <li key={i} className="grid grid-cols-[1fr_160px_auto] gap-2">
                  <input
                    aria-label={`Nom de la zone ${i + 1}`}
                    className="field"
                    value={z.name}
                    onChange={(e) =>
                      setR({
                        zones: r.zones.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                      })
                    }
                    placeholder="Nom de la zone"
                  />
                  <input
                    aria-label={`Frais de la zone ${i + 1} (FCFA)`}
                    inputMode="numeric"
                    className="field"
                    value={z.fee ?? ""}
                    placeholder="À confirmer"
                    onChange={(e) =>
                      setR({
                        zones: r.zones.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                fee:
                                  e.target.value.trim() === ""
                                    ? null
                                    : Math.round(Number(e.target.value.replace(/\D/g, "")) || 0),
                              }
                            : x,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-ghost px-3"
                    onClick={() => setR({ zones: r.zones.filter((_, j) => j !== i) })}
                    aria-label={`Supprimer la zone ${i + 1}`}
                  >
                    <IconTrash size={18} />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-outline btn-sm mt-2"
              onClick={() => setR({ zones: [...r.zones, { name: "", fee: null }] })}
            >
              <IconPlus size={16} /> Ajouter une zone
            </button>
          </fieldset>
        ) : null}
      </Panel>

      <Panel title="Garantie, retours, paiement" id="t-politiques">
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            id="s-warranty"
            label="Garantie"
            textarea
            value={s.policies.warranty}
            onChange={(v) => setS({ ...s, policies: { ...s.policies, warranty: v } })}
            hint="Texte validé par GPS. Vide = « à confirmer »."
          />
          <Field
            id="s-returns"
            label="Retours"
            textarea
            value={s.policies.returns}
            onChange={(v) => setS({ ...s, policies: { ...s.policies, returns: v } })}
          />
          <Field
            id="s-payment"
            label="Moyens de paiement acceptés"
            textarea
            value={s.policies.payment}
            onChange={(v) => setS({ ...s, policies: { ...s.policies, payment: v } })}
          />
        </div>
      </Panel>

      <Panel title="Stock & reçus" id="t-stock">
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            id="s-threshold"
            label="Seuil d'alerte par défaut"
            type="number"
            value={String(s.stock.defaultLowThreshold)}
            onChange={(v) =>
              setS({
                ...s,
                stock: {
                  defaultLowThreshold: Math.max(0, Math.floor(Number(v) || 0)),
                },
              })
            }
            hint="Alerte quand le disponible atteint ce nombre (modifiable par variante)."
          />
          <Field
            id="s-rh"
            label="En-tête des reçus"
            value={s.receipt.header}
            onChange={(v) => setS({ ...s, receipt: { ...s.receipt, header: v } })}
            hint="Ex. mentions légales, numéro d'immatriculation."
          />
          <Field
            id="s-rf"
            label="Pied des reçus"
            value={s.receipt.footer}
            onChange={(v) => setS({ ...s, receipt: { ...s.receipt, footer: v } })}
          />
        </div>
      </Panel>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-[6px] md:border">
        <button className="btn btn-blue" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer les paramètres"}
        </button>
        <ActionFeedback failure={failure} success={success} />
      </div>
    </form>
  );
}

export function DemoPurge({ demoMode, hasDemo }: { demoMode: boolean; hasDemo: boolean }) {
  const [text, setText] = useState("");
  const { run, pending, failure, success } = useAction();
  return (
    <section className="mt-10 rounded-[6px] border-[1.5px] border-gps-red/40 bg-card p-4" aria-labelledby="t-demo">
      <h2 id="t-demo" className="font-bold text-gps-red-ink">
        Données de démonstration
      </h2>
      <p className="mt-1 max-w-2xl text-[14px] text-ink-soft">
        {hasDemo
          ? "Produits, clients, commandes, mouvements et comptes d'exemple peuvent être supprimés avant le lancement. Les paramètres de cette page et les comptes réels sont conservés."
          : "Aucune donnée d'exemple en base."}{" "}
        Mode démonstration : <Badge tone={demoMode ? "warn" : "green"}>{demoMode ? "activé" : "désactivé"}</Badge>
      </p>
      {hasDemo ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => purgeDemoAction(text));
          }}
        >
          <div>
            <label className="label" htmlFor="purge">
              Tapez PURGER pour confirmer
            </label>
            <input
              id="purge"
              className="field w-48"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button className="btn btn-danger" disabled={pending || text !== "PURGER"}>
            Supprimer les données d&apos;exemple
          </button>
        </form>
      ) : null}
      <div className="mt-3">
        <ActionFeedback failure={failure} success={success} />
      </div>
      <p className="hint mt-2">
        Pour la mise en service, désactivez aussi le mode démonstration (variable DEMO_MODE=false) : les comptes
        d&apos;exemple ne pourront plus se connecter.
      </p>
    </section>
  );
}

interface U {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  isDemo: boolean;
}

export function TeamManager({ users, me }: { users: U[]; me: string }) {
  const [f, setF] = useState({
    name: "",
    email: "",
    role: "seller" as Role,
    password: "",
  });
  const create = useAction();
  const update = useAction();
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <div className="overflow-x-auto rounded-[6px] border border-line bg-card">
          <table className="w-full min-w-[620px] text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] tracking-wide text-ink-mute uppercase">
                <th className="px-3 py-3 font-bold">Membre</th>
                <th className="py-3 font-bold">Rôle</th>
                <th className="py-3 font-bold">État</th>
                <th className="px-3 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2">
                    <div className="font-semibold">
                      {u.name} {u.id === me ? <Badge tone="blue">vous</Badge> : null}{" "}
                      {u.isDemo ? <Badge>Exemple</Badge> : null}
                    </div>
                    <div className="text-[13px] text-ink-mute">{u.email}</div>
                  </td>
                  <td className="py-2">
                    <label className="sr-only" htmlFor={`role-${u.id}`}>
                      Rôle de {u.name}
                    </label>
                    <select
                      id={`role-${u.id}`}
                      className="field h-10 min-h-10 w-40 py-0 text-[14px]"
                      value={u.role}
                      disabled={update.pending || u.id === me}
                      onChange={(e) => update.run(() => updateUserAction(u.id, { role: e.target.value }))}
                    >
                      {(Object.keys(roleLabels) as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {roleLabels[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    {u.active ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button className="btn btn-ghost btn-sm" onClick={() => (setPwFor(u.id), setPw(""))}>
                        Mot de passe
                      </button>
                      {u.id !== me ? (
                        <button
                          className={`btn btn-sm ${u.active ? "btn-danger" : "btn-outline"}`}
                          disabled={update.pending}
                          onClick={() => update.run(() => updateUserAction(u.id, { active: !u.active }))}
                        >
                          {u.active ? "Désactiver" : "Réactiver"}
                        </button>
                      ) : null}
                    </div>
                    {pwFor === u.id ? (
                      <form
                        className="mt-2 flex justify-end gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          update.run(() => updateUserAction(u.id, { password: pw }), {
                            onSuccess: () => setPwFor(null),
                          });
                        }}
                      >
                        <label className="sr-only" htmlFor={`pw-${u.id}`}>
                          Nouveau mot de passe
                        </label>
                        <input
                          id={`pw-${u.id}`}
                          type="password"
                          autoComplete="new-password"
                          className="field h-10 min-h-10 w-48"
                          placeholder="10 caractères min."
                          value={pw}
                          onChange={(e) => setPw(e.target.value)}
                        />
                        <button className="btn btn-blue btn-sm" disabled={pw.length < 10}>
                          Changer
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <ActionFeedback failure={update.failure} success={update.success} />
        </div>
        <Panel title="Droits par rôle" className="mt-6" id="t-droits">
          <ul className="grid gap-2 text-[14px]">
            <li>
              <strong>Propriétaire</strong> — tout, dont coûts d&apos;achat et marge, export des clients, paramètres,
              équipe, purge de démonstration.
            </li>
            <li>
              <strong>Gestionnaire</strong> — catalogue, stock, inventaire, commandes (annulation, corrections, retours,
              remboursements), vitrine, rapports sans marge.
            </li>
            <li>
              <strong>Vendeur</strong> — vente rapide, enregistrement et suivi des commandes, encaissements, clients ;
              catalogue et stock en lecture.
            </li>
          </ul>
        </Panel>
      </div>
      <form
        className="grid content-start gap-3 rounded-[6px] border border-line bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.run(() => createUserAction(f), {
            onSuccess: () => setF({ name: "", email: "", role: "seller", password: "" }),
          });
        }}
      >
        <h2 className="font-bold">Ajouter un membre</h2>
        <Field
          id="u-name"
          label="Nom"
          value={f.name}
          onChange={(v) => setF({ ...f, name: v })}
          error={create.fieldErrors.name}
        />
        <Field
          id="u-email"
          label="E-mail de connexion"
          type="email"
          value={f.email}
          onChange={(v) => setF({ ...f, email: v })}
          error={create.fieldErrors.email}
        />
        <div>
          <label className="label" htmlFor="u-role">
            Rôle
          </label>
          <select
            id="u-role"
            className="field"
            value={f.role}
            onChange={(e) => setF({ ...f, role: e.target.value as Role })}
          >
            {(Object.keys(roleLabels) as Role[]).map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </div>
        <Field
          id="u-pw"
          label="Mot de passe provisoire"
          type="password"
          value={f.password}
          onChange={(v) => setF({ ...f, password: v })}
          hint="10 caractères minimum, à transmettre en main propre."
          error={create.fieldErrors.password}
        />
        <ActionFeedback failure={create.failure} success={create.success} />
        <button className="btn btn-blue" disabled={create.pending}>
          Créer le compte
        </button>
      </form>
    </div>
  );
}
