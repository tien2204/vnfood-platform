# Live Camera Capture on /recognize — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users capture a photo with their device camera (live, in-browser) on `/recognize`, in addition to the existing upload / drag-drop / URL flows.

**Architecture:** Add one new client component `CameraCapture.tsx` — a controlled full-screen modal that runs `getUserMedia`, shows a live `<video>`, captures a frame to `<canvas>` → `File`, with a review step (Retake / Use photo). Wire a "Chụp ảnh" button into the existing `ImageDropzone`, which opens the modal and feeds the captured `File` through the existing `handleFile` validation → `onSelect`. No backend changes; the captured `File` reuses `POST /ai/recognize`.

**Tech Stack:** Next.js 16 (App Router) + React 19, TypeScript, Tailwind CSS, lucide-react icons. No test runner is configured — verification is `npx tsc --noEmit`, `npm run lint`, and manual browser testing (per spec).

**Spec:** `docs/superpowers/specs/2026-06-16-recognize-camera-capture-design.md`

---

## File Structure

- **Create** `frontend/components/ai/CameraCapture.tsx` — controlled modal owning the camera stream lifecycle, capture, and review step. Props: `{ open: boolean; onClose: () => void; onCapture: (file: File) => void }`.
- **Modify** `frontend/components/ai/ImageDropzone.tsx` — add a "Chụp ảnh" button + local `cameraOpen` state; render `<CameraCapture>`; route captured file through existing `handleFile`.
- **No change** `frontend/app/recognize/page.tsx` — captured file flows through `ImageDropzone.onSelect` → `handleSelect` unchanged.

All work happens on the current branch `feat/monngonmoingay-restyle`.

---

## Verification commands (used throughout)

Run from `frontend/`:
- Typecheck: `npx tsc --noEmit`
- Lint: `npm run lint`

There is no unit-test runner; do **not** invent one. Each task ends with typecheck + lint + a manual check, then a commit.

---

### Task 1: Create CameraCapture modal (live stream + capture + review)

**Files:**
- Create: `frontend/components/ai/CameraCapture.tsx`

- [ ] **Step 1: Create the component file**

Create `frontend/components/ai/CameraCapture.tsx` with the full content below.

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, SwitchCamera, X, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

type FacingMode = "environment" | "user";

