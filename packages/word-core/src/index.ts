import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { deriveAddressLines, formatAmountForDisplay, type Asset, type CaseFile, type MasterData } from "@elb/domain/index";
import templateDocxUrl from "../../../vorlagen/Koller_sl_de.docx?url";

export interface WordPreviewPhoto {
  id: string;
  src: string;
  alt: string;
}

export interface WordPreviewRowLine {
  text: string;
  kind: "title" | "detail" | "estimate" | "price";
  color?: string;
}

export interface WordPreviewRow {
  id: string;
  intNumber: string;
  renderedTitleLines: string[];
  renderedDetailLines: string[];
  contentLines: WordPreviewRowLine[];
  title: string;
  estimate: string;
  priceLabel: string;
  priceValue: string;
  details: string[];
  photos: WordPreviewPhoto[];
  primaryPhoto?: WordPreviewPhoto;
  heightUnits: number;
}

export interface WordPreviewPageModel {
  pageNumber: number;
  totalPages: number;
  showAddress: boolean;
  addressLines: string[];
  headerRightText: string;
  footerLabel: string;
  rows: WordPreviewRow[];
}

export interface WordPreviewModel {
  pages: WordPreviewPageModel[];
  typography: {
    family: string;
    note: string;
  };
}

const WORD_TEMPLATE_PAGE_HEIGHT_UNITS = 1122.53;
const WORD_TEMPLATE_PADDING_TOP_UNITS = 179.6;
const WORD_TEMPLATE_PADDING_BOTTOM_UNITS = 113.47;
const WORD_TEMPLATE_HEADER_UNITS = 86.4;
const WORD_TEMPLATE_FOOTER_UNITS = 48.8;
const WORD_TEMPLATE_LIST_HEIGHT_UNITS = WORD_TEMPLATE_PAGE_HEIGHT_UNITS
  - WORD_TEMPLATE_PADDING_TOP_UNITS
  - WORD_TEMPLATE_PADDING_BOTTOM_UNITS
  - WORD_TEMPLATE_HEADER_UNITS
  - WORD_TEMPLATE_FOOTER_UNITS;
const WORD_TEMPLATE_LINE_HEIGHT_UNITS = 19.2;
const WORD_TEMPLATE_ROW_GAP_UNITS = 2.4;
const WORD_TEMPLATE_ROW_PADDING_Y_UNITS = 11.34;
const WORD_TEMPLATE_ROW_BORDER_UNITS = 2;
const WORD_TEMPLATE_PHOTO_ROW_UNITS = 245.84;
const WORD_TEMPLATE_MIN_ROW_UNITS = 48;
const WORD_TEXT_MAX_WIDTH_PX = 326.47;
const WORD_FONT = "13.33px 'Neue Haas Grotesk Text Pro', 'Helvetica Neue', sans-serif";
const WORD_LETTER_SPACING_PX = 0.8;

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PDF_MARGIN_X = 52;
const PDF_MARGIN_TOP = 52;
const PDF_MARGIN_BOTTOM = 54;
const ADDRESS_BLOCK_HEIGHT = 112;
const FOLLOW_HEADER_HEIGHT = 34;
const FOOTER_HEIGHT = 64;
const ROW_UNIT_TO_PT = 0.54;
const PDF_TEXT_LINE_HEIGHT = 11.5;
const PDF_ROW_PADDING_BOTTOM = 10;
const PDF_PHOTO_SIZE = 72;

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const WORD_PHOTO_FRAME_WIDTH_EMU = 1801495;
const WORD_PHOTO_FRAME_HEIGHT_EMU = 2233930;
let templateAssetsPromise: Promise<{ headerImageSrc: string }> | null = null;
let wrapMeasureContext: CanvasRenderingContext2D | null = null;

function normalizeDisplayIntNumber(value: string): string {
  const digits = value.trim();
  if (!digits) {
    return "";
  }

  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? String(parsed) : digits;
}

function getWrapMeasureContext(): CanvasRenderingContext2D | null {
  if (wrapMeasureContext) {
    return wrapMeasureContext;
  }

  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  wrapMeasureContext = canvas.getContext("2d");
  if (wrapMeasureContext) {
    wrapMeasureContext.font = WORD_FONT;
  }

  return wrapMeasureContext;
}

