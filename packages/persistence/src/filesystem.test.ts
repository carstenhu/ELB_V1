import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyCase, createEmptyClerk, createEmptyMasterData } from "@elb/domain/index";
import { hydrateSnapshotFromDisk, persistExportArtifactsToDisk, persistSnapshotToDisk } from "./filesystem";

class MemoryStorage {
  private readonly items = new Map<string, string>();

  clear() {
    this.items.clear();
  }

  getItem(key: string) {
    return this.items.has(key) ? this.items.get(key)! : null;
  }

  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.items.delete(key);
  }

  setItem(key: string, value: string) {
    this.items.set(key, value);
  }

  get length() {
    return this.items.size;
  }

  entries() {
    return [...this.items.entries()];
  }
}

const localStorageMock = new MemoryStorage();

function buildMasterData() {
  const masterData = createEmptyMasterData();
  masterData.clerks.push(createEmptyClerk({ id: "clerk-1", name: "Carsten Huebler", email: "carsten@example.com", phone: "123" }));
  masterData.clerks.push(createEmptyClerk({ id: "clerk-2", name: "Cyril Koller", email: "cyril@example.com", phone: "456" }));
  masterData.auctions.push({ id: "auction-1", number: "123", month: "03", year: "2026" });
  masterData.departments.push({ id: "dep-1", code: "MOB", name: "Mobiliar" });
  return masterData;
}

describe("filesystem dossier storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", localStorageMock);
    Reflect.deleteProperty(globalThis as object, "__TAURI_INTERNALS__");
    localStorageMock.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists and reloads current dossier pointers and dossier files per clerk", async () => {
    const masterData = buildMasterData();
    const currentCase = createEmptyCase({
      id: "case-current",
      clerkId: "clerk-1",
      receiptNumber: "2001",
      createdAt: "2026-03-22T10:00:00.000Z"
    });
    currentCase.meta.updatedAt = "2026-03-22T10:05:00.000Z";
    currentCase.consignor.lastName = "Infanger";

    const secondaryCase = createEmptyCase({
      id: "case-other",
      clerkId: "clerk-2",
      receiptNumber: "3001",
      createdAt: "2026-03-22T11:00:00.000Z"
    });
    secondaryCase.meta.updatedAt = "2026-03-22T11:05:00.000Z";
    secondaryCase.consignor.company = "Koller AG";

    await persistSnapshotToDisk({
      masterData,
      activeClerkId: "clerk-1",
      currentCase,
      currentDossierIdByClerk: {
        "clerk-1": "case-current",
        "clerk-2": "case-other"
      },
      dossiers: [currentCase, secondaryCase]
    });

    const keys = localStorageMock.entries().map(([key]) => key);
    expect(keys.some((key) => key.includes("Sachbearbeiter/Carsten_Huebler/current.json"))).toBe(true);
    expect(keys.some((key) => key.includes("Sachbearbeiter/Carsten_Huebler/Dossiers/case-current/dossier.json"))).toBe(true);
    expect(keys.some((key) => key.includes("Sachbearbeiter/Cyril_Koller/current.json"))).toBe(true);
    expect(keys.some((key) => key.includes("Sachbearbeiter/Cyril_Koller/Dossiers/case-other/dossier.json"))).toBe(true);

    const hydrated = await hydrateSnapshotFromDisk();

    expect(hydrated).not.toBeNull();
    expect(hydrated?.activeClerkId).toBe("clerk-1");
    expect(hydrated?.currentCase?.meta.id).toBe("case-current");
    expect(hydrated?.currentDossierIdByClerk["clerk-1"]).toBe("case-current");
    expect(hydrated?.currentDossierIdByClerk["clerk-2"]).toBe("case-other");
    expect(hydrated?.dossiers.map((caseFile) => caseFile.meta.id)).toEqual(["case-other", "case-current"]);
  });

  it("increments zip export versions across timestamped export folders", async () => {
    const masterData = buildMasterData();
    const caseFile = createEmptyCase({
      id: "case-export",
      clerkId: "clerk-1",
      receiptNumber: "4001",
      createdAt: "2026-03-22T12:00:00.000Z"
    });

    await persistSnapshotToDisk({
      masterData,
      activeClerkId: "clerk-1",
      currentCase: caseFile,
      currentDossierIdByClerk: {
        "clerk-1": "case-export"
      },
      dossiers: [caseFile]
    });

    const firstExport = await persistExportArtifactsToDisk({
      caseFile,
      artifacts: [],
      zipFileName: "ELB_4001.zip",
      zipContent: new Uint8Array([1, 2, 3])
    });
    const secondExport = await persistExportArtifactsToDisk({
      caseFile,
      artifacts: [],
      zipFileName: "ELB_4001.zip",
      zipContent: new Uint8Array([4, 5, 6])
    });

    expect(firstExport.savedPath.endsWith("ELB_4001_v1.zip")).toBe(true);
    expect(secondExport.savedPath.endsWith("ELB_4001_v2.zip")).toBe(true);
  });
});
