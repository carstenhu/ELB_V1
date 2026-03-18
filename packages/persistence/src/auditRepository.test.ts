import { describe, expect, it, vi } from "vitest";

const appendAuditEntryToDisk = vi.fn();
const loadAuditLogFromDisk = vi.fn();

vi.mock("./filesystem", () => ({
  appendAuditEntryToDisk,
  loadAuditLogFromDisk
}));

describe("createAuditRepository", () => {
  it("delegiert append und list an das Dateisystem", async () => {
    const { createAuditRepository } = await import("./auditRepository");
    const repository = createAuditRepository();
    const entry = {
      id: "audit-1",
      timestamp: "2026-03-18T00:00:00.000Z",
      actorId: "clerk-1",
      action: "case.created",
      entityType: "case" as const,
      entityId: "case-1",
      summary: "Vorgang 0001 wurde erstellt."
    };

    loadAuditLogFromDisk.mockResolvedValue([entry]);

    await repository.append(entry);
    const items = await repository.list();

    expect(appendAuditEntryToDisk).toHaveBeenCalledWith(entry);
    expect(items).toEqual([entry]);
  });
});
