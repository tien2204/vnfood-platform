# Cooking Mode Advanced + Voice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hands-free cooking to the existing fullscreen Cooking Mode — TTS auto-reads each step, voice commands navigate (tiếp/lùi/đọc lại), and a single timer survives step changes.

**Architecture:** Frontend-only, Web Speech API. Two new client hooks (`useSpeech` for TTS, `useVoiceCommands` for STT + a pure `matchCommand`), `CountdownTimer` refactored from self-stateful to controlled/presentational, and `CookingMode` lifts the timer state up (single interval at parent) and wires the voice hooks + header toggles + a floating "timer running on another step" indicator.

**Tech Stack:** Next.js 16 (App Router) client components, React 19, TypeScript, Tailwind v4, lucide-react icons, browser `speechSynthesis` + `SpeechRecognition`/`webkitSpeechRecognition`.

**Branch:** `feat/canonical-recipes` (already checked out). No backend, no migration, no DB.

**Verification note:** Project has **no frontend test runner**. Pure logic (`matchCommand`) is verified with an inline `node` script (precedent: `frontend/lib/shopping-links.ts`). Everything else is verified with `npx tsc --noEmit` (must add 0 errors beyond the known pre-existing ones in `app/admin/page.tsx`, `app/me/profile/page.tsx`, `app/recognize/page.tsx`) plus manual smoke in Chrome. All commands run from `frontend/`.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/lib/hooks/useVoiceCommands.ts` (new) | Pure `matchCommand(transcript)` + STT hook (mic toggle, continuous recognition, vi-VN, auto-restart). |
| `frontend/lib/hooks/useSpeech.ts` (new) | TTS hook: pick vi-VN voice, `speak`/`cancel`, `enabled` toggle. |
| `frontend/components/recipes/CountdownTimer.tsx` (modify) | Controlled/presentational ring + buttons; no internal interval/state. |
| `frontend/components/recipes/CookingMode.tsx` (modify) | Owns single timer state + interval, floating indicator, voice wiring, header toggles. |

Existing entry point `frontend/components/recipes/RecipeDetailClient.tsx` is **unchanged** (`<CookingMode recipe={recipe} onClose={...} />` signature stays).

---

### Task 1: Pure `matchCommand` parser

**Files:**
- Create: `frontend/lib/hooks/useVoiceCommands.ts`

- [ ] **Step 1: Create the file with the type + pure parser**

Create `frontend/lib/hooks/useVoiceCommands.ts`:

```ts
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
```

- [ ] **Step 2: Verify `matchCommand` with an inline node script**

Run from `frontend/`:

```bash
node --input-type=module -e "
const matchCommand=(transcript)=>{const t=transcript.toLowerCase().trim();if(!t)return null;if(t.includes('đọc lại')||t.includes('nhắc lại')||t.includes('lặp lại'))return 'repeat';if(t.includes('quay lại')||t.includes('lùi')||t.includes('trước'))return 'back';if(t.includes('tiếp')||t.includes('sau'))return 'next';return null;};
const cases=[['tiếp theo nào','next'],['cho tôi xem bước sau','next'],['lùi lại','back'],['quay lại','back'],['bước trước','back'],['đọc lại giúp','repeat'],['nhắc lại','repeat'],['lặp lại đi','repeat'],['abc xyz',null],['',null]];
let ok=true;for(const [inp,exp] of cases){const got=matchCommand(inp);const pass=got===exp;if(!pass)ok=false;console.log((pass?'PASS':'FAIL'),JSON.stringify(inp),'->',got,'(exp',exp+')');}
console.log(ok?'ALL PASS':'FAILURES');
"
```

Expected: every line `PASS`, final line `ALL PASS`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (only the 3 known pre-existing files may appear).

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/hooks/useVoiceCommands.ts
git commit -m "feat(cooking): pure matchCommand voice parser"
```

---

### Task 2: `useVoiceCommands` STT hook

**Files:**
- Modify: `frontend/lib/hooks/useVoiceCommands.ts` (append imports + hook)

- [ ] **Step 1: Add React imports at the top of the file**

Change the first line of `frontend/lib/hooks/useVoiceCommands.ts` from:

```ts
"use client";

export type VoiceCommand = "next" | "back" | "repeat";
```

to:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceCommand = "next" | "back" | "repeat";
```

- [ ] **Step 2: Append the hook to the end of the file**

Append to `frontend/lib/hooks/useVoiceCommands.ts`:

```ts
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/hooks/useVoiceCommands.ts
git commit -m "feat(cooking): useVoiceCommands STT hook (vi-VN, auto-restart)"
```

---

### Task 3: `useSpeech` TTS hook

**Files:**
- Create: `frontend/lib/hooks/useSpeech.ts`

- [ ] **Step 1: Create the file**

Create `frontend/lib/hooks/useSpeech.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/hooks/useSpeech.ts
git commit -m "feat(cooking): useSpeech TTS hook (vi-VN voice pick)"
```

---

### Task 4: Controlled `CountdownTimer` + lifted timer state in `CookingMode`

These two files **must change together** so the build stays green: making `CountdownTimer` controlled breaks its old caller, and `CookingMode` is that caller.

**Files:**
- Modify: `frontend/components/recipes/CountdownTimer.tsx` (full replace)
- Modify: `frontend/components/recipes/CookingMode.tsx` (full replace — timer lifted, no voice yet)

- [ ] **Step 1: Replace `CountdownTimer.tsx` with a controlled version**

Replace the entire contents of `frontend/components/recipes/CountdownTimer.tsx` with:

```tsx
'use client';

import { Play, Pause, RotateCcw } from 'lucide-react';

interface CountdownTimerProps {
  totalSeconds: number;
  remaining: number;
  running: boolean;
  completed: boolean;
  onToggle: () => void;
  onReset: () => void;
}

