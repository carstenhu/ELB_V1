import clerksData from "../../../vorlagen/clerks.json";
import auctionsData from "../../../vorlagen/auctions.json";
import departmentsData from "../../../vorlagen/departments.json";
import titlesData from "../../../vorlagen/titles.json";
import { DEFAULT_ADMIN_PIN } from "@elb/shared/constants";
import { repairMojibake } from "@elb/shared/mojibake";
import type { MasterData } from "./types";

export function loadSeedMasterData(): MasterData {
  return {
    clerks: clerksData.map((clerk, index) => ({
      id: `clerk-${index + 1}`,
      name: repairMojibake(clerk.name),
      email: clerk.email,
      phone: clerk.phone,
      signaturePng: clerk.signature_png,
    })),
    auctions: auctionsData.map((auction, index) => ({
      id: `auction-${index + 1}`,
      number: auction.number,
      month: auction.month,
      year: auction.year,
    })),
    departments: departmentsData.map((department, index) => ({
      id: `department-${index + 1}`,
      code: department.code,
      name: repairMojibake(department.name),
    })),
    titles: titlesData.map((title) => repairMojibake(title)),
    globalPdfRequiredFields: [
      "meta.receiptNumber",
      "meta.clerkId",
      "consignor.lastName",
      "consignor.street",
      "consignor.zip",
      "consignor.city",
      "objects[].departmentId",
      "objects[].shortDescription",
      "objects[].estimate.low",
      "objects[].estimate.high"
    ],
    adminPin: DEFAULT_ADMIN_PIN,
  };
}

