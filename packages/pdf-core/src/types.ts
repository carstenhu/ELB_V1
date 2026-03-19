export interface PdfPreviewObjectRow {
  id: string;
  intNumber: string;
  auctionLabel: string;
  departmentCode: string;
  shortDescription: string;
  description: string;
  referenceNumber: string;
  remarks: string;
  estimate: string;
  priceLabel: string;
  priceValue: string;
}

export interface PdfPreviewModel {
  receiptNumber: string;
  clerkLabel: string;
  addressLines: string[];
  beneficiary: string;
  objectRows: PdfPreviewObjectRow[];
  missingRequiredFields: string[];
}

export interface PdfHotspotRect {
  topPct: number;
  leftPct: number;
  widthPct: number;
  heightPct: number;
}

export interface PdfObjectHotspotRect extends PdfHotspotRect {
  contentTopPct: number;
  contentHeightPct: number;
  lineHeightPct: number;
}

export interface PdfHotspotMap {
  meta: PdfHotspotRect;
  consignor: PdfHotspotRect;
  consignorIdentity: PdfHotspotRect;
  vatCategory: PdfHotspotRect;
  vatNumber: PdfHotspotRect;
  owner: PdfHotspotRect;
  bank: PdfHotspotRect;
  commission: PdfHotspotRect;
  costs: PdfHotspotRect;
  object: PdfObjectHotspotRect;
  consignorSignature: PdfHotspotRect;
  clerkSignature: PdfHotspotRect;
}

export interface ObjectPageChunk {
  intNumber: string;
  auctionLabel: string;
  departmentCode: string;
  description: string;
  estimate: string;
  items: ObjectPageChunkItem[];
  usedLines: number;
  capacityLines: number;
}

export interface ObjectPageChunkItem {
  objectIndex: number;
  startLine: number;
  totalLines: number;
  intNumberLines: string[];
  auctionLabelLines: string[];
  departmentCodeLines: string[];
  descriptionLines: string[];
  estimateLines: string[];
}
