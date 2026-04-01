import { collectMissingRequiredFields, type CaseFile, deriveAddressLines, deriveBeneficiary, type MasterData } from "@elb/domain/index";
import { rgb, type PDFFont, type PDFDocument, type PDFPage } from "pdf-lib";
import { wrapText } from "./drawingSupport";
import {
  buildCostFieldValue,
  getVatCategoryLabel,
  isFollowUpValue,
  joinAddressLines
} from "./previewModel";
import {
  embedImageFromDataUrl,
  getFieldRects,
  setMultilineTextFieldSafe,
  setTextFieldSafe,
  type PdfForm
} from "./templateSupport";

export const FOLLOW_UP_COLOR = rgb(0.74, 0.14, 0.11);
export const REQUIRED_FIELD_COLOR = rgb(0.76, 0.08, 0.12);
export const PDF_DATA_TEXT_COLOR = rgb(0, 0, 0);
export const PDF_DATA_FONT_SIZE = 9.4;
export const PDF_DATA_LINE_HEIGHT = 10.8;

function appendContactLines(lines: string[], phone: string, email: string): string[] {
  const nextLines = [...lines];

  if (phone.trim()) {
    nextLines.push(phone.trim());
  }

  if (email.trim()) {
    nextLines.push(email.trim());
  }

  return nextLines;
}

function buildConsignorSummaryLine(caseFile: CaseFile): string[] {
  if (caseFile.consignor.useCompanyAddress && caseFile.consignor.company.trim()) {
    return [caseFile.consignor.company.trim()];
  }

  const fullName = [caseFile.consignor.firstName, caseFile.consignor.lastName].filter(Boolean).join(" ").trim();
  return fullName ? [fullName] : [];
}

function buildOwnerAddressLines(caseFile: CaseFile): string[] {
  if (caseFile.owner.sameAsConsignor) {
    return [];
  }

  return [
    [caseFile.owner.firstName, caseFile.owner.lastName].filter(Boolean).join(" ").trim(),
    [caseFile.owner.street, caseFile.owner.houseNumber].filter(Boolean).join(" ").trim(),
    [caseFile.owner.zip, caseFile.owner.city].filter(Boolean).join(" ").trim(),
    caseFile.owner.country
  ].map((line) => line.trim()).filter(Boolean);
}

function buildLabeledFieldValue(label: string, value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "";
  }

  return `${label}: ${trimmedValue}`;
}

export function drawFieldOverlay(args: {
  page: PDFPage;
  form: PdfForm;
  font: PDFFont;
  fieldName: string;
  value: string;
  multiline?: boolean;
  forceVisible?: boolean;
  color?: ReturnType<typeof rgb>;
  baselineNudge?: number;
}): void {
  if (!args.forceVisible && !isFollowUpValue(args.value)) {
    return;
  }

  const rect = getFieldRects(args.form, args.fieldName)[0];
  if (!rect) {
    return;
  }

  const fontSize = PDF_DATA_FONT_SIZE;
  const lineHeight = PDF_DATA_LINE_HEIGHT;
  const lines = args.multiline
    ? wrapText(args.font, args.value, fontSize, Math.max(rect.width - 6, 1))
    : [args.value];

  lines.forEach((line, index) => {
    const y = args.multiline
      ? rect.top - fontSize - 1.2 - index * lineHeight
      : rect.bottom + Math.max((rect.height - fontSize) / 2, 0) + (args.baselineNudge ?? 0.4) - index * lineHeight;

    args.page.drawText(line, {
      x: rect.left + 2.5,
      y,
      size: fontSize,
      font: args.font,
      color: args.color ?? (isFollowUpOverlayValue(args.value) ? FOLLOW_UP_COLOR : PDF_DATA_TEXT_COLOR)
    });
  });
}

function isFollowUpOverlayValue(value: string): boolean {
  if (isFollowUpValue(value)) {
    return true;
  }

  return value.toLowerCase().includes("angaben folgen");
}

function clearFieldOverlay(page: PDFPage, form: PdfForm, fieldName: string): void {
  const rect = getFieldRects(form, fieldName)[0];
  if (!rect) {
    return;
  }

  page.drawRectangle({
    x: rect.left,
    y: rect.bottom,
    width: rect.width,
    height: rect.height,
    color: rgb(1, 1, 1)
  });
}

