import { z } from "zod";

export const receiptNumberSchema = z.string().trim().regex(/^\d{4}$/, "Nummern müssen vierstellig sein.");
export const intNumberSchema = receiptNumberSchema;
export const adminPinSchema = z.string().trim().regex(/^\d{4,12}$/, "Die Admin-PIN muss aus 4 bis 12 Ziffern bestehen.");
export const vatCategorySchema = z.enum(["", "A", "B", "C"]);
export const emailLikeSchema = z.string().trim().refine((value) => value === "" || z.email().safeParse(value).success, {
  message: "Ungültige E-Mail-Adresse."
});
export const ibanSchema = z.string().trim().refine((value) => value === "" || /^[A-Z]{2}[0-9A-Z]{13,32}$/.test(value.replace(/\s+/g, "")), {
  message: "Ungültige IBAN."
});
export const bicSchema = z.string().trim().refine((value) => value === "" || /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(value), {
  message: "Ungültiger BIC."
});
export const amountInputSchema = z.string().trim().refine((value) => value === "" || /^[0-9 ]+$/.test(value), {
  message: "Beträge dürfen nur Ziffern und Leerzeichen enthalten."
});
