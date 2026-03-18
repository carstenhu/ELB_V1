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
  const [, base64 = ""] = dataUrl.split(",", 2);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

export async function embedImageFromDataUrl(pdf: PDFDocument, dataUrl: string) {
  const bytes = decodeDataUrl(dataUrl);
  if (dataUrl.startsWith("data:image/png")) {
    return pdf.embedPng(bytes);
  }

  return pdf.embedJpg(bytes);
}
