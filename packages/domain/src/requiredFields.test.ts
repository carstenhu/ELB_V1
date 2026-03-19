import { describe, expect, it } from "vitest";
import { createEmptyCase } from "./defaults";
import { collectMissingRequiredFields, normalizeRequiredFieldKeys } from "./requiredFields";

describe("required field helpers", () => {
  it("normalizes and filters configured required fields", () => {
    expect(normalizeRequiredFieldKeys([" meta.receiptNumber ", "unknown", "meta.receiptNumber", "objects[].shortDescription"])).toEqual([
      "meta.receiptNumber",
      "objects[].shortDescription"
    ]);
  });

  it("creates explicit object creation entries when object-scoped fields are configured", () => {
    const caseFile = createEmptyCase({ id: "case-1", clerkId: "clerk-1", receiptNumber: "0001", createdAt: "2026-03-18T10:00:00.000Z" });

    expect(collectMissingRequiredFields(caseFile, ["objects[].shortDescription"])).toEqual([
      {
        key: "objects[].create",
        label: "Mindestens ein Objekt",
        inputKind: "action"
      }
    ]);
  });
});
