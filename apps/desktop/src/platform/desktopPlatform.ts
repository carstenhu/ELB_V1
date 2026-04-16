import JSZip from "jszip";
import { createAuditRepository } from "@elb/persistence/auditRepository";
import { importMasterDataFromJson, serializeMasterData } from "@elb/persistence/masterDataSync";
import {
  getClerkDataDirectoryRelativePath,
  persistCaseAssetImmediately,
  persistExportArtifactsToDisk,
  persistGeneratedPdfToDisk
} from "@elb/persistence/filesystem";
import { migrateLegacyPayload, type WorkspaceRepository, type WorkspaceSnapshot } from "@elb/app-core/index";
import { createMasterDataRepository, createWorkspaceRepository } from "@elb/persistence/repository";
import { createLogger } from "@elb/shared/logger";
import type { AppPlatform } from "@elb/client-app/platform/platformTypes";
import { loadSeedMasterData, normalizeRequiredFieldKeys, type CaseFile, type MasterData } from "@elb/domain/index";
import { desktopDossierSyncStatusStore } from "./desktopDossierSyncStatus";

const logger = createLogger("desktop-platform");
const DEFAULT_SUPABASE_BUCKET = "elb-v1-data";
const DEFAULT_SUPABASE_URL = "https://rlcrejoilwzqbidfbapl.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vH2hrtDsZivGn2X7R2A9lg_OQG7DPEj";
const REMOTE_MASTER_DATA_PATH = "Stammdaten/master-data.json";
const REMOTE_DOSSIER_EXPORTS_ROOT = "desktop-dossiers";
const REMOTE_WORKSPACE_META_PATH = "workspace.json";
const REMOTE_CURRENT_POINTER_FILE_NAME = "current.json";
const REMOTE_DOSSIER_FILE_NAME = "dossier.json";
const REMOTE_ASSET_REF_PREFIX = "remote://";
const APP_DATA_EXPORT_ROOT = "Daten_zip";
const PENDING_WORKSPACE_SYNC_FILE = `${APP_DATA_EXPORT_ROOT}/pending-workspace-sync.json`;
const PENDING_EXPORT_UPLOADS_FILE = `${APP_DATA_EXPORT_ROOT}/pending-export-uploads.json`;

interface RemoteWorkspaceMeta {
  activeClerkId: string | null;
}

interface RemoteCurrentDossierPointer {
  caseId: string | null;
}

interface SupabaseListEntry {
  name: string;
  id: string | null;
}

interface PendingExportUpload {
  clerkId: string;
  caseId: string;
  zipFileName: string;
  localCachePath: string;
  queuedAt: string;
}

async function loadTauriCore() {
  const module = await import("@tauri-apps/api/core");
  if (typeof module.invoke !== "function") {
    throw new Error("Tauri Core API ist nicht verfuegbar.");
  }
  return module;
}

async function loadTauriDialog() {
  return import("@tauri-apps/plugin-dialog");
}

async function loadTauriFs() {
  return import("@tauri-apps/plugin-fs");
}

function toError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string" && error.trim()) return new Error(error);
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") return new Error(serialized);
  } catch {
    // Ignore serialization failures.
  }
  return new Error(fallback);
}

