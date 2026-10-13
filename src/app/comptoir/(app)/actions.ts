"use server";

import { guarded } from "@/server/admin";
import { globalSearch } from "@/server/domain/search";

export async function searchAction(q: string) {
  return guarded("orders.view", ({ db }) => globalSearch(db, String(q).slice(0, 80)));
}
