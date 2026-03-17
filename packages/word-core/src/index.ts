import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type ISectionOptions
} from "docx";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { deriveAddressLines, formatAmountForDisplay, type Asset, type CaseFile, type MasterData } from "@elb/domain/index";
import templateDocxUrl from "../../../vorlagen/Koller_sl_de.docx?url";

export interface WordPreviewPhoto {
  id: string;
  src: string;
  alt: string;
}

export interface WordPreviewRow {
  id: string;
  intNumber: string;
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
  templateBackgroundSrc: string;
  rows: WordPreviewRow[];
}

export interface WordPreviewModel {
  pages: WordPreviewPageModel[];
  typography: {
    family: string;
    note: string;
  };
}

const PAGE_HEIGHT_UNITS = 980;
const FIRST_PAGE_HEADER_UNITS = 250;
const FOLLOW_PAGE_HEADER_UNITS = 96;
const FOOTER_RESERVE_UNITS = 116;
const BASE_ROW_UNITS = 88;
const DETAIL_LINE_UNITS = 18;
const PHOTO_ROW_UNITS = 118;

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PDF_MARGIN_X = 52;
const PDF_MARGIN_TOP = 52;
const PDF_MARGIN_BOTTOM = 54;
const ADDRESS_BLOCK_HEIGHT = 112;
const FOLLOW_HEADER_HEIGHT = 34;
const FOOTER_HEIGHT = 64;
const ROW_UNIT_TO_PT = 0.54;
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
let templateAssetsPromise: Promise<{ backgroundImageSrc: string }> | null = null;

function chunkRowsByHeight(rows: WordPreviewRow[], firstPageBudget: number, followPageBudget: number): WordPreviewRow[][] {
  const pages: WordPreviewRow[][] = [];
  let currentPage: WordPreviewRow[] = [];
  let remainingBudget = firstPageBudget;

  rows.forEach((row) => {
    const rowHeight = row.heightUnits;

    if (currentPage.length > 0 && rowHeight > remainingBudget) {
      pages.push(currentPage);
      currentPage = [];
      remainingBudget = followPageBudget;
    }

    currentPage.push(row);
    remainingBudget -= rowHeight;
  });

  if (currentPage.length > 0 || pages.length === 0) {
    pages.push(currentPage);
  }

  return pages;
}

