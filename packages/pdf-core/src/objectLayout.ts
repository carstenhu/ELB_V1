import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import templatePdfUrl from "../../../vorlagen/template.pdf?url";
import templateObjectsPdfUrl from "../../../vorlagen/template_objekte.pdf?url";
import { PDF_DATA_FONT_SIZE, PDF_DATA_LINE_HEIGHT } from "./renderSupport";
import { wrapText } from "./drawingSupport";
import { buildEstimateText, buildObjectText } from "./previewModel";
import { getFieldRects, loadTemplateBytes, type PdfForm } from "./templateSupport";
import type { ObjectPageChunk, PdfHotspotMap, PdfHotspotRect, PdfObjectHotspotRect, PdfPreviewObjectRow } from "./types";

function unionRects(rects: Array<ReturnType<typeof import("./templateSupport").normalizeRect>>) {
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

function toHotspotRect(
  union: NonNullable<ReturnType<typeof unionRects>>,
  pageWidth: number,
  pageHeight: number,
  options?: { contentAligned?: boolean }
): PdfHotspotRect {
  let left = union.left;
  let right = union.right;
  let top = union.top;
  let bottom = union.bottom;

  if (options?.contentAligned) {
    const insetX = Math.min(union.width * 0.02, 3);
    const insetY = Math.min(union.height * 0.22, 4);
    left += insetX;
    right -= insetX;
    top -= insetY;
    bottom += insetY;
  }

  const width = Math.max(right - left, 0);
  const height = Math.max(top - bottom, 0);

  return {
    leftPct: (left / pageWidth) * 100,
    topPct: ((pageHeight - top) / pageHeight) * 100,
    widthPct: (width / pageWidth) * 100,
    heightPct: (height / pageHeight) * 100
  };
}

function getUnionForFields(form: PdfForm, fieldNames: string[]) {
  return unionRects(fieldNames.flatMap((fieldName) => getFieldRects(form, fieldName)));
}

function createObjectHotspotRect(args: {
  union: NonNullable<ReturnType<typeof unionRects>>;
  pageWidth: number;
  pageHeight: number;
  capacityLines: number;
  lineHeight: number;
  contentTop: number;
  contentLeft: number;
}): PdfObjectHotspotRect {
  const baseRect = toHotspotRect(args.union, args.pageWidth, args.pageHeight);
  const contentHeight = Math.min(args.capacityLines * args.lineHeight, args.union.height);
  const contentWidth = Math.max(args.union.right - args.contentLeft - 1.8, 0);

  return {
    ...baseRect,
    leftPct: (args.contentLeft / args.pageWidth) * 100,
    widthPct: (contentWidth / args.pageWidth) * 100,
    contentTopPct: ((args.pageHeight - args.contentTop) / args.pageHeight) * 100,
    contentHeightPct: (contentHeight / args.pageHeight) * 100,
    lineHeightPct: (args.lineHeight / args.pageHeight) * 100
  };
}

interface ObjectFieldLayout {
  intNumber: string;
  auctionLabel: string;
  departmentCode: string;
  description: string;
  estimate: string;
  intNumberLines: string[];
  auctionLabelLines: string[];
  departmentCodeLines: string[];
  descriptionLines: string[];
  estimateLines: string[];
  lineCount: number;
}

export interface ObjectFieldGeometry {
  intNumber: NonNullable<ReturnType<typeof unionRects>>;
  auctionLabel: NonNullable<ReturnType<typeof unionRects>>;
  departmentCode: NonNullable<ReturnType<typeof unionRects>>;
  description: NonNullable<ReturnType<typeof unionRects>>;
  estimate: NonNullable<ReturnType<typeof unionRects>>;
  block: NonNullable<ReturnType<typeof unionRects>>;
  lineHeight: number;
  fontSize: number;
  capacityLines: number;
  contentLeft: number;
  contentTop: number;
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
  const estimateLines = wrapText(font, buildEstimateText(row), fontSize, widths.estimate);
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
    intNumberLines: normalize(intLines),
    auctionLabelLines: normalize(auctionLines),
    departmentCodeLines: normalize(departmentLines),
    descriptionLines: normalize(descriptionLines),
    estimateLines: normalize(estimateLines),
    lineCount
  };
}

function getRequiredRect(form: PdfForm, fieldName: string) {
  const rect = getUnionForFields(form, [fieldName]);
  if (!rect) {
    throw new Error(`PDF-Feld nicht gefunden: ${fieldName}`);
  }
  return rect;
}

