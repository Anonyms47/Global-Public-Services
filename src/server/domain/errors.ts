export type ErrorCode =
  "validation" | "not_found" | "conflict" | "stock" | "forbidden" | "session_expired" | "internal";

/** Erreur métier : message destiné à l'utilisateur, en français. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const fail = (code: ErrorCode, message: string, fieldErrors?: Record<string, string>): never => {
  throw new AppError(code, message, fieldErrors);
};

export const newId = () => crypto.randomUUID();
