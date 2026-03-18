import { describe, expect, it } from "vitest";
import { createEmptyCase } from "@elb/domain/index";
import { createCaseEnvelope, migrateLegacyPayload } from "./migration";

describe("migration", () => {
  it("keeps current envelopes intact", () => {
    const caseFile = createEmptyCase({ id: "case-1", clerkId: "clerk-1", receiptNumber: "0001", createdAt: "2026-03-18T10:00:00.000Z" });
    const envelope = createCaseEnvelope(caseFile);
    expect(migrateLegacyPayload(envelope).caseFile.meta.id).toBe("case-1");
  });

  it("migrates legacy raw case payloads", () => {
    const caseFile = createEmptyCase({ id: "case-legacy", clerkId: "clerk-1", receiptNumber: "0001", createdAt: "2026-03-18T10:00:00.000Z" });
    const migrated = migrateLegacyPayload(caseFile);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.caseFile.meta.id).toBe("case-legacy");
  });
});
