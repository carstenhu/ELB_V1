import { z } from "zod";
import type { CaseFile } from "./types";

export const requiredFieldKeySchema = z.enum([
  "meta.receiptNumber",
  "meta.clerkId",
  "consignor.lastName",
  "consignor.street",
  "consignor.zip",
  "consignor.city",
  "bank.beneficiaryOverride.reason",
  "bank.beneficiaryOverride.name",
  "objects[].departmentId",
  "objects[].shortDescription"
]);

export type RequiredFieldKey = z.infer<typeof requiredFieldKeySchema>;

export type RequiredFieldInputKind = "text" | "select";

export interface MissingRequiredField {
  key: RequiredFieldKey | "objects[].create";
  label: string;
  inputKind: RequiredFieldInputKind | "action";
  objectIndex?: number;
}

const requiredFieldMetadata: Record<RequiredFieldKey, { label: string; inputKind: RequiredFieldInputKind; objectScoped: boolean }> = {
  "meta.receiptNumber": { label: "ELB-Nummer", inputKind: "text", objectScoped: false },
  "meta.clerkId": { label: "Sachbearbeiter", inputKind: "select", objectScoped: false },
  "consignor.lastName": { label: "Nachname Einlieferer", inputKind: "text", objectScoped: false },
  "consignor.street": { label: "Strasse Einlieferer", inputKind: "text", objectScoped: false },
  "consignor.zip": { label: "PLZ Einlieferer", inputKind: "text", objectScoped: false },
  "consignor.city": { label: "Stadt Einlieferer", inputKind: "text", objectScoped: false },
  "bank.beneficiaryOverride.reason": { label: "Grund abweichender Beguenstigter", inputKind: "text", objectScoped: false },
  "bank.beneficiaryOverride.name": { label: "Name abweichender Beguenstigter", inputKind: "text", objectScoped: false },
  "objects[].departmentId": { label: "Abteilung", inputKind: "select", objectScoped: true },
  "objects[].shortDescription": { label: "Kurzbeschrieb", inputKind: "text", objectScoped: true }
};

const objectScopedRequiredFieldKeys = requiredFieldKeySchema.options.filter((key) => requiredFieldMetadata[key].objectScoped);

export function isRequiredFieldKey(value: string): value is RequiredFieldKey {
  return requiredFieldKeySchema.safeParse(value).success;
}

export function normalizeRequiredFieldKeys(values: readonly string[]): RequiredFieldKey[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(isRequiredFieldKey)
    )
  );
}

export function getRequiredFieldLabel(key: RequiredFieldKey, objectIndex?: number): string {
  const metadata = requiredFieldMetadata[key];
  if (!metadata.objectScoped || objectIndex === undefined) {
    return metadata.label;
  }

  return `Objekt ${objectIndex + 1}: ${metadata.label}`;
}

export function getRequiredFieldInputKind(key: RequiredFieldKey): RequiredFieldInputKind {
  return requiredFieldMetadata[key].inputKind;
}

function isRequiredFieldMissing(caseFile: CaseFile, key: RequiredFieldKey, objectIndex?: number): boolean {
  if (key === "meta.receiptNumber") {
    return !caseFile.meta.receiptNumber.trim();
  }
  if (key === "meta.clerkId") {
    return !caseFile.meta.clerkId.trim();
  }
  if (key === "consignor.lastName") {
    return !caseFile.consignor.lastName.trim() && !caseFile.consignor.company.trim();
  }
  if (key === "consignor.street") {
    return !caseFile.consignor.street.trim();
  }
  if (key === "consignor.zip") {
    return !caseFile.consignor.zip.trim();
  }
  if (key === "consignor.city") {
    return !caseFile.consignor.city.trim();
  }
  if (key === "bank.beneficiaryOverride.reason") {
    return caseFile.bank.beneficiaryOverride.enabled && !caseFile.bank.beneficiaryOverride.reason.trim();
  }
  if (key === "bank.beneficiaryOverride.name") {
    return caseFile.bank.beneficiaryOverride.enabled && !caseFile.bank.beneficiaryOverride.name.trim();
  }

  const objectItem = objectIndex === undefined ? null : caseFile.objects[objectIndex] ?? null;
  if (!objectItem) {
    return false;
  }

  if (key === "objects[].departmentId") {
    return !objectItem.departmentId.trim();
  }
  if (key === "objects[].shortDescription") {
    return !objectItem.shortDescription.trim();
  }

  return false;
}

export function collectMissingRequiredFields(caseFile: CaseFile, requiredFields: readonly RequiredFieldKey[]): MissingRequiredField[] {
  const entries: MissingRequiredField[] = [];

  requiredFields.forEach((key) => {
    const metadata = requiredFieldMetadata[key];
    if (metadata.objectScoped) {
      return;
    }

    if (isRequiredFieldMissing(caseFile, key)) {
      entries.push({
        key,
        label: getRequiredFieldLabel(key),
        inputKind: metadata.inputKind
      });
    }
  });

  if (!caseFile.objects.length) {
    if (requiredFields.some((key) => objectScopedRequiredFieldKeys.includes(key))) {
      entries.push({
        key: "objects[].create",
        label: "Mindestens ein Objekt",
        inputKind: "action"
      });
    }
    return entries;
  }

  caseFile.objects.forEach((_, objectIndex) => {
    objectScopedRequiredFieldKeys.forEach((key) => {
      if (!requiredFields.includes(key)) {
        return;
      }

      if (isRequiredFieldMissing(caseFile, key, objectIndex)) {
        entries.push({
          key,
          label: getRequiredFieldLabel(key, objectIndex),
          inputKind: requiredFieldMetadata[key].inputKind,
          objectIndex
        });
      }
    });
  });

  return entries;
}
