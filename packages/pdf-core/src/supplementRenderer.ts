import {
  deriveAddressLines,
  deriveBeneficiary,
  formatAmountForDisplay,
  type CaseFile,
  type MasterData
} from "@elb/domain/index";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { drawWrappedBlock, ensurePage, type LayoutCursor, wrapText } from "./drawingSupport";
import { buildCostFieldValue, buildObjectEstimate, getAuctionLabel, getPriceLabel } from "./previewModel";
import { embedImageFromDataUrl } from "./templateSupport";

export async function generateSupplementPdf(caseFile: CaseFile, masterData: MasterData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 42;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const contentWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  const cursor: LayoutCursor = { y: pageHeight - margin };

  const clerk = masterData.clerks.find((item) => item.id === caseFile.meta.clerkId);
  const departmentsById = new Map(masterData.departments.map((department) => [department.id, department]));
  const auctionsById = new Map(masterData.auctions.map((auction) => [auction.id, auction]));

  page.drawText(`Zusatz-PDF ELB ${caseFile.meta.receiptNumber}`, {
    x: margin,
    y: cursor.y,
    size: 16,
    font: boldFont,
    color: rgb(0.1, 0.15, 0.13)
  });
  cursor.y -= 24;
  page.drawText(
    [caseFile.consignor.company || "", caseFile.consignor.firstName, caseFile.consignor.lastName].filter(Boolean).join(" ").trim() || "Einlieferer",
    {
      x: margin,
      y: cursor.y,
      size: 10.5,
      font,
      color: rgb(0.25, 0.31, 0.28)
    }
  );
  cursor.y -= 26;

  for (const [index, objectItem] of caseFile.objects.entries()) {
    const auction = auctionsById.get(objectItem.auctionId);
    const department = departmentsById.get(objectItem.departmentId);
    const descriptionParts = [
      objectItem.shortDescription,
      objectItem.description,
      objectItem.referenceNumber ? `Referenznr.: ${objectItem.referenceNumber}` : "",
      objectItem.remarks ? `Bemerkungen: ${objectItem.remarks}` : "",
      objectItem.estimate.low || objectItem.estimate.high ? `SchÃƒÂ¤tzung: ${buildObjectEstimate(objectItem)}` : "",
      objectItem.priceValue ? `${getPriceLabel(auction, objectItem)}: ${formatAmountForDisplay(objectItem.priceValue)}` : ""
    ].filter(Boolean);
    const objectText = descriptionParts.join("\n");
    const textLines = wrapText(font, objectText, 10.5, contentWidth);
    const photoAssets = caseFile.assets.filter((asset) => objectItem.photoAssetIds.includes(asset.id));
    const photoRows = Math.ceil(photoAssets.length / 4);
    const photoHeight = photoAssets.length ? photoRows * 104 + (photoRows - 1) * 8 : 0;
    const requiredHeight = 44 + textLines.length * 14 + (photoHeight ? 18 + photoHeight : 0) + 24;

    page = ensurePage(pdf, page, cursor, requiredHeight, margin);

    page.drawRectangle({
      x: margin,
      y: cursor.y - requiredHeight + 10,
      width: contentWidth,
      height: requiredHeight - 10,
      borderWidth: 0.8,
      borderColor: rgb(0.84, 0.87, 0.84),
      color: rgb(0.99, 0.99, 0.98)
    });

    page.drawText(`${index + 1}. ${objectItem.intNumber}`, {
      x: margin + 12,
      y: cursor.y - 18,
      size: 12,
      font: boldFont,
      color: rgb(0.13, 0.17, 0.15)
    });
    page.drawText(
      [department ? `${department.code} ${department.name}` : "", auction ? getAuctionLabel(auction) : ""].filter(Boolean).join(" Ã‚Â· "),
      {
        x: margin + 90,
        y: cursor.y - 18,
        size: 9.5,
        font,
        color: rgb(0.3, 0.36, 0.33)
      }
    );

    const blockCursor: LayoutCursor = { y: cursor.y - 38 };
    drawWrappedBlock({
      page,
      font,
      boldFont,
      cursor: blockCursor,
      margin: margin + 12,
      maxWidth: contentWidth - 24,
      text: objectText
    });

    if (photoAssets.length) {
      blockCursor.y -= 4;
      page.drawText("Fotos", {
        x: margin + 12,
        y: blockCursor.y,
        size: 10,
        font: boldFont,
        color: rgb(0.13, 0.17, 0.15)
      });
      blockCursor.y -= 14;

      const photoWidth = (contentWidth - 24 - 3 * 8) / 4;
      for (const [photoIndex, asset] of photoAssets.entries()) {
        const row = Math.floor(photoIndex / 4);
        const col = photoIndex % 4;
        const boxX = margin + 12 + col * (photoWidth + 8);
        const boxTop = blockCursor.y - row * 112;
        const boxHeight = 104;
        page.drawRectangle({
          x: boxX,
          y: boxTop - boxHeight,
          width: photoWidth,
          height: boxHeight,
          borderWidth: 0.6,
          borderColor: rgb(0.84, 0.87, 0.84),
          color: rgb(1, 1, 1)
        });

        try {
          const image = await embedImageFromDataUrl(pdf, asset.optimizedPath || asset.originalPath);
          const scale = Math.min(photoWidth / image.width, boxHeight / image.height);
          const drawWidth = image.width * scale;
          const drawHeight = image.height * scale;
          page.drawImage(image, {
            x: boxX + (photoWidth - drawWidth) / 2,
            y: boxTop - boxHeight + (boxHeight - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight
          });
        } catch {
          page.drawText("Bild konnte nicht geladen werden", {
            x: boxX + 8,
            y: boxTop - 24,
            size: 8,
            font,
            color: rgb(0.45, 0.45, 0.45)
          });
        }
      }
    }

    cursor.y -= requiredHeight + 12;
  }

  const closingLines = [
    ...deriveAddressLines(caseFile.consignor),
    "",
    `BegÃƒÂ¼nstigter: ${deriveBeneficiary(caseFile.consignor, caseFile.bank) || "-"}`,
    `IBAN: ${caseFile.bank.iban || "-"}`,
    `BIC: ${caseFile.bank.bic || "-"}`,
    "",
    `Kommission: ${buildCostFieldValue(caseFile.costs.commission) || "-"}`,
    `Versicherung: ${buildCostFieldValue(caseFile.costs.insurance) || "-"}`,
    `Transport: ${buildCostFieldValue(caseFile.costs.transport) || "-"}`,
    `Abb.-Kosten: ${buildCostFieldValue(caseFile.costs.imaging) || "-"}`,
    `Kosten Expertisen: ${buildCostFieldValue(caseFile.costs.expertise) || "-"}`,
    `Internet: ${buildCostFieldValue(caseFile.costs.internet) || "-"}`,
    caseFile.costs.provenance ? `Provenienz / Infos: ${caseFile.costs.provenance}` : "",
    "",
    caseFile.internalInfo.notes.trim() ? `Interne Notizen: ${caseFile.internalInfo.notes.trim()}` : "",
    clerk ? `Sachbearbeiter: ${[clerk.name, clerk.phone, clerk.email].filter(Boolean).join(", ")}` : ""
  ].filter(Boolean);

  if (closingLines.length > 2) {
    page = pdf.addPage([pageWidth, pageHeight]);
    const closingCursor: LayoutCursor = { y: pageHeight - margin };
    page.drawText("Schlussinfos", {
      x: margin,
      y: closingCursor.y,
      size: 15,
      font: boldFont,
      color: rgb(0.1, 0.15, 0.13)
    });
    closingCursor.y -= 24;
    drawWrappedBlock({
      page,
      font,
      boldFont,
      cursor: closingCursor,
      margin,
      maxWidth: contentWidth,
      text: closingLines.join("\n"),
      fontSize: 10.5,
      lineHeight: 15
    });
  }

  return pdf.save();
}