function parseJsonSafely<T>(raw: string | null, fallback: T): T {
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getDesktopSupabaseConfig(): { url: string; key: string; bucket: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim()
    || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
    || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
    || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  return {
    url,
    key,
    bucket: import.meta.env.VITE_SUPABASE_BUCKET?.trim() || DEFAULT_SUPABASE_BUCKET
  };
}

function buildSupabaseObjectUrl(url: string, bucket: string, path: string): string {
  const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${url.replace(/\/+$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
}

function buildSupabaseListUrl(url: string, bucket: string): string {
  return `${url.replace(/\/+$/, "")}/storage/v1/object/list/${encodeURIComponent(bucket)}`;
}

function createSupabaseAuthHeaders(config: { key: string }): HeadersInit {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`
  };
}

function sanitizeRemoteSegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "unassigned";
}

function buildRemoteExportPath(clerkId: string, caseId: string, zipFileName: string): string {
  return `${REMOTE_DOSSIER_EXPORTS_ROOT}/${sanitizeRemoteSegment(clerkId)}/${sanitizeRemoteSegment(caseId)}/${sanitizeRemoteSegment(zipFileName)}`;
}

function getRemoteClerkRoot(clerkId: string): string {
  return `clerks/${sanitizeRemoteSegment(clerkId)}`;
}

function getRemoteCurrentPointerPath(clerkId: string): string {
  return `${getRemoteClerkRoot(clerkId)}/${REMOTE_CURRENT_POINTER_FILE_NAME}`;
}

function getRemoteDossiersRoot(clerkId: string): string {
  return `${getRemoteClerkRoot(clerkId)}/dossiers`;
}

function toDataUrl(mimeType: string, bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) {
    binary += String.fromCharCode(value);
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function isRemoteAssetRef(path: string): boolean {
  return path.startsWith(REMOTE_ASSET_REF_PREFIX);
}

function fromRemoteAssetRef(path: string): string {
  return path.slice(REMOTE_ASSET_REF_PREFIX.length);
}

async function toBinaryBytes(input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Blob) return new Uint8Array(await input.arrayBuffer());
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function createTimestampSegment(): string {
  return new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-").replace("T", "_").replace("Z", "");
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error("Asset liegt nicht als Data-URL vor.");
  }
  return {
    mimeType: match[1] || "image/jpeg",
    bytes: Uint8Array.from(atob(match[2] || ""), (char) => char.charCodeAt(0))
  };
}

function getAssetExtension(mimeType: string, fileName: string): string {
  if (mimeType === "image/png" || fileName.toLowerCase().endsWith(".png")) return ".png";
  if (mimeType === "image/webp" || fileName.toLowerCase().endsWith(".webp")) return ".webp";
  if (mimeType === "image/gif" || fileName.toLowerCase().endsWith(".gif")) return ".gif";
  return ".jpg";
}

function toRemoteAssetRef(path: string): string {
  return `${REMOTE_ASSET_REF_PREFIX}${path}`;
}

async function readAppDataJson<T>(path: string): Promise<T | null> {
  const fs = await loadTauriFs();
  if (!("exists" in fs) || !("readTextFile" in fs)) {
    return null;
  }
  const exists = await fs.exists(path, { baseDir: fs.BaseDirectory.AppLocalData });
  if (!exists) {
    return null;
  }
  const raw = await fs.readTextFile(path, { baseDir: fs.BaseDirectory.AppLocalData });
  if (!raw.trim()) {
    return null;
  }
  return JSON.parse(raw) as T;
}

async function writeAppDataJson(path: string, value: unknown): Promise<void> {
  const fs = await loadTauriFs();
  if (!("mkdir" in fs) || !("writeTextFile" in fs)) {
    return;
  }
  await fs.mkdir(APP_DATA_EXPORT_ROOT, { baseDir: fs.BaseDirectory.AppLocalData, recursive: true });
  await fs.writeTextFile(path, JSON.stringify(value, null, 2), { baseDir: fs.BaseDirectory.AppLocalData });
}

async function deleteAppDataFile(path: string): Promise<void> {
  const fs = await loadTauriFs();
  if (!("exists" in fs) || !("writeTextFile" in fs)) {
    return;
  }
  const exists = await fs.exists(path, { baseDir: fs.BaseDirectory.AppLocalData });
  if (!exists) {
    return;
  }
  await fs.writeTextFile(path, "", { baseDir: fs.BaseDirectory.AppLocalData });
}

async function downloadTextFromSupabase(config: { url: string; key: string; bucket: string }, path: string): Promise<string | null> {
  const response = await fetch(buildSupabaseObjectUrl(config.url, config.bucket, path), {
    headers: createSupabaseAuthHeaders(config)
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Supabase-Datei konnte nicht geladen werden (${response.status}): ${path}`);
  }

  return response.text();
}

async function downloadBinaryFromSupabase(config: { url: string; key: string; bucket: string }, path: string): Promise<{ mimeType: string; bytes: Uint8Array } | null> {
  const response = await fetch(buildSupabaseObjectUrl(config.url, config.bucket, path), {
    headers: createSupabaseAuthHeaders(config)
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Supabase-Binaerdatei konnte nicht geladen werden (${response.status}): ${path}`);
  }

  const mimeType = response.headers.get("content-type") || "application/octet-stream";
  return {
    mimeType,
    bytes: new Uint8Array(await response.arrayBuffer())
  };
}

async function listSupabaseEntries(config: { url: string; key: string; bucket: string }, prefix: string): Promise<SupabaseListEntry[]> {
  const response = await fetch(buildSupabaseListUrl(config.url, config.bucket), {
    method: "POST",
    headers: {
      ...createSupabaseAuthHeaders(config),
      "content-type": "application/json"
    },
    body: JSON.stringify({
      prefix,
      limit: 1000,
      offset: 0,
      sortBy: { column: "name", order: "desc" }
    })
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Supabase-Liste konnte nicht geladen werden (${response.status}): ${prefix || "/"}`);
  }

  const payload = await response.json() as Array<{ name?: unknown; id?: unknown }> | null;
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .filter((entry): entry is { name: string; id: string | null } => typeof entry?.name === "string")
    .map((entry) => ({ name: entry.name, id: typeof entry.id === "string" ? entry.id : null }));
}

async function uploadTextToSupabase(config: { url: string; key: string; bucket: string }, path: string, value: string): Promise<void> {
  const response = await fetch(buildSupabaseObjectUrl(config.url, config.bucket, path), {
    method: "POST",
    headers: {
      ...createSupabaseAuthHeaders(config),
      "x-upsert": "true",
      "content-type": "application/json"
    },
    body: value
  });
  if (!response.ok) {
    throw new Error(`Supabase-Textupload fehlgeschlagen (${response.status}): ${path}`);
  }
}

async function uploadBinaryToSupabase(config: { url: string; key: string; bucket: string }, path: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  const response = await fetch(buildSupabaseObjectUrl(config.url, config.bucket, path), {
    method: "POST",
    headers: {
      ...createSupabaseAuthHeaders(config),
      "x-upsert": "true",
      "content-type": mimeType
    },
    body: new Blob([toArrayBuffer(bytes)], { type: mimeType })
  });
  if (!response.ok) {
    throw new Error(`Supabase-Binaryupload fehlgeschlagen (${response.status}): ${path}`);
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function guessMimeTypeFromPath(path: string): string {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function hydrateDesktopZipAssets(zip: JSZip, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(caseFile.assets.map(async (asset) => {
    const sourcePath = (asset.optimizedPath || asset.originalPath || "").replace(/^\/+/, "");
    if (!sourcePath) {
      return asset;
    }

    const directFile = zip.file(sourcePath) ?? null;
    const fallbackName = sourcePath.split("/").at(-1);
    const fallbackFile = fallbackName
      ? (zip.file(new RegExp(`${escapeRegex(fallbackName)}$`, "i"))[0] ?? null)
      : null;
    const imageFile = directFile ?? fallbackFile;

    if (!imageFile) {
      return asset;
    }

    const bytes = await imageFile.async("uint8array");
    const dataUrl = toDataUrl(guessMimeTypeFromPath(imageFile.name), bytes);
    return {
      ...asset,
      originalPath: dataUrl,
      optimizedPath: dataUrl
    };
  }));

  return {
    ...caseFile,
    assets
  };
}

async function loadDesktopDossierFromZipBinary(zipBytes: Uint8Array): Promise<{ caseFile: CaseFile; masterData: MasterData | null } | null> {
  const zip = await JSZip.loadAsync(toArrayBuffer(zipBytes));
  const caseFileEntry = zip.file("case.json") ?? zip.file(/(^|\/)case\.json$/i)[0] ?? null;

  if (!caseFileEntry) {
    return null;
  }

  const caseRaw = await caseFileEntry.async("text");
  const envelope = migrateLegacyPayload(JSON.parse(caseRaw) as unknown);
  const hydratedCase = await hydrateDesktopZipAssets(zip, envelope.caseFile);

  const masterDataEntry = zip.file("master-data.json") ?? zip.file(/(^|\/)master-data\.json$/i)[0] ?? null;
  if (!masterDataEntry) {
    return { caseFile: hydratedCase, masterData: null };
  }

  try {
    return {
      caseFile: hydratedCase,
      masterData: importMasterDataFromJson(await masterDataEntry.async("text"))
    };
  } catch {
    return { caseFile: hydratedCase, masterData: null };
  }
}

async function loadRemoteDesktopDossiers(config: { url: string; key: string; bucket: string }): Promise<{ dossiers: CaseFile[]; masterDataCandidates: MasterData[] }> {
  const clerkEntries = await listSupabaseEntries(config, REMOTE_DOSSIER_EXPORTS_ROOT);
  const zipPaths: string[] = [];

  for (const clerkEntry of clerkEntries) {
    if (clerkEntry.id || !clerkEntry.name.trim()) {
      continue;
    }

    const clerkRoot = `${REMOTE_DOSSIER_EXPORTS_ROOT}/${clerkEntry.name}`;
    const caseEntries = await listSupabaseEntries(config, clerkRoot);
    for (const caseEntry of caseEntries) {
      if (caseEntry.id || !caseEntry.name.trim()) {
        continue;
      }

      const caseRoot = `${clerkRoot}/${caseEntry.name}`;
      const fileEntries = await listSupabaseEntries(config, caseRoot);
      fileEntries
        .filter((entry) => Boolean(entry.id) && entry.name.toLowerCase().endsWith(".zip"))
        .forEach((entry) => zipPaths.push(`${caseRoot}/${entry.name}`));
    }
  }

  const dossiers: CaseFile[] = [];
  const masterDataCandidates: MasterData[] = [];

  for (const zipPath of zipPaths) {
    try {
      const binary = await downloadBinaryFromSupabase(config, zipPath);
      if (!binary) {
        continue;
      }

      const loaded = await loadDesktopDossierFromZipBinary(binary.bytes);
      if (!loaded) {
        logger.warn(`Desktop-Dossier-ZIP ohne case.json wird uebersprungen: ${zipPath}`);
        continue;
      }

      dossiers.push(loaded.caseFile);
      if (loaded.masterData) {
        masterDataCandidates.push(loaded.masterData);
      }
    } catch (error) {
      logger.warn(`Desktop-Dossier-ZIP konnte nicht geladen werden: ${zipPath}`, error);
    }
  }

  return {
    dossiers: dedupeCases(dossiers),
    masterDataCandidates
  };
}

function buildRemoteSnapshot(args: {
  localSnapshot: WorkspaceSnapshot | null;
  workspaceSnapshot: WorkspaceSnapshot | null;
  desktopDossiers: CaseFile[];
  desktopMasterDataCandidates: MasterData[];
}): WorkspaceSnapshot | null {
  const desktopDossiers = dedupeCases(args.desktopDossiers);

  if (!args.workspaceSnapshot && desktopDossiers.length === 0) {
    return null;
  }

  const seedMasterData = args.localSnapshot?.masterData ?? loadSeedMasterData();
  const mergedDesktopMasterData = args.desktopMasterDataCandidates.reduce((current, candidate) => mergeMasterData(current, candidate), seedMasterData);

  if (!args.workspaceSnapshot) {
    const currentDossierIdByClerk: Record<string, string | null> = {};
    desktopDossiers.forEach((dossier) => {
      if (!currentDossierIdByClerk[dossier.meta.clerkId]) {
        currentDossierIdByClerk[dossier.meta.clerkId] = dossier.meta.id;
      }
    });

    const activeClerkId = args.localSnapshot?.activeClerkId ?? desktopDossiers[0]?.meta.clerkId ?? null;
    const snapshot: WorkspaceSnapshot = {
      masterData: mergedDesktopMasterData,
      activeClerkId,
      currentCase: null,
      currentDossierIdByClerk,
      dossiers: desktopDossiers
    };

    return {
      ...snapshot,
      currentCase: resolveCurrentCase(snapshot)
    };
  }

  const mergedCurrentByClerk = { ...args.workspaceSnapshot.currentDossierIdByClerk };
  desktopDossiers.forEach((dossier) => {
    if (!mergedCurrentByClerk[dossier.meta.clerkId]) {
      mergedCurrentByClerk[dossier.meta.clerkId] = dossier.meta.id;
    }
  });

  const snapshot: WorkspaceSnapshot = {
    ...args.workspaceSnapshot,
    masterData: mergeMasterData(args.workspaceSnapshot.masterData, mergedDesktopMasterData),
    currentDossierIdByClerk: mergedCurrentByClerk,
    dossiers: dedupeCases([...args.workspaceSnapshot.dossiers, ...desktopDossiers])
  };

  return {
    ...snapshot,
    currentCase: resolveCurrentCase(snapshot)
  };
}

function mergeMasterData(local: MasterData, remote: MasterData): MasterData {
  const mergeById = <T extends { id: string }>(left: T[], right: T[]) => {
    const byId = new Map<string, T>();
    left.forEach((item) => byId.set(item.id, item));
    right.forEach((item) => {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    });
    return [...byId.values()];
  };

  const mergeStrings = (left: string[], right: string[]) => {
    const values = new Set(left);
    right.forEach((value) => values.add(value));
    return [...values];
  };

  return {
    ...local,
    clerks: mergeById(local.clerks, remote.clerks),
    auctions: mergeById(local.auctions, remote.auctions),
    departments: mergeById(local.departments, remote.departments),
    titles: mergeStrings(local.titles, remote.titles),
    globalPdfRequiredFields: normalizeRequiredFieldKeys(mergeStrings(local.globalPdfRequiredFields, remote.globalPdfRequiredFields)),
    adminPin: local.adminPin || remote.adminPin
  };
}

function dedupeCases(caseFiles: readonly CaseFile[]): CaseFile[] {
  const byId = new Map<string, CaseFile>();

  caseFiles.forEach((caseFile) => {
    const existing = byId.get(caseFile.meta.id);
    if (!existing || caseFile.meta.updatedAt > existing.meta.updatedAt) {
      byId.set(caseFile.meta.id, caseFile);
    }
  });

  return [...byId.values()].sort((left, right) =>
    right.meta.updatedAt.localeCompare(left.meta.updatedAt, "de-CH", { numeric: true, sensitivity: "base" })
  );
}

function resolveCurrentCase(snapshot: WorkspaceSnapshot): CaseFile | null {
  if (snapshot.currentCase) {
    const updatedCurrent = snapshot.dossiers.find((dossier) => dossier.meta.id === snapshot.currentCase?.meta.id);
    if (updatedCurrent) {
      return updatedCurrent;
    }
  }

  if (!snapshot.activeClerkId) {
    return null;
  }

  const currentCaseId = snapshot.currentDossierIdByClerk[snapshot.activeClerkId];
  if (!currentCaseId) {
    return null;
  }

  return snapshot.dossiers.find((dossier) => dossier.meta.id === currentCaseId) ?? null;
}

function mergeWorkspaceSnapshots(localSnapshot: WorkspaceSnapshot | null, remoteSnapshot: WorkspaceSnapshot | null): WorkspaceSnapshot | null {
  if (!localSnapshot && !remoteSnapshot) {
    return null;
  }

  if (!localSnapshot) {
    return remoteSnapshot;
  }

  if (!remoteSnapshot) {
    return localSnapshot;
  }

  const merged: WorkspaceSnapshot = {
    masterData: mergeMasterData(localSnapshot.masterData, remoteSnapshot.masterData),
    activeClerkId: localSnapshot.activeClerkId ?? remoteSnapshot.activeClerkId,
    currentCase: localSnapshot.currentCase ?? remoteSnapshot.currentCase,
    currentDossierIdByClerk: {
      ...remoteSnapshot.currentDossierIdByClerk,
      ...localSnapshot.currentDossierIdByClerk
    },
    dossiers: dedupeCases([...localSnapshot.dossiers, ...remoteSnapshot.dossiers])
  };

  return {
    ...merged,
    currentCase: resolveCurrentCase(merged)
  };
}

function getRelevantClerkIds(snapshot: WorkspaceSnapshot): string[] {
  const ids = new Set<string>();
  snapshot.masterData.clerks.forEach((clerk) => ids.add(clerk.id));
  snapshot.dossiers.forEach((caseFile) => ids.add(caseFile.meta.clerkId));
  if (snapshot.currentCase?.meta.clerkId) ids.add(snapshot.currentCase.meta.clerkId);
  if (snapshot.activeClerkId) ids.add(snapshot.activeClerkId);
  return [...ids];
}

function getCasesForClerk(snapshot: WorkspaceSnapshot, clerkId: string): CaseFile[] {
  return dedupeCases(
    [snapshot.currentCase, ...snapshot.dossiers]
      .filter((caseFile): caseFile is CaseFile => Boolean(caseFile))
      .filter((caseFile) => caseFile.meta.clerkId === clerkId)
  );
}

async function persistRemoteAssetsForCase(config: { url: string; key: string; bucket: string }, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(caseFile.assets.map(async (asset) => {
    const source = asset.optimizedPath || asset.originalPath;
    if (!source.startsWith("data:")) {
      return asset;
    }

    const { mimeType, bytes } = parseDataUrl(source);
    const extension = getAssetExtension(mimeType, asset.fileName);
    const remotePath = `${getRemoteDossiersRoot(caseFile.meta.clerkId)}/${sanitizeRemoteSegment(caseFile.meta.id)}/assets/optimized/${asset.id}${extension}`;
    await uploadBinaryToSupabase(config, remotePath, bytes, mimeType);
    return {
      ...asset,
      originalPath: toRemoteAssetRef(remotePath),
      optimizedPath: toRemoteAssetRef(remotePath)
    };
  }));

  return {
    ...caseFile,
    assets
  };
}

async function saveWorkspaceSnapshotToSupabase(config: { url: string; key: string; bucket: string }, snapshot: WorkspaceSnapshot): Promise<void> {
  await uploadTextToSupabase(config, REMOTE_MASTER_DATA_PATH, JSON.stringify(snapshot.masterData, null, 2));
  await uploadTextToSupabase(config, REMOTE_WORKSPACE_META_PATH, JSON.stringify({
    activeClerkId: snapshot.activeClerkId,
    savedAt: new Date().toISOString()
  }, null, 2));

  for (const clerkId of getRelevantClerkIds(snapshot)) {
    const currentCaseId = snapshot.currentDossierIdByClerk[clerkId]
      ?? (snapshot.currentCase?.meta.clerkId === clerkId ? snapshot.currentCase.meta.id : null);
    await uploadTextToSupabase(config, getRemoteCurrentPointerPath(clerkId), JSON.stringify({
      caseId: currentCaseId,
      savedAt: new Date().toISOString()
    }, null, 2));

    await Promise.all(getCasesForClerk(snapshot, clerkId).map(async (caseFile) => {
      const persistedCase = await persistRemoteAssetsForCase(config, caseFile);
      const remoteDossierPath = `${getRemoteDossiersRoot(clerkId)}/${sanitizeRemoteSegment(caseFile.meta.id)}/${REMOTE_DOSSIER_FILE_NAME}`;
      await uploadTextToSupabase(config, remoteDossierPath, JSON.stringify(persistedCase, null, 2));
    }));
  }
}

async function queuePendingWorkspaceSync(snapshot: WorkspaceSnapshot): Promise<void> {
  await writeAppDataJson(PENDING_WORKSPACE_SYNC_FILE, snapshot);
}

async function loadPendingWorkspaceSync(): Promise<WorkspaceSnapshot | null> {
  return readAppDataJson<WorkspaceSnapshot>(PENDING_WORKSPACE_SYNC_FILE);
}

async function clearPendingWorkspaceSync(): Promise<void> {
  await deleteAppDataFile(PENDING_WORKSPACE_SYNC_FILE);
}

async function cacheExportZipLocally(args: { clerkId: string; caseId: string; zipFileName: string; zipContent: Blob | ArrayBuffer | Uint8Array }): Promise<string> {
  const fs = await loadTauriFs();
  if (!("mkdir" in fs) || !("writeFile" in fs)) {
    return "";
  }
  const targetRoot = `${APP_DATA_EXPORT_ROOT}/${sanitizeRemoteSegment(args.clerkId)}/${sanitizeRemoteSegment(args.caseId)}/${createTimestampSegment()}`;
  const targetPath = `${targetRoot}/${sanitizeRemoteSegment(args.zipFileName)}`;
  await fs.mkdir(targetRoot, { baseDir: fs.BaseDirectory.AppLocalData, recursive: true });
  await fs.writeFile(targetPath, await toBinaryBytes(args.zipContent), { baseDir: fs.BaseDirectory.AppLocalData });
  return targetPath;
}

async function readCachedZip(path: string): Promise<Uint8Array | null> {
  const fs = await loadTauriFs();
  if (!("exists" in fs) || !("readFile" in fs)) {
    return null;
  }
  const exists = await fs.exists(path, { baseDir: fs.BaseDirectory.AppLocalData });
  if (!exists) {
    return null;
  }
  return fs.readFile(path, { baseDir: fs.BaseDirectory.AppLocalData });
}

async function loadPendingExportUploads(): Promise<PendingExportUpload[]> {
  return (await readAppDataJson<PendingExportUpload[]>(PENDING_EXPORT_UPLOADS_FILE)) ?? [];
}

async function savePendingExportUploads(queue: PendingExportUpload[]): Promise<void> {
  if (!queue.length) {
    await deleteAppDataFile(PENDING_EXPORT_UPLOADS_FILE);
    return;
  }
  await writeAppDataJson(PENDING_EXPORT_UPLOADS_FILE, queue);
}

async function hydrateRemoteAssets(config: { url: string; key: string; bucket: string }, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(caseFile.assets.map(async (asset) => {
    const sourcePath = asset.optimizedPath || asset.originalPath;
    if (!isRemoteAssetRef(sourcePath)) {
      return asset;
    }

    const binary = await downloadBinaryFromSupabase(config, fromRemoteAssetRef(sourcePath));
    if (!binary) {
      return asset;
    }

    const dataUrl = toDataUrl(binary.mimeType, binary.bytes);
    return {
      ...asset,
      originalPath: dataUrl,
      optimizedPath: dataUrl
    };
  }));

  return {
    ...caseFile,
    assets
  };
}

async function loadRemoteClerkDossiers(config: { url: string; key: string; bucket: string }, clerkId: string): Promise<{ currentCaseId: string | null; dossiers: CaseFile[] } | null> {
  const currentPointerRaw = await downloadTextFromSupabase(config, getRemoteCurrentPointerPath(clerkId));
  const currentPointer = parseJsonSafely<RemoteCurrentDossierPointer | null>(currentPointerRaw, null);
  const dossierEntries = await listSupabaseEntries(config, getRemoteDossiersRoot(clerkId));

  if (!currentPointer && dossierEntries.length === 0) {
    return null;
  }

  const dossiers = await Promise.all(
    dossierEntries
      .filter((entry) => !entry.id && entry.name)
      .map(async (entry) => {
        try {
          const raw = await downloadTextFromSupabase(config, `${getRemoteDossiersRoot(clerkId)}/${entry.name}/${REMOTE_DOSSIER_FILE_NAME}`);
          if (!raw) {
            return null;
          }

          return hydrateRemoteAssets(config, JSON.parse(raw) as CaseFile);
        } catch (error) {
          logger.warn(`Remote-Dossier konnte nicht geladen werden (clerk=${clerkId}, dossier=${entry.name}).`, error);
          return null;
        }
      })
  );

  return {
    currentCaseId: currentPointer?.caseId ?? null,
    dossiers: dossiers.filter((dossier): dossier is CaseFile => Boolean(dossier))
  };
}

async function loadRemoteClerkDossiersByRoot(config: { url: string; key: string; bucket: string }, clerkRootSegment: string): Promise<{ clerkId: string; currentCaseId: string | null; dossiers: CaseFile[] } | null> {
  const currentPointerPath = `clerks/${clerkRootSegment}/${REMOTE_CURRENT_POINTER_FILE_NAME}`;
  const dossiersRoot = `clerks/${clerkRootSegment}/dossiers`;
  const currentPointerRaw = await downloadTextFromSupabase(config, currentPointerPath);
  const currentPointer = parseJsonSafely<RemoteCurrentDossierPointer | null>(currentPointerRaw, null);
  const dossierEntries = await listSupabaseEntries(config, dossiersRoot);

  if (!currentPointer && dossierEntries.length === 0) {
    return null;
  }

  const dossiers = await Promise.all(
    dossierEntries
      .filter((entry) => !entry.id && entry.name)
      .map(async (entry) => {
        try {
          const raw = await downloadTextFromSupabase(config, `${dossiersRoot}/${entry.name}/${REMOTE_DOSSIER_FILE_NAME}`);
          if (!raw) {
            return null;
          }

          return hydrateRemoteAssets(config, JSON.parse(raw) as CaseFile);
        } catch (error) {
          logger.warn(`Remote-Dossier konnte nicht geladen werden (root=${clerkRootSegment}, dossier=${entry.name}).`, error);
          return null;
        }
      })
  );

  const availableDossiers = dossiers.filter((dossier): dossier is CaseFile => Boolean(dossier));
  const inferredClerkId = availableDossiers[0]?.meta.clerkId || clerkRootSegment;
  return {
    clerkId: inferredClerkId,
    currentCaseId: currentPointer?.caseId ?? null,
    dossiers: availableDossiers
  };
}

async function loadRemoteWorkspaceSnapshot(config: { url: string; key: string; bucket: string }): Promise<WorkspaceSnapshot | null> {
  const [masterDataRaw, workspaceMetaRaw] = await Promise.all([
    downloadTextFromSupabase(config, REMOTE_MASTER_DATA_PATH),
    downloadTextFromSupabase(config, REMOTE_WORKSPACE_META_PATH)
  ]);

  let masterData: MasterData;
  try {
    masterData = masterDataRaw ? importMasterDataFromJson(masterDataRaw) : loadSeedMasterData();
  } catch (error) {
    logger.warn("Stammdaten aus Supabase konnten nicht geparst werden. Fallback auf Seed-Stammdaten.", error);
    masterData = loadSeedMasterData();
  }
  const workspaceMeta = parseJsonSafely<RemoteWorkspaceMeta | null>(workspaceMetaRaw, null);
  const knownClerkRoots = new Set(masterData.clerks.map((clerk) => sanitizeRemoteSegment(clerk.id)));
  let clerkRootEntries: SupabaseListEntry[] = [];
  try {
    clerkRootEntries = await listSupabaseEntries(config, "clerks");
  } catch (error) {
    logger.warn("Clerk-Roots konnten nicht aus Supabase gelistet werden.", error);
  }
  const discoveredRoots = clerkRootEntries
    .filter((entry) => !entry.id && entry.name.trim())
    .map((entry) => entry.name.trim());

  const loadedKnownClerks = await Promise.all(masterData.clerks.map(async (clerk) => ({
    clerkId: clerk.id,
    loaded: await loadRemoteClerkDossiers(config, clerk.id)
  })));

  const loadedDiscoveredRoots = await Promise.all(
    discoveredRoots
      .filter((root) => !knownClerkRoots.has(root))
      .map(async (root) => ({
        root,
        loaded: await loadRemoteClerkDossiersByRoot(config, root)
      }))
  );

  const currentDossierIdByClerk: Record<string, string | null> = {};
  const remoteDossiers: CaseFile[] = [];

  loadedKnownClerks.forEach(({ clerkId, loaded }) => {
    if (!loaded) {
      return;
    }

    currentDossierIdByClerk[clerkId] = loaded.currentCaseId;
    remoteDossiers.push(...loaded.dossiers);
  });

  loadedDiscoveredRoots.forEach(({ loaded }) => {
    if (!loaded) {
      return;
    }

    currentDossierIdByClerk[loaded.clerkId] = loaded.currentCaseId;
    remoteDossiers.push(...loaded.dossiers);
  });

  if (!masterDataRaw && remoteDossiers.length === 0 && !workspaceMeta) {
    return null;
  }

  const dossiers = dedupeCases(remoteDossiers);
  const activeClerkId = workspaceMeta?.activeClerkId ?? null;
  const currentCaseId = activeClerkId ? currentDossierIdByClerk[activeClerkId] : null;
  const currentCase = currentCaseId ? dossiers.find((dossier) => dossier.meta.id === currentCaseId) ?? null : null;

  return {
    masterData,
    activeClerkId,
    currentCase,
    currentDossierIdByClerk,
    dossiers
  };
}

function createDesktopWorkspaceRepository(): WorkspaceRepository {
  const localRepository = createWorkspaceRepository();
  let localPinnedDossierIds = new Set<string>();

  return {
    async load() {
      const localSnapshot = await localRepository.load();
      localPinnedDossierIds = new Set((localSnapshot?.dossiers ?? []).map((dossier) => dossier.meta.id));
      const supabaseConfig = getDesktopSupabaseConfig();

      if (!supabaseConfig) {
        desktopDossierSyncStatusStore.markLocalLoaded(localSnapshot);
        return localSnapshot;
      }

      try {
        const pendingSnapshot = await loadPendingWorkspaceSync();
        if (pendingSnapshot) {
          try {
            await saveWorkspaceSnapshotToSupabase(supabaseConfig, pendingSnapshot);
            await clearPendingWorkspaceSync();
          } catch (pendingError) {
            logger.warn("Ausstehender Workspace-Sync konnte noch nicht nach Supabase geschrieben werden.", pendingError);
          }
        }

        const workspaceSnapshot = await loadRemoteWorkspaceSnapshot(supabaseConfig);
        const desktopRemote = await loadRemoteDesktopDossiers(supabaseConfig);
        const remoteSnapshot = buildRemoteSnapshot({
          localSnapshot,
          workspaceSnapshot,
          desktopDossiers: desktopRemote.dossiers,
          desktopMasterDataCandidates: desktopRemote.masterDataCandidates
        });
        const mergedSnapshot = mergeWorkspaceSnapshots(localSnapshot, remoteSnapshot);

        if (!mergedSnapshot) {
          desktopDossierSyncStatusStore.markLocalLoaded(null);
          return null;
        }

        desktopDossierSyncStatusStore.markMergedLoaded({
          localSnapshot,
          remoteSnapshot,
          mergedSnapshot
        });
        return mergedSnapshot;
      } catch (error) {
        logger.warn("Desktop-Workspace konnte nicht aus Supabase geladen werden. Lokaler Stand wird verwendet.", error);
        desktopDossierSyncStatusStore.markLocalLoaded(localSnapshot);
        return localSnapshot;
      }
    },
    async save(snapshot) {
      if (snapshot.currentCase?.meta.id) {
        localPinnedDossierIds.add(snapshot.currentCase.meta.id);
      }

      const syncSnapshot = desktopDossierSyncStatusStore.getSnapshot();
      const syncedIds = new Set(
        Object.entries(syncSnapshot?.dossiers ?? {})
          .filter(([, entry]) => entry.state === "synced")
          .map(([id]) => id)
      );
      const dossiersToPersist = snapshot.dossiers.filter((dossier) =>
        localPinnedDossierIds.has(dossier.meta.id) || !syncedIds.has(dossier.meta.id)
      );
      dossiersToPersist.forEach((dossier) => localPinnedDossierIds.add(dossier.meta.id));

      const persistedDossierIdSet = new Set(dossiersToPersist.map((dossier) => dossier.meta.id));
      const persistedCurrentByClerk = Object.fromEntries(
        Object.entries(snapshot.currentDossierIdByClerk).map(([clerkId, caseId]) => [
          clerkId,
          caseId && persistedDossierIdSet.has(caseId) ? caseId : null
        ])
      ) as Record<string, string | null>;
      const persistedCurrentCase = snapshot.currentCase && persistedDossierIdSet.has(snapshot.currentCase.meta.id)
        ? snapshot.currentCase
        : null;
      const snapshotToPersist: WorkspaceSnapshot = {
        ...snapshot,
        currentCase: persistedCurrentCase,
        currentDossierIdByClerk: persistedCurrentByClerk,
        dossiers: dossiersToPersist
      };

      await localRepository.save(snapshotToPersist);
      const supabaseConfig = getDesktopSupabaseConfig();
      if (supabaseConfig) {
        try {
          const pendingSnapshot = await loadPendingWorkspaceSync();
          if (pendingSnapshot) {
            await saveWorkspaceSnapshotToSupabase(supabaseConfig, pendingSnapshot);
            await clearPendingWorkspaceSync();
          }
          await saveWorkspaceSnapshotToSupabase(supabaseConfig, snapshot);
        } catch (error) {
          logger.warn("Workspace konnte nicht direkt nach Supabase gespeichert werden. Wird spaeter erneut versucht.", error);
          await queuePendingWorkspaceSync(snapshot);
        }
      }
      desktopDossierSyncStatusStore.markSaved(snapshot, persistedDossierIdSet);
    }
  };
}

async function uploadExportZipToSupabase(args: { clerkId: string; caseId: string; zipFileName: string; zipContent: Blob | ArrayBuffer | Uint8Array }): Promise<string | null> {
  const config = getDesktopSupabaseConfig();
  if (!config) return null;

  const path = buildRemoteExportPath(args.clerkId, args.caseId, args.zipFileName);
  const response = await fetch(buildSupabaseObjectUrl(config.url, config.bucket, path), {
    method: "POST",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "x-upsert": "true",
      "content-type": "application/zip"
    },
    body: new Blob([toArrayBuffer(await toBinaryBytes(args.zipContent))], { type: "application/zip" })
  });

  if (!response.ok) {
    throw new Error(`Supabase-Upload fuer Dossier-ZIP fehlgeschlagen (${response.status}).`);
  }

  return path;
}

async function flushPendingExportUploads(): Promise<void> {
  const queue = await loadPendingExportUploads();
  if (!queue.length) {
    return;
  }

  const remaining: PendingExportUpload[] = [];
  for (const entry of queue) {
    try {
      const bytes = await readCachedZip(entry.localCachePath);
      if (!bytes) {
        continue;
      }
      await uploadExportZipToSupabase({
        clerkId: entry.clerkId,
        caseId: entry.caseId,
        zipFileName: entry.zipFileName,
        zipContent: bytes
      });
    } catch (error) {
      logger.warn("Ausstehender Supabase-Export konnte nicht synchronisiert werden.", error);
      remaining.push(entry);
    }
  }

  await savePendingExportUploads(remaining);
}

async function loadMasterDataFromSupabase(): Promise<MasterData> {
  const config = getDesktopSupabaseConfig();
  if (!config) throw new Error("Supabase ist in der Desktop-App nicht konfiguriert.");

  const response = await fetch(buildSupabaseObjectUrl(config.url, config.bucket, REMOTE_MASTER_DATA_PATH), {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}` }
  });

  if (!response.ok) {
    throw new Error(`Supabase-Stammdaten konnten nicht geladen werden (${response.status}).`);
  }

  return importMasterDataFromJson(await response.text());
}

export const desktopPlatform: AppPlatform = {
  receiptNumberScope: "desktop",
  workspaceRepository: createDesktopWorkspaceRepository(),
  masterDataRepository: createMasterDataRepository(),
  dossierSyncStatus: desktopDossierSyncStatusStore,
  auditSink: createAuditRepository(),
  caseAssets: {
    persistAsset: (caseFile, asset) => persistCaseAssetImmediately(caseFile, asset)
  },
  pdfPreview: {
    open: async (args) => {
      try {
        const relativePath = await persistGeneratedPdfToDisk({
          caseFile: args.caseFile,
          fileName: args.fileName,
          pdfContent: args.pdfContent
        });
        const { invoke } = await loadTauriCore();
        const absolutePath = await invoke<string>("open_app_local_data_path", { relativePath });
        return { message: `PDF wurde lokal gespeichert und geoeffnet: ${absolutePath}` };
      } catch (error) {
        logger.error("Desktop-PDF konnte nicht gespeichert oder geoeffnet werden.", error);
        throw toError(error, "PDF konnte in der Desktop-App nicht gespeichert werden.");
      }
    }
  },
  masterDataSync: {
    exportCurrent: async (masterData) => {
      const { save } = await loadTauriDialog();
      const { writeTextFile } = await loadTauriFs();
      const targetPath = await save({
        defaultPath: "master-data.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
        title: "Stammdaten speichern"
      });

      if (!targetPath) return { message: "Export der Stammdaten wurde abgebrochen." };
      await writeTextFile(targetPath, serializeMasterData(masterData));
      return { message: `Stammdaten wurden gespeichert: ${targetPath}` };
    },
    importFromSelection: async () => {
      const { open } = await loadTauriDialog();
      const { readTextFile } = await loadTauriFs();
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
        title: "Stammdaten-Datei auswaehlen"
      });
      const selectedPath = Array.isArray(selected) ? selected[0] : selected;
      if (!selectedPath) return null;
      return {
        masterData: importMasterDataFromJson(await readTextFile(selectedPath)),
        message: `Stammdaten wurden importiert: ${selectedPath}`
      };
    },
    importFromSupabase: async () => ({
      masterData: await loadMasterDataFromSupabase(),
      message: "Stammdaten wurden aus Supabase geladen."
    })
  },
  dataDirectory: {
    getStatus: async () => ({
      supportsLinking: false,
      isLinked: true,
      label: "Downloads/ELB_V1_Daten",
      message: "Die Desktop-App speichert direkt in Downloads/ELB_V1_Daten."
    }),
    link: async () => ({
      supportsLinking: false,
      isLinked: true,
      label: "Downloads/ELB_V1_Daten",
      message: "Die Desktop-App verwendet den Datenordner bereits direkt."
    }),
    unlink: async () => ({
      supportsLinking: false,
      isLinked: true,
      label: "Downloads/ELB_V1_Daten",
      message: "Die Desktop-App verwendet den Datenordner fest in Downloads/ELB_V1_Daten."
    })
  },
  exportArtifacts: {
    persist: async (args) => {
      try {
        const { savedPath } = await persistExportArtifactsToDisk(args);
        const zipFileName = savedPath.split("/").pop() || args.zipFileName;
        const localCachePath = await cacheExportZipLocally({
          clerkId: args.caseFile.meta.clerkId,
          caseId: args.caseFile.meta.id,
          zipFileName,
          zipContent: args.zipContent
        });
        const supabaseConfig = getDesktopSupabaseConfig();

        try {
          let remoteZipPath: string | null = null;
          if (supabaseConfig) {
            await flushPendingExportUploads();
            remoteZipPath = await uploadExportZipToSupabase({
              clerkId: args.caseFile.meta.clerkId,
              caseId: args.caseFile.meta.id,
              zipFileName,
              zipContent: args.zipContent
            });
          }
          return {
            message: remoteZipPath
              ? `Dossierdateien wurden lokal gespeichert: ${savedPath}. App-Cache: ${localCachePath}. Online gespeichert unter: ${remoteZipPath}`
              : `Dossierdateien wurden lokal gespeichert: ${savedPath}. App-Cache: ${localCachePath}`
          };
        } catch (uploadError) {
          logger.warn("Desktop-Dossier-ZIP konnte nicht nach Supabase hochgeladen werden.", uploadError);
          const queue = await loadPendingExportUploads();
          queue.push({
            clerkId: args.caseFile.meta.clerkId,
            caseId: args.caseFile.meta.id,
            zipFileName,
            localCachePath,
            queuedAt: new Date().toISOString()
          });
          await savePendingExportUploads(queue);
          return { message: `Dossierdateien wurden lokal gespeichert: ${savedPath}. App-Cache: ${localCachePath}. Supabase-Upload ist fehlgeschlagen und wird spaeter erneut versucht.` };
        }
      } catch (error) {
        logger.error("Desktop-Dossierdateien konnten nicht gespeichert werden.", error);
        throw toError(error, "Dossierdateien konnten in der Desktop-App nicht gespeichert werden.");
      }
    }
  },
  shell: {
    openDataDirectory: async ({ clerkId, masterData }) => {
      const { invoke } = await loadTauriCore();
      return invoke<string>("open_data_directory", {
        relativePath: getClerkDataDirectoryRelativePath(clerkId, masterData)
      });
    }
  }
};
