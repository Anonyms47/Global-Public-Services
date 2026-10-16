"use server";

import { cookies } from "next/headers";
import { guarded, SESSION_COOKIE } from "@/server/admin";
import { changeOwnPassword, revokeOtherSessions } from "@/server/domain/auth";
import { audit } from "@/server/domain/audit";

async function token() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? "";
}

export async function changePasswordAction(input: { current: string; password: string; confirm: string }) {
  return guarded(
    "account.self",
    async ({ db, user }) => {
      await changeOwnPassword(db, user, await token(), {
        current: String(input.current ?? ""),
        password: String(input.password ?? ""),
        confirm: String(input.confirm ?? ""),
      });
      await audit(db, user.id, "account.password", user.id, { others_disconnected: true });
    },
    { message: "Mot de passe changé. Vos autres appareils ont été déconnectés.", allowTemporary: true },
  );
}

export async function revokeOtherSessionsAction() {
  return guarded(
    "account.self",
    async ({ db, user }) => {
      const n = await revokeOtherSessions(db, user.id, await token());
      await audit(db, user.id, "account.sessions", user.id, { closed: n });
      return n;
    },
    { allowTemporary: true },
  );
}
