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
import { proposals } from "@/lib/content-proposals";
import { defaultTemplates, templateKeys, templateMeta } from "@/lib/templates";
import { paymentMethods } from "@/lib/payment-methods";
import { Badge, Panel } from "./ui";
import { IconPlus, IconTrash } from "../ui/icons";

type Initial = Pick<Settings, "company" | "reception" | "policies" | "stock" | "receipt" | "messages" | "payments">;

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  textarea,
  type = "text",
  proposal,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  textarea?: boolean;
  type?: string;
  /** Texte proposé, appliqué au champ sur demande (à relire avant d'enregistrer). */
  proposal?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {textarea ? (
        <textarea
          id={id}
          rows={rows}
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
      {proposal && value.trim() !== proposal ? (
        <button
          type="button"
          className="mt-1 inline-flex min-h-10 items-center text-[13px] font-bold text-gps-blue underline underline-offset-2"
          onClick={() => {
            if (!value.trim() || confirm("Remplacer le texte actuel par la proposition GPS ?")) onChange(proposal);
          }}
        >
          Utiliser la proposition GPS
        </button>
      ) : null}
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
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field
            id="s-legal"
            label="Raison sociale"
            value={c.legalName}
            onChange={(v) => setC({ legalName: v })}
            hint="Affichée sur les reçus et les conditions de vente."
          />
          <Field
            id="s-ninea"
            label="NINEA"
            value={c.ninea}
            onChange={(v) => setC({ ninea: v })}
            hint="Numéro d'identification national, tel qu'il figure sur vos documents officiels."
          />
          <Field
            id="s-rccm"
            label="RCCM"
            value={c.rccm}
            onChange={(v) => setC({ rccm: v })}
            hint="Registre du commerce, tel qu'il figure sur vos documents officiels."
          />
          <Field
            id="s-legal-id"
            label="Autre immatriculation (facultatif)"
            value={c.legalId}
            onChange={(v) => setC({ legalId: v })}
          />
          <Field
            id="s-tz"
            label="Fuseau horaire"
            value={c.timezone}
            onChange={(v) => setC({ timezone: v })}
            hint="Africa/Dakar par défaut (heure universelle toute l'année)."
            error={fieldErrors["company.timezone"]}
          />
        </div>
        <div className="mt-4">
          <Field
            id="s-about"
            label="Notre histoire (page À propos)"
            textarea
            rows={7}
            value={c.aboutText}
            onChange={(v) => setC({ aboutText: v })}
            proposal={proposals.aboutText}
            hint="Relisez et personnalisez la proposition : année de création, quartier, équipe…"
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
              proposal={proposals.pickupDetails}
              textarea
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
              proposal={proposals.deliveryDetails}
              textarea
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
            proposal={proposals.warranty}
            rows={6}
            hint="Texte validé par GPS. Vide = « à confirmer »."
          />
          <Field
            id="s-returns"
            label="Retours"
            textarea
            value={s.policies.returns}
            onChange={(v) => setS({ ...s, policies: { ...s.policies, returns: v } })}
            proposal={proposals.returns}
            rows={6}
          />
          <Field
            id="s-payment"
            label="Moyens de paiement acceptés"
            textarea
            value={s.policies.payment}
            onChange={(v) => setS({ ...s, policies: { ...s.policies, payment: v } })}
            proposal={proposals.payment}
            rows={6}
          />
        </div>
      </Panel>

      <Panel title="Moyens de paiement" id="t-paiements">
        <fieldset>
          <legend className="sr-only">Moyens proposés à l&apos;encaissement</legend>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {paymentMethods.map(([k, label]) => (
              <li key={k}>
                <label className="flex min-h-11 items-center gap-2 rounded-[6px] border border-line px-3 font-semibold">
                  <input
                    type="checkbox"
                    checked={s.payments.methods.includes(k)}
                    onChange={(e) =>
                      setS({
                        ...s,
                        payments: {
                          methods: e.target.checked
                            ? paymentMethods.map(([m]) => m).filter((m) => m === k || s.payments.methods.includes(m))
                            : s.payments.methods.filter((m) => m !== k),
                        },
                      })
                    }
                  />
                  {label}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
        <p className="hint mt-2">
          Seuls les moyens cochés sont proposés à l&apos;encaissement. Les opérations déjà enregistrées ne changent pas.
        </p>
        {fieldErrors["payments.methods"] ? <p className="error-text">{fieldErrors["payments.methods"]}</p> : null}
      </Panel>

      <Panel title="Messages WhatsApp aux clients" id="t-messages">
        <div className="grid gap-4 md:grid-cols-2">
          {templateKeys.map((k) => (
            <div key={k}>
              <Field
                id={`s-msg-${k}`}
                label={templateMeta[k].label}
                textarea
                rows={5}
                value={s.messages[k]}
                onChange={(v) => setS({ ...s, messages: { ...s.messages, [k]: v } })}
                hint={`Variables : ${templateMeta[k].vars.map((v) => `{${v}}`).join(" ")}`}
                error={fieldErrors[`messages.${k}`]}
              />
              {s.messages[k] !== defaultTemplates[k] ? (
                <button
                  type="button"
                  className="mt-1 inline-flex min-h-10 items-center text-[13px] font-bold text-gps-blue underline underline-offset-2"
                  onClick={() => setS({ ...s, messages: { ...s.messages, [k]: defaultTemplates[k] } })}
                >
                  Revenir au modèle d&apos;origine
                </button>
              ) : null}
            </div>
          ))}
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
            hint="Ligne libre en tête de reçu (la raison sociale et l'immatriculation sont ajoutées automatiquement)."
          />
          <Field
            id="s-rf"
            label="Pied des reçus"
            value={s.receipt.footer}
            onChange={(v) => setS({ ...s, receipt: { ...s.receipt, footer: v } })}
            proposal={proposals.receiptFooter}
          />
        </div>
      </Panel>

      <div
        data-bottom-bar
        className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-[6px] md:border"
      >
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

const roleSummary: Record<Role, string> = {
  owner: "Accès complet : marges, paramètres, équipe.",
  manager: "Catalogue, stock, commandes, vitrine, rapports sans marge.",
  seller: "Ventes, commandes, encaissements et clients.",
};

const roleAvatar: Record<Role, string> = {
  owner: "bg-gps-blue text-white",
  manager: "bg-ink text-white",
  seller: "bg-gps-red-soft text-gps-red-ink",
};

function initials(name: string) {
  const words = name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
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
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-1" aria-label="Membres de l'équipe">
          {users.map((u) => {
            const self = u.id === me;
            return (
              <li
                key={u.id}
                className={`grid content-start gap-4 rounded-[6px] border-[1.5px] bg-card p-4 ${self ? "border-gps-blue" : "border-line"}`}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[17px] font-extrabold ${u.active ? roleAvatar[u.role] : "bg-paper-deep text-ink-mute"}`}
                  >
                    {initials(u.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-bold">{u.name}</p>
                    <p className="truncate text-[13px] text-ink-mute">{u.email}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {u.active ? <Badge tone="green">Actif</Badge> : <Badge tone="red">Désactivé</Badge>}
                      {self ? <Badge tone="blue">Vous</Badge> : null}
                      {u.isDemo ? <Badge>Exemple</Badge> : null}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor={`role-${u.id}`}>
                    Rôle
                  </label>
                  <select
                    id={`role-${u.id}`}
                    className="field lg:max-w-md"
                    value={u.role}
                    disabled={update.pending || self}
                    aria-describedby={`role-${u.id}-aide`}
                    onChange={(e) => update.run(() => updateUserAction(u.id, { role: e.target.value }))}
                  >
                    {(Object.keys(roleLabels) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {roleLabels[r]}
                      </option>
                    ))}
                  </select>
                  <p id={`role-${u.id}-aide`} className="hint mt-1">
                    {self ? "Votre propre rôle ne peut pas être modifié ici." : roleSummary[u.role]}
                  </p>
                </div>

                {pwFor === u.id ? (
                  <form
                    className="grid gap-2 border-t border-line pt-4 lg:max-w-md"
                    onSubmit={(e) => {
                      e.preventDefault();
                      update.run(() => updateUserAction(u.id, { password: pw }), {
                        onSuccess: () => setPwFor(null),
                      });
                    }}
                  >
                    <label className="label" htmlFor={`pw-${u.id}`}>
                      Nouveau mot de passe
                    </label>
                    <input
                      id={`pw-${u.id}`}
                      type="password"
                      autoComplete="new-password"
                      className="field"
                      placeholder="10 caractères minimum"
                      value={pw}
                      onChange={(e) => setPw(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPwFor(null)}>
                        Annuler
                      </button>
                      <button className="btn btn-blue btn-sm" disabled={pw.length < 10 || update.pending}>
                        Enregistrer
                      </button>
                    </div>
                  </form>
                ) : (
                  <div
                    className={`grid gap-2 border-t border-line pt-4 lg:max-w-md ${self ? "lg:max-w-56" : "grid-cols-2"}`}
                  >
                    <button
                      type="button"
                      className="btn btn-outline btn-sm whitespace-nowrap"
                      onClick={() => (setPwFor(u.id), setPw(""))}
                    >
                      Mot de passe
                    </button>
                    {self ? null : (
                      <button
                        type="button"
                        className={`btn btn-sm whitespace-nowrap ${u.active ? "btn-danger" : "btn-blue"}`}
                        disabled={update.pending}
                        onClick={() => {
                          if (
                            !u.active ||
                            confirm(`Désactiver le compte de ${u.name} ? Il ne pourra plus se connecter.`)
                          )
                            update.run(() => updateUserAction(u.id, { active: !u.active }));
                        }}
                      >
                        {u.active ? "Désactiver" : "Réactiver"}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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
        className="grid content-start gap-3 self-start rounded-[6px] border border-line bg-card p-4"
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
          label="Identifiant de connexion"
          hint="Un identifiant (ex. awa.diop) ou une adresse e-mail."
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