export function getObjectFieldGeometry(form: PdfForm, suffix: "1" | "2"): ObjectFieldGeometry {
  const intNumber = getRequiredRect(form, `Int-Nr ${suffix}`);
  const auctionLabel = getRequiredRect(form, `Erhalten ${suffix}`);
  const departmentCode = getRequiredRect(form, `Kapitel ${suffix}`);
  const description = getRequiredRect(form, `Kurzbeschreibung ${suffix}`);
  const estimate = getRequiredRect(form, `Sch\u00e4tzung ${suffix}`);
  const block = unionRects([intNumber, auctionLabel, departmentCode, description, estimate]);

  if (!block) {
    throw new Error(`Objektblock konnte nicht rekonstruiert werden: ${suffix}`);
  }

  const top = Math.min(intNumber.top, auctionLabel.top, departmentCode.top, description.top, estimate.top);
  const bottom = Math.max(intNumber.bottom, auctionLabel.bottom, departmentCode.bottom, description.bottom, estimate.bottom);
  const height = Math.max(top - bottom, 1);
  const fontSize = PDF_DATA_FONT_SIZE;
  const lineHeight = PDF_DATA_LINE_HEIGHT;
  const topPadding = 1;
  const bottomPadding = 0.8;
  const leftPadding = 1.8;

  return {
    intNumber,
    auctionLabel,
    departmentCode,
    description,
    estimate,
    block: {
      ...block,
      top,
      bottom,
      height
    },
    lineHeight,
    fontSize,
    capacityLines: Math.max(Math.floor((height - topPadding - bottomPadding) / lineHeight), 1),
    contentLeft: block.left + leftPadding,
    contentTop: top - topPadding
  };
}

export async function buildObjectPageChunks(rows: PdfPreviewObjectRow[]): Promise<ObjectPageChunk[]> {
  const mainPdf = await PDFDocument.load(await loadTemplateBytes(templatePdfUrl));
  const followPdf = await PDFDocument.load(await loadTemplateBytes(templateObjectsPdfUrl));
  const geometryMain = getObjectFieldGeometry(mainPdf.getForm(), "1");
  const geometryFollow = getObjectFieldGeometry(followPdf.getForm(), "2");
  const font = await PDFDocument.create().then((pdf) => pdf.embedFont(StandardFonts.Helvetica));

  const mainWidths = {
    intNumber: Math.max(geometryMain.intNumber.width - 3.6, 1),
    auctionLabel: Math.max(geometryMain.auctionLabel.width - 3.6, 1),
    departmentCode: Math.max(geometryMain.departmentCode.width - 3.6, 1),
    description: Math.max(geometryMain.description.width - 3.6, 1),
    estimate: Math.max(geometryMain.estimate.width - 3.6, 1)
  };
  const followWidths = {
    intNumber: Math.max(geometryFollow.intNumber.width - 3.6, 1),
    auctionLabel: Math.max(geometryFollow.auctionLabel.width - 3.6, 1),
    departmentCode: Math.max(geometryFollow.departmentCode.width - 3.6, 1),
    description: Math.max(geometryFollow.description.width - 3.6, 1),
    estimate: Math.max(geometryFollow.estimate.width - 3.6, 1)
  };

  const chunks: ObjectPageChunk[] = [];
  let current: ObjectPageChunk = {
    intNumber: "",
    auctionLabel: "",
    departmentCode: "",
    description: "",
    estimate: "",
    items: [],
    usedLines: 0,
    capacityLines: geometryMain.capacityLines
  };
  let usedLines = 0;
  let capacity = geometryMain.capacityLines;

  rows.forEach((row, objectIndex) => {
    const widths = chunks.length === 0 ? mainWidths : followWidths;
    const layout = buildObjectFieldLayout(row, font, widths, geometryMain.fontSize);
    const separatorLines = usedLines > 0 ? 1 : 0;
    const requiredLines = separatorLines + layout.lineCount;

    if (usedLines > 0 && usedLines + requiredLines > capacity) {
      current.usedLines = usedLines;
      current.capacityLines = capacity;
      chunks.push(current);
      current = {
        intNumber: "",
        auctionLabel: "",
        departmentCode: "",
        description: "",
        estimate: "",
        items: [],
        usedLines: 0,
        capacityLines: geometryFollow.capacityLines
      };
      usedLines = 0;
      capacity = geometryFollow.capacityLines;
    }

    if (usedLines > 0) {
      current.intNumber += "\r\n\r\n";
      current.auctionLabel += "\r\n\r\n";
      current.departmentCode += "\r\n\r\n";
      current.description += "\r\n\r\n";
      current.estimate += "\r\n\r\n";
    }

    current.intNumber += layout.intNumber;
    current.auctionLabel += layout.auctionLabel;
    current.departmentCode += layout.departmentCode;
    current.description += layout.description;
    current.estimate += layout.estimate;
    current.items.push({
      objectIndex,
      startLine: usedLines + separatorLines,
      totalLines: layout.lineCount,
      intNumberLines: layout.intNumberLines,
      auctionLabelLines: layout.auctionLabelLines,
      departmentCodeLines: layout.departmentCodeLines,
      descriptionLines: layout.descriptionLines,
      estimateLines: layout.estimateLines
    });
    usedLines += requiredLines;
    current.usedLines = usedLines;
    current.capacityLines = capacity;
  });

  if (usedLines > 0 || !chunks.length) {
    current.usedLines = usedLines;
    current.capacityLines = capacity;
    chunks.push(current);
  }

  return chunks;
}

