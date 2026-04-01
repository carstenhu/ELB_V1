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
  showFooter: boolean;
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

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const WORD_PHOTO_FRAME_WIDTH_EMU = 1801495;
const WORD_PHOTO_FRAME_HEIGHT_EMU = 2233930;

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
const WORD_TEMPLATE_MIN_ROW_UNITS = 48;
const WORD_TEXT_MAX_WIDTH_PX = 326.47;
const WORD_FONT = "13.33px 'Neue Haas Grotesk Text Pro', 'Helvetica Neue', sans-serif";
const WORD_LETTER_SPACING_PX = 0.8;
const WORD_UNIT_TO_TWIP = 15;

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

function measureWordRowHeight(lineCount: number): number {
  const safeLineCount = Math.max(lineCount, 1);
  const textHeight = WORD_TEMPLATE_ROW_PADDING_Y_UNITS * 2
    + WORD_TEMPLATE_ROW_BORDER_UNITS
    + safeLineCount * WORD_TEMPLATE_LINE_HEIGHT_UNITS
    + Math.max(safeLineCount - 1, 0) * WORD_TEMPLATE_ROW_GAP_UNITS;

  return Math.max(textHeight, WORD_TEMPLATE_MIN_ROW_UNITS);
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
    details: detailBlocks,
    photos,
    ...(photos[0] ? { primaryPhoto: photos[0] } : {}),
    heightUnits: measureWordRowHeight(contentLines.length)
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

<<<<<<< HEAD
export async function loadWordTemplateAssets(): Promise<{ headerImageSrc: string }> {
  if (!templateAssetsPromise) {
    templateAssetsPromise = (async () => {
      const response = await fetch(templateDocxUrl);
      const buffer = await response.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const headerImageSrc = await readZipDataUrl(zip, "word/media/image2.jpg");
      return { headerImageSrc };
    })();
  }

  return templateAssetsPromise;
}

function getDirectChildElements(node: Element): Element[] {
  return Array.from(node.childNodes).filter((child): child is Element => child.nodeType === Node.ELEMENT_NODE);
}

function hasVisibleWordText(node: Element): boolean {
  return Array.from(node.getElementsByTagNameNS(WORD_NS, "t")).some((textNode) => (textNode.textContent || "").trim().length > 0);
}

function getClosestWordAncestor(node: Node | null, localName: string): Element | null {
  let current = node;
  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element;
      if (element.localName === localName) {
        return element;
      }
    }
    current = current.parentNode;
  }
  return null;
}

function cloneWithText(doc: XMLDocument, paragraph: Element, text: string, color?: string): Element {
  const clone = paragraph.cloneNode(true) as Element;
  const pPr = clone.getElementsByTagNameNS(WORD_NS, "pPr")[0]?.cloneNode(true) ?? null;
  const runPrSource = clone.getElementsByTagNameNS(WORD_NS, "rPr")[0]?.cloneNode(true) as Element | undefined;

  while (clone.firstChild) {
    clone.removeChild(clone.firstChild);
  }

  if (pPr) {
    clone.appendChild(pPr);
  }

  const run = doc.createElementNS(WORD_NS, "w:r");
  if (runPrSource) {
    const runPr = runPrSource.cloneNode(true) as Element;
    if (color) {
      const existingColor = runPr.getElementsByTagNameNS(WORD_NS, "color")[0];
      if (existingColor) {
        existingColor.setAttributeNS(WORD_NS, "w:val", color);
      } else {
        const colorNode = doc.createElementNS(WORD_NS, "w:color");
        colorNode.setAttributeNS(WORD_NS, "w:val", color);
        runPr.appendChild(colorNode);
      }
    }
    run.appendChild(runPr);
  }

  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) {
      run.appendChild(doc.createElementNS(WORD_NS, "w:br"));
    }
    const textNode = doc.createElementNS(WORD_NS, "w:t");
    if (line.startsWith(" ") || line.endsWith(" ")) {
      textNode.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
    }
    textNode.textContent = line || "";
    run.appendChild(textNode);
  });

  clone.appendChild(run);
  return clone;
}

