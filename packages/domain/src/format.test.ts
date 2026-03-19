import { describe, expect, it } from "vitest";
import { buildExchangeBaseName, buildFolderName, formatAmountForDisplay, formatReceiptNumber, isIbidAuction } from "./format";

describe("domain format helpers", () => {
  it("formats receipt numbers without forced padding", () => {
    expect(formatReceiptNumber(7)).toBe("7");
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

  it("builds exchange names from company or last name", () => {
    expect(buildExchangeBaseName({
      useCompanyAddress: false,
      company: "",
      lastName: "Infanger",
      firstName: "Anna"
    }, "2001")).toBe("infanger_2001");
  });
});
