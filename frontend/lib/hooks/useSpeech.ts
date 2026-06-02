"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSpeech {
  supported: boolean;
  enabled: boolean;
  setEnabled: (b: boolean) => void;
  speak: (text: string) => void;
  cancel: () => void;
}

/**
 * Text-to-speech for reading cooking steps aloud. Picks a Vietnamese voice if
 * the OS provides one (voices load async, so we also listen for
 * `onvoiceschanged`); otherwise speaks with the default voice. Each `speak`
 * cancels the previous utterance so fast step changes don't overlap.
 */
export function useSpeech(): UseSpeech {
  const [supported] = useState(
    () => typeof window !== "undefined" && "speechSynthesis" in window,
  );
  const [enabled, setEnabled] = useState(true);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!supported) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current = voices.find((v) => v.lang.toLowerCase().startsWith("vi")) ?? null;
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
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "vi-VN";
      if (voiceRef.current) utterance.voice = voiceRef.current;
      window.speechSynthesis.speak(utterance);
    },
    [supported, enabled],
  );

  return { supported, enabled, setEnabled, speak, cancel };
}
