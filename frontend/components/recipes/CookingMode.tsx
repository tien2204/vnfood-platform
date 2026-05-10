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

export function CookingMode({ recipe, onClose }: CookingModeProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const steps = recipe.steps;
  const total = steps.length;
  const step = steps[currentStep];

  useWakeLock(true);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

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
          {(step.timer_seconds ?? 0) > 0 && (
            <div className="flex justify-center mb-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-[#7C6A56] bg-[#F7F0E8] px-3 py-1 rounded-full border border-[#E8DDD4]">
                <Clock className="w-3 h-3" />
                {Math.floor(step.timer_seconds! / 60)}:{String(step.timer_seconds! % 60).padStart(2, '0')} phút
              </span>
            </div>
          )}

          {/* Countdown timer */}
          {(step.timer_seconds ?? 0) > 0 && (
            <CountdownTimer
              key={`step-${currentStep}`}
              totalSeconds={step.timer_seconds!}
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