function setParagraphsInCell(doc: XMLDocument, cell: Element, texts: Array<{ text: string; color?: string }>) {
  const paragraphs = Array.from(cell.getElementsByTagNameNS(WORD_NS, "p"));
  const templateParagraph = paragraphs[0];
  if (!templateParagraph) {
    return;
  }

  while (cell.firstChild) {
    cell.removeChild(cell.firstChild);
  }

  texts.forEach((entry) => {
    cell.appendChild(cloneWithText(doc, templateParagraph, entry.text, entry.color));
  });
}

function createWordRun(doc: XMLDocument, runPrSource: Element | undefined, text: string): Element {
  const run = doc.createElementNS(WORD_NS, "w:r");
  if (runPrSource) {
    run.appendChild(runPrSource.cloneNode(true));
  }

  const textNode = doc.createElementNS(WORD_NS, "w:t");
  if (text.startsWith(" ") || text.endsWith(" ")) {
    textNode.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  }
  textNode.textContent = text;
  run.appendChild(textNode);
  return run;
}

function createWordFieldRun(doc: XMLDocument, runPrSource: Element | undefined, instruction: string, placeholderText: string): Element[] {
  const beginRun = doc.createElementNS(WORD_NS, "w:r");
  if (runPrSource) {
    beginRun.appendChild(runPrSource.cloneNode(true));
  }
  const beginField = doc.createElementNS(WORD_NS, "w:fldChar");
  beginField.setAttributeNS(WORD_NS, "w:fldCharType", "begin");
  beginRun.appendChild(beginField);

  const instructionRun = doc.createElementNS(WORD_NS, "w:r");
  if (runPrSource) {
    instructionRun.appendChild(runPrSource.cloneNode(true));
  }
  const instructionNode = doc.createElementNS(WORD_NS, "w:instrText");
  instructionNode.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  instructionNode.textContent = instruction;
  instructionRun.appendChild(instructionNode);

  const separateRun = doc.createElementNS(WORD_NS, "w:r");
  if (runPrSource) {
    separateRun.appendChild(runPrSource.cloneNode(true));
  }
  const separateField = doc.createElementNS(WORD_NS, "w:fldChar");
  separateField.setAttributeNS(WORD_NS, "w:fldCharType", "separate");
  separateRun.appendChild(separateField);

  const textRun = createWordRun(doc, runPrSource, placeholderText);

  const endRun = doc.createElementNS(WORD_NS, "w:r");
  if (runPrSource) {
    endRun.appendChild(runPrSource.cloneNode(true));
  }
  const endField = doc.createElementNS(WORD_NS, "w:fldChar");
  endField.setAttributeNS(WORD_NS, "w:fldCharType", "end");
  endRun.appendChild(endField);

  return [beginRun, instructionRun, separateRun, textRun, endRun];
}

function replaceDatePlaceholderParagraph(table: Element, replacementBuilder: (doc: XMLDocument, paragraph: Element) => Element) {
  const texts = Array.from(table.getElementsByTagNameNS(WORD_NS, "t"));
  const placeholderNode = texts.find((node) => node.textContent?.includes("{{DATE}}"));
  const placeholderParagraph = getClosestWordAncestor(placeholderNode ?? null, "p");
  if (!placeholderParagraph || !placeholderParagraph.parentNode) {
    return;
  }

  const doc = table.ownerDocument;
  placeholderParagraph.parentNode.replaceChild(replacementBuilder(doc, placeholderParagraph), placeholderParagraph);
}

function setPageBreakBefore(table: Element) {
  const paragraph = table.getElementsByTagNameNS(WORD_NS, "p")[0];
  if (!paragraph) {
    return;
  }

  let pPr = paragraph.getElementsByTagNameNS(WORD_NS, "pPr")[0];
  if (!pPr) {
    pPr = table.ownerDocument.createElementNS(WORD_NS, "w:pPr");
    paragraph.insertBefore(pPr, paragraph.firstChild);
  }

  const pageBreakBefore = table.ownerDocument.createElementNS(WORD_NS, "w:pageBreakBefore");
  pPr.insertBefore(pageBreakBefore, pPr.firstChild);
}

