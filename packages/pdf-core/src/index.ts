import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  deriveAddressLines,
  deriveBeneficiary,
  formatAmountForDisplay,
  type Auction,
  type CaseFile,
  type Department,
  type MasterData
} from "@elb/domain/index";
import templatePdfUrl from "../../../vorlagen/template.pdf?url";
import templateObjectsPdfUrl from "../../../vorlagen/template_objekte.pdf?url";

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

export interface PdfHotspotMap {
  meta: PdfHotspotRect;
  consignor: PdfHotspotRect;
  owner: PdfHotspotRect;
  bank: PdfHotspotRect;
  costs: PdfHotspotRect;
  object: PdfHotspotRect;
  consignorSignature: PdfHotspotRect;
  clerkSignature: PdfHotspotRect;
}

interface LayoutCursor {
  y: number;
}

function getAuctionLabel(auction: Auction | undefined): string {
  if (!auction) {
    return "";
  }

  const monthYear = [auction.month, auction.year.slice(-2)].filter(Boolean).join("/");
  return monthYear ? `${auction.number} ${monthYear}` : auction.number;
}

function getPriceLabel(auction: Auction | undefined, objectItem: CaseFile["objects"][number]): string {
  if (auction?.number.toLowerCase().startsWith("ibid")) {
    return "Startpreis";
  }

  return objectItem.pricingMode === "netLimit" ? "Nettolimite" : "Limite";
}

function getDepartment(departments: Department[], departmentId: string): Department | undefined {
  return departments.find((item) => item.id === departmentId);
}

function getDepartmentCode(departments: Department[], departmentId: string): string {
  return getDepartment(departments, departmentId)?.code ?? "";
}

function collectMissingRequiredFields(caseFile: CaseFile, masterData: MasterData): string[] {
  const missing: string[] = [];

  for (const field of masterData.globalPdfRequiredFields) {
    if (field === "meta.receiptNumber" && !caseFile.meta.receiptNumber.trim()) missing.push("ELB-Nummer");
    if (field === "meta.clerkId" && !caseFile.meta.clerkId.trim()) missing.push("Sachbearbeiter");
    if (field === "consignor.lastName" && !caseFile.consignor.lastName.trim()) missing.push("Nachname Einlieferer");
    if (field === "consignor.street" && !caseFile.consignor.street.trim()) missing.push("Straße Einlieferer");
    if (field === "consignor.zip" && !caseFile.consignor.zip.trim()) missing.push("PLZ Einlieferer");
    if (field === "consignor.city" && !caseFile.consignor.city.trim()) missing.push("Stadt Einlieferer");
  }

  caseFile.objects.forEach((item, index) => {
    if (!item.departmentId.trim()) missing.push(`Objekt ${index + 1}: Abteilung`);
    if (!item.shortDescription.trim()) missing.push(`Objekt ${index + 1}: Kurzbeschrieb`);
    if (!item.estimate.low.trim()) missing.push(`Objekt ${index + 1}: Schätzung von`);
    if (!item.estimate.high.trim()) missing.push(`Objekt ${index + 1}: Schätzung bis`);
  });

  if (caseFile.objects.length === 0) {
    missing.push("Mindestens ein Objekt");
  }

  return missing;
}

function joinAddressLines(lines: string[]): string {
  return lines.filter(Boolean).join("\r\n");
}

function buildObjectEstimate(objectItem: CaseFile["objects"][number]): string {
  return [formatAmountForDisplay(objectItem.estimate.low), formatAmountForDisplay(objectItem.estimate.high)]
    .filter(Boolean)
    .join(" - ");
}

function buildObjectText(row: PdfPreviewObjectRow): string {
  const parts = [
    row.shortDescription,
    row.description,
    row.referenceNumber ? `Referenznr.: ${row.referenceNumber}` : "",
    row.remarks ? `Bemerkungen: ${row.remarks}` : "",
    row.priceValue ? `${row.priceLabel}: ${row.priceValue}` : ""
  ].filter(Boolean);

  return parts.join("\n");
}

