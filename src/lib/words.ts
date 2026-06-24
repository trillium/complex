// ── spoken number → digit ──────────────────────────────────────────────────────
// Maps voice-transcribed number words (including common homophones) to digits,
// so "complex too" resolves to session 2.

export const WORD_TO_NUM: Record<string, number> = {
  one: 1, two: 2, too: 2, to: 2,
  three: 3, four: 4, "for": 4,
  five: 5, six: 6, seven: 7, eight: 8, ate: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20,
};

export function wordToNum(s: string): string {
  return s in WORD_TO_NUM ? String(WORD_TO_NUM[s]) : s;
}
