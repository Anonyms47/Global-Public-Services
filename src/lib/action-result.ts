import type { ErrorCode } from "@/server/domain/errors";

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | {
      ok: false;
      code: ErrorCode;
      error: string;
      fieldErrors?: Record<string, string>;
    };