function measureWordTextWidth(text: string): number {
  const context = getWrapMeasureContext();
  const letterSpacingWidth = Math.max(text.length - 1, 0) * WORD_LETTER_SPACING_PX;
  if (!context) {
    return text.length * 7.4 + letterSpacingWidth;
  }

  context.font = WORD_FONT;
  return context.measureText(text).width + letterSpacingWidth;
}

function wrapWordText(text: string, maxWidth: number): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return [];
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [];
  }

  const lines: string[] = [];
  let currentLine = words[0] ?? "";

  for (const word of words.slice(1)) {
    const nextLine = `${currentLine} ${word}`;
    if (measureWordTextWidth(nextLine) <= maxWidth) {
      currentLine = nextLine;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  lines.push(currentLine);
  return lines;
}

function measureWordRowHeight(lineCount: number, hasPhoto: boolean): number {
  const safeLineCount = Math.max(lineCount, 1);
  const textHeight = WORD_TEMPLATE_ROW_PADDING_Y_UNITS * 2
    + WORD_TEMPLATE_ROW_BORDER_UNITS
    + safeLineCount * WORD_TEMPLATE_LINE_HEIGHT_UNITS
    + Math.max(safeLineCount - 1, 0) * WORD_TEMPLATE_ROW_GAP_UNITS;

  return Math.max(textHeight, hasPhoto ? WORD_TEMPLATE_PHOTO_ROW_UNITS : 0, WORD_TEMPLATE_MIN_ROW_UNITS);
}

function paginateWordRows(rows: WordPreviewRow[]): WordPreviewRow[][] {
  const pages: WordPreviewRow[][] = [];
  let currentPage: WordPreviewRow[] = [];
  let currentHeight = 0;

  rows.forEach((row) => {
    const nextHeight = currentHeight + row.heightUnits;
    if (currentPage.length > 0 && nextHeight > WORD_TEMPLATE_LIST_HEIGHT_UNITS) {
      pages.push(currentPage);
      currentPage = [row];
      currentHeight = row.heightUnits;
      return;
    }

    currentPage.push(row);
    currentHeight = nextHeight;
  });

  if (currentPage.length > 0 || pages.length === 0) {
    pages.push(currentPage);
  }

  return pages;
}

function buildWordPreviewRow(item: CaseFile["objects"][number], assets: Asset[]): WordPreviewRow {
  const photos = assets
    .filter((asset) => item.photoAssetIds.includes(asset.id))
    .map((asset) => ({
      id: asset.id,
      src: asset.optimizedPath || asset.originalPath,
      alt: asset.fileName
    }));

  const title = item.shortDescription || item.description || "Ohne Kurzbeschrieb";
  const detailBlocks = [
    item.description.trim(),
    item.referenceNumber.trim() ? `Ref. ${item.referenceNumber.trim()}` : "",
    item.remarks.trim() ? `Bemerkung ${item.remarks.trim()}` : ""
  ].filter(Boolean);
  const details = detailBlocks;

  const renderedTitleLines = wrapWordText(title, WORD_TEXT_MAX_WIDTH_PX);
  const renderedDetailLines = detailBlocks.flatMap((detail) => wrapWordText(detail, WORD_TEXT_MAX_WIDTH_PX));
  const estimate = [formatAmountForDisplay(item.estimate.low), formatAmountForDisplay(item.estimate.high)]
    .filter(Boolean)
    .join(" - ");
  const priceLabel = item.pricingMode === "startPrice"
    ? "Startpreis"
    : item.pricingMode === "netLimit"
      ? "Nettolimite"
      : "Limite";
  const priceValue = formatAmountForDisplay(item.priceValue);

  const contentLines: WordPreviewRowLine[] = [
    ...renderedTitleLines.map((line) => ({ text: line, kind: "title" as const })),
    ...renderedDetailLines.map((line) => ({ text: line, kind: "detail" as const })),
    { text: estimate ? `Schaetzung: CHF ${estimate}` : "Schaetzung offen", kind: "estimate" as const },
    ...(priceValue ? [{ text: `${priceLabel}: CHF ${priceValue}`, kind: "price" as const, color: "FF0000" }] : [])
  ];

  return {
    id: item.id,
    intNumber: normalizeDisplayIntNumber(item.intNumber),
    renderedTitleLines,
    renderedDetailLines,
    contentLines,
    title,
    estimate,
    priceLabel,
    priceValue,
    details,
    photos,
    ...(photos[0] ? { primaryPhoto: photos[0] } : {}),
    heightUnits: measureWordRowHeight(contentLines.length, Boolean(photos[0]))
  };
}

function formatSwissDate(value: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function readDataUrlFromZip(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) {
    return Promise.resolve("");
  }

  return file.async("base64").then((base64) => {
    const extension = path.split(".").pop()?.toLowerCase();
    const mimeType = extension === "png" ? "image/png" : "image/jpeg";
    return `data:${mimeType};base64,${base64}`;
  });
}

export async function loadWordTemplateAssets(): Promise<{ headerImageSrc: string }> {
  if (!templateAssetsPromise) {
    templateAssetsPromise = (async () => {
      const response = await fetch(templateDocxUrl);
      const buffer = await response.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const headerImageSrc = await readDataUrlFromZip(zip, "word/media/image2.jpg");
      return { headerImageSrc };
    })();
  }

  return templateAssetsPromise;
}

function getDirectChildElements(node: Element): Element[] {
  return Array.from(node.childNodes).filter((child): child is Element => child.nodeType === Node.ELEMENT_NODE);
}

function cloneParagraphWithText(doc: XMLDocument, paragraph: Element, line: WordPreviewRowLine | string): Element {
  const entry: { text: string; color?: string } = typeof line === "string" ? { text: line } : line;
  const clone = paragraph.cloneNode(true) as Element;
  const paragraphProps = clone.getElementsByTagNameNS(WORD_NS, "pPr")[0]?.cloneNode(true) ?? null;
  const runPropsTemplate = clone.getElementsByTagNameNS(WORD_NS, "rPr")[0]?.cloneNode(true) as Element | undefined;

  while (clone.firstChild) {
    clone.removeChild(clone.firstChild);
  }

  if (paragraphProps) {
    clone.appendChild(paragraphProps);
  }

  const run = doc.createElementNS(WORD_NS, "w:r");
  if (runPropsTemplate) {
    const runProps = runPropsTemplate.cloneNode(true) as Element;
    if (entry.color) {
      const existingColor = runProps.getElementsByTagNameNS(WORD_NS, "color")[0];
      if (existingColor) {
        existingColor.setAttributeNS(WORD_NS, "w:val", entry.color);
      } else {
        const colorNode = doc.createElementNS(WORD_NS, "w:color");
        colorNode.setAttributeNS(WORD_NS, "w:val", entry.color);
        runProps.appendChild(colorNode);
      }
    }
    run.appendChild(runProps);
  }

  const textNode = doc.createElementNS(WORD_NS, "w:t");
  textNode.textContent = entry.text;
  run.appendChild(textNode);
  clone.appendChild(run);
  return clone;
}

function setCellParagraphs(doc: XMLDocument, cell: Element, lines: Array<WordPreviewRowLine | string>) {
  const templateParagraph = cell.getElementsByTagNameNS(WORD_NS, "p")[0];
  if (!templateParagraph) {
    return;
  }

  while (cell.firstChild) {
    cell.removeChild(cell.firstChild);
  }

  lines.forEach((line) => {
    cell.appendChild(cloneParagraphWithText(doc, templateParagraph, line));
  });
}

function createPageBreakParagraph(doc: XMLDocument): Element {
  const paragraph = doc.createElementNS(WORD_NS, "w:p");
  const run = doc.createElementNS(WORD_NS, "w:r");
  const breakNode = doc.createElementNS(WORD_NS, "w:br");
  breakNode.setAttributeNS(WORD_NS, "w:type", "page");
  run.appendChild(breakNode);
  paragraph.appendChild(run);
  return paragraph;
}

function replaceAddressBlock(table: Element, addressLines: string[]) {
  const paragraph = table.getElementsByTagNameNS(WORD_NS, "p")[0];
  if (!paragraph) {
    return;
  }

  const doc = table.ownerDocument;
  const replacement = cloneParagraphWithText(doc, paragraph, addressLines.join("\n"));
  paragraph.parentNode?.replaceChild(replacement, paragraph);
}

function replaceDateValue(table: Element, value: string) {
  Array.from(table.getElementsByTagNameNS(WORD_NS, "t")).forEach((node) => {
    if (node.textContent?.includes("{{DATE}}")) {
      node.textContent = value;
    }
  });
}

function replaceFooterClerkName(node: Element, value: string) {
  const texts = Array.from(node.getElementsByTagNameNS(WORD_NS, "t"));
  const lastText = texts[texts.length - 1];
  if (lastText) {
    lastText.textContent = value;
  }
}

function parseDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string } | null {
  const match = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const mimeType = match[1];
  const base64 = match[2];
  if (!mimeType || !base64) {
    return null;
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return { bytes, mimeType };
}

function createContainedPhotoDataUrl(dataUrl: string, targetWidth: number, targetHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Bildkontext fuer den Word-Export konnte nicht erzeugt werden."));
        return;
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, targetWidth, targetHeight);

      const scale = Math.min(targetWidth / image.width, targetHeight / image.height);
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      const drawX = (targetWidth - drawWidth) / 2;
      const drawY = (targetHeight - drawHeight) / 2;
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    image.onerror = () => reject(new Error("Bild konnte fuer den Word-Export nicht aufbereitet werden."));
    image.src = dataUrl;
  });
}

