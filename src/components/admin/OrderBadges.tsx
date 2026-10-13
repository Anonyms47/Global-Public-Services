import { Badge } from "./ui";
import {
  channelLabels,
  fulfillmentLabels,
  paymentLabels,
  receptionLabels,
  type Channel,
  type Fulfillment,
  type OrderStatus,
  type Reception,
} from "@/server/domain/orders";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return status === "cancelled" ? (
    <Badge tone="red">Annulée</Badge>
  ) : status === "completed" ? (
    <Badge tone="ink">Terminée</Badge>
  ) : (
    <Badge tone="blue">Confirmée</Badge>
  );
}

export function FulfillmentBadge({
  f,
  reception,
  status,
}: {
  f: Fulfillment;
  reception: Reception;
  status: OrderStatus;
}) {
  if (status === "cancelled") return <Badge>—</Badge>;
  const tone = f === "to_prepare" ? "red" : f === "handed_over" ? "green" : "warn";
  const label =
    f === "ready" ? (reception === "delivery" ? "Prête à livrer" : "Prête au retrait") : fulfillmentLabels[f];
  return <Badge tone={tone}>{reception === "immediate" ? "Remise au comptoir" : label}</Badge>;
}

export function PaymentBadge({ p }: { p: keyof typeof paymentLabels }) {
  const tone =
    p === "paid" ? "green" : p === "partial" ? "warn" : p === "to_refund" ? "red" : p === "unpaid" ? "red" : "neutral";
  return <Badge tone={tone}>{paymentLabels[p]}</Badge>;
}

export function ChannelLabel({ c, r }: { c: Channel; r: Reception }) {
  return (
    <span className="text-[13px] text-ink-mute">
      {channelLabels[c]} · {receptionLabels[r]}
    </span>
  );
}
