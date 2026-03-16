import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { deriveBeneficiary, deriveOwner, formatAmountForDisplay } from "@elb/domain/index";
import { createExportPlan, createExportZip, generateExportBundle, triggerDownload } from "@elb/export-core/index";
import { hydrateSnapshotFromDisk, persistSnapshotToDisk } from "@elb/persistence/filesystem";
import { createPdfPreviewModel } from "@elb/pdf-core/index";
import { APP_NAME } from "@elb/shared/constants";
import { Field, Section } from "@elb/ui/forms";
import { createWordPreviewModel } from "@elb/word-core/index";
import { PdfCanvasPreview } from "./pdfPreview";
import { addObject, applyAuctionPricingRules, createNewCase, createSnapshot, deleteObject, finalizeCurrentCase, getState, loadCaseById, saveDraft, selectClerk, subscribe, replaceState, updateCurrentCase, updateMasterData, updateObject } from "./appState";
const pages = [
    { id: "consignor", label: "Einlieferer" },
    { id: "objects", label: "Objekte" },
    { id: "internal", label: "Interne Infos" },
    { id: "pdfPreview", label: "ELB-PDF-Vorschau" },
    { id: "wordPreview", label: "Word-Schätzliste-Vorschau" }
];
function useAppState() {
    return useSyncExternalStore(subscribe, getState, getState);
}
async function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error(`Datei konnte nicht gelesen werden: ${file.name}`));
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.readAsDataURL(file);
    });
}
async function loadImageElement(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
        image.src = dataUrl;
    });
}
async function createOptimizedImageAsset(file) {
    const originalDataUrl = await readFileAsDataUrl(file);
    const image = await loadImageElement(originalDataUrl);
    const scale = Math.min(1500 / image.width, 1000 / image.height, 1);
    const targetWidth = Math.max(Math.round(image.width * scale), 1);
    const targetHeight = Math.max(Math.round(image.height * scale), 1);
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Bildkontext konnte nicht erzeugt werden.");
    }
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const optimizedDataUrl = canvas.toDataURL("image/jpeg", 0.5);
    return {
        id: crypto.randomUUID(),
        fileName: file.name,
        originalPath: originalDataUrl,
        optimizedPath: optimizedDataUrl,
        width: targetWidth,
        height: targetHeight
    };
}
function findAsset(caseFile, assetId) {
    return caseFile.assets.find((asset) => asset.id === assetId);
}
function SessionOverlay() {
    const state = useAppState();
    if (state.activeClerkId) {
        return null;
    }
    return (_jsx("div", { className: "overlay", children: _jsxs("div", { className: "overlay__card", children: [_jsx("p", { className: "eyebrow", children: "Sachbearbeiter-Auswahl" }), _jsx("h1", { children: APP_NAME }), _jsx("div", { className: "clerk-grid", children: state.masterData.clerks.map((clerk) => (_jsxs("button", { className: "clerk-card", onClick: () => selectClerk(clerk.id), children: [_jsx("strong", { children: clerk.name }), _jsx("span", { children: clerk.email }), _jsx("span", { children: clerk.phone || "Keine Telefonnummer" })] }, clerk.id))) })] }) }));
}
function TopBar(props) {
    const state = useAppState();
    const activeClerk = state.masterData.clerks.find((clerk) => clerk.id === state.activeClerkId);
    return (_jsxs("header", { className: "topbar", children: [_jsxs("div", { className: "topbar__brand", children: [_jsx("strong", { children: APP_NAME }), _jsx("span", { children: activeClerk?.name ?? "Kein Sachbearbeiter" })] }), _jsx("nav", { className: "topbar__nav", children: pages.map((page) => (_jsx("button", { className: page.id === props.page ? "nav-button nav-button--active" : "nav-button", onClick: () => props.onPageChange(page.id), children: page.label }, page.id))) }), _jsx("div", { className: "topbar__actions", children: _jsxs("select", { value: "", onChange: (event) => {
                        const value = event.target.value;
                        if (value === "new-case") {
                            createNewCase();
                        }
                        if (value.startsWith("clerk:")) {
                            selectClerk(value.replace("clerk:", ""));
                        }
                        if (value.startsWith("case:")) {
                            loadCaseById(value.replace("case:", ""));
                        }
                        if (value === "admin") {
                            props.onPageChange("internal");
                        }
                        event.target.value = "";
                    }, children: [_jsx("option", { value: "", children: "Men\u00FC" }), _jsx("option", { value: "new-case", children: "Neuer Vorgang" }), _jsx("option", { value: "admin", children: "Admin" }), state.masterData.clerks.map((clerk) => (_jsxs("option", { value: `clerk:${clerk.id}`, children: ["Sachbearbeiter wechseln: ", clerk.name] }, clerk.id))), state.drafts.map((draft) => (_jsxs("option", { value: `case:${draft.meta.id}`, children: ["Draft laden: ", draft.consignor.lastName || "Unbenannt", " ", draft.meta.receiptNumber] }, draft.meta.id))), state.finalized.map((caseFile) => (_jsxs("option", { value: `case:${caseFile.meta.id}`, children: ["Finalisiert laden: ", caseFile.consignor.lastName || "Unbenannt", " ", caseFile.meta.receiptNumber] }, caseFile.meta.id)))] }) })] }));
}
function AdminModal(props) {
    const state = useAppState();
    const [pinInput, setPinInput] = useState("");
    const [unlocked, setUnlocked] = useState(false);
    if (!props.open) {
        return null;
    }
    if (!unlocked) {
        return (_jsx("div", { className: "pin-modal", children: _jsxs("div", { className: "pin-modal__card", children: [_jsx("h2", { children: "Admin-PIN" }), _jsx("input", { type: "password", value: pinInput, onChange: (event) => setPinInput(event.target.value) }), _jsxs("div", { className: "pin-modal__actions", children: [_jsx("button", { onClick: props.onClose, children: "Schlie\u00DFen" }), _jsx("button", { onClick: () => {
                                    if (pinInput === state.masterData.adminPin) {
                                        setUnlocked(true);
                                    }
                                }, children: "\u00D6ffnen" })] })] }) }));
    }
    return (_jsx("div", { className: "pin-modal", children: _jsxs("div", { className: "overlay__card", children: [_jsxs("div", { className: "admin-header", children: [_jsx("h2", { children: "Admin-Panel" }), _jsx("button", { onClick: props.onClose, children: "Schlie\u00DFen" })] }), _jsxs("div", { className: "page-grid", children: [_jsx(Section, { title: "Lokale PIN", children: _jsx(Field, { label: "Admin-PIN", children: _jsx("input", { value: state.masterData.adminPin, onChange: (event) => updateMasterData((current) => ({
                                        ...current,
                                        adminPin: event.target.value
                                    })) }) }) }), _jsx(Section, { title: "PDF-Pflichtfelder", children: _jsx(Field, { label: "Feldliste", full: true, children: _jsx("textarea", { value: state.masterData.globalPdfRequiredFields.join("\n"), onChange: (event) => updateMasterData((current) => ({
                                        ...current,
                                        globalPdfRequiredFields: event.target.value
                                            .split("\n")
                                            .map((value) => value.trim())
                                            .filter(Boolean)
                                    })) }) }) }), _jsx(Section, { title: "Sachbearbeiter", children: state.masterData.clerks.map((clerk, index) => (_jsxs("div", { className: "admin-clerk", children: [_jsx(Field, { label: `Sachbearbeiter ${index + 1}`, full: true, children: _jsx("input", { value: clerk.name, onChange: (event) => updateMasterData((current) => ({
                                                ...current,
                                                clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, name: event.target.value } : item))
                                            })) }) }), _jsx(Field, { label: "Signatur", full: true, children: _jsx("input", { type: "file", accept: "image/*", onChange: async (event) => {
                                                const file = event.target.files?.[0];
                                                if (!file) {
                                                    return;
                                                }
                                                const dataUrl = await readFileAsDataUrl(file);
                                                updateMasterData((current) => ({
                                                    ...current,
                                                    clerks: current.clerks.map((item) => (item.id === clerk.id ? { ...item, signaturePng: dataUrl } : item))
                                                }));
                                                event.target.value = "";
                                            } }) }), clerk.signaturePng ? _jsx("img", { className: "signature-preview", src: clerk.signaturePng, alt: `Signatur ${clerk.name}` }) : null] }, clerk.id))) }), _jsx(Section, { title: "Auktionen", children: state.masterData.auctions.map((auction, index) => (_jsx(Field, { label: `Auktion ${index + 1}`, full: true, children: _jsx("input", { value: auction.number, onChange: (event) => updateMasterData((current) => ({
                                        ...current,
                                        auctions: current.auctions.map((item) => (item.id === auction.id ? { ...item, number: event.target.value } : item))
                                    })) }) }, auction.id))) }), _jsx(Section, { title: "Abteilungen / Interessengebiete", children: state.masterData.departments.map((department, index) => (_jsx(Field, { label: `Abteilung ${index + 1}`, full: true, children: _jsx("input", { value: `${department.code} · ${department.name}`, onChange: (event) => updateMasterData((current) => ({
                                        ...current,
                                        departments: current.departments.map((item) => item.id === department.id
                                            ? {
                                                ...item,
                                                name: event.target.value
                                            }
                                            : item)
                                    })) }) }, department.id))) })] })] }) }));
}
function ConsignorPage(props) {
    const state = useAppState();
    const owner = deriveOwner(props.caseFile.consignor, props.caseFile.owner);
    const beneficiary = deriveBeneficiary(props.caseFile.consignor, props.caseFile.bank);
    const consignorPhoto = findAsset(props.caseFile, props.caseFile.consignor.photoAssetId);
    return (_jsxs("div", { className: "page-grid", children: [_jsxs(Section, { title: "Meta", children: [_jsx(Field, { label: "ELB-Nummer", children: _jsx("input", { value: props.caseFile.meta.receiptNumber, onChange: (event) => updateCurrentCase((current) => ({
                                ...current,
                                meta: {
                                    ...current.meta,
                                    receiptNumber: event.target.value
                                }
                            })) }) }), _jsx(Field, { label: "Sachbearbeiter", children: _jsx("select", { value: props.caseFile.meta.clerkId, onChange: (event) => updateCurrentCase((current) => ({
                                ...current,
                                meta: {
                                    ...current.meta,
                                    clerkId: event.target.value
                                }
                            })), children: state.masterData.clerks.map((clerk) => (_jsx("option", { value: clerk.id, children: clerk.name }, clerk.id))) }) })] }), _jsxs(Section, { title: "Einlieferer", children: [_jsx(Field, { label: "Firmenadresse", children: _jsx("input", { type: "checkbox", checked: props.caseFile.consignor.useCompanyAddress, onChange: (event) => updateCurrentCase((current) => ({
                                ...current,
                                consignor: {
                                    ...current.consignor,
                                    useCompanyAddress: event.target.checked
                                }
                            })) }) }), props.caseFile.consignor.useCompanyAddress ? (_jsx(Field, { label: "Firma", full: true, children: _jsx("input", { value: props.caseFile.consignor.company, onChange: (event) => updateCurrentCase((current) => ({
                                ...current,
                                consignor: {
                                    ...current.consignor,
                                    company: event.target.value
                                }
                            })) }) })) : null, _jsx(Field, { label: "Anrede", children: _jsxs("select", { value: props.caseFile.consignor.title, onChange: (event) => updateCurrentCase((current) => ({
                                ...current,
                                consignor: {
                                    ...current.consignor,
                                    title: event.target.value
                                }
                            })), children: [_jsx("option", { value: "", children: "Bitte w\u00E4hlen" }), state.masterData.titles.map((title) => (_jsx("option", { value: title, children: title }, title)))] }) }), _jsx(Field, { label: "Vorname", children: _jsx("input", { value: props.caseFile.consignor.firstName, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, firstName: event.target.value } })) }) }), _jsx(Field, { label: "Nachname", children: _jsx("input", { value: props.caseFile.consignor.lastName, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, lastName: event.target.value } })) }) }), _jsx(Field, { label: "Stra\u00DFe", children: _jsx("input", { value: props.caseFile.consignor.street, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, street: event.target.value } })) }) }), _jsx(Field, { label: "Nr.", children: _jsx("input", { value: props.caseFile.consignor.houseNumber, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, houseNumber: event.target.value } })) }) }), _jsx(Field, { label: "PLZ", children: _jsx("input", { value: props.caseFile.consignor.zip, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, zip: event.target.value } })) }) }), _jsx(Field, { label: "Stadt", children: _jsx("input", { value: props.caseFile.consignor.city, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, city: event.target.value } })) }) }), _jsx(Field, { label: "Land", children: _jsx("input", { value: props.caseFile.consignor.country, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, country: event.target.value } })) }) }), _jsx(Field, { label: "Geburtsdatum", children: _jsx("input", { value: props.caseFile.consignor.birthDate, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, birthDate: event.target.value } })) }) }), _jsx(Field, { label: "Nationalit\u00E4t", children: _jsx("input", { value: props.caseFile.consignor.nationality, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, nationality: event.target.value } })) }) }), _jsx(Field, { label: "ID/Passnummer", children: _jsx("input", { value: props.caseFile.consignor.passportNumber, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, passportNumber: event.target.value } })) }) }), _jsx(Field, { label: "Passfoto", full: true, children: _jsxs("div", { className: "photo-upload", children: [_jsx("input", { type: "file", accept: "image/*", onChange: async (event) => {
                                        const file = event.target.files?.[0];
                                        if (!file) {
                                            return;
                                        }
                                        const asset = await createOptimizedImageAsset(file);
                                        updateCurrentCase((current) => ({
                                            ...current,
                                            assets: [...current.assets.filter((item) => item.id !== current.consignor.photoAssetId), asset],
                                            consignor: {
                                                ...current.consignor,
                                                photoAssetId: asset.id
                                            }
                                        }));
                                        event.target.value = "";
                                    } }), consignorPhoto ? (_jsxs("div", { className: "photo-preview photo-preview--passport", children: [_jsx("img", { src: consignorPhoto.optimizedPath, alt: "Passfoto Einlieferer" }), _jsx("button", { type: "button", className: "photo-preview__remove", onClick: () => updateCurrentCase((current) => ({
                                                ...current,
                                                assets: current.assets.filter((asset) => asset.id !== current.consignor.photoAssetId),
                                                consignor: {
                                                    ...current.consignor,
                                                    photoAssetId: ""
                                                }
                                            })), children: "\u00D7" })] })) : null] }) })] }), _jsxs(Section, { title: "Eigent\u00FCmer", children: [_jsx(Field, { label: "Eigent\u00FCmer = Einlieferer", children: _jsx("input", { type: "checkbox", checked: props.caseFile.owner.sameAsConsignor, onChange: (event) => updateCurrentCase((current) => ({
                                ...current,
                                owner: {
                                    ...current.owner,
                                    sameAsConsignor: event.target.checked
                                }
                            })) }) }), props.caseFile.owner.sameAsConsignor ? null : (_jsxs(_Fragment, { children: [_jsx(Field, { label: "Vorname", children: _jsx("input", { value: owner.firstName, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, firstName: event.target.value } })) }) }), _jsx(Field, { label: "Nachname", children: _jsx("input", { value: owner.lastName, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, lastName: event.target.value } })) }) }), _jsx(Field, { label: "Stra\u00DFe", children: _jsx("input", { value: owner.street, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, street: event.target.value } })) }) }), _jsx(Field, { label: "Nr.", children: _jsx("input", { value: owner.houseNumber, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, houseNumber: event.target.value } })) }) }), _jsx(Field, { label: "PLZ", children: _jsx("input", { value: owner.zip, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, zip: event.target.value } })) }) }), _jsx(Field, { label: "Stadt", children: _jsx("input", { value: owner.city, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, city: event.target.value } })) }) }), _jsx(Field, { label: "Land", children: _jsx("input", { value: owner.country, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, country: event.target.value } })) }) })] }))] }), _jsxs(Section, { title: "Bank", children: [_jsx(Field, { label: "Beg\u00FCnstigter", full: true, children: _jsx("input", { value: beneficiary, disabled: true }) }), _jsx(Field, { label: "IBAN", children: _jsx("input", { value: props.caseFile.bank.iban, onChange: (event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, iban: event.target.value } })) }) }), _jsx(Field, { label: "BIC", children: _jsx("input", { value: props.caseFile.bank.bic, onChange: (event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, bic: event.target.value } })) }) }), _jsx(Field, { label: "Abweichender Beg\u00FCnstigter", children: _jsx("input", { type: "checkbox", checked: props.caseFile.bank.beneficiaryOverride.enabled, onChange: (event) => updateCurrentCase((current) => ({
                                ...current,
                                bank: {
                                    ...current.bank,
                                    beneficiaryOverride: {
                                        ...current.bank.beneficiaryOverride,
                                        enabled: event.target.checked
                                    }
                                }
                            })) }) }), props.caseFile.bank.beneficiaryOverride.enabled ? (_jsxs(_Fragment, { children: [_jsx(Field, { label: "Grund", full: true, children: _jsx("input", { value: props.caseFile.bank.beneficiaryOverride.reason, onChange: (event) => updateCurrentCase((current) => ({
                                        ...current,
                                        bank: {
                                            ...current.bank,
                                            beneficiaryOverride: {
                                                ...current.bank.beneficiaryOverride,
                                                reason: event.target.value
                                            }
                                        }
                                    })) }) }), _jsx(Field, { label: "Name", full: true, children: _jsx("input", { value: props.caseFile.bank.beneficiaryOverride.name, disabled: !props.caseFile.bank.beneficiaryOverride.reason, onChange: (event) => updateCurrentCase((current) => ({
                                        ...current,
                                        bank: {
                                            ...current.bank,
                                            beneficiaryOverride: {
                                                ...current.bank.beneficiaryOverride,
                                                name: event.target.value
                                            }
                                        }
                                    })) }) })] })) : null] })] }));
}
function ObjectsPage(props) {
    const state = useAppState();
    const [selectedObjectId, setSelectedObjectId] = useState(props.caseFile.objects[0]?.id ?? "");
    useEffect(() => {
        if (!props.caseFile.objects.length) {
            setSelectedObjectId("");
            return;
        }
        if (!props.caseFile.objects.some((item) => item.id === selectedObjectId)) {
            setSelectedObjectId(props.caseFile.objects[0]?.id ?? "");
        }
    }, [props.caseFile.objects, selectedObjectId]);
    const selectedObject = props.caseFile.objects.find((item) => item.id === selectedObjectId) ?? props.caseFile.objects[0] ?? null;
    const selectedObjectAssets = selectedObject ? props.caseFile.assets.filter((asset) => selectedObject.photoAssetIds.includes(asset.id)) : [];
    return (_jsxs("div", { className: "page-grid", children: [_jsxs(Section, { title: "Objekte", children: [_jsx(Field, { label: "Objektauswahl", full: true, children: _jsxs("select", { value: selectedObjectId, onChange: (event) => setSelectedObjectId(event.target.value), children: [!props.caseFile.objects.length ? _jsx("option", { value: "", children: "Noch keine Objekte" }) : null, props.caseFile.objects.map((item, index) => (_jsxs("option", { value: item.id, children: [index + 1, "/", props.caseFile.objects.length, " - ", item.intNumber, " - ", item.shortDescription || "Ohne Kurzbeschrieb"] }, item.id)))] }) }), _jsxs("div", { className: "inline-actions", children: [_jsx("button", { className: "primary", onClick: () => addObject(), children: "Objekt hinzuf\u00FCgen" }), selectedObject ? _jsx("button", { onClick: () => deleteObject(selectedObject.id), children: "Objekt l\u00F6schen" }) : null] }), !selectedObject ? _jsx("p", { children: "Noch keine Objekte erfasst." }) : null, selectedObject ? (() => {
                        const auction = state.masterData.auctions.find((candidate) => candidate.id === selectedObject.auctionId);
                        const ibid = auction ? auction.number.toLowerCase().startsWith("ibid") : false;
                        return (_jsxs(_Fragment, { children: [_jsx(Field, { label: "Int.-Nr.", children: _jsx("input", { value: selectedObject.intNumber, onChange: (event) => updateObject(selectedObject.id, (current) => ({ ...current, intNumber: event.target.value })) }) }), _jsx(Field, { label: "Auktion", children: _jsx("select", { value: selectedObject.auctionId, onChange: (event) => {
                                            updateObject(selectedObject.id, (current) => ({ ...current, auctionId: event.target.value }));
                                            applyAuctionPricingRules(selectedObject.id);
                                        }, children: state.masterData.auctions.map((auctionOption) => (_jsxs("option", { value: auctionOption.id, children: [auctionOption.number, " ", auctionOption.month, "/", auctionOption.year.slice(-2)] }, auctionOption.id))) }) }), _jsx(Field, { label: "Abteilung", children: _jsx("select", { value: selectedObject.departmentId, onChange: (event) => updateObject(selectedObject.id, (current) => ({ ...current, departmentId: event.target.value })), children: state.masterData.departments.map((department) => (_jsxs("option", { value: department.id, children: [department.code, " \u00B7 ", department.name] }, department.id))) }) }), _jsx(Field, { label: "Kurzbeschrieb", full: true, children: _jsx("input", { value: selectedObject.shortDescription, onChange: (event) => updateObject(selectedObject.id, (current) => ({ ...current, shortDescription: event.target.value })) }) }), _jsx(Field, { label: "Beschreibung", full: true, children: _jsx("textarea", { value: selectedObject.description, onChange: (event) => updateObject(selectedObject.id, (current) => ({ ...current, description: event.target.value })) }) }), _jsx(Field, { label: "Sch\u00E4tzung von", children: _jsx("input", { value: formatAmountForDisplay(selectedObject.estimate.low), onChange: (event) => updateObject(selectedObject.id, (current) => ({ ...current, estimate: { ...current.estimate, low: event.target.value } })) }) }), _jsx(Field, { label: "Sch\u00E4tzung bis", children: _jsx("input", { value: formatAmountForDisplay(selectedObject.estimate.high), onChange: (event) => updateObject(selectedObject.id, (current) => ({ ...current, estimate: { ...current.estimate, high: event.target.value } })) }) }), _jsx(Field, { label: ibid ? "Startpreis" : "Limite / Nettolimite", children: _jsx("input", { value: formatAmountForDisplay(selectedObject.priceValue), onChange: (event) => updateObject(selectedObject.id, (current) => ({ ...current, priceValue: event.target.value })) }) }), !ibid ? (_jsx(Field, { label: "Nettolimite", children: _jsx("input", { type: "checkbox", checked: selectedObject.pricingMode === "netLimit", onChange: (event) => updateObject(selectedObject.id, (current) => ({ ...current, pricingMode: event.target.checked ? "netLimit" : "limit" })) }) })) : null, _jsx(Field, { label: "Objektfotos", full: true, children: _jsxs("div", { className: "photo-upload", children: [_jsx("input", { type: "file", accept: "image/*", multiple: true, onChange: async (event) => {
                                                    const files = Array.from(event.target.files ?? []);
                                                    if (!files.length) {
                                                        return;
                                                    }
                                                    const assets = await Promise.all(files.map((file) => createOptimizedImageAsset(file)));
                                                    updateCurrentCase((current) => ({
                                                        ...current,
                                                        assets: [...current.assets, ...assets],
                                                        objects: current.objects.map((item) => item.id === selectedObject.id
                                                            ? { ...item, photoAssetIds: [...item.photoAssetIds, ...assets.map((asset) => asset.id)] }
                                                            : item)
                                                    }));
                                                    event.target.value = "";
                                                } }), selectedObjectAssets.length ? (_jsx("div", { className: "photo-grid", children: selectedObjectAssets.map((asset) => (_jsxs("div", { className: "photo-preview", children: [_jsx("img", { src: asset.optimizedPath, alt: asset.fileName }), _jsx("button", { type: "button", className: "photo-preview__remove", onClick: () => updateCurrentCase((current) => ({
                                                                ...current,
                                                                assets: current.assets.filter((item) => item.id !== asset.id),
                                                                objects: current.objects.map((item) => item.id === selectedObject.id
                                                                    ? { ...item, photoAssetIds: item.photoAssetIds.filter((assetId) => assetId !== asset.id) }
                                                                    : item)
                                                            })), children: "\u00D7" })] }, asset.id))) })) : null] }) })] }));
                    })() : null] }), _jsxs(Section, { title: "Konditionen f\u00FCr alle Objekte", children: [_jsx(Field, { label: "Kommission", children: _jsx("input", { value: props.caseFile.costs.commission.amount, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, commission: { ...current.costs.commission, amount: event.target.value } } })) }) }), _jsx(Field, { label: "Versicherung", children: _jsx("input", { value: props.caseFile.costs.insurance.amount, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, insurance: { ...current.costs.insurance, amount: event.target.value } } })) }) }), _jsx(Field, { label: "Transport", children: _jsx("input", { value: props.caseFile.costs.transport.amount, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, transport: { ...current.costs.transport, amount: event.target.value } } })) }) }), _jsx(Field, { label: "Abb.-Kosten", children: _jsx("input", { value: props.caseFile.costs.imaging.amount, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, imaging: { ...current.costs.imaging, amount: event.target.value } } })) }) }), _jsx(Field, { label: "Kosten Expertisen", children: _jsx("input", { value: props.caseFile.costs.expertise.amount, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, expertise: { ...current.costs.expertise, amount: event.target.value } } })) }) }), _jsx(Field, { label: "Internet", children: _jsx("input", { value: props.caseFile.costs.internet.amount, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, internet: { ...current.costs.internet, amount: event.target.value } } })) }) }), _jsx(Field, { label: "Provenienz / Infos", full: true, children: _jsx("textarea", { value: props.caseFile.costs.provenance, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, provenance: event.target.value } })) }) })] })] }));
}
function InternalPage(props) {
    const state = useAppState();
    return (_jsxs("div", { className: "page-grid", children: [_jsx(Section, { title: "Interne Infos", children: _jsx(Field, { label: "Interne Notizen", full: true, children: _jsx("textarea", { value: props.caseFile.internalInfo.notes, onChange: (event) => updateCurrentCase((current) => ({
                            ...current,
                            internalInfo: {
                                ...current.internalInfo,
                                notes: event.target.value
                            }
                        })) }) }) }), _jsx(Section, { title: "Interessengebiete", children: state.masterData.departments.map((department) => {
                    const checked = props.caseFile.internalInfo.interestDepartmentIds.includes(department.id);
                    return (_jsxs("label", { className: "checkbox-line", children: [_jsx("input", { type: "checkbox", checked: checked, onChange: (event) => updateCurrentCase((current) => ({
                                    ...current,
                                    internalInfo: {
                                        ...current.internalInfo,
                                        interestDepartmentIds: event.target.checked
                                            ? [...current.internalInfo.interestDepartmentIds, department.id]
                                            : current.internalInfo.interestDepartmentIds.filter((id) => id !== department.id)
                                    }
                                })) }), _jsxs("span", { children: [department.code, " \u00B7 ", department.name] })] }, department.id));
                }) })] }));
}
function PdfEditModal(props) {
    const state = useAppState();
    const signatureCanvasRef = useRef(null);
    const isDrawingRef = useRef(false);
    const lastPointRef = useRef(null);
    const objectItem = props.openTarget?.kind === "object" ? props.caseFile.objects[props.openTarget.objectIndex] ?? null : null;
    useEffect(() => {
        if (props.openTarget?.kind !== "consignorSignature") {
            return;
        }
        const canvas = signatureCanvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
            return;
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 3;
        context.strokeStyle = "#111111";
        if (!props.caseFile.signatures.consignorSignaturePng) {
            return;
        }
        const image = new Image();
        image.onload = () => {
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
        };
        image.src = props.caseFile.signatures.consignorSignaturePng;
    }, [props.caseFile.signatures.consignorSignaturePng, props.openTarget]);
    function getCanvasPoint(event) {
        const canvas = signatureCanvasRef.current;
        if (!canvas) {
            return null;
        }
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * canvas.width,
            y: ((event.clientY - rect.top) / rect.height) * canvas.height
        };
    }
    function startSignature(event) {
        const canvas = signatureCanvasRef.current;
        const context = canvas?.getContext("2d");
        const point = getCanvasPoint(event);
        if (!canvas || !context || !point) {
            return;
        }
        isDrawingRef.current = true;
        lastPointRef.current = point;
        canvas.setPointerCapture(event.pointerId);
        context.beginPath();
        context.moveTo(point.x, point.y);
    }
    function moveSignature(event) {
        if (!isDrawingRef.current) {
            return;
        }
        const context = signatureCanvasRef.current?.getContext("2d");
        const point = getCanvasPoint(event);
        const lastPoint = lastPointRef.current;
        if (!context || !point || !lastPoint) {
            return;
        }
        context.beginPath();
        context.moveTo(lastPoint.x, lastPoint.y);
        context.lineTo(point.x, point.y);
        context.stroke();
        lastPointRef.current = point;
    }
    function endSignature(event) {
        if (event && signatureCanvasRef.current?.hasPointerCapture(event.pointerId)) {
            signatureCanvasRef.current.releasePointerCapture(event.pointerId);
        }
        isDrawingRef.current = false;
        lastPointRef.current = null;
    }
    function clearSignature() {
        const canvas = signatureCanvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) {
            return;
        }
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        updateCurrentCase((current) => ({
            ...current,
            signatures: {
                ...current.signatures,
                consignorSignaturePng: ""
            }
        }));
    }
    function saveSignature() {
        const canvas = signatureCanvasRef.current;
        if (!canvas) {
            return;
        }
        updateCurrentCase((current) => ({
            ...current,
            signatures: {
                ...current.signatures,
                consignorSignaturePng: canvas.toDataURL("image/png")
            }
        }));
        props.onClose();
    }
    if (!props.openTarget) {
        return null;
    }
    return (_jsx("div", { className: "pin-modal", children: _jsxs("div", { className: "overlay__card", children: [_jsxs("div", { className: "admin-header", children: [_jsx("h2", { children: "Bereich bearbeiten" }), _jsx("button", { onClick: props.onClose, children: "Schlie\u00DFen" })] }), _jsxs("div", { className: "page-grid", children: [props.openTarget.kind === "meta" ? (_jsxs(Section, { title: "Meta", children: [_jsx(Field, { label: "ELB-Nummer", children: _jsx("input", { value: props.caseFile.meta.receiptNumber, onChange: (event) => updateCurrentCase((current) => ({
                                            ...current,
                                            meta: { ...current.meta, receiptNumber: event.target.value }
                                        })) }) }), _jsx(Field, { label: "Sachbearbeiter", children: _jsx("select", { value: props.caseFile.meta.clerkId, onChange: (event) => updateCurrentCase((current) => ({
                                            ...current,
                                            meta: { ...current.meta, clerkId: event.target.value }
                                        })), children: state.masterData.clerks.map((clerk) => (_jsx("option", { value: clerk.id, children: clerk.name }, clerk.id))) }) })] })) : null, props.openTarget.kind === "consignor" ? (_jsxs(Section, { title: "Einlieferer", children: [_jsx(Field, { label: "Firma", children: _jsx("input", { value: props.caseFile.consignor.company, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, company: event.target.value } })) }) }), _jsx(Field, { label: "Vorname", children: _jsx("input", { value: props.caseFile.consignor.firstName, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, firstName: event.target.value } })) }) }), _jsx(Field, { label: "Nachname", children: _jsx("input", { value: props.caseFile.consignor.lastName, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, lastName: event.target.value } })) }) }), _jsx(Field, { label: "Stra\u00DFe", children: _jsx("input", { value: props.caseFile.consignor.street, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, street: event.target.value } })) }) }), _jsx(Field, { label: "PLZ", children: _jsx("input", { value: props.caseFile.consignor.zip, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, zip: event.target.value } })) }) }), _jsx(Field, { label: "Stadt", children: _jsx("input", { value: props.caseFile.consignor.city, onChange: (event) => updateCurrentCase((current) => ({ ...current, consignor: { ...current.consignor, city: event.target.value } })) }) })] })) : null, props.openTarget.kind === "owner" ? (_jsxs(Section, { title: "Eigent\u00FCmer", children: [_jsx(Field, { label: "Eigent\u00FCmer = Einlieferer", children: _jsx("input", { type: "checkbox", checked: props.caseFile.owner.sameAsConsignor, onChange: (event) => updateCurrentCase((current) => ({
                                            ...current,
                                            owner: { ...current.owner, sameAsConsignor: event.target.checked }
                                        })) }) }), props.caseFile.owner.sameAsConsignor ? null : (_jsxs(_Fragment, { children: [_jsx(Field, { label: "Vorname", children: _jsx("input", { value: props.caseFile.owner.firstName, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, firstName: event.target.value } })) }) }), _jsx(Field, { label: "Nachname", children: _jsx("input", { value: props.caseFile.owner.lastName, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, lastName: event.target.value } })) }) }), _jsx(Field, { label: "Stra\u00C3\u0178e", children: _jsx("input", { value: props.caseFile.owner.street, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, street: event.target.value } })) }) }), _jsx(Field, { label: "Nr.", children: _jsx("input", { value: props.caseFile.owner.houseNumber, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, houseNumber: event.target.value } })) }) }), _jsx(Field, { label: "PLZ", children: _jsx("input", { value: props.caseFile.owner.zip, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, zip: event.target.value } })) }) }), _jsx(Field, { label: "Stadt", children: _jsx("input", { value: props.caseFile.owner.city, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, city: event.target.value } })) }) }), _jsx(Field, { label: "Land", children: _jsx("input", { value: props.caseFile.owner.country, onChange: (event) => updateCurrentCase((current) => ({ ...current, owner: { ...current.owner, country: event.target.value } })) }) })] }))] })) : null, props.openTarget.kind === "bank" ? (_jsxs(Section, { title: "Bank", children: [_jsx(Field, { label: "IBAN", children: _jsx("input", { value: props.caseFile.bank.iban, onChange: (event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, iban: event.target.value } })) }) }), _jsx(Field, { label: "BIC", children: _jsx("input", { value: props.caseFile.bank.bic, onChange: (event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, bic: event.target.value } })) }) }), _jsx(Field, { label: "Grund abweichender Beg\u00FCnstigter", children: _jsx("input", { value: props.caseFile.bank.beneficiaryOverride.reason, onChange: (event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, reason: event.target.value } } })) }) }), _jsx(Field, { label: "Name abweichender Beg\u00FCnstigter", children: _jsx("input", { value: props.caseFile.bank.beneficiaryOverride.name, onChange: (event) => updateCurrentCase((current) => ({ ...current, bank: { ...current.bank, beneficiaryOverride: { ...current.bank.beneficiaryOverride, name: event.target.value } } })) }) })] })) : null, props.openTarget.kind === "costs" ? (_jsxs(Section, { title: "Konditionen", children: [_jsx(Field, { label: "Kommission", children: _jsx("input", { value: props.caseFile.costs.commission.amount, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, commission: { ...current.costs.commission, amount: event.target.value } } })) }) }), _jsx(Field, { label: "Versicherung", children: _jsx("input", { value: props.caseFile.costs.insurance.amount, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, insurance: { ...current.costs.insurance, amount: event.target.value } } })) }) }), _jsx(Field, { label: "Transport", children: _jsx("input", { value: props.caseFile.costs.transport.amount, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, transport: { ...current.costs.transport, amount: event.target.value } } })) }) }), _jsx(Field, { label: "Abb.-Kosten", children: _jsx("input", { value: props.caseFile.costs.imaging.amount, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, imaging: { ...current.costs.imaging, amount: event.target.value } } })) }) }), _jsx(Field, { label: "Provenienz / Infos", full: true, children: _jsx("textarea", { value: props.caseFile.costs.provenance, onChange: (event) => updateCurrentCase((current) => ({ ...current, costs: { ...current.costs, provenance: event.target.value } })) }) })] })) : null, props.openTarget.kind === "object" && objectItem ? (_jsxs(Section, { title: `Objekt ${objectItem.intNumber}`, children: [_jsx(Field, { label: "Int.-Nr.", children: _jsx("input", { value: objectItem.intNumber, onChange: (event) => updateObject(objectItem.id, (current) => ({ ...current, intNumber: event.target.value })) }) }), _jsx(Field, { label: "Auktion", children: _jsx("select", { value: objectItem.auctionId, onChange: (event) => {
                                            updateObject(objectItem.id, (current) => ({ ...current, auctionId: event.target.value }));
                                            applyAuctionPricingRules(objectItem.id);
                                        }, children: state.masterData.auctions.map((auction) => (_jsx("option", { value: auction.id, children: auction.number }, auction.id))) }) }), _jsx(Field, { label: "Abteilung", children: _jsx("select", { value: objectItem.departmentId, onChange: (event) => updateObject(objectItem.id, (current) => ({ ...current, departmentId: event.target.value })), children: state.masterData.departments.map((department) => (_jsxs("option", { value: department.id, children: [department.code, " \u00B7 ", department.name] }, department.id))) }) }), _jsx(Field, { label: "Kurzbeschrieb", full: true, children: _jsx("input", { value: objectItem.shortDescription, onChange: (event) => updateObject(objectItem.id, (current) => ({ ...current, shortDescription: event.target.value })) }) }), _jsx(Field, { label: "Beschreibung", full: true, children: _jsx("textarea", { value: objectItem.description, onChange: (event) => updateObject(objectItem.id, (current) => ({ ...current, description: event.target.value })) }) })] })) : null, props.openTarget.kind === "consignorSignature" ? (_jsxs(Section, { title: "Einlieferer-Signatur", children: [_jsxs("div", { className: "signature-pad", children: [_jsx("canvas", { ref: signatureCanvasRef, className: "signature-pad__canvas", width: 640, height: 220, onPointerDown: startSignature, onPointerMove: moveSignature, onPointerUp: endSignature, onPointerLeave: endSignature }), _jsxs("div", { className: "signature-pad__actions", children: [_jsx("button", { type: "button", className: "secondary-button", onClick: clearSignature, children: "L\u00C3\u00B6schen" }), _jsx("button", { type: "button", className: "secondary-button", onClick: props.onClose, children: "Schlie\u00C3\u0178en" }), _jsx("button", { type: "button", className: "primary-button", onClick: saveSignature, children: "\u00C3\u0153bernehmen" })] })] }), _jsx("p", { children: "Der Signaturbereich ist jetzt pr\u00E4zise auf das PDF gelegt. Die Canvas-Erfassung folgt als n\u00E4chster Schritt." })] })) : null, props.openTarget.kind === "clerkSignature" ? (_jsx(Section, { title: "Sachbearbeiter-Signatur", children: _jsx("p", { children: "Die Sachbearbeiter-Signatur wird aus den Stammdaten \u00FCbernommen. Die direkte Vorschauplatzierung folgt als n\u00E4chster Schritt." }) })) : null] })] }) }));
}
function PdfPreviewPage(props) {
    const state = useAppState();
    const model = createPdfPreviewModel(props.caseFile, state.masterData);
    const exportPlan = createExportPlan(props.caseFile);
    const [exportStatus, setExportStatus] = useState("");
    const [editTarget, setEditTarget] = useState(null);
    async function handleExportArtifacts() {
        try {
            setExportStatus("Artefakte werden erzeugt...");
            const bundle = await generateExportBundle(props.caseFile, state.masterData);
            for (const artifact of bundle.artifacts) {
                const blob = new Blob([artifact.content], { type: artifact.mimeType });
                triggerDownload(artifact.fileName.replace("bilder/", "bilder_"), blob);
            }
            const zipBlob = await createExportZip(props.caseFile, state.masterData);
            triggerDownload(bundle.plan.zipFileName, zipBlob);
            setExportStatus("Artefakte und ZIP wurden erzeugt.");
        }
        catch (error) {
            setExportStatus(error instanceof Error ? error.message : "Export fehlgeschlagen.");
        }
    }
    return (_jsx("div", { className: "preview-page", children: _jsxs("div", { className: "preview-sheet", children: [_jsxs("div", { className: "preview-sheet__toolbar", children: [_jsx("button", { children: "Signatur erfassen" }), _jsx("button", { children: "Pflichtfelder pr\u00FCfen" }), _jsx("button", { onClick: () => saveDraft(), children: "Draft speichern" }), _jsx("button", { onClick: () => finalizeCurrentCase(), children: "Finalisieren" }), _jsx("button", { onClick: () => void handleExportArtifacts(), children: "Artefakte + ZIP erzeugen" })] }), _jsxs("div", { className: "preview-sheet__content", children: [_jsx(PdfCanvasPreview, { caseFile: props.caseFile, masterData: state.masterData, onEdit: setEditTarget }), _jsxs("div", { className: "preview-card", children: [_jsx("h3", { children: "Exportstatus" }), _jsxs("p", { children: ["Beg\u00FCnstigter: ", model.beneficiary || "Noch nicht gesetzt"] }), _jsxs("p", { children: ["Sachbearbeiter: ", model.clerkLabel || "Noch nicht gesetzt"] }), _jsxs("p", { children: ["ZIP: ", exportPlan.zipFileName] }), _jsx("div", { className: "chip-list", children: exportPlan.artifacts.map((artifact) => (_jsx("span", { className: "chip", children: artifact.fileName }, artifact.fileName))) }), model.missingRequiredFields.length ? (_jsxs(_Fragment, { children: [_jsx("h4", { children: "Fehlende PDF-Pflichtfelder" }), _jsx("ul", { className: "simple-list", children: model.missingRequiredFields.map((item) => (_jsx("li", { children: item }, item))) })] })) : (_jsx("p", { children: "Alle konfigurierten PDF-Pflichtfelder sind aktuell bef\u00FCllt." })), exportStatus ? _jsx("p", { children: exportStatus }) : null] })] }), _jsx(PdfEditModal, { caseFile: props.caseFile, openTarget: editTarget, onClose: () => setEditTarget(null) })] }) }));
}
function WordPreviewPage(props) {
    const state = useAppState();
    const model = createWordPreviewModel(props.caseFile, state.masterData);
    return (_jsx("div", { className: "preview-page", children: _jsx("div", { className: "word-sheet-stack", children: model.pages.map((page) => (_jsxs("div", { className: "word-sheet", children: [_jsxs("header", { className: "word-sheet__header", children: [_jsx("div", { children: "Word-Sch\u00E4tzliste" }), _jsxs("div", { children: ["Seite ", page.pageNumber, "/", page.totalPages] })] }), _jsxs("div", { className: "word-sheet__body", children: [_jsxs("div", { className: "preview-card", children: [_jsx("h3", { children: "Einliefereradresse" }), page.showAddress ? page.addressLines.map((line) => _jsx("div", { children: line }, line)) : _jsx("div", { children: "Keine Adresse auf Folgeseite" })] }), _jsxs("div", { className: "preview-card", children: [_jsx("h3", { children: "Objektinfos" }), page.rows.map((item) => (_jsxs("div", { className: "word-row", children: [_jsx("strong", { children: item.intNumber }), _jsx("span", { children: item.title }), _jsx("span", { children: item.estimate })] }, item.id)))] }), _jsxs("div", { className: "preview-card", children: [_jsx("h3", { children: "Typografie" }), _jsx("p", { children: model.typography.family }), _jsx("p", { children: model.typography.note })] })] })] }, page.pageNumber))) }) }));
}
export function App() {
    const state = useAppState();
    const [page, setPage] = useState("consignor");
    const [adminOpen, setAdminOpen] = useState(false);
    const [hydrated, setHydrated] = useState(false);
    const firstSaveRef = useRef(true);
    const caseFile = state.currentCase;
    useEffect(() => {
        let active = true;
        hydrateSnapshotFromDisk()
            .then((snapshot) => {
            if (!active || !snapshot) {
                return;
            }
            replaceState(snapshot);
        })
            .finally(() => {
            if (active) {
                setHydrated(true);
            }
        });
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        if (!hydrated) {
            return;
        }
        if (firstSaveRef.current) {
            firstSaveRef.current = false;
            return;
        }
        void persistSnapshotToDisk(createSnapshot());
    }, [hydrated, state]);
    return (_jsxs("div", { className: "app-shell", children: [_jsx(SessionOverlay, {}), _jsx(TopBar, { page: page, onPageChange: setPage }), _jsx("button", { className: "admin-fab", onClick: () => setAdminOpen(true), children: "Admin" }), _jsx(AdminModal, { open: adminOpen, onClose: () => setAdminOpen(false) }), !caseFile ? (_jsxs("main", { className: "empty-state", children: [_jsx("h1", { children: "Kein aktiver Vorgang" }), _jsx("p", { children: "Bitte zuerst einen Sachbearbeiter w\u00E4hlen oder einen neuen Vorgang anlegen." })] })) : (_jsxs("main", { className: "page", children: [page === "consignor" ? _jsx(ConsignorPage, { caseFile: caseFile }) : null, page === "objects" ? _jsx(ObjectsPage, { caseFile: caseFile }) : null, page === "internal" ? _jsx(InternalPage, { caseFile: caseFile }) : null, page === "pdfPreview" ? _jsx(PdfPreviewPage, { caseFile: caseFile }) : null, page === "wordPreview" ? _jsx(WordPreviewPage, { caseFile: caseFile }) : null] }))] }));
}