async function attachGeneratedPhoto(zip: JSZip, relsDoc: XMLDocument, photo: WordPreviewPhoto, counter: number): Promise<string | null> {
  const targetWidth = 640;
  const targetHeight = Math.round((targetWidth * WORD_PHOTO_FRAME_HEIGHT_EMU) / WORD_PHOTO_FRAME_WIDTH_EMU);
  const containedDataUrl = await createContainedPhotoDataUrl(photo.src, targetWidth, targetHeight);
  const parsed = parseDataUrl(containedDataUrl);
  if (!parsed) {
    return null;
  }

  const extension = parsed.mimeType.includes("png") ? "png" : "jpg";
  const relationshipId = `rId${900 + counter}`;
  const target = `media/generated_${counter}.${extension}`;
  zip.file(`word/${target}`, parsed.bytes);

  const relationship = relsDoc.createElementNS(PACKAGE_REL_NS, "Relationship");
  relationship.setAttribute("Id", relationshipId);
  relationship.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image");
  relationship.setAttribute("Target", target);
  relsDoc.documentElement.appendChild(relationship);

  return relationshipId;
}

function buildWordRowTable(doc: XMLDocument, templateTable: Element, row: WordPreviewRow, imageRelationshipId: string | null): Element {
  const clone = templateTable.cloneNode(true) as Element;
  const cells = Array.from(clone.getElementsByTagNameNS(WORD_NS, "tc"));
  const intCell = cells[0];
  const photoCell = cells[1];
  const textCell = cells[2];

  if (intCell) {
    setCellParagraphs(doc, intCell, [row.intNumber]);
  }

  if (photoCell) {
    const blip = photoCell.getElementsByTagNameNS(DRAWING_NS, "blip")[0];
    if (blip && imageRelationshipId) {
      blip.setAttributeNS(REL_NS, "r:embed", imageRelationshipId);
    } else {
      setCellParagraphs(doc, photoCell, [""]);
    }
  }

  if (textCell) {
    setCellParagraphs(doc, textCell, row.contentLines);
  }

  return clone;
}

