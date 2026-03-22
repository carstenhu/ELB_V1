import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkspaceRepository, WorkspaceSnapshot } from "@elb/app-core/index";
import type { CaseFile, MasterData } from "@elb/domain/index";
import { createWorkspaceRepository } from "@elb/persistence/repository";
import { createLogger } from "@elb/shared/logger";
import { getSupabaseClient } from "./utils/supabase";

const logger = createLogger("web-supabase");

const REMOTE_ASSET_REF_PREFIX = "remote://";
const REMOTE_EXPORT_ZIP_ID_PREFIX = "supabase-export:";
const WORKSPACE_META_PATH = "workspace.json";
const MASTER_DATA_PATH = "Stammdaten/master-data.json";
const CURRENT_POINTER_FILE_NAME = "current.json";
const DOSSIER_FILE_NAME = "dossier.json";
const DEFAULT_BUCKET = "elb-v1-data";

interface WorkspaceMetaStorage {
  activeClerkId: string | null;
  savedAt: string;
}

interface ClerkSessionStorage {
  currentCase: CaseFile | null;
  drafts: CaseFile[];
  finalized: CaseFile[];
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

async function toBinaryBytes(input: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  if (input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer());
  }

  return normalizeBytes(input);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function createDataUrl(mimeType: string, bytes: Uint8Array): string {
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error("Optimiertes Bild liegt nicht als Data-URL vor.");
  }

  const mimeType = match[1] || "image/jpeg";
  const base64 = match[2] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return { mimeType, bytes };
}

function getAssetExtension(mimeType: string, fileName: string): string {
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  if (mimeType === "image/gif") {
    return ".gif";
  }

  const lowerCaseFileName = fileName.toLowerCase();
  if (lowerCaseFileName.endsWith(".png")) {
    return ".png";
  }
  if (lowerCaseFileName.endsWith(".webp")) {
    return ".webp";
  }
  if (lowerCaseFileName.endsWith(".gif")) {
    return ".gif";
  }

  return ".jpg";
}

function sanitizeRemoteSegment(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase() || "unassigned";
}

export function buildSupabaseRemoteExportPath(clerkId: string, zipFileName: string): string {
  return `exports/${sanitizeRemoteSegment(clerkId)}/${sanitizeRemoteSegment(zipFileName)}`;
}

function toSupabaseExportZipId(path: string): string {
  return `${REMOTE_EXPORT_ZIP_ID_PREFIX}${path}`;
}

export function isSupabaseExportZipId(zipId: string): boolean {
  return zipId.startsWith(REMOTE_EXPORT_ZIP_ID_PREFIX);
}

function fromSupabaseExportZipId(zipId: string): string {
  return zipId.slice(REMOTE_EXPORT_ZIP_ID_PREFIX.length);
}

function getRemoteClerkRoot(clerkId: string): string {
  return `clerks/${sanitizeRemoteSegment(clerkId)}`;
}

