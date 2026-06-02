"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

// Minimal shape of the browser SpeechRecognition we use. The DOM lib does not
// ship types for the (prefixed) Web Speech API, so we model just what we touch.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export interface UseVoiceCommands {
  supported: boolean;
  listening: boolean;
  toggle: () => void;
}

/**
 * Hands-free voice navigation via the browser SpeechRecognition API.
 * Default OFF — the user taps the mic once (grants permission), then it
 * listens continuously and restarts itself when the browser auto-ends on
 * silence. `onCommand` is read through a ref so re-renders never rebuild the
 * recognition object.
 */
export function useVoiceCommands(onCommand: (cmd: VoiceCommand) => void): UseVoiceCommands {
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const onCommandRef = useRef(onCommand);
  const listeningRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Keep the callback fresh without rebuilding recognition.
  useEffect(() => {
    onCommandRef.current = onCommand;
  });

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "vi-VN";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      const results = event.results;
      const last = results[results.length - 1];
      const transcript = last[0].transcript;
      const cmd = matchCommand(transcript);
      if (cmd) onCommandRef.current(cmd);
    };
    rec.onend = () => {
      // Browser auto-stops after silence; restart while the user wants to listen.
      if (listeningRef.current) {
        try {
          rec.start();
        } catch {
          /* start() throws if called too quickly; ignore and wait for next onend */
        }
      }
    };
    recognitionRef.current = rec;
    return () => {
      listeningRef.current = false;
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
      recognitionRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listeningRef.current) {
      listeningRef.current = false;
      setListening(false);
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    } else {
      listeningRef.current = true;
      setListening(true);
      try {
        rec.start();
      } catch {
        /* already started */
      }
    }
  }, []);

  return { supported, listening, toggle };
}