function setTextFieldSafe(form: ReturnType<PDFDocument["getForm"]>, fieldName: string, value: string): void {
  try {
    form.getTextField(fieldName).setText(value);
  } catch {
    // Some templates may differ slightly; we skip missing fields deliberately.
  }
}

function setMultilineTextFieldSafe(form: ReturnType<PDFDocument["getForm"]>, fieldName: string, value: string): void {
  try {
    const field = form.getTextField(fieldName);
    field.enableMultiline();
    field.setText(value);
  } catch {
    // Some templates may differ slightly; we skip missing fields deliberately.
  }
}

function buildCostFieldValue(cost: { amount: string; note: string }): string {
  return [cost.amount.trim(), cost.note.trim()].filter(Boolean).join(" ");
}

async function loadTemplateBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Vorlage konnte nicht geladen werden: ${url}`);
  }

  return response.arrayBuffer();
}

type PdfForm = ReturnType<PDFDocument["getForm"]>;

function normalizeRect(rect: { x: number; y: number; width: number; height: number }) {
  const left = rect.width >= 0 ? rect.x : rect.x + rect.width;
  const bottom = rect.height >= 0 ? rect.y : rect.y + rect.height;
  const width = Math.abs(rect.width);
  const height = Math.abs(rect.height);
  return {
    left,
    bottom,
    width,
    height,
    right: left + width,
    top: bottom + height
  };
}

function getFieldRects(form: PdfForm, fieldName: string) {
  try {
    const field = form.getField(fieldName) as unknown as { acroField?: { getWidgets(): Array<{ getRectangle(): { x: number; y: number; width: number; height: number } }> } };
    const widgets = field.acroField?.getWidgets() ?? [];
    return widgets.map((widget) => normalizeRect(widget.getRectangle()));
  } catch {
    return [];
  }
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const [, base64 = ""] = dataUrl.split(",", 2);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function embedImageFromDataUrl(pdf: PDFDocument, dataUrl: string) {
  const bytes = decodeDataUrl(dataUrl);
  if (dataUrl.startsWith("data:image/png")) {
    return pdf.embedPng(bytes);
  }
  return pdf.embedJpg(bytes);
}

function wrapText(font: PDFFont, text: string, fontSize: number, maxWidth: number): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const paragraphs = normalized.split("\n");
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      return;
    }

    let current = words[0] ?? "";
    for (const word of words.slice(1)) {
      const candidate = `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  });

  return lines;
}

function ensurePage(
  pdf: PDFDocument,
  currentPage: PDFPage,
  cursor: LayoutCursor,
  requiredHeight: number,
  margin: number
): PDFPage {
  if (cursor.y - requiredHeight >= margin) {
    return currentPage;
  }

  const page = pdf.addPage([595.28, 841.89]);
  cursor.y = page.getHeight() - margin;
  return page;
}

function drawWrappedBlock(args: {
  page: PDFPage;
  font: PDFFont;
  boldFont?: PDFFont;
  cursor: LayoutCursor;
  margin: number;
  maxWidth: number;
  title?: string;
  text: string;
  fontSize?: number;
  lineHeight?: number;
}) {
  const fontSize = args.fontSize ?? 10.5;
  const lineHeight = args.lineHeight ?? 14;
  const lines = wrapText(args.font, args.text, fontSize, args.maxWidth);

  if (args.title) {
    args.page.drawText(args.title, {
      x: args.margin,
      y: args.cursor.y,
      size: 11,
      font: args.boldFont ?? args.font,
      color: rgb(0.12, 0.16, 0.14)
    });
    args.cursor.y -= 16;
  }

  lines.forEach((line) => {
    args.page.drawText(line, {
      x: args.margin,
      y: args.cursor.y,
      size: fontSize,
      font: args.font,
      color: rgb(0.14, 0.17, 0.16)
    });
    args.cursor.y -= lineHeight;
  });
}

