export type AppErrorCode =
  | "VALIDATION_ERROR"
  | "CASE_NOT_FOUND"
  | "NO_ACTIVE_CLERK"
  | "IMPORT_ERROR"
  | "MIGRATION_ERROR"
  | "EXPORT_NOT_READY";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export function toAppError(error: unknown, fallbackCode: AppErrorCode, fallbackMessage: string): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(fallbackCode, error.message, { cause: error.name });
  }

  return new AppError(fallbackCode, fallbackMessage, { cause: error });
}
