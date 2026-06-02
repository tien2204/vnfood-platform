'use client';

import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Clock, Volume2, VolumeX, Mic, MicOff } from 'lucide-react';
import { CountdownTimer } from './CountdownTimer';
import { useWakeLock } from '@/lib/hooks/useWakeLock';
import { useSpeech } from '@/lib/hooks/useSpeech';
import { useVoiceCommands } from '@/lib/hooks/useVoiceCommands';
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
