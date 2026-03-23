import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceRepository, WorkspaceSnapshot } from "@elb/app-core/index";
import type { CaseFile, MasterData } from "@elb/domain/index";
import { createMasterDataRepository, createWorkspaceRepository } from "@elb/persistence/repository";
import { createLogger } from "@elb/shared/logger";
import { getSupabaseClient } from "./utils/supabase";
import { workspaceSyncStatusStore } from "./workspaceSyncStatus";

const logger = createLogger("web-supabase");
const REMOTE_ASSET_REF_PREFIX = "remote://";
const WORKSPACE_META_PATH = "workspace.json";
const MASTER_DATA_PATH = "Stammdaten/master-data.json";
const CURRENT_POINTER_FILE_NAME = "current.json";
const DOSSIER_FILE_NAME = "dossier.json";
const DEFAULT_BUCKET = "elb-v1-data";

interface WorkspaceMetaStorage {
  activeClerkId: string | null;
  savedAt: string;
}

interface CurrentDossierPointerStorage {
  caseId: string | null;
  savedAt: string;
}

interface SupabaseWorkspaceConfig {
  client: SupabaseClient;
  bucket: string;
}

export function getSupabaseWorkspaceConfig(): SupabaseWorkspaceConfig | null {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }

  return {
    client,
    bucket: import.meta.env.VITE_SUPABASE_BUCKET?.trim() || DEFAULT_BUCKET
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

function getRemoteClerkRoot(clerkId: string): string {
  return `clerks/${sanitizeRemoteSegment(clerkId)}`;
}

function getCurrentPointerPath(clerkId: string): string {
  return `${getRemoteClerkRoot(clerkId)}/${CURRENT_POINTER_FILE_NAME}`;
}

function getRemoteDossiersRoot(clerkId: string): string {
  return `${getRemoteClerkRoot(clerkId)}/dossiers`;
}

function getRemoteDossierRoot(clerkId: string, caseId: string): string {
  return `${getRemoteDossiersRoot(clerkId)}/${sanitizeRemoteSegment(caseId)}`;
}

function getRemoteDossierFilePath(clerkId: string, caseId: string): string {
  return `${getRemoteDossierRoot(clerkId, caseId)}/${DOSSIER_FILE_NAME}`;
}

function toRemoteAssetRef(path: string): string {
  return `${REMOTE_ASSET_REF_PREFIX}${path}`;
}

function isRemoteAssetRef(path: string): boolean {
  return path.startsWith(REMOTE_ASSET_REF_PREFIX);
}

function fromRemoteAssetRef(path: string): string {
  return path.slice(REMOTE_ASSET_REF_PREFIX.length);
}

function normalizeBytes(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary);
}

function createDataUrl(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) throw new Error("Optimiertes Bild liegt nicht als Data-URL vor.");
  return { mimeType: match[1] || "image/jpeg", bytes: Uint8Array.from(atob(match[2] || ""), (char) => char.charCodeAt(0)) };
}

function getAssetExtension(mimeType: string, fileName: string): string {
  if (mimeType === "image/png" || fileName.toLowerCase().endsWith(".png")) return ".png";
  if (mimeType === "image/webp" || fileName.toLowerCase().endsWith(".webp")) return ".webp";
  if (mimeType === "image/gif" || fileName.toLowerCase().endsWith(".gif")) return ".gif";
  return ".jpg";
}

async function uploadText(config: SupabaseWorkspaceConfig, path: string, value: string): Promise<void> {
  const { error } = await config.client.storage.from(config.bucket).upload(path, new Blob([value], { type: "application/json" }), { upsert: true, contentType: "application/json" });
  if (error) throw error;
}

async function uploadBinary(config: SupabaseWorkspaceConfig, path: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  const { error } = await config.client.storage.from(config.bucket).upload(path, bytes, { upsert: true, contentType: mimeType });
  if (error) throw error;
}

async function downloadText(config: SupabaseWorkspaceConfig, path: string): Promise<string | null> {
  const { data, error } = await config.client.storage.from(config.bucket).download(path);
  if (error) {
    if (error.message.toLowerCase().includes("not found")) return null;
    throw error;
  }
  return data.text();
}

async function downloadBinary(config: SupabaseWorkspaceConfig, path: string): Promise<{ mimeType: string; bytes: Uint8Array } | null> {
  const { data, error } = await config.client.storage.from(config.bucket).download(path);
  if (error) {
    if (error.message.toLowerCase().includes("not found")) return null;
    throw error;
  }
  return { mimeType: data.type || "image/jpeg", bytes: normalizeBytes(await data.arrayBuffer()) };
}

async function listEntries(config: SupabaseWorkspaceConfig, path: string) {
  const { data, error } = await config.client.storage.from(config.bucket).list(path, { limit: 1000, sortBy: { column: "name", order: "desc" } });
  if (error) throw error;
  return data ?? [];
}

