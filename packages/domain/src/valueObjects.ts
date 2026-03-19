import { z } from "zod";

export const receiptNumberSchema = z.string().trim().regex(/^\d{4}$/, "Nummern muessen vierstellig sein.");
export const intNumberSchema = receiptNumberSchema;
export const adminPinSchema = z.string().trim().regex(/^\d{4,12}$/, "Die Admin-PIN muss aus 4 bis 12 Ziffern bestehen.");
export const vatCategorySchema = z.enum(["", "A", "B", "C"]);
export const emailLikeSchema = z.string().trim().refine((value) => value === "" || z.email().safeParse(value).success, {
  message: "Ungueltige E-Mail-Adresse."
});

// IBAN und BIC sind im aktuellen Fachprozess optionale Freitextfelder.
export const ibanSchema = z.string().trim();
export const bicSchema = z.string().trim();

// Betraege bleiben Freitext, erlauben aber die ueblichen Tausendertrennzeichen
// sowie in der Schweiz gebraeuchliche Suffixe wie ".-".
export const amountInputSchema = z.string().trim().refine((value) => value === "" || /^[0-9\s'.,-]+$/.test(value), {
  message: "Betraege duerfen Ziffern sowie uebliche Trennzeichen enthalten."
});