function appendAddress(table: Element, addressLines: string[]) {
  const paragraph = table.getElementsByTagNameNS(WORD_NS, "p")[0];
  if (!paragraph) {
    return;
  }
  const doc = table.ownerDocument;
  const replacement = cloneWithText(doc, paragraph, addressLines.join("\n"));
  paragraph.parentNode?.replaceChild(replacement, paragraph);
}

function appendDateValue(table: Element, value: string) {
  replaceDatePlaceholderParagraph(table, (doc, paragraph) => cloneWithText(doc, paragraph, value));
}

function appendPageNumberField(table: Element) {
  replaceDatePlaceholderParagraph(table, (doc, paragraph) => {
    const clone = paragraph.cloneNode(true) as Element;
    const pPr = clone.getElementsByTagNameNS(WORD_NS, "pPr")[0]?.cloneNode(true) ?? null;
    const runPrSource = clone.getElementsByTagNameNS(WORD_NS, "rPr")[0]?.cloneNode(true) as Element | undefined;

    while (clone.firstChild) {
      clone.removeChild(clone.firstChild);
    }

    if (pPr) {
      clone.appendChild(pPr);
    }

    clone.appendChild(createWordRun(doc, runPrSource, "Seite "));
    createWordFieldRun(doc, runPrSource, " PAGE ", "1").forEach((run) => clone.appendChild(run));
    clone.appendChild(createWordRun(doc, runPrSource, "/"));
    createWordFieldRun(doc, runPrSource, " NUMPAGES ", "1").forEach((run) => clone.appendChild(run));
    return clone;
  });
}

function setFooterClerkName(node: Element, value: string) {
  const texts = Array.from(node.getElementsByTagNameNS(WORD_NS, "t"));
  const lastText = texts[texts.length - 1];
  if (!lastText) {
    return;
  }
  lastText.textContent = value;
}

async function createContainedPhotoDataUrl(dataUrl: string, targetWidth: number, targetHeight: number): Promise<string> {
=======
function createContainedPhotoDataUrl(dataUrl: string, targetWidth: number, targetHeight: number): Promise<string> {
>>>>>>> d375752613b7189a9aa66924a336480270774ada
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
      showFooter: index === totalPages - 1,
      addressLines: index === 0 ? deriveAddressLines(caseFile.consignor) : [],
      headerRightText: index === 0
        ? formatSwissDate(caseFile.meta.updatedAt || caseFile.meta.createdAt)
        : `Seite ${index + 1}/${totalPages}`,
      footerLabel,
      rows: rowsOnPage
    })),
    typography: {
      family: "Neue Haas Grotesk",
      note: "Template-basierter Word-Export"
    }
  };
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

  const preservedCellProps = cell.getElementsByTagNameNS(WORD_NS, "tcPr")[0]?.cloneNode(true) as Element | undefined;

  while (cell.firstChild) {
    cell.removeChild(cell.firstChild);
  }

  if (preservedCellProps) {
    cell.appendChild(preservedCellProps);
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
  const cell = table.getElementsByTagNameNS(WORD_NS, "tc")[0];
  if (!cell) {
    return;
  }

  const doc = table.ownerDocument;
  setCellParagraphs(doc, cell, addressLines.length > 0 ? addressLines : [""]);
}

