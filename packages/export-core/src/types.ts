export interface ExportArtifactPlan {
  fileName: string;
  type: "json" | "pdf" | "docx" | "image" | "zip";
  required: boolean;
}

export interface ExportPlan {
  baseName: string;
  zipFileName: string;
  artifacts: ExportArtifactPlan[];
}

export interface ExportMetadata {
  appVersion: string;
  exportedAt: string;
  receiptNumber: string;
  caseId: string;
  clerkId: string;
  status: string;
  objectCount: number;
  imageCount: number;
}

export interface GeneratedArtifact {
  fileName: string;
  mimeType: string;
  content: string | ArrayBuffer | Blob;
}

export interface GeneratedExportBundle {
  plan: ExportPlan;
  metadata: ExportMetadata;
  artifacts: GeneratedArtifact[];
}
