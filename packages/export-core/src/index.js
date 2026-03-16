import JSZip from "jszip";
import { buildFolderName } from "@elb/domain/index";
import { createPdfPreviewModel, generateElbPdf, generateSupplementPdf } from "@elb/pdf-core/index";
import { createWordPreviewModel } from "@elb/word-core/index";
function toArrayBuffer(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
export function createExportPlan(caseFile) {
    const folderName = buildFolderName(caseFile.consignor.lastName, caseFile.consignor.firstName, caseFile.meta.receiptNumber);
    const zipFileName = `ELB_${caseFile.meta.receiptNumber}_${folderName}.zip`;
    return {
        folderName,
        zipFileName,
        artifacts: [
            { fileName: "payload.json", type: "json", required: true },
            { fileName: "metadata.json", type: "json", required: true },
            { fileName: "elb.pdf", type: "pdf", required: true },
            { fileName: "zusatz.pdf", type: "pdf", required: true },
            { fileName: "schaetzliste.docx", type: "docx", required: true },
            { fileName: "schaetzliste.pdf", type: "pdf", required: true },
            { fileName: "bilder/manifest.json", type: "image", required: true },
            { fileName: zipFileName, type: "zip", required: true }
        ]
    };
}
export function createExportMetadata(caseFile) {
    return {
        appVersion: "0.1.0",
        exportedAt: new Date().toISOString(),
        receiptNumber: caseFile.meta.receiptNumber,
        caseId: caseFile.meta.id,
        clerkId: caseFile.meta.clerkId,
        status: caseFile.meta.status,
        objectCount: caseFile.objects.length,
        imageCount: caseFile.assets.length
    };
}
function createStubText(title, lines) {
    return [title, "", ...lines].join("\n");
}
function createPdfStub(caseFile, masterData, kind) {
    const pdfModel = createPdfPreviewModel(caseFile, masterData);
    const header = kind === "zusatz" ? "Zusatz-PDF Platzhalter" : "Schätzlisten-PDF Platzhalter";
    const lines = [
        `ELB-Nummer: ${caseFile.meta.receiptNumber}`,
        `Sachbearbeiter: ${pdfModel.clerkLabel || "n/a"}`,
        `Objekte: ${pdfModel.objectRows.length}`,
        "Diese Datei ist ein technischer Stub fuer die End-to-End-Pipeline.",
        "Die finale PDF-Erzeugung wird im naechsten Schritt auf Basis der Vorlagen implementiert."
    ];
    if (kind === "zusatz" && caseFile.internalInfo.notes.trim()) {
        lines.push("", "Interne Notizen:", caseFile.internalInfo.notes.trim());
    }
    return createStubText(header, lines);
}
function createDocxStub(caseFile, masterData) {
    const wordModel = createWordPreviewModel(caseFile, masterData);
    return createStubText("Schätzliste DOCX Platzhalter", [
        `ELB-Nummer: ${caseFile.meta.receiptNumber}`,
        `Seiten: ${wordModel.pages.length}`,
        `Typografie-Ziel: ${wordModel.typography.family}`,
        "Diese Datei ist ein technischer Stub fuer die End-to-End-Pipeline.",
        "Die finale DOCX-Erzeugung wird im naechsten Schritt implementiert."
    ]);
}
function createImageManifest(caseFile) {
    return JSON.stringify({
        count: caseFile.assets.length,
        images: caseFile.assets.map((asset) => ({
            id: asset.id,
            fileName: asset.fileName,
            optimizedPath: asset.optimizedPath,
            width: asset.width,
            height: asset.height
        }))
    }, null, 2);
}
export async function generateExportBundle(caseFile, masterData) {
    const plan = createExportPlan(caseFile);
    const metadata = createExportMetadata(caseFile);
    const elbPdfBytes = await generateElbPdf(caseFile, masterData);
    const supplementPdfBytes = await generateSupplementPdf(caseFile, masterData);
    return {
        plan,
        metadata,
        artifacts: [
            {
                fileName: "payload.json",
                mimeType: "application/json",
                content: JSON.stringify(caseFile, null, 2)
            },
            {
                fileName: "metadata.json",
                mimeType: "application/json",
                content: JSON.stringify(metadata, null, 2)
            },
            {
                fileName: "elb.pdf",
                mimeType: "application/pdf",
                content: toArrayBuffer(elbPdfBytes)
            },
            {
                fileName: "zusatz.pdf",
                mimeType: "application/pdf",
                content: toArrayBuffer(supplementPdfBytes)
            },
            {
                fileName: "schaetzliste.docx",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                content: createDocxStub(caseFile, masterData)
            },
            {
                fileName: "schaetzliste.pdf",
                mimeType: "application/pdf",
                content: createPdfStub(caseFile, masterData, "schaetzliste")
            },
            {
                fileName: "bilder/manifest.json",
                mimeType: "application/json",
                content: createImageManifest(caseFile)
            }
        ]
    };
}
export async function createExportZip(caseFile, masterData) {
    const bundle = await generateExportBundle(caseFile, masterData);
    const zip = new JSZip();
    const root = zip.folder(bundle.plan.folderName);
    if (!root) {
        throw new Error("ZIP-Ordner konnte nicht erstellt werden.");
    }
    for (const artifact of bundle.artifacts) {
        root.file(artifact.fileName, artifact.content);
    }
    return zip.generateAsync({ type: "blob" });
}
export function triggerDownload(fileName, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
