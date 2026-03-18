import JSZip from "jszip";
import { caseFileSchema, type CaseFile } from "@elb/domain/index";
import { AppError, toAppError } from "./errors";
import { createCaseEnvelope, migrateLegacyPayload, type CaseEnvelope } from "./migration";
import { validateCaseBusinessRules, validateCaseSchema } from "./validation";

export interface ImportCaseResult {
  envelope: CaseEnvelope;
  caseFile: CaseFile;
  warnings: string[];
}

function validateImportedCase(caseFile: CaseFile): string[] {
  const schemaReport = validateCaseSchema(caseFile);
  if (!schemaReport.isValid) {
    throw new AppError("IMPORT_ERROR", "Importierte Daten sind schema-ungültig.", schemaReport.issues);
  }

  const domainReport = validateCaseBusinessRules(caseFile);
  return domainReport.issues.filter((issue) => issue.severity === "warning").map((issue) => issue.message);
}

export function importCaseFromJson(jsonText: string): ImportCaseResult {
  try {
    const raw = JSON.parse(jsonText) as unknown;
    const envelope = migrateLegacyPayload(raw);
    const warnings = validateImportedCase(envelope.caseFile);
    return {
      envelope,
      caseFile: envelope.caseFile,
      warnings
    };
  } catch (error) {
    throw toAppError(error, "IMPORT_ERROR", "JSON-Import fehlgeschlagen.");
  }
}

export async function importCaseFromZip(input: Blob | ArrayBuffer): Promise<ImportCaseResult> {
  try {
    const zip = await JSZip.loadAsync(input);
    const payloadFile = zip.file(/payload\.json$/i)[0];

    if (!payloadFile) {
      throw new AppError("IMPORT_ERROR", "ZIP enthält keine payload.json.");
    }

    const jsonText = await payloadFile.async("text");
    return importCaseFromJson(jsonText);
  } catch (error) {
    throw toAppError(error, "IMPORT_ERROR", "ZIP-Import fehlgeschlagen.");
  }
}

export function exportCaseToJsonEnvelope(caseFile: CaseFile): string {
  return JSON.stringify(createCaseEnvelope(caseFile), null, 2);
}