function compactDateBlockForFollowPage(table: Element) {
  const cell = table.getElementsByTagNameNS(WORD_NS, "tc")[0];
  if (!cell) {
    return;
  }

  const paragraphs = Array.from(cell.getElementsByTagNameNS(WORD_NS, "p"));
  if (!paragraphs.length) {
    return;
  }

  const nonEmptyParagraph = paragraphs.find((paragraph) => paragraph.textContent?.trim());
  const paragraphToKeep = nonEmptyParagraph ?? paragraphs[0];
  if (!paragraphToKeep) {
    return;
  }

  paragraphs.forEach((paragraph) => {
    if (paragraph !== paragraphToKeep) {
      paragraph.parentNode?.removeChild(paragraph);
    }
  });
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

function findFirstTableWithMarker(body: Element, marker: string): Element | null {
  const tables = getDirectChildElements(body).filter((node) => node.localName === "tbl");
  return tables.find((table) => table.textContent?.includes(marker)) ?? null;
}

function findRowTemplateTable(body: Element): Element | null {
  const tables = getDirectChildElements(body).filter((node) => node.localName === "tbl");
  return tables.find((table) => {
    const cells = table.getElementsByTagNameNS(WORD_NS, "tc");
    const blips = table.getElementsByTagNameNS(DRAWING_NS, "blip");
    return cells.length >= 3 && blips.length > 0;
  }) ?? null;
}

function collectFooterTemplateNodes(body: Element, rowTable: Element): Element[] {
  const nodes = getDirectChildElements(body);
  const rowIndex = nodes.findIndex((node) => node === rowTable);
  const sectIndex = nodes.findIndex((node) => node.localName === "sectPr");
  if (rowIndex === -1 || sectIndex === -1 || sectIndex <= rowIndex + 1) {
    return [];
  }

  return nodes.slice(rowIndex + 1, sectIndex).map((node) => node.cloneNode(true) as Element);
}

function nextRelationshipCounter(relsDoc: XMLDocument): number {
  const ids = Array.from(relsDoc.getElementsByTagName("Relationship"))
    .map((relationship) => relationship.getAttribute("Id") ?? "")
    .map((id) => {
      const match = id.match(/^rId(\d+)$/);
      return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
    });
  return Math.max(900, ...ids) + 1;
}

async function attachGeneratedPhoto(
  zip: JSZip,
  relsDoc: XMLDocument,
  photo: WordPreviewPhoto,
  counter: number
): Promise<string | null> {
  const targetWidth = 640;
  const targetHeight = Math.round((targetWidth * WORD_PHOTO_FRAME_HEIGHT_EMU) / WORD_PHOTO_FRAME_WIDTH_EMU);
  const containedDataUrl = await createContainedPhotoDataUrl(photo.src, targetWidth, targetHeight);
  const parsed = parseDataUrl(containedDataUrl);
  if (!parsed) {
    return null;
  }

  const extension = parsed.mimeType.includes("png") ? "png" : "jpg";
  const relationshipId = `rId${counter}`;
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
  const tableProps = clone.getElementsByTagNameNS(WORD_NS, "tblPr")[0];
  const tableBorders = tableProps?.getElementsByTagNameNS(WORD_NS, "tblBorders")[0];
  const rowNode = clone.getElementsByTagNameNS(WORD_NS, "tr")[0];
  const cells = Array.from(clone.getElementsByTagNameNS(WORD_NS, "tc"));
  const intCell = cells[0];
  const photoCell = cells[1];
  const textCell = cells[2];

  if (tableBorders) {
    const topBorder = tableBorders.getElementsByTagNameNS(WORD_NS, "top")[0];
    const bottomBorder = tableBorders.getElementsByTagNameNS(WORD_NS, "bottom")[0];
    topBorder?.setAttributeNS(WORD_NS, "w:val", "nil");
    bottomBorder?.setAttributeNS(WORD_NS, "w:val", "nil");
  }

  if (rowNode) {
    let rowProps = rowNode.getElementsByTagNameNS(WORD_NS, "trPr")[0];
    if (!rowProps) {
      rowProps = doc.createElementNS(WORD_NS, "w:trPr");
      rowNode.insertBefore(rowProps, rowNode.firstChild);
    }

    let rowHeight = rowProps.getElementsByTagNameNS(WORD_NS, "trHeight")[0];
    if (!rowHeight) {
      rowHeight = doc.createElementNS(WORD_NS, "w:trHeight");
      rowProps.appendChild(rowHeight);
    }

    rowHeight.setAttributeNS(WORD_NS, "w:val", String(Math.round(row.heightUnits * WORD_UNIT_TO_TWIP)));
    rowHeight.setAttributeNS(WORD_NS, "w:hRule", "atLeast");
  }

  cells.forEach((cell) => {
    let cellProps = cell.getElementsByTagNameNS(WORD_NS, "tcPr")[0];
    if (!cellProps) {
      cellProps = doc.createElementNS(WORD_NS, "w:tcPr");
      cell.insertBefore(cellProps, cell.firstChild);
    }

    let verticalAlign = cellProps.getElementsByTagNameNS(WORD_NS, "vAlign")[0];
    if (!verticalAlign) {
      verticalAlign = doc.createElementNS(WORD_NS, "w:vAlign");
      cellProps.appendChild(verticalAlign);
    }

    verticalAlign.setAttributeNS(WORD_NS, "w:val", "top");
  });

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
<<<<<<< HEAD
    const lines: Array<{ text: string; color?: string }> = [
      ...row.renderedTitleLines.map((line) => ({ text: line })),
      ...row.renderedDetailLines.map((line) => ({ text: line })),
      { text: row.estimate ? `Schätzung: CHF ${row.estimate}` : "Schätzung offen" }
    ];
    if (row.priceValue) {
      lines.push({ text: `${row.priceLabel}: CHF ${row.priceValue}`, color: "FF0000" });
    }
    setParagraphsInCell(doc, textCell, lines);
=======
    setCellParagraphs(doc, textCell, row.contentLines);
>>>>>>> d375752613b7189a9aa66924a336480270774ada
  }

  return clone;
}