function getPdfLineColor(line: WordPreviewRowLine) {
  if (line.kind === "price") {
    return rgb(0.62, 0.08, 0.08);
  }

  if (line.kind === "detail") {
    return rgb(0.32, 0.39, 0.36);
  }

  return rgb(0.15, 0.21, 0.18);
}

function getPdfLineSize(line: WordPreviewRowLine) {
  return line.kind === "title" ? 10 : 9;
}

async function drawPdfPhoto(page: PDFPage, pdfDocument: PDFDocument, photo: WordPreviewPhoto, x: number, y: number, size: number) {
  const parsed = parseDataUrl(photo.src);
  if (!parsed) {
    return;
  }

  const embedded = parsed.mimeType.includes("png")
    ? await pdfDocument.embedPng(parsed.bytes)
    : await pdfDocument.embedJpg(parsed.bytes);

  const scale = Math.min(size / embedded.width, size / embedded.height);
  const targetWidth = embedded.width * scale;
  const targetHeight = embedded.height * scale;
  const offsetX = (size - targetWidth) / 2;
  const offsetY = (size - targetHeight) / 2;

  page.drawImage(embedded, {
    x: x + offsetX,
    y: y + offsetY,
    width: targetWidth,
    height: targetHeight
  });
}

async function drawPdfRow(page: PDFPage, pdfDocument: PDFDocument, font: PDFFont, row: WordPreviewRow, x: number, y: number) {
  page.drawText(row.intNumber, {
    x,
    y,
    size: 10,
    font,
    color: rgb(0.13, 0.21, 0.18)
  });

  const titleX = x + 78;
  let cursorY = y;

  for (const line of row.contentLines) {
    page.drawText(line.text, {
      x: titleX,
      y: cursorY,
      size: getPdfLineSize(line),
      font,
      color: getPdfLineColor(line)
    });
    cursorY -= PDF_TEXT_LINE_HEIGHT;
  }

  if (row.primaryPhoto) {
    const photoY = cursorY - PDF_PHOTO_SIZE - 4;
    await drawPdfPhoto(page, pdfDocument, row.primaryPhoto, titleX, photoY, PDF_PHOTO_SIZE);
    page.drawRectangle({
      x: titleX,
      y: photoY,
      width: PDF_PHOTO_SIZE,
      height: PDF_PHOTO_SIZE,
      borderColor: rgb(0.84, 0.86, 0.83),
      borderWidth: 0.6
    });
    cursorY = photoY - 18;
  }

  const dividerY = cursorY - PDF_ROW_PADDING_BOTTOM;
  page.drawLine({
    start: { x, y: dividerY },
    end: { x: A4_WIDTH - PDF_MARGIN_X, y: dividerY },
    thickness: 0.7,
    color: rgb(0.9, 0.91, 0.89)
  });
}

