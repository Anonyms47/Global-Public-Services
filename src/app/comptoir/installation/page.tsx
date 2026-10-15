import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { getDb } from "@/server/db";
import { hasRealOwner } from "@/server/domain/auth";
import { Logo } from "@/components/brand/Logo";
import { InstallForm } from "./InstallForm";

export const metadata: Metadata = { title: "Installation" };

export default async function InstallPage() {
  await connection();
  const configured = !!process.env.COMPTOIR_SETUP_CODE && process.env.COMPTOIR_SETUP_CODE.length >= 16;
  const done = await hasRealOwner(await getDb());
  return (
    <main id="contenu" className="flex min-h-dvh items-center justify-center p-4 md:p-12">
      <div className="w-full max-w-md">
        <Logo variant="mark" className="h-12 w-auto" />
        <p className="eyebrow mt-6 text-gps-red-ink">Mise en service</p>
        <h1 className="mt-1 font-display text-4xl font-bold uppercase">Compte du propriétaire</h1>
        {done ? (
          <p className="mt-4 text-[16px] text-ink-soft">
            Un propriétaire réel existe déjà. Les autres comptes se créent depuis Équipe.{" "}
            <Link href="/comptoir/connexion" className="font-bold text-gps-blue hover:underline">
              Se connecter
            </Link>
          </p>
        ) : !configured ? (
          <div className="mt-4 grid gap-3 text-[16px] text-ink-soft">
            <p>L&apos;installation n&apos;est pas ouverte sur ce serveur.</p>
            <p>
              Dans Vercel, ajoutez la variable <code className="font-bold">COMPTOIR_SETUP_CODE</code> (16 caractères
              minimum, choisie par vous et gardée pour vous), redéployez, puis revenez sur cette page.
            </p>
          </div>
        ) : (
          <>
            <p className="mt-4 text-[16px] text-ink-soft">
              Ce compte réel remplace les comptes de démonstration : une fois créé, ceux-ci ne peuvent plus se connecter
              en production. Les données d&apos;exemple restent en place.
            </p>
            <InstallForm />
          </>
        )}
      </div>
    </main>
  );
}
