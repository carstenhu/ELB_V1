import { useEffect, useState } from "react";
import { type CaseFile, type MasterData } from "@elb/domain/index";
import { buildObjectPageChunks, createPdfPreviewModel, generateElbPdf, getPdfHotspotMap, type ObjectPageChunk, type PdfHotspotMap } from "@elb/pdf-core/index";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

interface RenderedPage {
  pageNumber: number;
  dataUrl: string;
  width: number;
  height: number;
  displayWidth: number;
  displayHeight: number;
}

export type PdfEditTarget =
  | { kind: "meta" }
  | { kind: "consignor" }
  | { kind: "owner" }
  | { kind: "bank" }
  | { kind: "costs" }
  | { kind: "object"; objectIndex: number }
  | { kind: "consignorSignature" }
  | { kind: "clerkSignature" };

interface HotspotDefinition {
  key: string;
  label: string;
  top: string;
  left: string;
  width: string;
  height: string;
  target: PdfEditTarget;
}

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsLoader: Promise<PdfJsModule> | null = null;

function isAndroidBrowserContext(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /android/i.test(navigator.userAgent || "");
}

function buildPdfPreviewErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes("tohex is not a function")) {
    return "Die PDF-Vorschau ist auf diesem Android-Geraet auf einen Browserdecoder-Fehler gestossen. Bitte Seite neu laden und erneut versuchen.";
  }

  if (isAndroidBrowserContext() && (normalized.includes("image") || normalized.includes("decoder"))) {
    return "Die PDF-Vorschau konnte wegen eines Android-Browserdecoder-Problems nicht geladen werden. Bitte Seite neu laden und erneut versuchen.";
  }

  return rawMessage || "PDF-Vorschau konnte nicht erzeugt werden.";
}

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsLoader) {
    pdfJsLoader = import("pdfjs-dist/legacy/build/pdf.mjs").then((module) => {
      module.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return module;
    });
  }

  return pdfJsLoader;
}

function toCssRect(rect: PdfHotspotMap[keyof PdfHotspotMap]) {
  return {
    top: `${rect.topPct}%`,
    left: `${rect.leftPct}%`,
    width: `${rect.widthPct}%`,
    height: `${rect.heightPct}%`
  };
}

function getHotspots(
  pageNumber: number,
  layouts: { main: PdfHotspotMap | null; follow: PdfHotspotMap | null },
  objectPages: ObjectPageChunk[]
): HotspotDefinition[] {
  const layout = pageNumber === 1 ? layouts.main : layouts.follow;
  if (!layout) {
    return [];
  }

  const hotspots: HotspotDefinition[] = [
    { key: `meta-${pageNumber}`, label: "Meta", ...toCssRect(layout.meta), target: { kind: "meta" } },
    { key: `consignor-${pageNumber}`, label: "Einlieferer", ...toCssRect(layout.consignor), target: { kind: "consignor" } },
    {
      key: `consignor-identity-${pageNumber}`,
      label: "Einlieferer-Identitaet",
      ...toCssRect(layout.consignorIdentity),
      target: { kind: "consignor" }
    },
    {
      key: `vat-category-${pageNumber}`,
      label: "MwSt-Kategorie",
      ...toCssRect(layout.vatCategory),
      target: { kind: "consignor" }
    },
    {
      key: `vat-number-${pageNumber}`,
      label: "MwSt-Nummer",
      ...toCssRect(layout.vatNumber),
      target: { kind: "consignor" }
    },
    { key: `owner-${pageNumber}`, label: "Eigentümer", ...toCssRect(layout.owner), target: { kind: "owner" } },
    { key: `bank-${pageNumber}`, label: "Bank", ...toCssRect(layout.bank), target: { kind: "bank" } },
    { key: `commission-${pageNumber}`, label: "Kommission", ...toCssRect(layout.commission), target: { kind: "costs" } },
    { key: `costs-${pageNumber}`, label: "Konditionen", ...toCssRect(layout.costs), target: { kind: "costs" } },
    {
      key: `consignor-signature-${pageNumber}`,
      label: "Einlieferer-Signatur",
      ...toCssRect(layout.consignorSignature),
      target: { kind: "consignorSignature" }
    },
    {
      key: `clerk-signature-${pageNumber}`,
      label: "Sachbearbeiter-Signatur",
      ...toCssRect(layout.clerkSignature),
      target: { kind: "clerkSignature" }
    }
  ];

  const objectPage = objectPages[pageNumber - 1];
  if (objectPage && objectPage.items.length > 0 && layout.object.contentHeightPct > 0) {
    const lineHeightPct = layout.object.lineHeightPct || (layout.object.contentHeightPct / Math.max(objectPage.capacityLines, 1));

    objectPage.items.forEach((item, itemIndex) => {
      hotspots.push({
        key: `object-${pageNumber}-${item.objectIndex}`,
        label: `Objekt ${itemIndex + 1}`,
        top: `${layout.object.contentTopPct + item.startLine * lineHeightPct}%`,
        left: `${layout.object.leftPct}%`,
        width: `${layout.object.widthPct}%`,
        height: `${Math.max(item.totalLines * lineHeightPct, lineHeightPct)}%`,
        target: { kind: "object", objectIndex: item.objectIndex }
      });
    });
  }

  return hotspots.filter((item) => item.width !== "0%" && item.height !== "0%");
}