async function persistRemoteAssets(config: SupabaseWorkspaceConfig, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(caseFile.assets.map(async (asset) => {
    const sourceDataUrl = asset.optimizedPath || asset.originalPath;
    if (!sourceDataUrl.startsWith("data:")) return asset;
    const { mimeType, bytes } = parseDataUrl(sourceDataUrl);
    const extension = getAssetExtension(mimeType, asset.fileName);
    const remotePath = `${getRemoteDossierRoot(caseFile.meta.clerkId, caseFile.meta.id)}/assets/optimized/${asset.id}${extension}`;
    await uploadBinary(config, remotePath, bytes, mimeType);
    return { ...asset, originalPath: toRemoteAssetRef(remotePath), optimizedPath: toRemoteAssetRef(remotePath) };
  }));
  return { ...caseFile, assets };
}

async function hydrateRemoteAssets(config: SupabaseWorkspaceConfig, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(caseFile.assets.map(async (asset) => {
    const source = asset.optimizedPath || asset.originalPath;
    if (!isRemoteAssetRef(source)) return asset;
    const binary = await downloadBinary(config, fromRemoteAssetRef(source));
    if (!binary) return asset;
    const dataUrl = createDataUrl(binary.mimeType, binary.bytes);
    return { ...asset, originalPath: dataUrl, optimizedPath: dataUrl };
  }));
  return { ...caseFile, assets };
}

function getRelevantClerkIds(snapshot: WorkspaceSnapshot): string[] {
  const ids = new Set<string>();
  snapshot.masterData.clerks.forEach((clerk) => ids.add(clerk.id));
  snapshot.dossiers.forEach((caseFile) => ids.add(caseFile.meta.clerkId));
  if (snapshot.currentCase?.meta.clerkId) ids.add(snapshot.currentCase.meta.clerkId);
  if (snapshot.activeClerkId) ids.add(snapshot.activeClerkId);
  return [...ids];
}

function dedupeCases(caseFiles: readonly CaseFile[]): CaseFile[] {
  const byId = new Map<string, CaseFile>();
  caseFiles.forEach((caseFile) => byId.set(caseFile.meta.id, caseFile));
  return [...byId.values()].sort((left, right) => right.meta.updatedAt.localeCompare(left.meta.updatedAt, "de-CH", { numeric: true, sensitivity: "base" }));
}

function getCasesForClerk(snapshot: WorkspaceSnapshot, clerkId: string): CaseFile[] {
  return dedupeCases([snapshot.currentCase, ...snapshot.dossiers].filter((caseFile): caseFile is CaseFile => Boolean(caseFile)).filter((caseFile) => caseFile.meta.clerkId === clerkId));
}

async function saveRemoteSnapshot(config: SupabaseWorkspaceConfig, snapshot: WorkspaceSnapshot): Promise<void> {
  await uploadText(config, MASTER_DATA_PATH, JSON.stringify(snapshot.masterData, null, 2));
  await uploadText(config, WORKSPACE_META_PATH, JSON.stringify({ activeClerkId: snapshot.activeClerkId, savedAt: new Date().toISOString() } satisfies WorkspaceMetaStorage, null, 2));

  for (const clerkId of getRelevantClerkIds(snapshot)) {
    const currentCaseId = snapshot.currentDossierIdByClerk[clerkId] ?? (snapshot.currentCase?.meta.clerkId === clerkId ? snapshot.currentCase.meta.id : null);
    await uploadText(config, getCurrentPointerPath(clerkId), JSON.stringify({ caseId: currentCaseId, savedAt: new Date().toISOString() } satisfies CurrentDossierPointerStorage, null, 2));
    await Promise.all(getCasesForClerk(snapshot, clerkId).map(async (caseFile) => {
      const persistedCaseFile = await persistRemoteAssets(config, caseFile);
      await uploadText(config, getRemoteDossierFilePath(clerkId, caseFile.meta.id), JSON.stringify(persistedCaseFile, null, 2));
    }));
  }
}

async function saveRemoteMasterData(config: SupabaseWorkspaceConfig, masterData: MasterData): Promise<void> {
  await uploadText(config, MASTER_DATA_PATH, JSON.stringify(masterData, null, 2));
}

async function loadRemoteClerkDossiers(config: SupabaseWorkspaceConfig, clerkId: string): Promise<{ currentCaseId: string | null; dossiers: CaseFile[] } | null> {
  const currentPointerRaw = await downloadText(config, getCurrentPointerPath(clerkId));
  const currentPointer = currentPointerRaw ? (JSON.parse(currentPointerRaw) as CurrentDossierPointerStorage) : null;
  const dossierEntries = await listEntries(config, getRemoteDossiersRoot(clerkId));
  if (!currentPointer && !dossierEntries.length) return null;

  const dossiers = await Promise.all(dossierEntries.filter((entry) => !entry.id && entry.name).map(async (entry) => {
    const raw = await downloadText(config, `${getRemoteDossiersRoot(clerkId)}/${entry.name}/${DOSSIER_FILE_NAME}`);
    return raw ? hydrateRemoteAssets(config, JSON.parse(raw) as CaseFile) : null;
  }));

  return { currentCaseId: currentPointer?.caseId ?? null, dossiers: dossiers.filter((caseFile): caseFile is CaseFile => Boolean(caseFile)) };
}

