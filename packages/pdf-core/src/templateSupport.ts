import { PDFDocument } from "pdf-lib";

export type PdfForm = ReturnType<PDFDocument["getForm"]>;

export async function loadTemplateBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Vorlage konnte nicht geladen werden: ${url}`);
  }

  return response.arrayBuffer();
}

export function setTextFieldSafe(form: PdfForm, fieldName: string, value: string): void {
  try {
    form.getTextField(fieldName).setText(value);
  } catch {
    // Some templates may differ slightly; we skip missing fields deliberately.
  }
}

export function setMultilineTextFieldSafe(form: PdfForm, fieldName: string, value: string): void {
  try {
    const field = form.getTextField(fieldName);
    field.enableMultiline();
    field.setText(value);
  } catch {
    // Some templates may differ slightly; we skip missing fields deliberately.
  }
}

export function normalizeRect(rect: { x: number; y: number; width: number; height: number }) {
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

export function getFieldRects(form: PdfForm, fieldName: string) {
  try {
    const field = form.getField(fieldName) as unknown as {
      acroField?: {
        getWidgets(): Array<{ getRectangle(): { x: number; y: number; width: number; height: number } }>;
      };
    };
    const widgets = field.acroField?.getWidgets() ?? [];
    return widgets.map((widget) => normalizeRect(widget.getRectangle()));
  } catch {
    return [];
  }
}

export function decodeDataUrl(dataUrl: string): Uint8Array {
  const match = dataUrl.match(/^data:.*?;base64,(.*)$/i);
  if (!match || !match[1]) {
    throw new Error("Bildquelle ist keine gueltige Base64-Data-URL.");
  }

  const normalizedBase64 = match[1].replaceAll(/\s+/g, "").replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalizedBase64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function loadImageBytesFromSource(source: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const trimmedSource = source.trim();
  if (!trimmedSource) {
    throw new Error("Bildquelle ist leer.");
  }

  if (trimmedSource.startsWith("data:")) {
    const mimeTypeMatch = trimmedSource.match(/^data:(.*?);base64,/i);
    return {
      bytes: decodeDataUrl(trimmedSource),
      mimeType: (mimeTypeMatch?.[1] || "image/jpeg").toLowerCase()
    };
  }

  if (trimmedSource.startsWith("http://") || trimmedSource.startsWith("https://") || trimmedSource.startsWith("blob:")) {
    const response = await fetch(trimmedSource);
    if (!response.ok) {
      throw new Error(`Bildquelle konnte nicht geladen werden (${response.status}).`);
    }

    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType: (response.headers.get("content-type") || "image/jpeg").toLowerCase()
    };
  }

  throw new Error("Bildquelle ist weder Data-URL noch HTTP/Blob-URL.");
}

export async function embedImageFromDataUrl(pdf: PDFDocument, dataUrl: string) {
  const { bytes, mimeType } = await loadImageBytesFromSource(dataUrl);
  if (mimeType.includes("png")) {
    return pdf.embedPng(bytes);
  }

  return pdf.embedJpg(bytes);
}
