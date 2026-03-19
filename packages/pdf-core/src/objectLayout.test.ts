import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildObjectPageChunks, getPdfHotspotMap } from "./index";
import type { PdfPreviewObjectRow } from "./types";

const originalFetch = globalThis.fetch;

async function createTemplatePdf(fieldNames: string[]): Promise<ArrayBuffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const form = pdf.getForm();

  fieldNames.forEach((fieldName, index) => {
    const textField = form.createTextField(fieldName);
    textField.setText("");
    const column = index % 2;
    const row = Math.floor(index / 2);
    textField.addToPage(page, {
      x: 40 + column * 260,
      y: 760 - row * 26,
      width: 180,
      height: 18
    });
  });

  const bytes = await pdf.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

beforeAll(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = String(typeof input === "string" || input instanceof URL ? input : input.url);

    const mainFields = [
      "ELB Nr",
      "Adresse EL",
      "EL Geburtsdatum 1",
      "EL Nationalit\u00e4t  1",
      "EL ID/Passnr  1",
      "Adresse EG",
      "BIC/SWIFT",
      "IBAN/Kontonr",
      "Bankangaben: Beg\u00fcnstigter",
      "Kommission",
      "Versicherung ",
      "Transport",
      "Abb.-Kosten",
      "Kosten ",
      "Internet  1",
      "Diverses/Provenienz 2",
      "Int-Nr 1",
      "Erhalten 1",
      "Kapitel 1",
      "Kurzbeschreibung 1",
      "Sch\u00e4tzung 1",
      "der Einlieferer Sig",
      "der Einlieferer Sig 2",
      "Koller Auktionen Sig 1"
    ];

    const followFields = [
      "ELB Nr 2",
      "Seite N/N",
      "Adresse EL",
      "Kommission",
      "Versicherung ",
      "Transport",
      "Abb.-Kosten",
      "Kosten ",
      "Internet  1",
      "Diverses/Provenienz 2",
      "Int-Nr 2",
      "Erhalten 2",
      "Kapitel 2",
      "Kurzbeschreibung 2",
      "Sch\u00e4tzung 2",
      "der Einlieferer Sig",
      "der Einlieferer Sig 2",
      "Koller Auktionen Sig 1"
    ];

    if (url.includes("template_objekte")) {
      return new Response(await createTemplatePdf(followFields), { status: 200 });
    }

    if (url.includes("template")) {
      return new Response(await createTemplatePdf(mainFields), { status: 200 });
    }

    throw new Error(`Unexpected fetch in pdf-core test: ${url}`);
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
});

describe("object layout", () => {
  it("creates multiple object chunks when content exceeds the first page capacity", async () => {
    const rows: PdfPreviewObjectRow[] = Array.from({ length: 12 }, (_, index) => ({
      id: `row-${index + 1}`,
      intNumber: String(index + 1).padStart(4, "0"),
      auctionLabel: "123 06/26",
      departmentCode: "A1",
      shortDescription: `Objekt ${index + 1}`,
      description: "Sehr ausfuehrliche Beschreibung mit mehreren Worten fuer eine robuste Umbruchpruefung im PDF-Layout.",
      referenceNumber: `REF-${index + 1}`,
      remarks: "Hinweis",
      estimate: "1 000 - 2 000",
      priceLabel: "Limite",
      priceValue: "2 500"
    }));

    const chunks = await buildObjectPageChunks(rows);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.items.length).toBeGreaterThan(0);
    expect(chunks.at(-1)?.items.length).toBeGreaterThan(0);
    expect(chunks[0]?.capacityLines).toBeGreaterThan(0);
  });

  it("derives hotspot maps from both templates", async () => {
    const main = await getPdfHotspotMap("main");
    const follow = await getPdfHotspotMap("follow");

    expect(main.meta.widthPct).toBeGreaterThan(0);
    expect(main.object.contentHeightPct).toBeGreaterThan(0);
    expect(main.clerkSignature.widthPct).toBeGreaterThan(0);
    expect(follow.meta.widthPct).toBeGreaterThan(0);
    expect(follow.object.lineHeightPct).toBeGreaterThan(0);
  });
});
