"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSpeech {
  supported: boolean;
  enabled: boolean;
  setEnabled: (b: boolean) => void;
  speak: (text: string) => void;
  cancel: () => void;
}

/** Find an installed Vietnamese voice — by BCP-47 lang (vi/vi-VN) or by name
 * (e.g. "Google Tiếng Việt", "Microsoft HoaiMy"). Returns null if none. */
function findVietnameseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("vi")) ??
    voices.find((v) => /viet|tiếng việt/i.test(v.name)) ??
    null
  );
}

/**
 * Text-to-speech for reading cooking steps aloud. Picks a Vietnamese voice if
 * the OS/browser provides one (voices load async, so we also listen for
 * `onvoiceschanged` AND re-pick lazily on the first `speak`). If the machine has
 * no Vietnamese voice we fall back to the default voice and warn once — the Web
 * Speech API can only use voices already installed; we cannot ship our own.
 * Each `speak` cancels the previous utterance so fast step changes don't overlap.
 */
export function useSpeech(): UseSpeech {
  const [supported] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
  );
  const [enabled, setEnabled] = useState(true);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!supported) return;
    const pick = () => {
      voiceRef.current = findVietnameseVoice(window.speechSynthesis.getVoices());
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [supported]);

  const cancel = useCallback(() => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !enabled) return;
      // Voices load asynchronously; if we don't have one yet, try again right
      // now so the first step isn't read with the default (English) voice.
      if (!voiceRef.current) {
        voiceRef.current = findVietnameseVoice(window.speechSynthesis.getVoices());
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "vi-VN";
      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
      } else if (!warnedRef.current) {
        warnedRef.current = true;
        // eslint-disable-next-line no-console
        console.warn(
          "[useSpeech] Không có giọng đọc tiếng Việt trên trình duyệt/máy này — " +
            "đang đọc bằng giọng mặc định. Cài gói giọng tiếng Việt (Windows: Cài đặt → " +
            "Thời gian & ngôn ngữ → Giọng nói → Thêm giọng nói → Tiếng Việt) hoặc dùng " +
            "Chrome khi có mạng ('Google Tiếng Việt').",
        );
      }
      window.speechSynthesis.speak(utterance);
    },
    [supported, enabled],
  );

  return { supported, enabled, setEnabled, speak, cancel };
}