function formatRequiredFieldNotice(label: string): string {
  const cleanLabel = label.replace(/^Objekt \d+:\s*/, "").trim();
  return `"${cleanLabel}" zwingend.`;
}

function drawMissingRequiredFieldOverlay(args: {
  page: PDFPage;
  form: PdfForm;
  font: PDFFont;
  caseFile: CaseFile;
  masterData: MasterData;
  pageNumber: number;
}): void {
  const missingFields = collectMissingRequiredFields(args.caseFile, args.masterData.globalPdfRequiredFields);

  if (!missingFields.length) {
    return;
  }

  const groupedNotices = new Map<string, string[]>();

  missingFields.forEach((field) => {
    if (field.key === "objects[].create" || field.objectIndex !== undefined) {
      return;
    }

    if (field.key === "consignor.lastName" || field.key === "consignor.street" || field.key === "consignor.zip" || field.key === "consignor.city") {
      const notices = groupedNotices.get("Adresse EL") ?? [];
      notices.push(formatRequiredFieldNotice(field.label));
      groupedNotices.set("Adresse EL", notices);
      return;
    }

    if (field.key === "bank.beneficiaryOverride.reason" || field.key === "bank.beneficiaryOverride.name") {
      const notices = groupedNotices.get("Bankangaben: Begünstigter") ?? [];
      notices.push(formatRequiredFieldNotice(field.label));
      groupedNotices.set("Bankangaben: Begünstigter", notices);
      return;
    }

    if (field.key === "meta.receiptNumber") {
      groupedNotices.set(args.pageNumber === 1 ? "ELB Nr" : "ELB Nr 2", [formatRequiredFieldNotice(field.label)]);
      return;
    }

    if (field.key === "meta.clerkId") {
      groupedNotices.set("Sachbearbeiter 2", [formatRequiredFieldNotice(field.label)]);
    }
  });

  groupedNotices.forEach((notices, fieldName) => {
    drawFieldOverlay({
      page: args.page,
      form: args.form,
      font: args.font,
      fieldName,
      value: notices.join("\n"),
      multiline: notices.length > 1 || fieldName === "Adresse EL" || fieldName === "Bankangaben: Begünstigter",
      forceVisible: true,
      color: REQUIRED_FIELD_COLOR
    });
  });
}

export function buildMissingObjectFieldMap(caseFile: CaseFile, masterData: MasterData): Map<number, Set<string>> {
  const missingFields = collectMissingRequiredFields(caseFile, masterData.globalPdfRequiredFields);
  const missingByObjectIndex = new Map<number, Set<string>>();

  missingFields.forEach((field) => {
    if (field.objectIndex === undefined) {
      return;
    }

    const objectFields = missingByObjectIndex.get(field.objectIndex) ?? new Set<string>();
    objectFields.add(field.key);
    missingByObjectIndex.set(field.objectIndex, objectFields);
  });

  return missingByObjectIndex;
}

export function drawMissingObjectFieldOverlays(args: {
  page: PDFPage;
  font: PDFFont;
  row: {
    items: Array<{
      objectIndex: number;
      startLine: number;
    }>;
  };
  missingByObjectIndex: Map<number, Set<string>>;
  geometry: {
    departmentCode: { left: number };
    description: { left: number };
    contentTop: number;
    lineHeight: number;
    fontSize: number;
  };
}): void {
  args.row.items.forEach((item) => {
    const missingFields = args.missingByObjectIndex.get(item.objectIndex);
    if (!missingFields) {
      return;
    }

    const y = args.geometry.contentTop - item.startLine * args.geometry.lineHeight - args.geometry.fontSize;

    if (missingFields.has("objects[].departmentId")) {
      args.page.drawText(formatRequiredFieldNotice("Abteilung"), {
        x: args.geometry.departmentCode.left + 1.8,
        y,
        size: args.geometry.fontSize,
        font: args.font,
        color: REQUIRED_FIELD_COLOR
      });
    }

    if (missingFields.has("objects[].shortDescription")) {
      args.page.drawText(formatRequiredFieldNotice("Kurzbeschrieb"), {
        x: args.geometry.description.left + 1.8,
        y,
        size: args.geometry.fontSize,
        font: args.font,
        color: REQUIRED_FIELD_COLOR
      });
    }
  });
}

