import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/server/db";
import { demoAccess } from "@/server/admin";
import { hasRealOwner } from "@/server/domain/auth";
import { DEMO_PASSWORD, demoAccounts } from "@/server/demo/seed";
import { roleLabels } from "@/lib/permissions";
import { Logo } from "@/components/brand/Logo";
import { Ribbon } from "@/components/brand/Ribbon";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/comptoir/connexion">) {
  const sp = await searchParams;
  const suite = typeof sp.suite === "string" ? sp.suite : "";
  const expired = sp.expiree === "1";
  const db = await getDb();
  const access = await demoAccess(db);
  const demo = access.allowDemo;
  const installable = !!process.env.COMPTOIR_SETUP_CODE && !(await hasRealOwner(db));
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gps-blue-deep p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Ribbon tone="white" className="absolute inset-x-0 bottom-24 h-64 w-full opacity-30" width={6} />
        <div className="inline-flex w-fit rounded-[6px] bg-white p-3">
          <Logo className="h-16 w-auto" />
        </div>
        <div className="relative">
          <p className="eyebrow text-white/70">Espace de gestion</p>
          <p className="mt-3 font-display text-[88px] leading-[0.85] font-extrabold uppercase">
            Le
            <br />
            Comptoir
            <br />
            <span className="text-gps-red">GPS</span>
          </p>
        </div>
        <p className="relative text-white/70">Commandes, stock, ventes et vitrine.</p>
      </div>
      <main className="flex items-center justify-center p-4 md:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo variant="mark" className="h-12 w-auto" />
            <p className="mt-3 font-display text-4xl font-extrabold uppercase">Le Comptoir GPS</p>
          </div>
          <h1 className="font-display text-4xl font-bold uppercase">Connexion</h1>
          {expired ? (
            <p role="alert" className="mt-4 rounded-[6px] bg-warn-soft p-3 text-[15px] font-semibold text-warn">
              Votre session a expiré. Reconnectez-vous : la saisie en cours dans l&apos;autre onglet est conservée.
            </p>
          ) : null}
          <LoginForm suite={suite} />
          {demo ? (
            <section
              className="mt-10 rounded-[6px] border-[1.5px] border-dashed border-gps-blue/40 bg-gps-blue-soft p-4"
              aria-labelledby="titre-demo"
            >
              <h2 id="titre-demo" className="font-bold text-gps-blue-deep">
                Comptes de démonstration
              </h2>
              {access.restricted ? (
                <p className="mt-1 text-[14px] text-gps-blue-deep">
                  Démonstration protégée : ces comptes consultent et testent les opérations sur les données
                  d&apos;exemple, sans accès aux paramètres, à l&apos;équipe, aux exports ni à la purge. Ils sont
                  refusés dès qu&apos;un propriétaire réel est créé.
                </p>
              ) : (
                <p className="mt-1 text-[14px] text-gps-blue-deep">
                  Isolés des données réelles, désactivés automatiquement hors mode démonstration. Mot de passe local :{" "}
                  <code className="font-bold">{DEMO_PASSWORD}</code>
                </p>
              )}
              <ul className="mt-3 grid gap-1 text-[14px]">
                {demoAccounts.map((a) => (
                  <li key={a.email} className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold">{roleLabels[a.role]}</span>
                    <code>{a.email}</code>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {installable ? (
            <p className="mt-6 text-[14px] text-ink-soft">
              Première mise en service ?{" "}
              <Link
                href="/comptoir/installation"
                className="font-bold text-gps-blue underline-offset-2 hover:underline"
              >
                Créer le compte du propriétaire
              </Link>
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
