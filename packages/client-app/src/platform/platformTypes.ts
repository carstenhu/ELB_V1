import type { AuditSink, WorkspaceRepository } from "@elb/app-core/index";
import type { Asset, CaseFile, MasterData, ReceiptNumberScope } from "@elb/domain/index";

export interface CaseAssetPort {
  persistAsset(caseFile: CaseFile, asset: Asset): Promise<Asset>;
}

export interface ExportArtifactPort {
  persist(args: {
    caseFile: CaseFile;
    artifacts: Array<{ fileName: string; content: string | ArrayBuffer | Blob | Uint8Array }>;
    zipFileName: string;
    zipContent: Blob | ArrayBuffer | Uint8Array;
    initiatedWindow?: Window | null;
  }): Promise<{ message: string }>;
}

export interface PdfPreviewPort {
  open(args: {
    caseFile: CaseFile;
    fileName: string;
    pdfContent: Blob | ArrayBuffer | Uint8Array;
    initiatedWindow?: Window | null;
  }): Promise<{ message: string }>;
}

export interface MasterDataSyncResult {
  masterData: MasterData;
  message: string;
}

export interface MasterDataSyncPort {
  exportCurrent(masterData: MasterData): Promise<{ message: string }>;
  importFromSelection(): Promise<MasterDataSyncResult | null>;
  importFromSupabase?(): Promise<MasterDataSyncResult | null>;
}

export interface DataDirectoryStatus {
  supportsLinking: boolean;
  isLinked: boolean;
  label: string | null;
  message: string;
}

export interface DataDirectoryPort {
  getStatus(): Promise<DataDirectoryStatus>;
  link(): Promise<DataDirectoryStatus>;
  unlink(): Promise<DataDirectoryStatus>;
}

export interface AppShellPort {
  openDataDirectory(args: { clerkId: string; masterData: MasterData }): Promise<string>;
}

export interface AppPlatform {
  receiptNumberScope: ReceiptNumberScope;
  workspaceRepository: WorkspaceRepository;
  auditSink: AuditSink;
  caseAssets: CaseAssetPort;
  exportArtifacts: ExportArtifactPort;
  pdfPreview: PdfPreviewPort;
  masterDataSync: MasterDataSyncPort;
  dataDirectory: DataDirectoryPort;
  shell: AppShellPort;
}
