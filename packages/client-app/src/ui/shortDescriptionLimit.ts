export const SHORT_DESCRIPTION_MAX_LENGTH = 86;
export const SHORT_DESCRIPTION_LIMIT_MESSAGE = "Kurzbeschrieb: maximal 86 Zeichen erlaubt.";

export function wouldExceedInputLimit(input: HTMLInputElement, insertedText: string, maxLength: number): boolean {
  const selectionStart = input.selectionStart ?? input.value.length;
  const selectionEnd = input.selectionEnd ?? input.value.length;
  const replacedLength = Math.max(selectionEnd - selectionStart, 0);
  const nextLength = input.value.length - replacedLength + insertedText.length;
  return nextLength > maxLength;
}
