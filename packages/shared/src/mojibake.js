const FIXES = [
    ["Ã¼", "ü"],
    ["Ã¤", "ä"],
    ["Ã¶", "ö"],
    ["Ãœ", "Ü"],
    ["Ã„", "Ä"],
    ["Ã–", "Ö"],
    ["Ã©", "é"],
    ["Ã¨", "è"],
    ["Ã ", "à"],
    ["ÃŸ", "ß"],
];
export function repairMojibake(value) {
    return FIXES.reduce((current, [broken, fixed]) => current.replaceAll(broken, fixed), value);
}