export async function getPdfHotspotMap(pageKind: "main" | "follow"): Promise<PdfHotspotMap> {
  const templateBytes = await loadTemplateBytes(pageKind === "main" ? templatePdfUrl : templateObjectsPdfUrl);
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPage(0);
  const form = pdf.getForm();
  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();

  const fieldMap = pageKind === "main"
    ? {
        meta: ["ELB Nr", "Sachbearbeiter 2"],
        consignor: ["Adresse EL"],
        consignorIdentity: ["EL Geburtsdatum 1", "EL Nationalit\u00e4t  1", "EL ID/Passnr  1"],
        vatCategory: ["MwSt. Kategorie"],
        vatNumber: ["MwSt. Nr "],
        owner: ["Adresse EG"],
        bank: ["BIC/SWIFT", "IBAN/Kontonr", "Bankangaben: Beg\u00fcnstigter"],
        commission: ["Kommission"],
        costs: ["Versicherung ", "Transport", "Abb.-Kosten", "Kosten ", "Internet  1", "Diverses/Provenienz 2"],
        object: ["Int-Nr 1", "Erhalten 1", "Kapitel 1", "Kurzbeschreibung 1", "Sch\u00e4tzung 1"],
        consignorSignature: ["der Einlieferer Sig", "der Einlieferer Sig 2"],
        clerkSignature: ["Koller Auktionen Sig 1"]
      }
    : {
        meta: ["ELB Nr 2", "Sachbearbeiter 2", "Seite N/N"],
        consignor: ["Adresse EL"],
        consignorIdentity: [],
        vatCategory: [],
        vatNumber: [],
        owner: [],
        bank: ["Adresse EL"],
        commission: ["Kommission"],
        costs: ["Versicherung ", "Transport", "Abb.-Kosten", "Kosten ", "Internet  1", "Diverses/Provenienz 2"],
        object: ["Int-Nr 2", "Erhalten 2", "Kapitel 2", "Kurzbeschreibung 2", "Sch\u00e4tzung 2"],
        consignorSignature: ["der Einlieferer Sig", "der Einlieferer Sig 2"],
        clerkSignature: ["Koller Auktionen Sig 1"]
      };

  function buildHotspot(fields: string[], options?: { contentAligned?: boolean }) {
    const union = getUnionForFields(form, fields);
    if (!union) {
      return { topPct: 0, leftPct: 0, widthPct: 0, heightPct: 0 };
    }
    return toHotspotRect(union, pageWidth, pageHeight, options);
  }

  function buildObjectHotspot() {
    const suffix = pageKind === "main" ? "1" : "2";
    try {
      const geometry = getObjectFieldGeometry(form, suffix);
      return createObjectHotspotRect({
        union: geometry.block,
        pageWidth,
        pageHeight,
        capacityLines: geometry.capacityLines,
        lineHeight: geometry.lineHeight,
        contentTop: geometry.contentTop,
        contentLeft: geometry.contentLeft
      });
    } catch {
      return {
        topPct: 0,
        leftPct: 0,
        widthPct: 0,
        heightPct: 0,
        contentTopPct: 0,
        contentHeightPct: 0,
        lineHeightPct: 0
      };
    }
  }

  return {
    meta: buildHotspot(fieldMap.meta, { contentAligned: true }),
    consignor: buildHotspot(fieldMap.consignor),
    consignorIdentity: buildHotspot(fieldMap.consignorIdentity, { contentAligned: true }),
    vatCategory: buildHotspot(fieldMap.vatCategory, { contentAligned: true }),
    vatNumber: buildHotspot(fieldMap.vatNumber, { contentAligned: true }),
    owner: buildHotspot(fieldMap.owner),
    bank: buildHotspot(fieldMap.bank, { contentAligned: true }),
    commission: buildHotspot(fieldMap.commission, { contentAligned: true }),
    costs: buildHotspot(fieldMap.costs, { contentAligned: true }),
    object: buildObjectHotspot(),
    consignorSignature: buildHotspot(fieldMap.consignorSignature),
    clerkSignature: buildHotspot(fieldMap.clerkSignature)
  };
}