function createRow(item: CaseFile["objects"][number], assets: Asset[]): WordPreviewRow {
  const photos = assets
    .filter((asset) => item.photoAssetIds.includes(asset.id))
    .map((asset) => ({
      id: asset.id,
      src: asset.optimizedPath || asset.originalPath,
      alt: asset.fileName
    }));

  const details = [
    item.description.trim(),
    item.referenceNumber.trim() ? `Ref. ${item.referenceNumber.trim()}` : "",
    item.remarks.trim() ? `Bemerkung ${item.remarks.trim()}` : ""
  ].filter(Boolean);

  const estimate = [formatAmountForDisplay(item.estimate.low), formatAmountForDisplay(item.estimate.high)]
    .filter(Boolean)
    .join(" - ");

  const detailLines = Math.max(details.length, 1);
  const photoRows = photos.length ? Math.ceil(photos.length / 4) : 0;
  const heightUnits = BASE_ROW_UNITS + detailLines * DETAIL_LINE_UNITS + photoRows * PHOTO_ROW_UNITS;

  return {
    id: item.id,
    intNumber: item.intNumber,
    title: item.shortDescription || item.description || "Ohne Kurzbeschrieb",
    estimate,
    priceLabel: item.pricingMode === "startPrice" ? "Startpreis" : item.pricingMode === "netLimit" ? "Nettolimite" : "Limite",
    priceValue: formatAmountForDisplay(item.priceValue),
    details,
    photos,
    ...(photos[0] ? { primaryPhoto: photos[0] } : {}),
    heightUnits
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

async function readZipDataUrl(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) {
    return "";
  }

  const base64 = await file.async("base64");
  const extension = path.split(".").pop()?.toLowerCase();
  const mimeType = extension === "png" ? "image/png" : "image/jpeg";
  return `data:${mimeType};base64,${base64}`;
}

export async function loadWordTemplateAssets(): Promise<{ backgroundImageSrc: string }> {
  if (!templateAssetsPromise) {
    templateAssetsPromise = (async () => {
      const response = await fetch(templateDocxUrl);
      const buffer = await response.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const backgroundImageSrc = await readZipDataUrl(zip, "word/media/image2.jpg");
      return { backgroundImageSrc };
    })();
  }

  return templateAssetsPromise;
}

function getDirectChildElements(node: Element): Element[] {
  return Array.from(node.childNodes).filter((child): child is Element => child.nodeType === Node.ELEMENT_NODE);
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

function createPageBreakParagraph(doc: XMLDocument): Element {
  const paragraph = doc.createElementNS(WORD_NS, "w:p");
  const run = doc.createElementNS(WORD_NS, "w:r");
  const breakNode = doc.createElementNS(WORD_NS, "w:br");
  breakNode.setAttributeNS(WORD_NS, "w:type", "page");
  run.appendChild(breakNode);
  paragraph.appendChild(run);
  return paragraph;
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
  const texts = table.getElementsByTagNameNS(WORD_NS, "t");
  for (const node of Array.from(texts)) {
    if (node.textContent?.includes("{{DATE}}")) {
      node.textContent = value;
    }
  }
}

function setFooterClerkName(node: Element, value: string) {
  const texts = Array.from(node.getElementsByTagNameNS(WORD_NS, "t"));
  const lastText = texts[texts.length - 1];
  if (!lastText) {
    return;
  }
  lastText.textContent = value;
}

function ensureImageRelationship(zip: JSZip, relsDoc: XMLDocument, photo: WordPreviewPhoto, counter: number): string | null {
  const parsed = dataUrlToBytes(photo.src);
  if (!parsed) {
    return null;
  }

  const extension = parsed.mimeType.includes("png") ? "png" : "jpg";
  const relationshipId = `rId${900 + counter}`;
  const target = `media/generated_${counter}.${extension}`;
  zip.file(`word/${target}`, parsed.bytes);

  const root = relsDoc.documentElement;
  const relationship = relsDoc.createElementNS(PACKAGE_REL_NS, "Relationship");
  relationship.setAttribute("Id", relationshipId);
  relationship.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image");
  relationship.setAttribute("Target", target);
  root.appendChild(relationship);

  return relationshipId;
}

function buildTemplateObjectTable(doc: XMLDocument, templateTable: Element, row: WordPreviewRow, imageRelationshipId: string | null): Element {
  const clone = templateTable.cloneNode(true) as Element;
  const cells = Array.from(clone.getElementsByTagNameNS(WORD_NS, "tc"));
  const intCell = cells[0];
  const photoCell = cells[1];
  const textCell = cells[2];

  if (intCell) {
    setParagraphsInCell(doc, intCell, [{ text: row.intNumber }]);
  }

  if (photoCell) {
    const blip = photoCell.getElementsByTagNameNS(DRAWING_NS, "blip")[0];
    if (blip && imageRelationshipId) {
      blip.setAttributeNS(REL_NS, "r:embed", imageRelationshipId);
    } else {
      setParagraphsInCell(doc, photoCell, [{ text: "" }]);
    }
  }

  if (textCell) {
    const lines = [
      { text: row.title },
      { text: row.details[0] ?? "" },
      { text: row.details[1] ?? "" },
      { text: row.details[2] ?? "" },
      { text: "" },
      { text: row.estimate ? `Schätzung: CHF ${row.estimate}` : "Schätzung offen" },
      { text: row.priceValue ? `${row.priceLabel}: CHF ${row.priceValue}` : "", color: "FF0000" }
    ];
    setParagraphsInCell(doc, textCell, lines);
  }

  return clone;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mimeType: string } | null {
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

function createDocxPhotoRuns(photos: WordPreviewPhoto[]): Table | null {
  if (!photos.length) {
    return null;
  }

  const columns = 4;
  const rows: TableRow[] = [];

  for (let index = 0; index < photos.length; index += columns) {
    const slice = photos.slice(index, index + columns);
    rows.push(
      new TableRow({
        children: Array.from({ length: columns }).map((_, cellIndex) => {
          const photo = slice[cellIndex];
          const parsed = photo ? dataUrlToBytes(photo.src) : null;

          return new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
            },
            margins: { top: 60, bottom: 60, left: 40, right: 40 },
            children: parsed
              ? [
                  new Paragraph({
                    children: [
                      new ImageRun({
                        data: parsed.bytes,
                        transformation: {
                          width: 108,
                          height: 108
                        },
                        type: parsed.mimeType.includes("png") ? "png" : "jpg"
                      })
                    ]
                  })
                ]
              : [new Paragraph("")]
          });
        })
      })
    );
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
    },
    rows
  });
}