async function drawSignatureIntoFields(
  pdf: PDFDocument,
  pageIndex: number,
  form: PdfForm,
  fieldNames: string[],
  dataUrl: string
): Promise<void> {
  if (!dataUrl.trim()) {
    return;
  }

  const rects = fieldNames.flatMap((fieldName) => getFieldRects(form, fieldName));
  if (!rects.length) {
    return;
  }

  const page = pdf.getPage(pageIndex);
  const image = await embedImageFromDataUrl(pdf, dataUrl);
  const imageRatio = image.height / image.width;

  rects.forEach((rect) => {
    const width = rect.width;
    const height = Math.min(rect.height, width * imageRatio);
    const x = rect.left;
    const y = rect.bottom + Math.max((rect.height - height) / 2, 0);

    page.drawImage(image, {
      x,
      y,
      width,
      height
    });
  });
}

function unionRects(rects: Array<ReturnType<typeof normalizeRect>>) {
  if (!rects.length) {
    return null;
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const bottom = Math.min(...rects.map((rect) => rect.bottom));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.max(...rects.map((rect) => rect.top));

  return {
    left,
    bottom,
    right,
    top,
    width: right - left,
    height: top - bottom
  };
}

function toHotspotRect(union: NonNullable<ReturnType<typeof unionRects>>, pageWidth: number, pageHeight: number): PdfHotspotRect {
  return {
    leftPct: (union.left / pageWidth) * 100,
    topPct: ((pageHeight - union.top) / pageHeight) * 100,
    widthPct: (union.width / pageWidth) * 100,
    heightPct: (union.height / pageHeight) * 100
  };
}

function getUnionForFields(form: PdfForm, fieldNames: string[]) {
  return unionRects(fieldNames.flatMap((fieldName) => getFieldRects(form, fieldName)));
}

interface ObjectFieldLayout {
  intNumber: string;
  auctionLabel: string;
  departmentCode: string;
  description: string;
  estimate: string;
  lineCount: number;
}

export interface ObjectPageChunk {
  intNumber: string;
  auctionLabel: string;
  departmentCode: string;
  description: string;
  estimate: string;
  items: ObjectPageChunkItem[];
}

export interface ObjectPageChunkItem {
  objectIndex: number;
  startLine: number;
  totalLines: number;
}

function buildObjectFieldLayout(
  row: PdfPreviewObjectRow,
  font: PDFFont,
  widths: { intNumber: number; auctionLabel: number; departmentCode: number; description: number; estimate: number },
  fontSize: number
): ObjectFieldLayout {
  const intLines = wrapText(font, row.intNumber, fontSize, widths.intNumber);
  const auctionLines = wrapText(font, row.auctionLabel, fontSize, widths.auctionLabel);
  const departmentLines = wrapText(font, row.departmentCode, fontSize, widths.departmentCode);
  const descriptionLines = wrapText(font, buildObjectText(row), fontSize, widths.description);
  const estimateLines = wrapText(font, row.estimate, fontSize, widths.estimate);
  const lineCount = Math.max(intLines.length, auctionLines.length, departmentLines.length, descriptionLines.length, estimateLines.length, 1);

  function normalize(lines: string[]) {
    return [...lines, ...Array(Math.max(lineCount - lines.length, 0)).fill("")];
  }

  return {
    intNumber: normalize(intLines).join("\r\n"),
    auctionLabel: normalize(auctionLines).join("\r\n"),
    departmentCode: normalize(departmentLines).join("\r\n"),
    description: normalize(descriptionLines).join("\r\n"),
    estimate: normalize(estimateLines).join("\r\n"),
    lineCount
  };
}

export async function buildObjectPageChunks(rows: PdfPreviewObjectRow[]): Promise<ObjectPageChunk[]> {
  const font = await PDFDocument.create().then((pdf) => pdf.embedFont(StandardFonts.Helvetica));
  const fontSize = 9.2;
  const lineHeight = 11.8;
  const mainPdf = await PDFDocument.load(await loadTemplateBytes(templatePdfUrl));
  const followPdf = await PDFDocument.load(await loadTemplateBytes(templateObjectsPdfUrl));
  const mainForm = mainPdf.getForm();
  const followForm = followPdf.getForm();

  const mainHeights = getUnionForFields(mainForm, ["Kurzbeschreibung 1"]);
  const followHeights = getUnionForFields(followForm, ["Kurzbeschreibung 2"]);
  const mainCap = Math.max(Math.floor((mainHeights?.height ?? 220) / lineHeight), 1);
  const followCap = Math.max(Math.floor((followHeights?.height ?? 260) / lineHeight), 1);

  const mainWidths = {
    intNumber: getUnionForFields(mainForm, ["Int-Nr 1"])?.width ?? 42,
    auctionLabel: getUnionForFields(mainForm, ["Erhalten 1"])?.width ?? 95,
    departmentCode: getUnionForFields(mainForm, ["Kapitel 1"])?.width ?? 55,
    description: getUnionForFields(mainForm, ["Kurzbeschreibung 1"])?.width ?? 260,
    estimate: getUnionForFields(mainForm, ["Schätzung 1"])?.width ?? 90
  };
  const followWidths = {
    intNumber: getUnionForFields(followForm, ["Int-Nr 2"])?.width ?? 42,
    auctionLabel: getUnionForFields(followForm, ["Erhalten 2"])?.width ?? 95,
    departmentCode: getUnionForFields(followForm, ["Kapitel 2"])?.width ?? 55,
    description: getUnionForFields(followForm, ["Kurzbeschreibung 2"])?.width ?? 260,
    estimate: getUnionForFields(followForm, ["Schätzung 2"])?.width ?? 90
  };

  const chunks: ObjectPageChunk[] = [];
  let current: ObjectPageChunk = { intNumber: "", auctionLabel: "", departmentCode: "", description: "", estimate: "", items: [] };
  let usedLines = 0;
  let capacity = mainCap;

  rows.forEach((row, objectIndex) => {
    const widths = chunks.length === 0 ? mainWidths : followWidths;
    const layout = buildObjectFieldLayout(row, font, widths, fontSize);
    const blockLines = layout.lineCount + 1;

    if (usedLines > 0 && usedLines + blockLines > capacity) {
      chunks.push(current);
      current = { intNumber: "", auctionLabel: "", departmentCode: "", description: "", estimate: "", items: [] };
      usedLines = 0;
      capacity = followCap;
    }

    if (usedLines > 0) {
      current.intNumber += "\r\n";
      current.auctionLabel += "\r\n";
      current.departmentCode += "\r\n";
      current.description += "\r\n";
      current.estimate += "\r\n";
    }

    current.intNumber += layout.intNumber;
    current.auctionLabel += layout.auctionLabel;
    current.departmentCode += layout.departmentCode;
    current.description += layout.description;
    current.estimate += layout.estimate;
    current.items.push({
      objectIndex,
      startLine: usedLines,
      totalLines: layout.lineCount
    });
    usedLines += blockLines;
  });

  if (usedLines > 0 || !chunks.length) {
    chunks.push(current);
  }

  return chunks;
}

export async function getPdfHotspotMap(pageKind: "main" | "follow"): Promise<PdfHotspotMap> {
  const templateBytes = await loadTemplateBytes(pageKind === "main" ? templatePdfUrl : templateObjectsPdfUrl);
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPage(0);
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const form = pdf.getForm();

  const fieldMap = pageKind === "main"
    ? {
        meta: ["ELB Nr"],
        consignor: ["Adresse EL", "EL Geburtsdatum 1", "EL Nationalität  1", "EL ID/Passnr  1"],
        owner: ["Adresse EG"],
        bank: ["BIC/SWIFT", "IBAN/Kontonr", "Bankangaben: Begünstigter", "Bankangaben: BegÃ¼nstigter"],
        costs: ["Kommission", "Versicherung ", "Transport", "Abb.-Kosten", "Kosten ", "Internet  1", "Diverses/Provenienz 2"],
        object: ["Int-Nr 1", "Erhalten 1", "Kapitel 1", "Kurzbeschreibung 1", "Schätzung 1"],
        consignorSignature: ["der Einlieferer Sig", "der Einlieferer Sig 2"],
        clerkSignature: ["Koller Auktionen Sig 1"]
      }
    : {
        meta: ["ELB Nr 2", "Seite N/N"],
        consignor: ["Adresse EL"],
        owner: [],
        bank: ["Adresse EL"],
        costs: ["Kommission", "Versicherung ", "Transport", "Abb.-Kosten", "Kosten ", "Internet  1", "Diverses/Provenienz 2"],
        object: ["Int-Nr 2", "Erhalten 2", "Kapitel 2", "Kurzbeschreibung 2", "Schätzung 2"],
        consignorSignature: ["der Einlieferer Sig", "der Einlieferer Sig 2"],
        clerkSignature: ["Koller Auktionen Sig 1"]
      };

  function buildHotspot(fields: string[]) {
    const union = getUnionForFields(form, fields);
    if (!union) {
      return { topPct: 0, leftPct: 0, widthPct: 0, heightPct: 0 };
    }
    return toHotspotRect(union, pageWidth, pageHeight);
  }

  return {
    meta: buildHotspot(fieldMap.meta),
    consignor: buildHotspot(fieldMap.consignor),
    owner: buildHotspot(fieldMap.owner),
    bank: buildHotspot(fieldMap.bank),
    costs: buildHotspot(fieldMap.costs),
    object: buildHotspot(fieldMap.object),
    consignorSignature: buildHotspot(fieldMap.consignorSignature),
    clerkSignature: buildHotspot(fieldMap.clerkSignature)
  };
}

function fillSharedFields(form: ReturnType<PDFDocument["getForm"]>, caseFile: CaseFile, masterData: MasterData, pageNumber: number, totalPages: number): void {
  const clerk = masterData.clerks.find((item) => item.id === caseFile.meta.clerkId);
  const beneficiary = deriveBeneficiary(caseFile.consignor, caseFile.bank);
  const addressLines = deriveAddressLines(caseFile.consignor);
  const ownerLines = caseFile.owner.sameAsConsignor
    ? addressLines
    : [
        [caseFile.owner.firstName, caseFile.owner.lastName].filter(Boolean).join(" ").trim(),
        [caseFile.owner.street, caseFile.owner.houseNumber].filter(Boolean).join(" ").trim(),
        [caseFile.owner.zip, caseFile.owner.city].filter(Boolean).join(" ").trim(),
        caseFile.owner.country
      ].filter(Boolean);

  setTextFieldSafe(form, pageNumber === 1 ? "ELB Nr" : "ELB Nr 2", caseFile.meta.receiptNumber);
  setTextFieldSafe(form, "Kommission", buildCostFieldValue(caseFile.costs.commission));
  setTextFieldSafe(form, "Transport", buildCostFieldValue(caseFile.costs.transport));
  setTextFieldSafe(form, "Abb.-Kosten", buildCostFieldValue(caseFile.costs.imaging));
  setTextFieldSafe(form, "Kosten ", buildCostFieldValue(caseFile.costs.expertise));
  setTextFieldSafe(form, "Versicherung ", buildCostFieldValue(caseFile.costs.insurance));
  setTextFieldSafe(form, "MwSt. Nr ", "");
  setTextFieldSafe(form, "MwSt. Nr 2", "");
  setTextFieldSafe(form, "MwSt. Kategorie", "");
  setTextFieldSafe(form, "MwSt. Kategorie 2", "");
  setTextFieldSafe(form, "Diverses/Provenienz 2", caseFile.costs.provenance);
  setTextFieldSafe(form, "Datum", new Date(caseFile.meta.createdAt).toLocaleDateString("de-CH"));
  setTextFieldSafe(form, "Internet  1", buildCostFieldValue(caseFile.costs.internet));
  setTextFieldSafe(form, "Sachbearbeiter 2", clerk ? [clerk.name, clerk.phone, clerk.email].filter(Boolean).join(", ") : "");
  setMultilineTextFieldSafe(form, "Adresse EL", joinAddressLines(addressLines));
  setMultilineTextFieldSafe(form, "Adresse EG", joinAddressLines(ownerLines));
  setTextFieldSafe(form, "BIC/SWIFT", caseFile.bank.bic);
  setTextFieldSafe(form, "IBAN/Kontonr", caseFile.bank.iban);
  setTextFieldSafe(form, "Bankangaben: Begünstigter", beneficiary);
  setTextFieldSafe(form, "Seite N/N", `${pageNumber}/${totalPages}`);
  setTextFieldSafe(form, "EL Geburtsdatum 1", caseFile.consignor.birthDate);
  setTextFieldSafe(form, "EL Nationalität  1", caseFile.consignor.nationality);
  setTextFieldSafe(form, "EL ID/Passnr  1", caseFile.consignor.passportNumber);
}

function fillObjectFields(
  form: ReturnType<PDFDocument["getForm"]>,
  row: ObjectPageChunk,
  suffix: "1" | "2"
): void {
  setMultilineTextFieldSafe(form, `Int-Nr ${suffix}`, row.intNumber);
  setMultilineTextFieldSafe(form, `Erhalten ${suffix}`, row.auctionLabel);
  setMultilineTextFieldSafe(form, `Kapitel ${suffix}`, row.departmentCode);
  setMultilineTextFieldSafe(form, `Kurzbeschreibung ${suffix}`, row.description);
  setMultilineTextFieldSafe(form, `Schätzung ${suffix}`, row.estimate);
}

export function createPdfPreviewModel(caseFile: CaseFile, masterData: MasterData): PdfPreviewModel {
  const clerk = masterData.clerks.find((item) => item.id === caseFile.meta.clerkId);

  return {
    receiptNumber: caseFile.meta.receiptNumber,
    clerkLabel: clerk ? [clerk.name, clerk.phone, clerk.email].filter(Boolean).join(", ") : "",
    addressLines: deriveAddressLines(caseFile.consignor),
    beneficiary: deriveBeneficiary(caseFile.consignor, caseFile.bank),
    objectRows: caseFile.objects.map((item) => {
      const auction = masterData.auctions.find((candidate) => candidate.id === item.auctionId);
      return {
        id: item.id,
        intNumber: item.intNumber,
        auctionLabel: getAuctionLabel(auction),
        departmentCode: getDepartmentCode(masterData.departments, item.departmentId),
        shortDescription: item.shortDescription,
        description: item.description,
        referenceNumber: item.referenceNumber,
        remarks: item.remarks,
        estimate: buildObjectEstimate(item),
        priceLabel: getPriceLabel(auction, item),
        priceValue: formatAmountForDisplay(item.priceValue)
      };
    }),
    missingRequiredFields: collectMissingRequiredFields(caseFile, masterData)
  };
}

export async function generateElbPdf(caseFile: CaseFile, masterData: MasterData): Promise<Uint8Array> {
  const previewModel = createPdfPreviewModel(caseFile, masterData);
  const mainTemplateBytes = await loadTemplateBytes(templatePdfUrl);
  const followTemplateBytes = await loadTemplateBytes(templateObjectsPdfUrl);
  const objectPages = await buildObjectPageChunks(previewModel.objectRows);
  const outputPdf = await PDFDocument.create();
  const totalPages = Math.max(objectPages.length, 1);
  const clerk = masterData.clerks.find((item) => item.id === caseFile.meta.clerkId);

  for (let index = 0; index < totalPages; index += 1) {
    const row = objectPages[index] ?? { intNumber: "", auctionLabel: "", departmentCode: "", description: "", estimate: "", items: [] };
    const sourceBytes = index === 0 ? mainTemplateBytes : followTemplateBytes;
    const sourcePdf = await PDFDocument.load(sourceBytes);
    const form = sourcePdf.getForm();

    fillSharedFields(form, caseFile, masterData, index + 1, totalPages);
    fillObjectFields(form, row, index === 0 ? "1" : "2");

    await drawSignatureIntoFields(sourcePdf, 0, form, ["der Einlieferer Sig", "der Einlieferer Sig 2"], caseFile.signatures.consignorSignaturePng);
    await drawSignatureIntoFields(sourcePdf, 0, form, ["Koller Auktionen Sig 1"], clerk?.signaturePng ?? "");

    form.flatten();
    const [copiedPage] = await outputPdf.copyPages(sourcePdf, [0]);
    outputPdf.addPage(copiedPage);
  }

  return outputPdf.save();
}

export async function generateSupplementPdf(caseFile: CaseFile, masterData: MasterData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 42;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  const cursor: LayoutCursor = { y: pageHeight - margin };

  const clerk = masterData.clerks.find((item) => item.id === caseFile.meta.clerkId);
  const departmentsById = new Map(masterData.departments.map((department) => [department.id, department]));
  const auctionsById = new Map(masterData.auctions.map((auction) => [auction.id, auction]));

  page.drawText(`Zusatz-PDF ELB ${caseFile.meta.receiptNumber}`, {
    x: margin,
    y: cursor.y,
    size: 16,
    font: boldFont,
    color: rgb(0.1, 0.15, 0.13)
  });
  cursor.y -= 24;
  page.drawText([caseFile.consignor.company || "", caseFile.consignor.firstName, caseFile.consignor.lastName].filter(Boolean).join(" ").trim() || "Einlieferer", {
    x: margin,
    y: cursor.y,
    size: 10.5,
    font,
    color: rgb(0.25, 0.31, 0.28)
  });
  cursor.y -= 26;

  for (const [index, objectItem] of caseFile.objects.entries()) {
    const auction = auctionsById.get(objectItem.auctionId);
    const department = departmentsById.get(objectItem.departmentId);
    const descriptionParts = [
      objectItem.shortDescription,
      objectItem.description,
      objectItem.referenceNumber ? `Referenznr.: ${objectItem.referenceNumber}` : "",
      objectItem.remarks ? `Bemerkungen: ${objectItem.remarks}` : "",
      objectItem.estimate.low || objectItem.estimate.high ? `Schätzung: ${buildObjectEstimate(objectItem)}` : "",
      objectItem.priceValue ? `${getPriceLabel(auction, objectItem)}: ${formatAmountForDisplay(objectItem.priceValue)}` : ""
    ].filter(Boolean);
    const objectText = descriptionParts.join("\n");
    const textLines = wrapText(font, objectText, 10.5, contentWidth);
    const photoAssets = caseFile.assets.filter((asset) => objectItem.photoAssetIds.includes(asset.id));
    const photoRows = Math.ceil(photoAssets.length / 4);
    const photoHeight = photoAssets.length ? photoRows * 104 + (photoRows - 1) * 8 : 0;
    const requiredHeight = 44 + textLines.length * 14 + (photoHeight ? 18 + photoHeight : 0) + 24;

    page = ensurePage(pdf, page, cursor, requiredHeight, margin);

    page.drawRectangle({
      x: margin,
      y: cursor.y - requiredHeight + 10,
      width: contentWidth,
      height: requiredHeight - 10,
      borderWidth: 0.8,
      borderColor: rgb(0.84, 0.87, 0.84),
      color: rgb(0.99, 0.99, 0.98)
    });

    page.drawText(`${index + 1}. ${objectItem.intNumber}`, {
      x: margin + 12,
      y: cursor.y - 18,
      size: 12,
      font: boldFont,
      color: rgb(0.13, 0.17, 0.15)
    });
    page.drawText(
      [department ? `${department.code} ${department.name}` : "", auction ? getAuctionLabel(auction) : ""].filter(Boolean).join(" · "),
      {
        x: margin + 90,
        y: cursor.y - 18,
        size: 9.5,
        font,
        color: rgb(0.3, 0.36, 0.33)
      }
    );

    const blockCursor: LayoutCursor = { y: cursor.y - 38 };
    drawWrappedBlock({
      page,
      font,
      boldFont,
      cursor: blockCursor,
      margin: margin + 12,
      maxWidth: contentWidth - 24,
      text: objectText
    });

    if (photoAssets.length) {
      blockCursor.y -= 4;
      page.drawText("Fotos", {
        x: margin + 12,
        y: blockCursor.y,
        size: 10,
        font: boldFont,
        color: rgb(0.13, 0.17, 0.15)
      });
      blockCursor.y -= 14;

      const photoWidth = (contentWidth - 24 - 3 * 8) / 4;
      for (const [photoIndex, asset] of photoAssets.entries()) {
        const row = Math.floor(photoIndex / 4);
        const col = photoIndex % 4;
        const boxX = margin + 12 + col * (photoWidth + 8);
        const boxTop = blockCursor.y - row * 112;
        const boxHeight = 104;
        page.drawRectangle({
          x: boxX,
          y: boxTop - boxHeight,
          width: photoWidth,
          height: boxHeight,
          borderWidth: 0.6,
          borderColor: rgb(0.84, 0.87, 0.84),
          color: rgb(1, 1, 1)
        });

        try {
          const image = await embedImageFromDataUrl(pdf, asset.optimizedPath || asset.originalPath);
          const scale = Math.min(photoWidth / image.width, boxHeight / image.height);
          const drawWidth = image.width * scale;
          const drawHeight = image.height * scale;
          page.drawImage(image, {
            x: boxX + (photoWidth - drawWidth) / 2,
            y: boxTop - boxHeight + (boxHeight - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight
          });
        } catch {
          page.drawText("Bild konnte nicht geladen werden", {
            x: boxX + 8,
            y: boxTop - 24,
            size: 8,
            font,
            color: rgb(0.45, 0.45, 0.45)
          });
        }
      }
    }

    cursor.y -= requiredHeight + 12;
  }

  const closingLines = [
    ...deriveAddressLines(caseFile.consignor),
    "",
    `Begünstigter: ${deriveBeneficiary(caseFile.consignor, caseFile.bank) || "-"}`,
    `IBAN: ${caseFile.bank.iban || "-"}`,
    `BIC: ${caseFile.bank.bic || "-"}`,
    "",
    `Kommission: ${buildCostFieldValue(caseFile.costs.commission) || "-"}`,
    `Versicherung: ${buildCostFieldValue(caseFile.costs.insurance) || "-"}`,
    `Transport: ${buildCostFieldValue(caseFile.costs.transport) || "-"}`,
    `Abb.-Kosten: ${buildCostFieldValue(caseFile.costs.imaging) || "-"}`,
    `Kosten Expertisen: ${buildCostFieldValue(caseFile.costs.expertise) || "-"}`,
    `Internet: ${buildCostFieldValue(caseFile.costs.internet) || "-"}`,
    caseFile.costs.provenance ? `Provenienz / Infos: ${caseFile.costs.provenance}` : "",
    "",
    caseFile.internalInfo.notes.trim() ? `Interne Notizen: ${caseFile.internalInfo.notes.trim()}` : "",
    clerk ? `Sachbearbeiter: ${[clerk.name, clerk.phone, clerk.email].filter(Boolean).join(", ")}` : ""
  ].filter(Boolean);

  if (closingLines.length > 2) {
    page = pdf.addPage([pageWidth, pageHeight]);
    const closingCursor: LayoutCursor = { y: pageHeight - margin };
    page.drawText("Schlussinfos", {
      x: margin,
      y: closingCursor.y,
      size: 15,
      font: boldFont,
      color: rgb(0.1, 0.15, 0.13)
    });
    closingCursor.y -= 24;
    drawWrappedBlock({
      page,
      font,
      boldFont,
      cursor: closingCursor,
      margin,
      maxWidth: contentWidth,
      text: closingLines.join("\n"),
      fontSize: 10.5,
      lineHeight: 15
    });
  }

  return pdf.save();
}
