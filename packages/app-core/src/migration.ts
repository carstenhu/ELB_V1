import { z } from "zod";
import { caseFileSchema, type CaseFile } from "@elb/domain/index";
import { AppError } from "./errors";

export const CURRENT_CASE_SCHEMA_VERSION = 2;

const caseEnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string().optional(),
  caseFile: caseFileSchema
});

export type CaseEnvelope = z.infer<typeof caseEnvelopeSchema>;

export function createCaseEnvelope(caseFile: CaseFile): CaseEnvelope {
  return {
    schemaVersion: CURRENT_CASE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    caseFile
  };
}

export function migrateLegacyPayload(input: unknown): CaseEnvelope {
  const parsedEnvelope = caseEnvelopeSchema.safeParse(input);
  if (parsedEnvelope.success) {
    return parsedEnvelope.data;
  }

  const parsedCase = caseFileSchema.safeParse(input);
  if (parsedCase.success) {
    return {
      schemaVersion: 1,
      caseFile: parsedCase.data
    };
  }

  throw new AppError("MIGRATION_ERROR", "Importdatei konnte nicht in ein unterstütztes Vorgangsformat überführt werden.", {
    envelopeIssues: parsedEnvelope.error.issues
  });
}
