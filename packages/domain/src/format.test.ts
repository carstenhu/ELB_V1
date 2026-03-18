import { describe, expect, it } from "vitest";
import { buildFolderName, formatAmountForDisplay, formatReceiptNumber, isIbidAuction } from "./format";

describe("domain format helpers", () => {
  it("formats receipt numbers as four digits", () => {
    expect(formatReceiptNumber(7)).toBe("0007");
  });

  it("formats amounts with spaces", () => {
    expect(formatAmountForDisplay("12500")).toBe("12 500");
  });

  it("detects ibid auctions", () => {
    expect(isIbidAuction("ibid 12")).toBe(true);
  });

  it("builds stable folder names", () => {
    expect(buildFolderName("Meier", "Anna", "0004")).toBe("Meier_Anna_0004");
  });
});
