import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { buildObjectPageChunks, createPdfPreviewModel, generateElbPdf, getPdfHotspotMap } from "@elb/pdf-core/index";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
function toCssRect(rect) {
    return {
        top: `${rect.topPct}%`,
        left: `${rect.leftPct}%`,
        width: `${rect.widthPct}%`,
        height: `${rect.heightPct}%`
    };
}
function getHotspots(pageNumber, layouts, objectPages) {
    const layout = pageNumber === 1 ? layouts.main : layouts.follow;
    if (!layout) {
        return [];
    }
    const hotspots = [
        { key: `meta-${pageNumber}`, label: "Meta", ...toCssRect(layout.meta), target: { kind: "meta" } },
        { key: `consignor-${pageNumber}`, label: "Einlieferer", ...toCssRect(layout.consignor), target: { kind: "consignor" } },
        { key: `owner-${pageNumber}`, label: "Eigentümer", ...toCssRect(layout.owner), target: { kind: "owner" } },
        { key: `bank-${pageNumber}`, label: "Bank", ...toCssRect(layout.bank), target: { kind: "bank" } },
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
    if (objectPage && objectPage.items.length > 0 && layout.object.heightPct > 0) {
        const totalLines = Math.max(...objectPage.items.map((item) => item.startLine + item.totalLines), 1);
        objectPage.items.forEach((item, itemIndex) => {
            hotspots.push({
                key: `object-${pageNumber}-${item.objectIndex}`,
                label: `Objekt ${itemIndex + 1}`,
                top: `${layout.object.topPct + (item.startLine / totalLines) * layout.object.heightPct}%`,
                left: `${layout.object.leftPct}%`,
                width: `${layout.object.widthPct}%`,
                height: `${(item.totalLines / totalLines) * layout.object.heightPct}%`,
                target: { kind: "object", objectIndex: item.objectIndex }
            });
        });
    }
    return hotspots.filter((item) => item.width !== "0%" && item.height !== "0%");
}
export function PdfCanvasPreview(props) {
    const [pages, setPages] = useState([]);
    const [status, setStatus] = useState("PDF-Vorschau wird erzeugt...");
    const [layouts, setLayouts] = useState({
        main: null,
        follow: null
    });
    const [objectPages, setObjectPages] = useState([]);
    useEffect(() => {
        let cancelled = false;
        async function renderPreview() {
            try {
                setStatus("PDF-Vorschau wird erzeugt...");
                const previewModel = createPdfPreviewModel(props.caseFile, props.masterData);
                const chunks = await buildObjectPageChunks(previewModel.objectRows);
                const pdfBytes = await generateElbPdf(props.caseFile, props.masterData);
                const loadingTask = pdfjsLib.getDocument({
                    data: pdfBytes
                });
                const pdfDocument = await loadingTask.promise;
                const rendered = [];
                for (let index = 1; index <= pdfDocument.numPages; index += 1) {
                    const page = await pdfDocument.getPage(index);
                    const viewport = page.getViewport({ scale: 1.6 });
                    const canvas = document.createElement("canvas");
                    const context = canvas.getContext("2d");
                    if (!context) {
                        throw new Error("Canvas-Kontext konnte nicht erstellt werden.");
                    }
                    canvas.width = Math.ceil(viewport.width);
                    canvas.height = Math.ceil(viewport.height);
                    await page.render({
                        canvas,
                        canvasContext: context,
                        viewport
                    }).promise;
                    rendered.push({
                        pageNumber: index,
                        dataUrl: canvas.toDataURL("image/png"),
                        width: canvas.width,
                        height: canvas.height
                    });
                }
                if (!cancelled) {
                    setObjectPages(chunks);
                    setPages(rendered);
                    setStatus("");
                }
            }
            catch (error) {
                if (!cancelled) {
                    setStatus(error instanceof Error ? error.message : "PDF-Vorschau konnte nicht erzeugt werden.");
                    setPages([]);
                }
            }
        }
        void renderPreview();
        return () => {
            cancelled = true;
        };
    }, [props.caseFile, props.masterData]);
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
        return (_jsx("div", { className: "preview-card", children: _jsx("p", { children: status }) }));
    }
    return (_jsxs("div", { className: "pdf-page-stack", children: [pages.map((page) => (_jsxs("figure", { className: "pdf-page", children: [_jsxs("div", { className: "pdf-page__meta", children: ["Seite ", page.pageNumber] }), _jsxs("div", { className: "pdf-page__canvas", children: [_jsx("img", { src: page.dataUrl, alt: `ELB-PDF Seite ${page.pageNumber}`, width: page.width, height: page.height }), _jsx("div", { className: "pdf-hotspots", children: getHotspots(page.pageNumber, layouts, objectPages).map((hotspot) => (_jsx("button", { className: "pdf-hotspot", style: {
                                        top: hotspot.top,
                                        left: hotspot.left,
                                        width: hotspot.width,
                                        height: hotspot.height
                                    }, onClick: () => props.onEdit(hotspot.target), title: `${hotspot.label} bearbeiten`, children: _jsx("span", { children: hotspot.label }) }, hotspot.key))) })] })] }, page.pageNumber))), status ? (_jsx("div", { className: "preview-card", children: _jsx("p", { children: status }) })) : null] }));
}