export async function generateWordDocx(caseFile: CaseFile, masterData: MasterData): Promise<Blob> {
  const model = createWordPreviewModel(caseFile, masterData);

  const templateResponse = await fetch(templateDocxUrl);
  const templateBuffer = await templateResponse.arrayBuffer();
  const zip = await JSZip.loadAsync(templateBuffer);

  const documentXml = await zip.file("word/document.xml")?.async("string");
  const relsXml = await zip.file("word/_rels/document.xml.rels")?.async("string");
  if (!documentXml || !relsXml) {
    throw new Error("Word-Vorlage konnte nicht gelesen werden.");
  }

  const parser = new DOMParser();
  const documentDoc = parser.parseFromString(documentXml, "application/xml");
  const relsDoc = parser.parseFromString(relsXml, "application/xml");

  const body = documentDoc.getElementsByTagNameNS(WORD_NS, "body")[0];
  if (!body) {
    throw new Error("Word-Vorlage enthaelt keinen gueltigen Body.");
  }

  const sectPr = getDirectChildElements(body).find((node) => node.localName === "sectPr");
  const addressTemplate = findFirstTableWithMarker(body, "{{ADDRESS}}");
  const dateTemplate = findFirstTableWithMarker(body, "{{DATE}}");
  const rowTemplate = findRowTemplateTable(body);

  if (!sectPr || !addressTemplate || !dateTemplate || !rowTemplate) {
    throw new Error("Word-Vorlage hat nicht die erwartete Tabellenstruktur.");
  }

  const footerTemplateNodes = collectFooterTemplateNodes(body, rowTemplate);
  const relationshipStart = nextRelationshipCounter(relsDoc);
  let relationshipCounter = relationshipStart;

  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }

  for (let pageIndex = 0; pageIndex < model.pages.length; pageIndex += 1) {
    const page = model.pages[pageIndex];
    if (!page) {
      continue;
    }

    if (pageIndex > 0) {
      body.appendChild(createPageBreakParagraph(documentDoc));
    }

    const dateTable = dateTemplate.cloneNode(true) as Element;
    replaceDateValue(dateTable, page.headerRightText);
    if (page.showAddress) {
      const addressTable = addressTemplate.cloneNode(true) as Element;
      replaceAddressBlock(addressTable, page.addressLines);
      body.appendChild(addressTable);
    } else {
      compactDateBlockForFollowPage(dateTable);
    }
    body.appendChild(dateTable);

    for (const row of page.rows) {
      let imageRelationshipId: string | null = null;
      if (row.primaryPhoto) {
        // eslint-disable-next-line no-await-in-loop
        imageRelationshipId = await attachGeneratedPhoto(zip, relsDoc, row.primaryPhoto, relationshipCounter);
        relationshipCounter += 1;
      }

      const rowTable = buildWordRowTable(documentDoc, rowTemplate, row, imageRelationshipId);
      body.appendChild(rowTable);
    }

    if (pageIndex === model.pages.length - 1 && footerTemplateNodes.length > 0) {
      footerTemplateNodes.forEach((node, index) => {
        const clone = node.cloneNode(true) as Element;
        if (index === 1) {
          replaceFooterClerkName(clone, page.footerLabel);
        }
        body.appendChild(clone);
      });
    }
  }

  body.appendChild(sectPr.cloneNode(true));

  const serializer = new XMLSerializer();
  zip.file("word/document.xml", serializer.serializeToString(documentDoc));
  zip.file("word/_rels/document.xml.rels", serializer.serializeToString(relsDoc));

  const outputBuffer = await zip.generateAsync({ type: "arraybuffer" });
  return new Blob([outputBuffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
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

<<<<<<< HEAD
export function createWordPreviewModel(caseFile: CaseFile, _masterData: MasterData): WordPreviewModel {
  const rows = caseFile.objects.map((item) => createRow(item, caseFile.assets));
  const firstPageBudget = PAGE_HEIGHT_UNITS - FIRST_PAGE_HEADER_UNITS - FOOTER_RESERVE_UNITS;
  const followPageBudget = PAGE_HEIGHT_UNITS - FOLLOW_PAGE_HEADER_UNITS - FOOTER_RESERVE_UNITS;
  const chunks = chunkRowsByHeight(rows, firstPageBudget, followPageBudget);
  const totalPages = Math.max(chunks.length, 1);

  return {
    pages: chunks.map((chunk, index) => ({
      pageNumber: index + 1,
      totalPages,
      showAddress: index === 0,
      addressLines: index === 0 ? deriveAddressLines(caseFile.consignor) : [],
      headerRightText: index === 0 ? formatSwissDate(caseFile.meta.updatedAt || caseFile.meta.createdAt) : `Seite ${index + 1}/${totalPages}`,
      footerLabel: _masterData.clerks.find((clerk) => clerk.id === caseFile.meta.clerkId)?.name || "Sachbearbeiter offen",
      rows: chunk
    })),
    typography: {
      family: "Neue Haas Grotesk",
      note: "Seitenlogik mit festem Fußbereich und echtem Umbruchmodell"
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
    throw new Error("Koller-Vorlage enthält keinen Word-Body.");
  }

  const bodyElements = getDirectChildElements(body);
  const addressTable = bodyElements[0];
  const spacerParagraph = bodyElements[1];
  const dateTable = bodyElements[2];
  const objectTable = bodyElements[3];
  const footerNodes = bodyElements.slice(4, -1).filter((node) => hasVisibleWordText(node));
  const sectionProperties = bodyElements[bodyElements.length - 1];

  if (!addressTable || !dateTable || !objectTable || !sectionProperties) {
    throw new Error("Koller-Vorlage konnte strukturell nicht interpretiert werden.");
  }

  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }

  let imageCounter = 1;

  for (const [pageIndex, page] of model.pages.entries()) {
    if (page.showAddress) {
      const addressClone = addressTable.cloneNode(true) as Element;
      appendAddress(addressClone, page.addressLines);
      body.appendChild(addressClone);

      if (spacerParagraph) {
        body.appendChild(spacerParagraph.cloneNode(true));
      }
    }

    const dateClone = dateTable.cloneNode(true) as Element;
    if (page.showAddress) {
      appendDateValue(dateClone, page.headerRightText);
    } else {
      setPageBreakBefore(dateClone);
      appendPageNumberField(dateClone);
    }
    body.appendChild(dateClone);

    for (const row of page.rows) {
      const relationshipId = row.primaryPhoto ? await ensureImageRelationship(zip, relationshipsDoc, row.primaryPhoto, imageCounter) : null;
      if (relationshipId) {
        imageCounter += 1;
      }
      body.appendChild(buildTemplateObjectTable(documentDoc, objectTable, row, relationshipId));
    }

    footerNodes.forEach((footerNode, footerIndex) => {
      const footerClone = footerNode.cloneNode(true) as Element;
      if (footerIndex === footerNodes.length - 1) {
        setFooterClerkName(footerClone, page.footerLabel);
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

=======
>>>>>>> d375752613b7189a9aa66924a336480270774ada
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