export default function CameraCapture({ open, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [error, setError] = useState<string | null>(null);
  // Blob URL of the just-captured still; null = live preview mode.
  const [review, setReview] = useState<{ url: string; file: File } | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(
    async (mode: FacingMode) => {
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Trình duyệt không hỗ trợ camera. Vui lòng tải ảnh lên thay thế.");
        return;
      }
      try {
        stopStream();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: mode },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        setError("Không truy cập được camera, vui lòng cho phép quyền hoặc tải ảnh lên.");
      }
    },
    [stopStream]
  );

  // Open/close lifecycle: start stream when opened, fully clean up when closed.
  useEffect(() => {
    if (!open) return;
    setReview(null);
    setFacingMode("environment");
    startStream("environment");
    return () => stopStream();
  }, [open, startStream, stopStream]);

  const handleClose = useCallback(() => {
    stopStream();
    if (review) URL.revokeObjectURL(review.url);
    setReview(null);
    onClose();
  }, [stopStream, review, onClose]);

  const handleSwitch = useCallback(() => {
    const next: FacingMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startStream(next);
  }, [facingMode, startStream]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        stopStream();
        setReview({ url, file });
      },
      "image/jpeg",
      0.92
    );
  }, [stopStream]);

  const handleRetake = useCallback(() => {
    if (review) URL.revokeObjectURL(review.url);
    setReview(null);
    startStream(facingMode);
  }, [review, startStream, facingMode]);

  const handleUse = useCallback(() => {
    if (!review) return;
    const { file, url } = review;
    URL.revokeObjectURL(url);
    setReview(null);
    onCapture(file);
    onClose();
  }, [review, onCapture, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="font-semibold">Chụp ảnh món ăn</span>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Đóng"
          className="p-2 rounded-full hover:bg-white/10"
        >
          <X className="w-6 h-6" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center gap-4 text-center text-white px-6">
            <AlertTriangle className="w-10 h-10 text-yellow-400" />
            <p className="max-w-sm">{error}</p>
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold"
            >
              Đóng
            </button>
          </div>
        ) : review ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={review.url} alt="Ảnh vừa chụp" className="max-h-full max-w-full object-contain" />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-h-full max-w-full object-contain"
          />
        )}
      </div>

      {/* Controls */}
      {!error && (
        <div className="px-4 py-6 flex items-center justify-center gap-6">
          {review ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-white/40 text-white text-sm font-medium hover:bg-white/10"
              >
                <RefreshCw className="w-4 h-4" />
                Chụp lại
              </button>
              <button
                type="button"
                onClick={handleUse}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-white text-sm font-semibold"
              >
                Dùng ảnh này
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSwitch}
                aria-label="Đổi camera"
                className="p-3 rounded-full border border-white/40 text-white hover:bg-white/10"
              >
                <SwitchCamera className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleCapture}
                aria-label="Chụp"
                className="w-16 h-16 rounded-full bg-white flex items-center justify-center ring-4 ring-white/30 active:scale-95 transition-transform"
              >
                <Camera className="w-7 h-7 text-black" />
              </button>
              <div className="w-11" aria-hidden /> {/* spacer to keep capture button centered */}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: PASS, no errors referencing `CameraCapture.tsx`.

- [ ] **Step 3: Lint**

Run (from `frontend/`): `npm run lint`
Expected: PASS (no new errors). The `@next/next/no-img-element` disable comment is intentional for the blob preview.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/ai/CameraCapture.tsx
git commit -m "feat(recognize): add CameraCapture live-camera modal component"
```

---

### Task 2: Wire "Chụp ảnh" button into ImageDropzone

**Files:**
- Modify: `frontend/components/ai/ImageDropzone.tsx`

- [ ] **Step 1: Add imports**

In `frontend/components/ai/ImageDropzone.tsx`, change the existing imports at the top so that:
- the lucide import also brings in `Camera`
- `CameraCapture` is imported

Replace:

```tsx
import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
```

with:

```tsx
import { useCallback, useRef, useState } from "react";
import { Upload, Camera } from "lucide-react";
import CameraCapture from "@/components/ai/CameraCapture";
```

- [ ] **Step 2: Add cameraOpen state**

Inside `ImageDropzone`, just after the existing `const [url, setUrl] = useState("");` line, add:

```tsx
  const [cameraOpen, setCameraOpen] = useState(false);
```

- [ ] **Step 3: Render the "Chụp ảnh" button and the modal**

The existing URL row is wrapped in `{onSelectUrl && ( ... )}`. We want the camera button to always show (independent of `onSelectUrl`). Insert a new block **immediately before** the `{onSelectUrl && (` block.

Find this line:

```tsx
      {onSelectUrl && (
        <div className="w-full max-w-xl flex items-center gap-2">
```

Insert directly above it:

```tsx
      <button
        type="button"
        onClick={() => !disabled && setCameraOpen(true)}
        disabled={disabled}
        className="w-full max-w-xl h-11 flex items-center justify-center gap-2 rounded-lg border border-border bg-muted text-sm font-semibold text-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
      >
        <Camera className="w-4 h-4" />
        Chụp ảnh
      </button>

      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleFile}
      />

```

Note: `handleFile` already exists in this component (it runs `validate` then `onSelect`), so the captured file reuses the same 10MB / image-type validation as uploads.

- [ ] **Step 4: Typecheck**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: PASS. Confirms `handleFile`'s `(file: File) => void` signature matches `CameraCapture`'s `onCapture` prop.

- [ ] **Step 5: Lint**

Run (from `frontend/`): `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/ai/ImageDropzone.tsx
git commit -m "feat(recognize): add Chụp ảnh button opening CameraCapture in ImageDropzone"
```

---

### Task 3: Manual verification

**Files:** none (manual QA against running dev server).

- [ ] **Step 1: Start the frontend dev server**

Run (from `frontend/`): `npm run dev`
Open `http://localhost:3000/recognize`.

- [ ] **Step 2: Desktop webcam happy path**

1. Click **"Chụp ảnh"** → browser prompts for camera permission → Allow.
2. Confirm live video shows in a full-screen black modal.
3. Click the round capture button → still image appears with **"Chụp lại"** and **"Dùng ảnh này"**.
4. Click **"Chụp lại"** → live video resumes.
5. Capture again → click **"Dùng ảnh này"** → modal closes, page shows "Đang nhận diện..." then the recognition result (same flow as upload).

Expected: result renders via existing `RecognitionResult` / `RecipeCarousel`.

- [ ] **Step 3: Permission-denied path**

1. Reload, click **"Chụp ảnh"**, and **Block** the camera permission (or use a device with no camera).
2. Confirm the modal shows the warning message "Không truy cập được camera..." with a working **"Đóng"** button.
3. Confirm the upload dropzone still works after closing.

- [ ] **Step 4: Camera released (no stuck light)**

After closing the modal (via X, "Đóng", or "Dùng ảnh này"), confirm the webcam indicator light turns off — verifies `stopStream()` cleanup.

- [ ] **Step 5: Switch camera (mobile, if available)**

On a phone (localhost over HTTPS or via dev tunnel), tap **"Chụp ảnh"**, then the switch-camera icon → confirm it toggles front/back without leaving a stuck stream.

- [ ] **Step 6: Final typecheck + lint sweep**

Run (from `frontend/`): `npx tsc --noEmit && npm run lint`
Expected: both PASS.

---

## Self-Review

**Spec coverage:**
- Live in-web camera via `getUserMedia` → Task 1 `startStream`. ✅
- Modal with live `<video>` → Task 1. ✅
- `facingMode` default `environment` + switch button → Task 1 `handleSwitch`. ✅
- Capture via canvas → `File` (`camera-<ts>.jpg`, `image/jpeg`) → Task 1 `handleCapture`. ✅
- Review step (Chụp lại / Dùng ảnh này) → Task 1 `handleRetake` / `handleUse`. ✅
- Stream cleanup on close/unmount/switch + revoke blob URL → Task 1 `stopStream` / `useEffect` cleanup / `handleClose`. ✅
- Permission-denied & unsupported-browser messaging → Task 1 `error` state. ✅
- "Chụp ảnh" button in ImageDropzone, reuses validation → Task 2 (`handleFile`). ✅
- `disabled` when loading → Task 2 button `disabled={disabled}`. ✅
- No backend change → confirmed; page.tsx untouched. ✅
- Out of scope (history, crop, video) → not implemented. ✅

**Placeholder scan:** No TBD/TODO; all code blocks complete. ✅

**Type consistency:** `onCapture: (file: File) => void` (Task 1) matches `handleFile: (file: File) => void` (Task 2). `open`/`onClose`/`onCapture` props consistent across both tasks. ✅
