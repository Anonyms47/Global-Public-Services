import { currentUser } from "@/server/admin";
import { getDb } from "@/server/db";
import { getOrder } from "@/server/domain/orders";
import { getSettings } from "@/server/domain/settings";
import { receiptPdf } from "@/server/receipt";
import { can } from "@/lib/permissions";

/** Reçu en PDF : session et droits vérifiés côté serveur. */
export async function GET(_req: Request, { params }: RouteContext<"/comptoir/recus/[id]/pdf">) {
  const user = await currentUser();
  if (!user) return new Response("Session expirée", { status: 401 });
  if (!can(user, "orders.view")) return new Response("Droits insuffisants", { status: 403 });
  const db = await getDb();
  const order = await getOrder(db, (await params).id);
  if (!order) return new Response("Reçu introuvable", { status: 404 });
  const body = receiptPdf(order, await getSettings(db));
  return new Response(body as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recu-${order.reference.replace(/[^\w-]/g, "")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