// Presentational only — all timer state (and the ticking interval, beep, and
// notification) lives in CookingMode so a timer survives step navigation.
export function CountdownTimer({
  totalSeconds,
  remaining,
  running,
  completed,
  onToggle,
  onReset,
}: CountdownTimerProps) {
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? (totalSeconds - remaining) / totalSeconds : 0;

  return (
    <div className="flex flex-col items-center gap-4 my-6">
      <div className="relative w-36 h-36">
        <svg className="w-36 h-36 transform -rotate-90" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} stroke="#E8DDD4" strokeWidth="8" fill="none" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke={completed ? '#2D6A4F' : '#E85D26'}
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-[#1C1209]" style={{ fontFamily: 'var(--font-heading)' }}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
          {completed && (
            <span className="text-xs font-semibold text-[#2D6A4F] mt-0.5">Xong!</span>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onToggle}
          disabled={completed && remaining === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#E85D26] text-[#E85D26] hover:bg-[#E85D26] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {running ? 'Tạm dừng' : 'Bắt đầu'}
        </button>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#E8DDD4] text-[#7C6A56] hover:border-[#7C6A56] transition-colors text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Làm lại
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `CookingMode.tsx` with the lifted-timer version (no voice yet)**

Replace the entire contents of `frontend/components/recipes/CookingMode.tsx` with:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { CountdownTimer } from './CountdownTimer';
import { useWakeLock } from '@/lib/hooks/useWakeLock';
import type { RecipeDetail } from '@/lib/types';

interface CookingModeProps {
  recipe: RecipeDetail;
  onClose: () => void;
}

// A single timer that survives step navigation. Starting a timer on a new step
// replaces any existing one (per spec: one persistent timer, not concurrent).
type CookTimer = {
  stepIndex: number;
  totalSeconds: number;
  remaining: number;
  running: boolean;
  completed: boolean;
};

function playBeep() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioCtx: typeof window.AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.3;
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {}
}

export function CookingMode({ recipe, onClose }: CookingModeProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [timer, setTimer] = useState<CookTimer | null>(null);
  const steps = recipe.steps;
  const total = steps.length;
  const step = steps[currentStep];

  useWakeLock(true);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Single ticking interval, recreated only when running toggles.
  useEffect(() => {
    if (!timer?.running) return;
    const id = setInterval(() => {
      setTimer((t) => {
        if (!t || !t.running) return t;
        if (t.remaining <= 1) {
          playBeep();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('Hết giờ!', { body: `Bước ${t.stepIndex + 1} đã xong` });
          }
          return { ...t, remaining: 0, running: false, completed: true };
        }
        return { ...t, remaining: t.remaining - 1 };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [timer?.running]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && currentStep < total - 1) {
        setCurrentStep((s) => s + 1);
      } else if (e.key === 'ArrowLeft' && currentStep > 0) {
        setCurrentStep((s) => s - 1);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentStep, total, onClose]);

  // Lock body scroll while cooking mode is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const stepTimerSeconds = step.timer_seconds ?? 0;
  const isCurrentStepTimer = timer?.stepIndex === currentStep;

  function toggleCurrentTimer() {
    setTimer((t) => {
      if (t && t.stepIndex === currentStep) {
        if (t.completed) {
          return { stepIndex: currentStep, totalSeconds: stepTimerSeconds, remaining: stepTimerSeconds, running: true, completed: false };
        }
        return { ...t, running: !t.running };
      }
      // No timer for this step (or it belongs to another step) → start fresh, replacing any other.
      return { stepIndex: currentStep, totalSeconds: stepTimerSeconds, remaining: stepTimerSeconds, running: true, completed: false };
    });
  }

  function resetCurrentTimer() {
    setTimer({ stepIndex: currentStep, totalSeconds: stepTimerSeconds, remaining: stepTimerSeconds, running: false, completed: false });
  }

  const stepImageUrl = step.image_url
    ? step.image_url.startsWith('http')
      ? step.image_url
      : `${process.env.NEXT_PUBLIC_UPLOAD_URL}/${step.image_url}`
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-[#FFFBF5] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E8DDD4] bg-white shrink-0">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm text-[#7C6A56] hover:text-[#E85D26] transition-colors font-medium"
        >
          <X className="w-4 h-4" />
          Thoát
        </button>
        <span
          className="font-bold italic text-[#1C1209] text-base truncate max-w-[50vw] text-center"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          {recipe.title}
        </span>
        <span className="text-sm text-[#7C6A56] shrink-0">
          {currentStep + 1} / {total}
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-2xl">
          {/* Step number badge */}
          <div className="flex justify-center mb-6">
            <div
              className="w-16 h-16 rounded-full bg-[#E85D26]/10 flex items-center justify-center text-3xl font-bold text-[#E85D26]"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              {currentStep + 1}
            </div>
          </div>

          {/* Step content */}
          <p className="text-xl md:text-2xl leading-relaxed text-[#1C1209] text-center mb-6">
            {step.content}
          </p>

          {/* Timer badge hint */}
          {stepTimerSeconds > 0 && (
            <div className="flex justify-center mb-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-[#7C6A56] bg-[#F7F0E8] px-3 py-1 rounded-full border border-[#E8DDD4]">
                <Clock className="w-3 h-3" />
                {Math.floor(stepTimerSeconds / 60)}:{String(stepTimerSeconds % 60).padStart(2, '0')} phút
              </span>
            </div>
          )}

          {/* Countdown timer (controlled by lifted state) */}
          {stepTimerSeconds > 0 && (
            <CountdownTimer
              totalSeconds={stepTimerSeconds}
              remaining={isCurrentStepTimer ? timer!.remaining : stepTimerSeconds}
              running={isCurrentStepTimer ? timer!.running : false}
              completed={isCurrentStepTimer ? timer!.completed : false}
              onToggle={toggleCurrentTimer}
              onReset={resetCurrentTimer}
            />
          )}

          {/* Step image */}
          {stepImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stepImageUrl}
              alt={`Bước ${currentStep + 1}`}
              className="rounded-xl w-full max-w-md mx-auto object-cover mt-4"
            />
          )}
        </div>
      </div>

      {/* Floating indicator: a timer is running on a different step */}
      {timer && timer.stepIndex !== currentStep && (
        <button
          onClick={() => setCurrentStep(timer.stepIndex)}
          className={`fixed bottom-24 right-4 z-50 inline-flex items-center gap-2 px-3 py-2 rounded-full shadow-lg text-sm font-semibold text-white transition-colors ${timer.completed ? 'bg-[#2D6A4F]' : 'bg-[#E85D26]'}`}
        >
          <Clock className="w-4 h-4" />
          Bước {timer.stepIndex + 1} · {Math.floor(timer.remaining / 60)}:{String(timer.remaining % 60).padStart(2, '0')}
        </button>
      )}

      {/* Progress dots */}
      {total > 1 && (
        <div className="flex justify-center items-center gap-2 py-3 shrink-0">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              aria-label={`Bước ${i + 1}`}
              className={`h-3 rounded-full transition-all duration-300 touch-manipulation ${
                i === currentStep
                  ? 'bg-[#E85D26] w-10'
                  : i < currentStep
                  ? 'bg-[#E85D26]/40 w-3'
                  : 'bg-[#E8DDD4] w-3'
              }`}
              style={{ minWidth: i === currentStep ? 40 : 12 }}
            />
          ))}
        </div>
      )}

      {/* Footer navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#E8DDD4] bg-white shrink-0">
        <button
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={currentStep === 0}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#E8DDD4] text-[#7C6A56] hover:border-[#E85D26] hover:text-[#E85D26] disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium text-sm"
        >
          <ChevronLeft className="w-5 h-5" />
          Bước trước
        </button>

        {currentStep < total - 1 ? (
          <button
            onClick={() => setCurrentStep((s) => Math.min(total - 1, s + 1))}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#E85D26] hover:bg-[#D44E1E] text-white font-semibold transition-colors text-sm"
          >
            Bước sau
            <ChevronRight className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#2D6A4F] hover:bg-[#255940] text-white font-semibold transition-colors text-sm"
          >
            Hoàn thành ✓
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. (Confirms the controlled `CountdownTimer` and its `CookingMode` caller agree on props.)

- [ ] **Step 4: Commit**

```bash
git add frontend/components/recipes/CountdownTimer.tsx frontend/components/recipes/CookingMode.tsx
git commit -m "feat(cooking): persistent single timer (lift state, controlled CountdownTimer)"
```

---

### Task 5: Wire voice (TTS auto-read + STT nav) + header toggles

**Files:**
- Modify: `frontend/components/recipes/CookingMode.tsx`

- [ ] **Step 1: Add imports**

In `frontend/components/recipes/CookingMode.tsx`, change:

```tsx
import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { CountdownTimer } from './CountdownTimer';
import { useWakeLock } from '@/lib/hooks/useWakeLock';
import type { RecipeDetail } from '@/lib/types';
```

to:

```tsx
import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Clock, Volume2, VolumeX, Mic, MicOff } from 'lucide-react';
import { CountdownTimer } from './CountdownTimer';
import { useWakeLock } from '@/lib/hooks/useWakeLock';
import { useSpeech } from '@/lib/hooks/useSpeech';
import { useVoiceCommands } from '@/lib/hooks/useVoiceCommands';
import type { RecipeDetail } from '@/lib/types';
```

- [ ] **Step 2: Add the speech/voice hooks + auto-read effect + close cleanup**

In `CookingMode`, immediately after the existing line `  useWakeLock(true);` insert:

```tsx
  const speech = useSpeech();

  // Read "Bước N: <content>" aloud. Plain function (recreated each render) so it
  // always closes over the latest speech + steps; not in any dependency array.
  const speakStep = (i: number) => {
    speech.speak(`Bước ${i + 1}: ${steps[i].content}`);
  };

  const voice = useVoiceCommands((cmd) => {
    if (cmd === 'next') setCurrentStep((s) => Math.min(total - 1, s + 1));
    else if (cmd === 'back') setCurrentStep((s) => Math.max(0, s - 1));
    else if (cmd === 'repeat') speakStep(currentStep);
  });

  // Auto-read on step change and when TTS is (re)enabled.
  useEffect(() => {
    if (speech.supported && speech.enabled) speakStep(currentStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, speech.enabled, speech.supported]);

  // Stop talking when cooking mode unmounts.
  useEffect(() => () => speech.cancel(), [speech]);
```

- [ ] **Step 3: Add the speaker + mic toggles to the header**

In the header block, replace:

```tsx
        <span className="text-sm text-[#7C6A56] shrink-0">
          {currentStep + 1} / {total}
        </span>
```

with:

```tsx
        <div className="flex items-center gap-2 shrink-0">
          {speech.supported && (
            <button
              onClick={() => {
                const next = !speech.enabled;
                speech.setEnabled(next);
                if (!next) speech.cancel();
              }}
              title={speech.enabled ? 'Tắt đọc bước' : 'Bật đọc bước'}
              aria-pressed={speech.enabled}
              className={`p-1.5 rounded-lg transition-colors ${speech.enabled ? 'text-[#E85D26] bg-[#E85D26]/10' : 'text-[#7C6A56] hover:text-[#E85D26]'}`}
            >
              {speech.enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          )}
          {voice.supported && (
            <button
              onClick={voice.toggle}
              title={voice.listening ? 'Tắt điều khiển giọng nói' : 'Bật điều khiển giọng nói'}
              aria-pressed={voice.listening}
              className={`inline-flex items-center gap-1 p-1.5 rounded-lg transition-colors ${voice.listening ? 'text-[#2D6A4F] bg-[#2D6A4F]/10' : 'text-[#7C6A56] hover:text-[#2D6A4F]'}`}
            >
              {voice.listening ? <Mic className="w-4 h-4 animate-pulse" /> : <MicOff className="w-4 h-4" />}
              {voice.listening && <span className="text-[10px] font-semibold">Đang nghe</span>}
            </button>
          )}
          <span className="text-sm text-[#7C6A56]">
            {currentStep + 1} / {total}
          </span>
        </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/components/recipes/CookingMode.tsx
git commit -m "feat(cooking): voice — TTS auto-read steps + STT navigation + header toggles"
```

- [ ] **Step 6: Manual smoke test (Chrome desktop or Android)**

Start the frontend if not running (`npm run dev` in `frontend/`), open a recipe with steps, click "Bắt đầu nấu", and verify:

1. On open, the app reads "Bước 1: …" aloud.
2. Click the speaker toggle off → no reading; toggle on → reads current step.
3. Click the mic toggle, allow the permission, then say "tiếp" (next step + auto-read), "lùi" (previous), "đọc lại" (re-reads current step). Mic shows "Đang nghe".
4. On a step with a timer, click "Bắt đầu", navigate to another step → a floating pill shows "Bước N · mm:ss" counting down; let it finish → beep + "Hết giờ!" notification, pill turns green; click the pill → jumps back to that step.
5. Open in Firefox or on iOS Safari → the mic toggle is hidden; buttons, arrow keys, and progress dots still navigate; (TTS may also be hidden on unsupported browsers).

---

## Self-Review

**1. Spec coverage:**
- TTS auto-read "Bước N: content", default ON, toggle → Task 5 (speakStep, auto-read effect, speaker toggle). ✓
- STT nav tiếp/lùi/đọc lại, default OFF, feature-detect, fallback → Tasks 1, 2, 5. ✓
- Single persistent timer surviving navigation, replace-on-new, floating indicator, beep+notification → Task 4. ✓
- Controlled CountdownTimer → Task 4. ✓
- `matchCommand` pure + node verify → Task 1. ✓
- Cleanup on close (cancel TTS, stop STT, clear interval) → Task 5 (TTS unmount effect + cancel-on-disable), Task 2 (STT unmount cleanup), Task 4 (interval cleanup). ✓
- Header controls hidden when unsupported → Task 5 (`speech.supported` / `voice.supported` guards). ✓
- No backend/migration; RecipeDetailClient unchanged → confirmed, no task touches them. ✓

**2. Placeholder scan:** No "TBD"/"add error handling"/vague steps — every code step shows full code; verification steps give exact commands + expected output. ✓

**3. Type consistency:**
- `VoiceCommand = "next" | "back" | "repeat"` defined Task 1, used Tasks 2 & 5 identically. ✓
- `useVoiceCommands(onCommand)` returns `{ supported, listening, toggle }` — used in Task 5 as `voice.supported`/`voice.listening`/`voice.toggle`. ✓
- `useSpeech()` returns `{ supported, enabled, setEnabled, speak, cancel }` — used in Task 5 as `speech.supported`/`speech.enabled`/`speech.setEnabled`/`speech.speak`/`speech.cancel`. ✓
- `CountdownTimer` props `{ totalSeconds, remaining, running, completed, onToggle, onReset }` defined Task 4, passed identically by `CookingMode` in Task 4. ✓
- `CookTimer` fields `{ stepIndex, totalSeconds, remaining, running, completed }` consistent across interval, toggle, reset, and render in Task 4. ✓

No gaps found.
