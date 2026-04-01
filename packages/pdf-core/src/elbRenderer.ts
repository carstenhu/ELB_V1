import { type CaseFile, type MasterData } from "@elb/domain/index";
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import templatePdfUrl from "../../../vorlagen/template.pdf?url";
import templateObjectsPdfUrl from "../../../vorlagen/template_objekte.pdf?url";
import { buildObjectPageChunks, getObjectFieldGeometry } from "./objectLayout";
import { createPdfPreviewModel, isFollowUpValue } from "./previewModel";
import {
  FOLLOW_UP_COLOR,
  PDF_DATA_TEXT_COLOR,
  buildMissingObjectFieldMap,
  drawMissingObjectFieldOverlays,
  drawSignatureIntoFields,
  fillObjectFields,
  fillSharedFields
} from "./renderSupport";
import { loadTemplateBytes, type PdfForm } from "./templateSupport";
import type { ObjectPageChunk } from "./types";

async function drawObjectChunk(args: {
  pdf: PDFDocument;
  page: PDFPage;
  form: PdfForm;
  row: ObjectPageChunk;
  suffix: "1" | "2";
}): Promise<void> {
  const geometry = getObjectFieldGeometry(args.form, args.suffix);
  const font = await args.pdf.embedFont(StandardFonts.Helvetica);
  const baselineOffset = geometry.fontSize;
  const columnX = {
    intNumber: geometry.intNumber.left + 1.8,
    auctionLabel: geometry.auctionLabel.left + 1.8,
    departmentCode: geometry.departmentCode.left + 1.8,
    description: geometry.description.left + 1.8,
    estimate: geometry.estimate.left + 1.8
  };

  args.row.items.forEach((item) => {
    const columns = [
      { x: columnX.intNumber, values: item.intNumberLines },
      { x: columnX.auctionLabel, values: item.auctionLabelLines },
      { x: columnX.departmentCode, values: item.departmentCodeLines },
      { x: columnX.description, values: item.descriptionLines },
      { x: columnX.estimate, values: item.estimateLines }
    ];

    columns.forEach((column) => {
      column.values.forEach((line, index) => {
        if (!line.trim()) {
          return;
        }

        const lineTop = geometry.contentTop - (item.startLine + index) * geometry.lineHeight;
        args.page.drawText(line, {
          x: column.x,
          y: lineTop - baselineOffset,
          size: geometry.fontSize,
          font,
          color: isFollowUpValue(line) ? FOLLOW_UP_COLOR : PDF_DATA_TEXT_COLOR
        });
      });
    });
  });
}

export async function generateElbPdf(caseFile: CaseFile, masterData: MasterData): Promise<Uint8Array> {
  const previewModel = createPdfPreviewModel(caseFile, masterData);
  const mainTemplateBytes = await loadTemplateBytes(templatePdfUrl);
  const followTemplateBytes = await loadTemplateBytes(templateObjectsPdfUrl);
  const objectPages = await buildObjectPageChunks(previewModel.objectRows);
  const outputPdf = await PDFDocument.create();
  const totalPages = Math.max(objectPages.length, 1);
  const clerk = masterData.clerks.find((item) => item.id === caseFile.meta.clerkId);
  const missingObjectFields = buildMissingObjectFieldMap(caseFile, masterData);

  for (let index = 0; index < totalPages; index += 1) {
    const row = objectPages[index] ?? {
      intNumber: "",
      auctionLabel: "",
      departmentCode: "",
      description: "",
      estimate: "",
      items: [],
      usedLines: 0,
      capacityLines: 0
    };
    const sourceBytes = index === 0 ? mainTemplateBytes : followTemplateBytes;
    const sourcePdf = await PDFDocument.load(sourceBytes);
    const form = sourcePdf.getForm();
    const page = sourcePdf.getPage(0);
    const overlayFont = await sourcePdf.embedFont(StandardFonts.Helvetica);

    fillSharedFields({ form, page, font: overlayFont, caseFile, masterData, pageNumber: index + 1, totalPages });
    fillObjectFields(form, index === 0 ? "1" : "2");
    await drawObjectChunk({
      pdf: sourcePdf,
      page,
      form,
      row,
      suffix: index === 0 ? "1" : "2"
    });
    drawMissingObjectFieldOverlays({
      page,
      font: overlayFont,
      row,
      missingByObjectIndex: missingObjectFields,
      geometry: getObjectFieldGeometry(form, index === 0 ? "1" : "2")
    });

    await drawSignatureIntoFields(sourcePdf, 0, form, ["der Einlieferer Sig", "der Einlieferer Sig 2"], caseFile.signatures.consignorSignaturePng);
    await drawSignatureIntoFields(sourcePdf, 0, form, ["Koller Auktionen Sig 1"], clerk?.signaturePng ?? "");

    form.flatten();
    const [copiedPage] = await outputPdf.copyPages(sourcePdf, [0]);
    outputPdf.addPage(copiedPage);
  }

  return outputPdf.save();
}