async function loadRemoteSnapshot(config: SupabaseWorkspaceConfig): Promise<WorkspaceSnapshot | null> {
  const [masterDataRaw, workspaceMetaRaw] = await Promise.all([downloadText(config, MASTER_DATA_PATH), downloadText(config, WORKSPACE_META_PATH)]);
  if (!masterDataRaw) return null;

  const masterData = JSON.parse(masterDataRaw) as MasterData;
  const workspaceMeta = workspaceMetaRaw ? (JSON.parse(workspaceMetaRaw) as WorkspaceMetaStorage) : null;
  const loadedByClerk = await Promise.all(masterData.clerks.map(async (clerk) => ({ clerkId: clerk.id, loaded: await loadRemoteClerkDossiers(config, clerk.id) })));
  const currentDossierIdByClerk: Record<string, string | null> = {};
  const dossiers: CaseFile[] = [];

  loadedByClerk.forEach(({ clerkId, loaded }) => {
    if (!loaded) return;
    currentDossierIdByClerk[clerkId] = loaded.currentCaseId;
    dossiers.push(...loaded.dossiers);
  });

  const dedupedDossiers = dedupeCases(dossiers);
  const activeClerkId = workspaceMeta?.activeClerkId ?? null;
  const activeCurrentId = activeClerkId ? currentDossierIdByClerk[activeClerkId] : null;
  const currentCase = activeCurrentId
    ? dedupedDossiers.find((caseFile) => caseFile.meta.id === activeCurrentId) ?? null
    : activeClerkId
      ? dedupedDossiers.find((caseFile) => caseFile.meta.clerkId === activeClerkId) ?? null
      : null;

  return { masterData, activeClerkId, currentCase, currentDossierIdByClerk, dossiers: dedupedDossiers };
}

export function createWebWorkspaceRepository(): WorkspaceRepository {
  const localRepository = createWorkspaceRepository();
  const supabaseConfig = getSupabaseWorkspaceConfig();
  if (!supabaseConfig) {
    logger.info("Supabase ist nicht konfiguriert. Web speichert weiterhin nur lokal.");
    workspaceSyncStatusStore.set({ level: "warning", message: "Supabase ist nicht konfiguriert. Es wird nur lokal gespeichert." });
    return localRepository;
  }

  logger.info("Supabase-Workspace-Sync ist aktiv.", { bucket: supabaseConfig.bucket });
  workspaceSyncStatusStore.set({ level: "info", message: `Supabase-Sync aktiv: ${supabaseConfig.bucket}` });

  return {
    async load() {
      const localSnapshot = await localRepository.load();
      workspaceSyncStatusStore.set({ level: "info", message: "Workspace wird aus Supabase geladen..." });
      try {
        const remoteSnapshot = await loadRemoteSnapshot(supabaseConfig);
        if (!remoteSnapshot) {
          workspaceSyncStatusStore.set({ level: "warning", message: "Kein Supabase-Workspace gefunden. Lokaler Stand bleibt aktiv." });
          return null;
        }
        await localRepository.save(remoteSnapshot);
        workspaceSyncStatusStore.set({ level: "success", message: "Workspace wurde aus Supabase geladen." });
        return remoteSnapshot;
      } catch (error) {
        logger.warn("Supabase-Workspace konnte nicht geladen werden. Lokaler Stand wird verwendet.", error);
        workspaceSyncStatusStore.set({ level: "warning", message: "Supabase-Laden fehlgeschlagen. Lokaler Stand wird verwendet." });
        return localSnapshot;
      }
    },
    async save(snapshot) {
      await localRepository.save(snapshot);
      try {
        await saveRemoteSnapshot(supabaseConfig, snapshot);
        workspaceSyncStatusStore.set({ level: "success", message: "Aenderungen wurden lokal und in Supabase gespeichert." });
      } catch (error) {
        logger.warn("Supabase-Workspace konnte nicht gespeichert werden. Lokale Speicherung bleibt erhalten.", error);
        workspaceSyncStatusStore.set({ level: "warning", message: "Supabase-Speichern fehlgeschlagen. Lokaler Stand bleibt erhalten." });
      }
    }
  };
}

export function createWebMasterDataRepository(): { save(masterData: MasterData): Promise<void> } {
  const localRepository = createMasterDataRepository();
  const supabaseConfig = getSupabaseWorkspaceConfig();

  if (!supabaseConfig) {
    return localRepository;
  }

  return {
    async save(masterData) {
      await localRepository.save(masterData);
      try {
        await saveRemoteMasterData(supabaseConfig, masterData);
        workspaceSyncStatusStore.set({ level: "success", message: "Stammdaten wurden lokal und in Supabase gespeichert." });
      } catch (error) {
        logger.warn("Supabase-Stammdaten konnten nicht gespeichert werden. Lokale Speicherung bleibt erhalten.", error);
        workspaceSyncStatusStore.set({ level: "warning", message: "Supabase-Speichern der Stammdaten fehlgeschlagen. Lokaler Stand bleibt erhalten." });
      }
    }
  };
}
