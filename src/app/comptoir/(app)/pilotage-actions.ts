"use server";

import { z } from "zod";
import { guarded, serverEnv } from "@/server/admin";
import { AppError } from "@/server/domain/errors";
import { getSettings } from "@/server/domain/settings";
import { addManualTask, updateQueueItem } from "@/server/domain/queue";
import { launchChecks, setTargetMode } from "@/server/domain/launch";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError("validation", r.error.issues[0]?.message ?? "Données invalides.");
  return r.data;
}

const change = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), userId: z.string().nullable() }),
  z.object({ action: z.literal("note"), note: z.string().max(1000) }),
  z.object({ action: z.literal("snooze"), until: z.coerce.date() }),
  z.object({ action: z.literal("resolve") }),
  z.object({ action: z.literal("reopen") }),
]);

export async function queueAction(key: string, input: unknown) {
  return guarded("queue.manage", async ({ db, user }) => {
    const s = await getSettings(db);
    await updateQueueItem(db, user, String(key).slice(0, 200), parse(change, input), s.stock.defaultLowThreshold);
    return null;
  });
}

export async function addTaskAction(input: unknown) {
  return guarded(
    "queue.manage",
    ({ db, user }) => {
      const d = parse(
        z.object({
          title: z.string().max(200),
          note: z.string().max(1000).optional(),
          assigneeId: z.string().nullable().optional(),
        }),
        input,
      );
      return addManualTask(db, user, d);
    },
    { message: "Tâche ajoutée à la file." },
  );
}

export async function setTargetModeAction(input: unknown) {
  return guarded(
    "shop.mode",
    async ({ db, user }) => {
      const d = parse(z.object({ mode: z.enum(["demo", "test", "open"]), confirmation: z.string().max(40) }), input);
      const checks = await launchChecks(db, await getSettings(db), serverEnv());
      await setTargetMode(db, user, d.mode, d.confirmation, checks);
      return null;
    },
    { message: "Mode visé enregistré et journalisé. Le serveur n'a pas été basculé." },
  );
}