export async function drawSignatureIntoFields(
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

export function fillSharedFields(args: {
  form: PdfForm;
  page: PDFPage;
  font: PDFFont;
  caseFile: CaseFile;
  masterData: MasterData;
  pageNumber: number;
  totalPages: number;
}): void {
  const { form, page, font, caseFile, masterData, pageNumber, totalPages } = args;
  const clerk = masterData.clerks.find((item) => item.id === caseFile.meta.clerkId);
  const beneficiary = deriveBeneficiary(caseFile.consignor, caseFile.bank);
  const addressLines = pageNumber === 1
    ? appendContactLines(deriveAddressLines(caseFile.consignor), caseFile.consignor.phone, caseFile.consignor.email)
    : buildConsignorSummaryLine(caseFile);
  const ownerLines = buildOwnerAddressLines(caseFile);

  const receiptFieldName = pageNumber === 1 ? "ELB Nr" : "ELB Nr 2";
  const commissionValue = buildCostFieldValue(caseFile.costs.commission);
  const transportValue = buildCostFieldValue(caseFile.costs.transport);
  const imagingValue = buildCostFieldValue(caseFile.costs.imaging);
  const expertiseValue = buildCostFieldValue(caseFile.costs.expertise);
  const insuranceValue = buildCostFieldValue(caseFile.costs.insurance);
  const provenanceValue = caseFile.costs.provenance;
  const internetValue = buildCostFieldValue(caseFile.costs.internet);
  const clerkValue = clerk ? [clerk.name, clerk.phone, clerk.email].filter(Boolean).join(", ") : "";
  const addressValue = joinAddressLines(addressLines);
  const ownerValue = joinAddressLines(ownerLines);
  const bicValue = buildLabeledFieldValue("BIC", caseFile.bank.bic);
  const ibanValue = buildLabeledFieldValue("IBAN", caseFile.bank.iban);
  const beneficiaryValue = buildLabeledFieldValue("Begünstigter", beneficiary);
  const birthDateValue = buildLabeledFieldValue("Geburtsdatum", caseFile.consignor.birthDate);
  const nationalityValue = buildLabeledFieldValue("Nationalität", caseFile.consignor.nationality);
  const passportValue = buildLabeledFieldValue("Passnummer", caseFile.consignor.passportNumber);
  const vatCategoryValue = getVatCategoryLabel(caseFile.consignor.vatCategory);
  const vatNumberValue = caseFile.consignor.vatCategory === "C" && caseFile.consignor.vatNumber.trim()
    ? `MwSt-Nr. ${caseFile.consignor.vatNumber.trim()}`
    : "";
  const vatCategoryFieldName = pageNumber === 1 ? "MwSt. Kategorie" : "MwSt. Kategorie 2";
  const vatNumberFieldName = pageNumber === 1 ? "MwSt. Nr " : "MwSt. Nr 2";

  setTextFieldSafe(form, receiptFieldName, isFollowUpValue(caseFile.meta.receiptNumber) ? "" : caseFile.meta.receiptNumber);
  setTextFieldSafe(form, "Kommission", isFollowUpValue(commissionValue) ? "" : commissionValue);
  setTextFieldSafe(form, "Transport", isFollowUpValue(transportValue) ? "" : transportValue);
  setTextFieldSafe(form, "Abb.-Kosten", isFollowUpValue(imagingValue) ? "" : imagingValue);
  setTextFieldSafe(form, "Kosten ", isFollowUpValue(expertiseValue) ? "" : expertiseValue);
  setTextFieldSafe(form, "Versicherung ", isFollowUpValue(insuranceValue) ? "" : insuranceValue);
  setTextFieldSafe(form, vatNumberFieldName, "");
  setTextFieldSafe(form, vatCategoryFieldName, "");
  setTextFieldSafe(form, "Diverses/Provenienz 2", isFollowUpValue(provenanceValue) ? "" : provenanceValue);
  setTextFieldSafe(form, "Datum", new Date(caseFile.meta.createdAt).toLocaleDateString("de-CH"));
  setTextFieldSafe(form, "Internet  1", isFollowUpValue(internetValue) ? "" : internetValue);
  setTextFieldSafe(form, "Sachbearbeiter 2", isFollowUpValue(clerkValue) ? "" : clerkValue);
  setMultilineTextFieldSafe(form, "Adresse EL", "");
  setMultilineTextFieldSafe(form, "Adresse EG", "");
  setTextFieldSafe(form, "BIC/SWIFT", "");
  setTextFieldSafe(form, "IBAN/Kontonr", "");
  setTextFieldSafe(form, "Bankangaben: Beg\u00fcnstigter", "");
  setTextFieldSafe(form, "Seite N/N", `${pageNumber}/${totalPages}`);
  setTextFieldSafe(form, "EL Geburtsdatum 1", "");
  setTextFieldSafe(form, "EL Nationalit\u00e4t  1", "");
  setTextFieldSafe(form, "EL ID/Passnr  1", "");

  drawFieldOverlay({ page, form, font, fieldName: receiptFieldName, value: caseFile.meta.receiptNumber, baselineNudge: 1.2 });
  drawFieldOverlay({ page, form, font, fieldName: "Kommission", value: commissionValue });
  drawFieldOverlay({ page, form, font, fieldName: "Transport", value: transportValue });
  drawFieldOverlay({ page, form, font, fieldName: "Abb.-Kosten", value: imagingValue });
  drawFieldOverlay({ page, form, font, fieldName: "Kosten ", value: expertiseValue });
  drawFieldOverlay({ page, form, font, fieldName: "Versicherung ", value: insuranceValue });
  drawFieldOverlay({ page, form, font, fieldName: vatNumberFieldName, value: vatNumberValue, forceVisible: Boolean(vatNumberValue) });
  drawFieldOverlay({ page, form, font, fieldName: vatCategoryFieldName, value: vatCategoryValue, forceVisible: Boolean(vatCategoryValue) });
  drawFieldOverlay({ page, form, font, fieldName: "Diverses/Provenienz 2", value: provenanceValue });
  drawFieldOverlay({ page, form, font, fieldName: "Internet  1", value: internetValue });
  drawFieldOverlay({ page, form, font, fieldName: "Sachbearbeiter 2", value: clerkValue, baselineNudge: 1.2 });
  drawFieldOverlay({ page, form, font, fieldName: "Adresse EL", value: addressValue, multiline: true, forceVisible: true });
  if (ownerValue) {
    drawFieldOverlay({ page, form, font, fieldName: "Adresse EG", value: ownerValue, multiline: true, forceVisible: true });
  } else {
    clearFieldOverlay(page, form, "Adresse EG");
  }
  drawFieldOverlay({ page, form, font, fieldName: "BIC/SWIFT", value: bicValue, forceVisible: Boolean(bicValue) });
  drawFieldOverlay({ page, form, font, fieldName: "IBAN/Kontonr", value: ibanValue, multiline: true, forceVisible: Boolean(ibanValue) });
  drawFieldOverlay({ page, form, font, fieldName: "Bankangaben: Beg\u00fcnstigter", value: beneficiaryValue, multiline: true, forceVisible: Boolean(beneficiaryValue) });
  drawFieldOverlay({ page, form, font, fieldName: "EL Geburtsdatum 1", value: birthDateValue, forceVisible: Boolean(birthDateValue) });
  drawFieldOverlay({ page, form, font, fieldName: "EL Nationalit\u00e4t  1", value: nationalityValue, forceVisible: Boolean(nationalityValue) });
  drawFieldOverlay({ page, form, font, fieldName: "EL ID/Passnr  1", value: passportValue, forceVisible: Boolean(passportValue) });
  drawMissingRequiredFieldOverlay({ page, form, font, caseFile, masterData, pageNumber });
}

export function fillObjectFields(form: PdfForm, suffix: "1" | "2"): void {
  setMultilineTextFieldSafe(form, `Int-Nr ${suffix}`, "");
  setMultilineTextFieldSafe(form, `Erhalten ${suffix}`, "");
  setMultilineTextFieldSafe(form, `Kapitel ${suffix}`, "");
  setMultilineTextFieldSafe(form, `Kurzbeschreibung ${suffix}`, "");
  setMultilineTextFieldSafe(form, `Sch\u00e4tzung ${suffix}`, "");
}
