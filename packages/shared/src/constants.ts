export const APP_NAME = "ELB V1";

export const ADMIN_PIN_STORAGE_KEY = "elb.admin.pin";

export const CASE_STATUSES = {
  draft: "draft",
  finalized: "finalized",
} as const;

export const PAGE_IDS = {
  consignor: "consignor",
  objects: "objects",
  internal: "internal",
  admin: "admin",
  pdfPreview: "pdfPreview",
  wordPreview: "wordPreview",
} as const;

export const DEFAULT_ADMIN_PIN = "2026";
