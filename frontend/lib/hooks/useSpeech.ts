"use client";

import { useCallback, useRef, useState } from "react";
import api from "@/lib/api";

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
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled) return;
      cancel();
      const controller = new AbortController();
      abortRef.current = controller;
      api
        .get("/tts", {
          params: { text },
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
          console.warn("[useSpeech] TTS fetch failed:", err);
        });
    },
    [enabled, cancel],
  );

  // Fire-and-forget request to warm the cache for an upcoming step. Same `text`
  // → same server cache key as `speak`, so the later `speak` resolves instantly.
  const prefetch = useCallback((text: string) => {
    if (!enabled) return;
    api.get("/tts", { params: { text }, responseType: "blob" }).catch(() => {});
  }, [enabled]);

  return { supported: true, enabled, setEnabled, speak, prefetch, cancel };
}