export function PdfCanvasPreview(props: {
  caseFile: CaseFile;
  masterData: MasterData;
  onEdit: (target: PdfEditTarget) => void;
}) {
  const [pages, setPages] = useState<RenderedPage[]>([]);
  const [status, setStatus] = useState("PDF-Vorschau wird erzeugt...");
  const [androidPdfUrl, setAndroidPdfUrl] = useState("");
  const [androidPreviewNotice, setAndroidPreviewNotice] = useState("");
  const [layouts, setLayouts] = useState<{ main: PdfHotspotMap | null; follow: PdfHotspotMap | null }>({
    main: null,
    follow: null
  });
  const [objectPages, setObjectPages] = useState<ObjectPageChunk[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function renderPreview(): Promise<void> {
      try {
        setStatus("PDF-Vorschau wird erzeugt...");
        if (isAndroidBrowserContext()) {
          const pdfBytes = await generateElbPdf(props.caseFile, props.masterData);
          const buffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
          const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
          if (!cancelled) {
            setPages([]);
            setObjectPages([]);
            setAndroidPdfUrl((previousUrl) => {
              if (previousUrl) {
                URL.revokeObjectURL(previousUrl);
              }
              return url;
            });
            setAndroidPreviewNotice("Android-Fallback aktiv: PDF wird nativ angezeigt.");
            setStatus("");
          } else {
            URL.revokeObjectURL(url);
          }
          return;
        }

        setAndroidPdfUrl((previousUrl) => {
          if (previousUrl) {
            URL.revokeObjectURL(previousUrl);
          }
          return "";
        });
        setAndroidPreviewNotice("");
        const pdfjsLib = await loadPdfJs();
        const previewModel = createPdfPreviewModel(props.caseFile, props.masterData);
        const chunks = await buildObjectPageChunks(previewModel.objectRows);
        const pdfBytes = await generateElbPdf(props.caseFile, props.masterData);
        const loadingTask = pdfjsLib.getDocument({
          data: pdfBytes,
          // Android WebViews occasionally fail in the ImageDecoder pipeline
          // (e.g. "toHex is not a function"). Force the stable fallback.
          isImageDecoderSupported: false
        });
        const pdfDocument = await loadingTask.promise;
        const rendered: RenderedPage[] = [];
        const deviceScale = typeof window !== "undefined" ? Math.max(window.devicePixelRatio || 1, 1.5) : 1.5;
        const previewScale = 2.2;

        for (let index = 1; index <= pdfDocument.numPages; index += 1) {
          const page = await pdfDocument.getPage(index);
          const viewport = page.getViewport({ scale: previewScale });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("Canvas-Kontext konnte nicht erstellt werden.");
          }

          canvas.width = Math.ceil(viewport.width * deviceScale);
          canvas.height = Math.ceil(viewport.height * deviceScale);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0);

          await page.render({
            canvas,
            canvasContext: context,
            viewport
          }).promise;

          rendered.push({
            pageNumber: index,
            dataUrl: canvas.toDataURL("image/png"),
            width: canvas.width,
            height: canvas.height,
            displayWidth: Math.ceil(viewport.width),
            displayHeight: Math.ceil(viewport.height)
          });
        }

        if (!cancelled) {
          setObjectPages(chunks);
          setPages(rendered);
          setStatus("");
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(buildPdfPreviewErrorMessage(error));
          setPages([]);
        }
      }
    }

    void renderPreview();

    return () => {
      cancelled = true;
    };
  }, [props.caseFile, props.masterData]);

  useEffect(() => () => {
    if (androidPdfUrl) {
      URL.revokeObjectURL(androidPdfUrl);
    }
  }, [androidPdfUrl]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([getPdfHotspotMap("main"), getPdfHotspotMap("follow")]).then(([main, follow]) => {
      if (!cancelled) {
        setLayouts({ main, follow });
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status && pages.length === 0) {
    return (
      <div className="preview-card">
        <p>{status}</p>
      </div>
    );
  }

  if (androidPdfUrl) {
    return (
      <div className="pdf-page-stack">
        <div className="preview-card">
          <p>{androidPreviewNotice}</p>
          <p>Hotspot-Bearbeitung ist in der Android-Fallback-Ansicht deaktiviert.</p>
          <a href={androidPdfUrl} target="_blank" rel="noreferrer">
            PDF in neuem Tab oeffnen
          </a>
        </div>
        <div className="preview-card">
          <iframe
            title="ELB-PDF Vorschau"
            src={androidPdfUrl}
            style={{ width: "100%", minHeight: "780px", border: "1px solid #d6dbd2", borderRadius: "12px" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-page-stack">
      {pages.map((page) => (
        <figure key={page.pageNumber} className="pdf-page">
          <div className="pdf-page__meta">Seite {page.pageNumber}</div>
          <div className="pdf-page__canvas">
            <img src={page.dataUrl} alt={`ELB-PDF Seite ${page.pageNumber}`} width={page.displayWidth} height={page.displayHeight} />
            <div className="pdf-hotspots">
              {getHotspots(page.pageNumber, layouts, objectPages).map((hotspot) => (
                <button
                  key={hotspot.key}
                  className="pdf-hotspot"
                  style={{
                    top: hotspot.top,
                    left: hotspot.left,
                    width: hotspot.width,
                    height: hotspot.height
                  }}
                  onClick={() => props.onEdit(hotspot.target)}
                  aria-label={`${hotspot.label} bearbeiten`}
                  title={`${hotspot.label} bearbeiten`}
                />
              ))}
            </div>
          </div>
        </figure>
      ))}
      {status ? (
        <div className="preview-card">
          <p>{status}</p>
        </div>
      ) : null}
    </div>
  );
}
