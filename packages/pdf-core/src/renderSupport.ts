import { type CaseFile, deriveAddressLines, deriveBeneficiary, type MasterData } from "@elb/domain/index";
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

export function drawFieldOverlay(args: {
  page: PDFPage;
  form: PdfForm;
  font: PDFFont;
  fieldName: string;
  value: string;
  multiline?: boolean;
  forceVisible?: boolean;
}): void {
  if (!args.forceVisible && !isFollowUpValue(args.value)) {
    return;
  }

  const rect = getFieldRects(args.form, args.fieldName)[0];
  if (!rect) {
    return;
  }

  const fontSize = args.multiline ? 10 : 10.5;
  const lineHeight = args.multiline ? 12 : 10.5;
  const lines = args.multiline
    ? wrapText(args.font, args.value, fontSize, Math.max(rect.width - 6, 1))
    : [args.value];

  lines.forEach((line, index) => {
    args.page.drawText(line, {
      x: rect.left + 2.5,
      y: rect.top - fontSize - 2.5 - index * lineHeight,
      size: fontSize,
      font: args.font,
      color: isFollowUpValue(args.value) ? FOLLOW_UP_COLOR : rgb(0, 0, 0)
    });
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
  const addressLines = deriveAddressLines(caseFile.consignor);
  const ownerLines = caseFile.owner.sameAsConsignor
    ? addressLines
    : [
        [caseFile.owner.firstName, caseFile.owner.lastName].filter(Boolean).join(" ").trim(),
        [caseFile.owner.street, caseFile.owner.houseNumber].filter(Boolean).join(" ").trim(),
        [caseFile.owner.zip, caseFile.owner.city].filter(Boolean).join(" ").trim(),
        caseFile.owner.country
      ].map((line) => line.trim()).filter(Boolean);

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
  setMultilineTextFieldSafe(form, "Adresse EL", isFollowUpValue(addressValue) ? "" : addressValue);
  setMultilineTextFieldSafe(form, "Adresse EG", isFollowUpValue(ownerValue) ? "" : ownerValue);
  setTextFieldSafe(form, "BIC/SWIFT", isFollowUpValue(caseFile.bank.bic) ? "" : caseFile.bank.bic);
  setTextFieldSafe(form, "IBAN/Kontonr", isFollowUpValue(caseFile.bank.iban) ? "" : caseFile.bank.iban);
  setTextFieldSafe(form, "Bankangaben: Beg\u00fcnstigter", isFollowUpValue(beneficiary) ? "" : beneficiary);
  setTextFieldSafe(form, "Seite N/N", `${pageNumber}/${totalPages}`);
  setTextFieldSafe(form, "EL Geburtsdatum 1", isFollowUpValue(caseFile.consignor.birthDate) ? "" : caseFile.consignor.birthDate);
  setTextFieldSafe(form, "EL Nationalit\u00e4t  1", isFollowUpValue(caseFile.consignor.nationality) ? "" : caseFile.consignor.nationality);
  setTextFieldSafe(form, "EL ID/Passnr  1", isFollowUpValue(caseFile.consignor.passportNumber) ? "" : caseFile.consignor.passportNumber);

  drawFieldOverlay({ page, form, font, fieldName: receiptFieldName, value: caseFile.meta.receiptNumber });
  drawFieldOverlay({ page, form, font, fieldName: "Kommission", value: commissionValue });
  drawFieldOverlay({ page, form, font, fieldName: "Transport", value: transportValue });
  drawFieldOverlay({ page, form, font, fieldName: "Abb.-Kosten", value: imagingValue });
  drawFieldOverlay({ page, form, font, fieldName: "Kosten ", value: expertiseValue });
  drawFieldOverlay({ page, form, font, fieldName: "Versicherung ", value: insuranceValue });
  drawFieldOverlay({ page, form, font, fieldName: vatNumberFieldName, value: vatNumberValue, forceVisible: Boolean(vatNumberValue) });
  drawFieldOverlay({ page, form, font, fieldName: vatCategoryFieldName, value: vatCategoryValue, forceVisible: Boolean(vatCategoryValue) });
  drawFieldOverlay({ page, form, font, fieldName: "Diverses/Provenienz 2", value: provenanceValue });
  drawFieldOverlay({ page, form, font, fieldName: "Internet  1", value: internetValue });
  drawFieldOverlay({ page, form, font, fieldName: "Sachbearbeiter 2", value: clerkValue });
  drawFieldOverlay({ page, form, font, fieldName: "Adresse EL", value: addressValue, multiline: true });
  drawFieldOverlay({ page, form, font, fieldName: "Adresse EG", value: ownerValue, multiline: true });
  drawFieldOverlay({ page, form, font, fieldName: "BIC/SWIFT", value: caseFile.bank.bic });
  drawFieldOverlay({ page, form, font, fieldName: "IBAN/Kontonr", value: caseFile.bank.iban });
  drawFieldOverlay({ page, form, font, fieldName: "Bankangaben: Beg\u00fcnstigter", value: beneficiary });
  drawFieldOverlay({ page, form, font, fieldName: "EL Geburtsdatum 1", value: caseFile.consignor.birthDate });
  drawFieldOverlay({ page, form, font, fieldName: "EL Nationalit\u00e4t  1", value: caseFile.consignor.nationality });
  drawFieldOverlay({ page, form, font, fieldName: "EL ID/Passnr  1", value: caseFile.consignor.passportNumber });
}

export function fillObjectFields(form: PdfForm, suffix: "1" | "2"): void {
  setMultilineTextFieldSafe(form, `Int-Nr ${suffix}`, "");
  setMultilineTextFieldSafe(form, `Erhalten ${suffix}`, "");
  setMultilineTextFieldSafe(form, `Kapitel ${suffix}`, "");
  setMultilineTextFieldSafe(form, `Kurzbeschreibung ${suffix}`, "");
  setMultilineTextFieldSafe(form, `Sch\u00e4tzung ${suffix}`, "");
}