function createDocxRow(row: WordPreviewRow): Array<Paragraph | Table> {
  const children: Array<Paragraph | Table> = [];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 16, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
              },
              children: [
                new Paragraph({
                  spacing: { after: 100 },
                  children: [new TextRun({ text: row.intNumber, bold: true, font: "Neue Haas Grotesk" })]
                })
              ]
            }),
            new TableCell({
              width: { size: 60, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
              },
              children: [
                new Paragraph({
                  spacing: { after: 100 },
                  children: [new TextRun({ text: row.title, font: "Neue Haas Grotesk" })]
                })
              ]
            }),
            new TableCell({
              width: { size: 24, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
                right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
              },
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  spacing: { after: 100 },
                  children: [new TextRun({ text: row.estimate || "Schätzung offen", font: "Neue Haas Grotesk" })]
                })
              ]
            })
          ]
        })
      ]
    })
  );

  row.details.forEach((detail) => {
    children.push(
      new Paragraph({
        indent: { left: 920 },
        spacing: { after: 90 },
        children: [new TextRun({ text: detail, color: "4F6259", font: "Neue Haas Grotesk" })]
      })
    );
  });

  const photoTable = createDocxPhotoRuns(row.photos);
  if (photoTable) {
    children.push(photoTable);
  }

  children.push(
    new Paragraph({
      border: {
        bottom: { color: "E3E7E1", style: BorderStyle.SINGLE, size: 1 }
      },
      spacing: { after: 120 }
    })
  );

  return children;
}

function createDocxSections(model: WordPreviewModel): ISectionOptions[] {
  return model.pages.map((page) => {
    const children: Array<Paragraph | Table> = [];

    children.push(
      new Paragraph({
        spacing: { after: 220 },
        children: [
          new TextRun({
            text: "Schätzliste",
            bold: true,
            size: 24,
            font: "Neue Haas Grotesk"
          }),
          new TextRun({
            text: page.showAddress ? "  Einlieferer + Objekte" : `  Seite ${page.pageNumber}/${page.totalPages}`,
            size: 20,
            color: "586C62",
            font: "Neue Haas Grotesk"
          })
        ]
      })
    );

    if (page.showAddress) {
      page.addressLines.forEach((line) => {
        children.push(
          new Paragraph({
            spacing: { after: 70 },
            children: [new TextRun({ text: line, font: "Neue Haas Grotesk" })]
          })
        );
      });
      children.push(new Paragraph({ spacing: { after: 260 } }));
    } else {
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 240 },
          children: [new TextRun({ text: `Seite ${page.pageNumber}/${page.totalPages}`, color: "5F7067", font: "Neue Haas Grotesk" })]
        })
      );
    }

    page.rows.forEach((row) => {
      children.push(...createDocxRow(row));
    });

    children.push(
      new Paragraph({
        spacing: { before: 220, after: 80 },
        border: {
          top: { color: "D6DCD5", style: BorderStyle.SINGLE, size: 1 }
        }
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: "Hinweis- und Footerbereich bleibt frei", color: "6A786F", font: "Neue Haas Grotesk" })]
      })
    );

    return {
      properties: {
        page: {
          margin: {
            top: 900,
            right: 900,
            bottom: 900,
            left: 900
          }
        }
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "Seite ", color: "7A867E", font: "Neue Haas Grotesk" }),
                new TextRun({ children: [PageNumber.CURRENT] })
              ]
            })
          ]
        })
      },
      children
    };
  });
}

function drawWrappedText(page: PDFPage, font: PDFFont, text: string, x: number, y: number, maxWidth: number, lineHeight: number, size: number, color = rgb(0.15, 0.21, 0.18)) {
  const words = text.split(/\s+/).filter(Boolean);
  let currentLine = "";
  let cursorY = y;

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(nextLine, size) > maxWidth && currentLine) {
      page.drawText(currentLine, { x, y: cursorY, size, font, color });
      cursorY -= lineHeight;
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  });

  if (currentLine) {
    page.drawText(currentLine, { x, y: cursorY, size, font, color });
    cursorY -= lineHeight;
  }

  return cursorY;
}

