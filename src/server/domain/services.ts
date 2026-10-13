import type { Db } from "../db/client";
import { fail, newId } from "./errors";

export interface Service {
  id: string;
  title: string;
  summary: string;
  operators: string;
  operations: string;
  hours: string;
  confirmed: boolean;
  position: number;
  is_demo: boolean;
}

export async function listServices(
  db: Db,
  opts: { publicOnly?: boolean } = {},
) {
  return db.query<Service>(
    `select * from services ${opts.publicOnly ? "where confirmed or is_demo" : ""} order by position, created_at`,
  );
}

export async function saveService(
  db: Db,
  input: Omit<Service, "id" | "position" | "is_demo"> & { id?: string },
) {
  if (!input.title.trim())
    fail("validation", "Le titre est obligatoire.", { title: "Obligatoire." });
  if (input.id) {
    await db.query(
      "update services set title=$2, summary=$3, operators=$4, operations=$5, hours=$6, confirmed=$7 where id=$1",
      [
        input.id,
        input.title.trim(),
        input.summary,
        input.operators,
        input.operations,
        input.hours,
        input.confirmed,
      ],
    );
    return input.id;
  }
  const id = newId();
  const pos = await db.one<{ n: number }>(
    "select coalesce(max(position), 0)::int + 1 as n from services",
  );
  await db.query(
    "insert into services (id, title, summary, operators, operations, hours, confirmed, position) values ($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      id,
      input.title.trim(),
      input.summary,
      input.operators,
      input.operations,
      input.hours,
      input.confirmed,
      pos!.n,
    ],
  );
  return id;
}

export async function deleteService(db: Db, id: string) {
  await db.query("delete from services where id = $1", [id]);
}
