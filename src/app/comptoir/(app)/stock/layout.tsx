import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/server/db";
import { stockTracking } from "@/server/domain/stock";

/** Suivi des quantités coupé (Paramètres → Stock) : les écrans de stock ne sont plus proposés. */
export default async function StockLayout({ children }: { children: ReactNode }) {
  if (!(await stockTracking(await getDb()))) redirect("/comptoir");
  return children;
}
