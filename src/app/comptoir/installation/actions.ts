"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/server/db";
import { claimOwner, login } from "@/server/domain/auth";
import { AppError } from "@/server/domain/errors";
import { SESSION_COOKIE } from "@/server/admin";

type State = { error?: string; fieldErrors?: Record<string, string>; name?: string; email?: string } | null;

export async function installAction(_prev: State, formData: FormData): Promise<State> {
  const input = {
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  if (input.password !== String(formData.get("confirm") ?? "")) {
    return {
      error: "Les deux mots de passe ne correspondent pas.",
      fieldErrors: { confirm: "Différent du mot de passe." },
      name: input.name,
      email: input.email,
    };
  }
  try {
    const db = await getDb();
    await claimOwner(db, process.env.COMPTOIR_SETUP_CODE, input);
    const { token, expires } = await login(db, input.email, input.password, { allowDemo: false });
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires,
    });
  } catch (error) {
    if (error instanceof AppError) {
      // Ralentit les essais de code au hasard.
      if (error.fieldErrors?.code) await new Promise((r) => setTimeout(r, 1500));
      return { error: error.message, fieldErrors: error.fieldErrors, name: input.name, email: input.email };
    }
    console.error(error);
    return { error: "L'installation a échoué. Réessayez dans un instant.", name: input.name, email: input.email };
  }
  redirect("/comptoir/lancement");
}
