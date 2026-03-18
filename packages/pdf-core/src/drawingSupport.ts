import { rgb, type PDFFont, type PDFPage } from "pdf-lib";

export interface LayoutCursor {
  y: number;
}

export function wrapText(font: PDFFont, text: string, fontSize: number, maxWidth: number): string[] {
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

export function ensurePage(
  pdf: { addPage(size: [number, number]): PDFPage },
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

export function drawWrappedBlock(args: {
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