export function createWordPreviewModel(caseFile: CaseFile, masterData: MasterData): WordPreviewModel {
  const rows = caseFile.objects.map((item) => buildWordPreviewRow(item, caseFile.assets));
  const pages = paginateWordRows(rows);
  const totalPages = Math.max(pages.length, 1);
  const footerLabel = masterData.clerks.find((clerk) => clerk.id === caseFile.meta.clerkId)?.name || "Sachbearbeiter offen";

  return {
    pages: pages.map((rowsOnPage, index) => ({
      pageNumber: index + 1,
      totalPages,
      showAddress: index === 0,
      addressLines: index === 0 ? deriveAddressLines(caseFile.consignor) : [],
      headerRightText: index === 0
        ? formatSwissDate(caseFile.meta.updatedAt || caseFile.meta.createdAt)
        : `Seite ${index + 1}/${totalPages}`,
      footerLabel,
      rows: rowsOnPage
    })),
    typography: {
      family: "Neue Haas Grotesk",
      note: "Neu aufgebaute zeilenbasierte Word-Layoutplanung"
    }
  };
}

export async function generateWordDocx(caseFile: CaseFile, masterData: MasterData): Promise<Blob> {
  const model = createWordPreviewModel(caseFile, masterData);
  const response = await fetch(templateDocxUrl);
  const buffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");
  const relationshipsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");

  if (!documentXml || !relationshipsXml) {
    throw new Error("Koller-Vorlage konnte nicht geladen werden.");
  }

  const parser = new DOMParser();
  const documentDoc = parser.parseFromString(documentXml, "application/xml");
  const relationshipsDoc = parser.parseFromString(relationshipsXml, "application/xml");
  const body = documentDoc.getElementsByTagNameNS(WORD_NS, "body")[0];

  if (!body) {
    throw new Error("Koller-Vorlage enthaelt keinen Word-Body.");
  }

  const bodyElements = getDirectChildElements(body);
  const addressTable = bodyElements[0];
  const spacerParagraph = bodyElements[1];
  const dateTable = bodyElements[2];
  const objectTable = bodyElements[3];
  const footerNodes = bodyElements.slice(4, -1);
  const sectionProperties = bodyElements[bodyElements.length - 1];

  if (!addressTable || !dateTable || !objectTable || !sectionProperties) {
    throw new Error("Koller-Vorlage konnte strukturell nicht interpretiert werden.");
  }

  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }

  let imageCounter = 1;

  for (const [pageIndex, page] of model.pages.entries()) {
    if (pageIndex > 0) {
      body.appendChild(createPageBreakParagraph(documentDoc));
    }

    if (page.showAddress) {
      const addressClone = addressTable.cloneNode(true) as Element;
      replaceAddressBlock(addressClone, page.addressLines);
      body.appendChild(addressClone);

      if (spacerParagraph) {
        body.appendChild(spacerParagraph.cloneNode(true));
      }
    }

    const dateClone = dateTable.cloneNode(true) as Element;
    replaceDateValue(dateClone, page.headerRightText);
    body.appendChild(dateClone);

    for (const row of page.rows) {
      const relationshipId = row.primaryPhoto
        ? await attachGeneratedPhoto(zip, relationshipsDoc, row.primaryPhoto, imageCounter)
        : null;
      if (relationshipId) {
        imageCounter += 1;
      }

      body.appendChild(buildWordRowTable(documentDoc, objectTable, row, relationshipId));
    }

    footerNodes.forEach((footerNode, footerIndex) => {
      const footerClone = footerNode.cloneNode(true) as Element;
      if (footerIndex === 1) {
        replaceFooterClerkName(footerClone, page.footerLabel);
      }
      body.appendChild(footerClone);
    });
  }

  body.appendChild(sectionProperties.cloneNode(true));

  const serializer = new XMLSerializer();
  zip.file("word/document.xml", serializer.serializeToString(documentDoc));
  zip.file("word/_rels/document.xml.rels", serializer.serializeToString(relationshipsDoc));

  return zip.generateAsync({ type: "blob" });
}