async function drawPdfPhoto(page: PDFPage, pdfDocument: PDFDocument, photo: WordPreviewPhoto, x: number, y: number, size: number) {
  const parsed = dataUrlToBytes(photo.src);
  if (!parsed) {
    return;
  }

  const embedded = parsed.mimeType.includes("png")
    ? await pdfDocument.embedPng(parsed.bytes)
    : await pdfDocument.embedJpg(parsed.bytes);

  page.drawImage(embedded, {
    x,
    y,
    width: size,
    height: size
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

  page.drawText(row.estimate || "Schätzung offen", {
    x: A4_WIDTH - PDF_MARGIN_X - 120,
    y,
    size: 10,
    font,
    color: rgb(0.13, 0.21, 0.18)
  });

  const titleX = x + 78;
  const estimateWidth = 120;
  const titleWidth = A4_WIDTH - PDF_MARGIN_X - estimateWidth - titleX;
  let cursorY = drawWrappedText(page, font, row.title, titleX, y, titleWidth, 12, 10);

  row.details.forEach((detail) => {
    cursorY = drawWrappedText(page, font, detail, titleX, cursorY, titleWidth, 11, 9, rgb(0.32, 0.39, 0.36));
  });

  if (row.photos.length) {
    const photoSize = 72;
    const gap = 10;
    let photoY = cursorY - photoSize - 4;
    for (let index = 0; index < row.photos.length; index += 1) {
      const photo = row.photos[index];
      if (!photo) {
        continue;
      }
      const column = index % 4;
      const rowIndex = Math.floor(index / 4);
      const photoX = titleX + column * (photoSize + gap);
      const currentY = photoY - rowIndex * (photoSize + gap);
      // eslint-disable-next-line no-await-in-loop
      await drawPdfPhoto(page, pdfDocument, photo, photoX, currentY, photoSize);
      page.drawRectangle({
        x: photoX,
        y: currentY,
        width: photoSize,
        height: photoSize,
        borderColor: rgb(0.84, 0.86, 0.83),
        borderWidth: 0.6
      });
    }
    cursorY = photoY - Math.floor((row.photos.length - 1) / 4) * (photoSize + gap) - 18;
  }

  page.drawLine({
    start: { x: x, y: cursorY },
    end: { x: A4_WIDTH - PDF_MARGIN_X, y: cursorY },
    thickness: 0.7,
    color: rgb(0.9, 0.91, 0.89)
  });
}

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
      templateBackgroundSrc: "",
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
  const footerNodes = bodyElements.slice(4, -1);
  const sectionProperties = bodyElements[bodyElements.length - 1];

  if (!addressTable || !dateTable || !objectTable || !sectionProperties) {
    throw new Error("Koller-Vorlage konnte strukturell nicht interpretiert werden.");
  }

  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }

  let imageCounter = 1;

  model.pages.forEach((page, pageIndex) => {
    if (pageIndex > 0) {
      body.appendChild(createPageBreakParagraph(documentDoc));
    }

    if (page.showAddress) {
      const addressClone = addressTable.cloneNode(true) as Element;
      appendAddress(addressClone, page.addressLines);
      body.appendChild(addressClone);

      if (spacerParagraph) {
        body.appendChild(spacerParagraph.cloneNode(true));
      }
    }

    const dateClone = dateTable.cloneNode(true) as Element;
    appendDateValue(dateClone, page.headerRightText);
    body.appendChild(dateClone);

    page.rows.forEach((row) => {
      const relationshipId = row.primaryPhoto ? ensureImageRelationship(zip, relationshipsDoc, row.primaryPhoto, imageCounter) : null;
      if (relationshipId) {
        imageCounter += 1;
      }
      body.appendChild(buildTemplateObjectTable(documentDoc, objectTable, row, relationshipId));
    });

    footerNodes.forEach((footerNode, footerIndex) => {
      const footerClone = footerNode.cloneNode(true) as Element;
      if (footerIndex === 1) {
        setFooterClerkName(footerClone, page.footerLabel);
      }
      body.appendChild(footerClone);
    });
  });

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

    page.drawText("Schätzliste", {
      x: PDF_MARGIN_X,
      y,
      size: 14,
      font,
      color: rgb(0.13, 0.21, 0.18)
    });

    page.drawText(previewPage.showAddress ? "Einlieferer + Objekte" : `Seite ${previewPage.pageNumber}/${previewPage.totalPages}`, {
      x: A4_WIDTH - PDF_MARGIN_X - 120,
      y,
      size: 10,
      font,
      color: rgb(0.36, 0.42, 0.39)
    });

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
