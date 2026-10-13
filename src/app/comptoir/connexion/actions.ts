"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, isDemoMode } from "@/server/db";
import { login, logout } from "@/server/domain/auth";
import { AppError } from "@/server/domain/errors";
import { SESSION_COOKIE } from "@/server/admin";

export async function loginAction(
  _prev: { error?: string; email?: string } | null,
  formData: FormData,
) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const suite = String(formData.get("suite") ?? "");
  try {
    const { token, expires } = await login(await getDb(), email, password, {
      allowDemo: isDemoMode(),
    });
    (await cookies()).set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires,
    });
  } catch (error) {
    if (error instanceof AppError) return { error: error.message, email };
    console.error(error);
    return { error: "Connexion impossible pour le moment. Réessayez.", email };
  }
  redirect(
    suite.startsWith("/comptoir") && !suite.startsWith("/comptoir/connexion")
      ? suite
      : "/comptoir",
  );
}

export async function logoutAction() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await logout(await getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/comptoir/connexion");
}