function getCurrentPointerPath(clerkId: string): string {
  return `${getRemoteClerkRoot(clerkId)}/current/${CURRENT_POINTER_FILE_NAME}`;
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

function getRemoteAssetPath(clerkId: string, assetId: string, extension: string): string {
  return `${getRemoteDossierRoot(clerkId, assetId.split(":")[0] || clerkId)}/assets/optimized/${assetId}${extension}`;
}

function getRelevantClerkIds(snapshot: WorkspaceSnapshot): string[] {
  const ids = new Set<string>();

  snapshot.masterData.clerks.forEach((clerk) => ids.add(clerk.id));
  if (snapshot.activeClerkId) {
    ids.add(snapshot.activeClerkId);
  }
  snapshot.drafts.forEach((caseFile) => ids.add(caseFile.meta.clerkId));
  snapshot.finalized.forEach((caseFile) => ids.add(caseFile.meta.clerkId));
  if (snapshot.currentCase?.meta.clerkId) {
    ids.add(snapshot.currentCase.meta.clerkId);
  }

  return [...ids];
}

function buildClerkSessionSnapshot(snapshot: WorkspaceSnapshot, clerkId: string): ClerkSessionStorage {
  return {
    currentCase: snapshot.currentCase?.meta.clerkId === clerkId ? snapshot.currentCase : null,
    drafts: snapshot.drafts.filter((caseFile) => caseFile.meta.clerkId === clerkId),
    finalized: snapshot.finalized.filter((caseFile) => caseFile.meta.clerkId === clerkId),
    savedAt: new Date().toISOString()
  };
}

function dedupeCases(caseFiles: CaseFile[]): CaseFile[] {
  const byId = new Map<string, CaseFile>();

  caseFiles.forEach((caseFile) => {
    byId.set(caseFile.meta.id, caseFile);
  });

  return [...byId.values()];
}

async function uploadText(config: SupabaseWorkspaceConfig, path: string, value: string): Promise<void> {
  const { error } = await config.client.storage.from(config.bucket).upload(path, new Blob([value], { type: "application/json" }), {
    upsert: true,
    contentType: "application/json"
  });

  if (error) {
    throw error;
  }
}

async function uploadBinary(config: SupabaseWorkspaceConfig, path: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  const { error } = await config.client.storage.from(config.bucket).upload(path, bytes, {
    upsert: true,
    contentType: mimeType
  });

  if (error) {
    throw error;
  }
}

async function downloadText(config: SupabaseWorkspaceConfig, path: string): Promise<string | null> {
  const { data, error } = await config.client.storage.from(config.bucket).download(path);
  if (error) {
    if (error.message.toLowerCase().includes("not found")) {
      return null;
    }
    throw error;
  }

  return data.text();
}

async function downloadBinary(config: SupabaseWorkspaceConfig, path: string): Promise<{ mimeType: string; bytes: Uint8Array } | null> {
  const { data, error } = await config.client.storage.from(config.bucket).download(path);
  if (error) {
    if (error.message.toLowerCase().includes("not found")) {
      return null;
    }
    throw error;
  }

  return {
    mimeType: data.type || "image/jpeg",
    bytes: normalizeBytes(await data.arrayBuffer())
  };
}

async function listExportFolderEntries(config: SupabaseWorkspaceConfig, path: string) {
  const { data, error } = await config.client.storage.from(config.bucket).list(path, {
    limit: 1000,
    sortBy: { column: "name", order: "desc" }
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function persistCaseAssetsRemote(config: SupabaseWorkspaceConfig, masterData: MasterData, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(
    caseFile.assets.map(async (asset) => {
      const sourceDataUrl = asset.optimizedPath || asset.originalPath;
      if (!sourceDataUrl.startsWith("data:")) {
        return asset;
      }

      const { mimeType, bytes } = parseDataUrl(sourceDataUrl);
      const extension = getAssetExtension(mimeType, asset.fileName);
      const remotePath = `${getRemoteDossierRoot(caseFile.meta.clerkId, caseFile.meta.id)}/assets/optimized/${asset.id}${extension}`;

      await uploadBinary(config, remotePath, bytes, mimeType);

      return {
        ...asset,
        originalPath: toRemoteAssetRef(remotePath),
        optimizedPath: toRemoteAssetRef(remotePath)
      };
    })
  );

  return {
    ...caseFile,
    assets
  };
}

async function hydrateRemoteCaseAssets(config: SupabaseWorkspaceConfig, caseFile: CaseFile): Promise<CaseFile> {
  const assets = await Promise.all(
    caseFile.assets.map(async (asset) => {
      const source = asset.optimizedPath || asset.originalPath;
      if (!isRemoteAssetRef(source)) {
        return asset;
      }

      const binary = await downloadBinary(config, fromRemoteAssetRef(source));
      if (!binary) {
        return asset;
      }

      const dataUrl = createDataUrl(binary.mimeType, binary.bytes);
      return {
        ...asset,
        originalPath: dataUrl,
        optimizedPath: dataUrl
      };
    })
  );

  return {
    ...caseFile,
    assets
  };
}

async function saveRemoteSnapshot(config: SupabaseWorkspaceConfig, snapshot: WorkspaceSnapshot): Promise<void> {
  await uploadText(config, MASTER_DATA_PATH, JSON.stringify(snapshot.masterData, null, 2));
  await uploadText(config, WORKSPACE_META_PATH, JSON.stringify({
    activeClerkId: snapshot.activeClerkId,
    savedAt: new Date().toISOString()
  } satisfies WorkspaceMetaStorage, null, 2));

  for (const clerkId of getRelevantClerkIds(snapshot)) {
    const session = buildClerkSessionSnapshot(snapshot, clerkId);
    await uploadText(config, getCurrentPointerPath(clerkId), JSON.stringify({
      caseId: session.currentCase?.meta.id ?? null,
      savedAt: session.savedAt
    } satisfies { caseId: string | null; savedAt: string }, null, 2));

    await Promise.all(
      [session.currentCase, ...session.drafts, ...session.finalized]
        .filter((caseFile): caseFile is CaseFile => Boolean(caseFile))
        .map(async (caseFile) => {
          const persistedCaseFile = await persistCaseAssetsRemote(config, snapshot.masterData, caseFile);
          await uploadText(config, getRemoteDossierFilePath(clerkId, caseFile.meta.id), JSON.stringify(persistedCaseFile, null, 2));
        })
    );
  }
}

async function loadRemoteClerkSession(config: SupabaseWorkspaceConfig, clerkId: string): Promise<ClerkSessionStorage | null> {
  const currentPointerRaw = await downloadText(config, getCurrentPointerPath(clerkId));
  const currentPointer = currentPointerRaw ? (JSON.parse(currentPointerRaw) as { caseId: string | null; savedAt: string }) : null;
  const dossierEntries = await listExportFolderEntries(config, getRemoteDossiersRoot(clerkId));

  if (!currentPointer && !dossierEntries.length) {
    return null;
  }

  const cases = await Promise.all(
    dossierEntries
      .filter((entry) => !entry.id && entry.name)
      .map(async (entry) => {
        const raw = await downloadText(config, `${getRemoteDossiersRoot(clerkId)}/${entry.name}/${DOSSIER_FILE_NAME}`);
        if (!raw) {
          return null;
        }

        return hydrateRemoteCaseAssets(config, JSON.parse(raw) as CaseFile);
      })
  );

  const hydratedCases = cases.filter((caseFile): caseFile is CaseFile => Boolean(caseFile));
  const currentCase = currentPointer?.caseId ? hydratedCases.find((caseFile) => caseFile.meta.id === currentPointer.caseId) ?? null : null;
  const remainingCases = hydratedCases.filter((caseFile) => caseFile.meta.id !== currentCase?.meta.id);

  return {
    currentCase,
    drafts: remainingCases.filter((caseFile) => caseFile.meta.status !== "finalized"),
    finalized: remainingCases.filter((caseFile) => caseFile.meta.status === "finalized"),
    savedAt: currentPointer?.savedAt ?? new Date().toISOString()
  };
}

async function loadRemoteSnapshot(config: SupabaseWorkspaceConfig): Promise<WorkspaceSnapshot | null> {
  const [masterDataRaw, workspaceMetaRaw] = await Promise.all([
    downloadText(config, MASTER_DATA_PATH),
    downloadText(config, WORKSPACE_META_PATH)
  ]);

  if (!masterDataRaw) {
    return null;
  }

  const masterData = JSON.parse(masterDataRaw) as MasterData;
  const workspaceMeta = workspaceMetaRaw ? (JSON.parse(workspaceMetaRaw) as WorkspaceMetaStorage) : null;
  const clerkSessions = await Promise.all(
    masterData.clerks.map(async (clerk) => ({
      clerkId: clerk.id,
      session: await loadRemoteClerkSession(config, clerk.id)
    }))
  );

  const drafts: CaseFile[] = [];
  const finalized: CaseFile[] = [];
  let currentCase: CaseFile | null = null;

  clerkSessions.forEach(({ clerkId, session }) => {
    if (!session) {
      return;
    }

    if (session.currentCase) {
      if (clerkId === workspaceMeta?.activeClerkId && !currentCase) {
        currentCase = session.currentCase;
      } else {
        drafts.push(session.currentCase);
      }
    }

    drafts.push(...session.drafts);
    finalized.push(...session.finalized);
  });

  const dedupedDrafts = dedupeCases(drafts).filter((caseFile) => caseFile.meta.id !== currentCase?.meta.id);
  const dedupedFinalized = dedupeCases(finalized).filter((caseFile) => caseFile.meta.id !== currentCase?.meta.id);

  if (!currentCase && workspaceMeta?.activeClerkId) {
    const activeDraftIndex = dedupedDrafts.findIndex((caseFile) => caseFile.meta.clerkId === workspaceMeta.activeClerkId);
    if (activeDraftIndex >= 0) {
      currentCase = dedupedDrafts[activeDraftIndex] ?? null;
      if (currentCase) {
        dedupedDrafts.splice(activeDraftIndex, 1);
      }
    }
  }

  return {
    masterData,
    activeClerkId: workspaceMeta?.activeClerkId ?? null,
    currentCase,
    drafts: dedupedDrafts,
    finalized: dedupedFinalized
  };
}

export function createWebWorkspaceRepository(): WorkspaceRepository {
  const localRepository = createWorkspaceRepository();
  const supabaseConfig = getSupabaseWorkspaceConfig();

  if (!supabaseConfig) {
    logger.info("Supabase ist nicht konfiguriert. Web speichert weiterhin nur lokal.");
    return localRepository;
  }

  logger.info("Supabase-Workspace-Sync ist aktiv.", { bucket: supabaseConfig.bucket });

  return {
    async load() {
      const localSnapshot = await localRepository.load();

      try {
        const remoteSnapshot = await loadRemoteSnapshot(supabaseConfig);
        if (!remoteSnapshot) {
          return localSnapshot;
        }

        await localRepository.save(remoteSnapshot);
        return remoteSnapshot;
      } catch (error) {
        logger.warn("Supabase-Workspace konnte nicht geladen werden. Lokaler Stand wird verwendet.", error);
        return localSnapshot;
      }
    },
    async save(snapshot) {
      await localRepository.save(snapshot);

      try {
        await saveRemoteSnapshot(supabaseConfig, snapshot);
      } catch (error) {
        logger.warn("Supabase-Workspace konnte nicht gespeichert werden. Lokale Speicherung bleibt erhalten.", error);
      }
    }
  };
}

export async function uploadExportZipToSupabase(args: {
  clerkId: string;
  zipFileName: string;
  zipContent: Blob | ArrayBuffer | Uint8Array;
}): Promise<string | null> {
  const supabaseConfig = getSupabaseWorkspaceConfig();
  if (!supabaseConfig) {
    return null;
  }

  const path = buildSupabaseRemoteExportPath(args.clerkId, args.zipFileName);
  await uploadBinary(supabaseConfig, path, await toBinaryBytes(args.zipContent), "application/zip");
  return path;
}

export async function listExportZipsFromSupabase(): Promise<Array<{ id: string; fileName: string; label: string }>> {
  const supabaseConfig = getSupabaseWorkspaceConfig();
  if (!supabaseConfig) {
    return [];
  }

  const clerkFolders = await listExportFolderEntries(supabaseConfig, "exports");
  const exportZips = await Promise.all(
    clerkFolders
      .filter((entry) => !entry.id && entry.name)
      .map(async (folder) => {
        const folderPath = `exports/${folder.name}`;
        const files = await listExportFolderEntries(supabaseConfig, folderPath);

        return files
          .filter((entry) => Boolean(entry.name) && entry.name.toLowerCase().endsWith(".zip"))
          .map((entry) => ({
            id: toSupabaseExportZipId(`${folderPath}/${entry.name}`),
            fileName: entry.name,
            label: `Online · ${entry.name}`
          }));
      })
  );

  return exportZips
    .flat()
    .sort((left, right) => right.fileName.localeCompare(left.fileName, "de-CH", { numeric: true, sensitivity: "base" }));
}

export async function downloadExportZipFromSupabase(zipId: string): Promise<{ fileName: string; content: Uint8Array } | null> {
  if (!isSupabaseExportZipId(zipId)) {
    return null;
  }

  const supabaseConfig = getSupabaseWorkspaceConfig();
  if (!supabaseConfig) {
    return null;
  }

  const remotePath = fromSupabaseExportZipId(zipId);
  const binary = await downloadBinary(supabaseConfig, remotePath);
  if (!binary) {
    return null;
  }

  return {
    fileName: remotePath.split("/").pop() || "austausch.zip",
    content: binary.bytes
  };
}
