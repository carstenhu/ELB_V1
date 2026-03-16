import { deriveAddressLines, formatAmountForDisplay } from "@elb/domain/index";
const ROWS_PER_PAGE = 8;
function chunkRows(rows, size) {
    const chunks = [];
    for (let index = 0; index < rows.length; index += size) {
        chunks.push(rows.slice(index, index + size));
    }
    return chunks;
}
export function createWordPreviewModel(caseFile, _masterData) {
    const rows = caseFile.objects.map((item) => ({
        id: item.id,
        intNumber: item.intNumber,
        title: item.shortDescription || item.description,
        estimate: [formatAmountForDisplay(item.estimate.low), formatAmountForDisplay(item.estimate.high)].filter(Boolean).join(" - "),
        hasPhoto: item.photoAssetIds.length > 0
    }));
    const chunks = chunkRows(rows, ROWS_PER_PAGE);
    const totalPages = Math.max(chunks.length, 1);
    return {
        pages: (chunks.length ? chunks : [[]]).map((chunk, index) => ({
            pageNumber: index + 1,
            totalPages,
            showAddress: index === 0,
            addressLines: index === 0 ? deriveAddressLines(caseFile.consignor) : [],
            rows: chunk
        })),
        typography: {
            family: "Neue Haas Grotesk",
            note: "Typografie der Vorlage möglichst eng annähern"
        }
    };
}
