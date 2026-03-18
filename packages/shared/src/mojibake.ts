const FIXES: Array<[string, string]> = [
  ["\u00C3\u00BC", "\u00FC"],
  ["\u00C3\u00A4", "\u00E4"],
  ["\u00C3\u00B6", "\u00F6"],
  ["\u00C3\u0153", "\u00DC"],
  ["\u00C3\u201E", "\u00C4"],
  ["\u00C3\u201C", "\u00D6"],
  ["\u00C3\u00A9", "\u00E9"],
  ["\u00C3\u00A8", "\u00E8"],
  ["\u00C3\u00A0", "\u00E0"],
  ["\u00C3\u0178", "\u00DF"],
];

export function repairMojibake(value: string): string {
  return FIXES.reduce((current, [broken, fixed]) => current.replaceAll(broken, fixed), value);
}
