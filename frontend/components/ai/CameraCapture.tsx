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
  // Mirrors `open` so the async toBlob callback can bail if the modal closed.
  const openRef = useRef(open);
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
  // State resets live in the close handlers (handleClose/handleUse) so this
  // effect performs no synchronous setState.
  useEffect(() => {
    openRef.current = open;
    if (!open) return;
    // startStream synchronizes with the camera (an external system) and may
    // setError synchronously; that is the intended effect behavior here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startStream("environment");
    return () => stopStream();
  }, [open, startStream, stopStream]);

  // Attach the active stream once the <video> element is actually mounted.
  // Guards against a race on retake/switch where startStream resolves before
  // React re-renders the live-preview branch.
  useEffect(() => {
    if (!open || review || error) return;
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [open, review, error]);

  const handleClose = useCallback(() => {
    stopStream();
    if (review) URL.revokeObjectURL(review.url);
    setReview(null);
    setFacingMode("environment");
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
        // Modal was closed before the async encode finished: don't leak the URL.
        if (!openRef.current) {
          URL.revokeObjectURL(url);
          return;
        }
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
    setFacingMode("environment");
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