export async function generateWordPdf(caseFile: CaseFile, masterData: MasterData): Promise<Uint8Array> {
  const model = createWordPreviewModel(caseFile, masterData);
  const pdfDocument = await PDFDocument.create();
  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);

  for (const previewPage of model.pages) {
    const page = pdfDocument.addPage([A4_WIDTH, A4_HEIGHT]);
    let y = A4_HEIGHT - PDF_MARGIN_TOP;

    page.drawText("Schaetzliste", {
      x: PDF_MARGIN_X,
      y,
      size: 14,
      font,
      color: rgb(0.13, 0.21, 0.18)
    });

    page.drawText(
      previewPage.showAddress ? "Einlieferer + Objekte" : `Seite ${previewPage.pageNumber}/${previewPage.totalPages}`,
      {
        x: A4_WIDTH - PDF_MARGIN_X - 120,
        y,
        size: 10,
        font,
        color: rgb(0.36, 0.42, 0.39)
      }
    );

    y -= 28;

    if (previewPage.showAddress) {
      previewPage.addressLines.forEach((line) => {
        page.drawText(line, {
          x: PDF_MARGIN_X,
          y,
          size: 10,
          font,
          color: rgb(0.13, 0.21, 0.18)
        });
        y -= 14;
      });
      y -= Math.max(ADDRESS_BLOCK_HEIGHT - previewPage.addressLines.length * 14, 24);
    } else {
      page.drawText(`Seite ${previewPage.pageNumber}/${previewPage.totalPages}`, {
        x: A4_WIDTH - PDF_MARGIN_X - 70,
        y,
        size: 10,
        font,
        color: rgb(0.37, 0.44, 0.4)
      });
      y -= FOLLOW_HEADER_HEIGHT;
    }

    for (const row of previewPage.rows) {
      // eslint-disable-next-line no-await-in-loop
      await drawPdfRow(page, pdfDocument, font, row, PDF_MARGIN_X, y);
      y -= row.heightUnits * ROW_UNIT_TO_PT;
    }

    const footerY = PDF_MARGIN_BOTTOM + FOOTER_HEIGHT - 14;
    page.drawLine({
      start: { x: PDF_MARGIN_X, y: footerY + 20 },
      end: { x: A4_WIDTH - PDF_MARGIN_X, y: footerY + 20 },
      thickness: 0.8,
      color: rgb(0.84, 0.86, 0.83)
    });
    page.drawText("Hinweis- und Footerbereich bleibt frei", {
      x: PDF_MARGIN_X,
      y: footerY,
      size: 9,
      font,
      color: rgb(0.42, 0.47, 0.44)
    });
  }

  return pdfDocument.save();
}
