"use client";

export type VoiceCommand = "next" | "back" | "repeat";

/**
 * Map a Vietnamese speech transcript to a navigation command.
 * Pure keyword spotting — checked most-specific first so "quay lại" (back)
 * is never mistaken for the repeat phrases ("đọc lại"/"nhắc lại"/"lặp lại").
 */
export function matchCommand(transcript: string): VoiceCommand | null {
  const t = transcript.toLowerCase().trim();
  if (!t) return null;
  if (t.includes("đọc lại") || t.includes("nhắc lại") || t.includes("lặp lại")) return "repeat";
  if (t.includes("quay lại") || t.includes("lùi") || t.includes("trước")) return "back";
  if (t.includes("tiếp") || t.includes("sau")) return "next";
  return null;
}
