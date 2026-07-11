"use client";

import { useCallback, useRef, useState } from "react";
import api from "@/lib/api";

// Cache-bust token appended to TTS requests. The endpoint sends a long
// Cache-Control, so the browser would otherwise replay audio cached under the
// previous engine/voice for the same `text` URL. Bump this whenever the
// backend TTS engine or voice changes (currently Piper vi_VN-vais1000-medium).
const TTS_VERSION = "piper-vais1000-1";

/**
 * Offline fallback: read `text` with the browser's built-in speech synthesis
 * (Web Speech API). Used when the server TTS (edge-tts) fails — Microsoft's free
 * endpoint flakes often — so the user still hears the step instead of silence.
 * Prefers a Vietnamese voice if the OS has one; otherwise the vi-VN lang hint.
 */
function browserSpeak(text: string) {
  try {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    if (!synth) return;
    synth.cancel(); // never overlap with a previous utterance
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "vi-VN";
    const vi = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("vi"));
    if (vi) u.voice = vi;
    synth.speak(u);
  } catch {
    /* Web Speech API unavailable — nothing more we can do */
  }
}

export interface UseSpeech {
  supported: boolean;
  enabled: boolean;
  setEnabled: (b: boolean) => void;
  speak: (text: string) => void;
  /** Warm the server+browser cache for `text` without playing (e.g. next step). */
  prefetch: (text: string) => void;
  cancel: () => void;
}

/**
 * Reads cooking steps aloud in Vietnamese via the backend `/tts` endpoint
 * (OpenAI server-side synthesis) — no dependency on a locally installed voice.
 * Fetches MP3 audio for the text and plays it; a new `speak` first cancels the
 * previous audio and aborts any in-flight request so steps never overlap.
 * `supported` is always true: synthesis happens on the server, and cooking mode
 * is only reachable while logged in (so the authed request always has a token).
 */
export function useSpeech(): UseSpeech {
  const [enabled, setEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    // Also stop any browser-synthesis fallback that may be speaking.
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled) return;
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      api
        .get("/tts", {
          params: { text, v: TTS_VERSION },
          responseType: "blob",
          signal: controller.signal,
        })
        .then((res) => {
          if (controller.signal.aborted) return;
          const url = URL.createObjectURL(res.data as Blob);
          urlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          // Ignore autoplay-policy rejections (e.g. first read before a gesture)
          // so they don't surface as unhandled promise rejections.
          void audio.play().catch(() => {});
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          // eslint-disable-next-line no-console
          console.warn("[useSpeech] TTS fetch failed, falling back to browser voice:", err);
          // Server TTS unavailable (edge-tts flake / 502) → speak locally so the
          // user still hears the step instead of waiting on nothing.
          browserSpeak(text);
        });
    },
    [enabled, cancel],
  );

  // Fire-and-forget request to warm the cache for an upcoming step. Same `text`
  // → same server cache key as `speak`, so the later `speak` resolves instantly.
  const prefetch = useCallback((text: string) => {
    if (!enabled) return;
    api.get("/tts", { params: { text, v: TTS_VERSION }, responseType: "blob" }).catch(() => {});
  }, [enabled]);

  return { supported: true, enabled, setEnabled, speak, prefetch, cancel };
}
