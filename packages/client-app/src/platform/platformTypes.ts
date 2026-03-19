import type { AuditSink, WorkspaceRepository } from "@elb/app-core/index";
import type { Asset, CaseFile, ReceiptNumberScope } from "@elb/domain/index";

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

export interface AppShellPort {
  openDataDirectory(): Promise<string>;
}

export interface AppPlatform {
  receiptNumberScope: ReceiptNumberScope;
  workspaceRepository: WorkspaceRepository;
  auditSink: AuditSink;
  caseAssets: CaseAssetPort;
  exportArtifacts: ExportArtifactPort;
  pdfPreview: PdfPreviewPort;
  shell: AppShellPort;
}
