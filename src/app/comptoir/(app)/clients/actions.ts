"use server";

import { z } from "zod";
import { guarded } from "@/server/admin";
import { isDemoMode } from "@/server/db";
import { AppError } from "@/server/domain/errors";
import { createCustomer, updateCustomer } from "@/server/domain/customers";

const schema = z.object({
  name: z.string().max(120),
  phone: z.string().max(40),
  email: z.string().max(120).optional(),
  address: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
});

function parse(input: unknown) {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError("validation", "Données invalides.");
  return r.data;
}

export async function createCustomerAction(input: unknown, allowDuplicate: boolean) {
  return guarded("customers.edit", ({ db }) =>
    createCustomer(db, parse(input), {
      allowDuplicate: !!allowDuplicate,
      isDemo: isDemoMode(),
    }),
  );
}

export async function updateCustomerAction(id: string, input: unknown) {
  return guarded("customers.edit", ({ db }) => updateCustomer(db, String(id), parse(input)), {
    message: "Fiche client enregistrée.",
  });
}
