'use client';

import { useEffect, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';

interface CountdownTimerProps {
  totalSeconds: number;
  onComplete?: () => void;
  autoStart?: boolean;
}

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

export function CountdownTimer({ totalSeconds, onComplete, autoStart = false }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const [running, setRunning] = useState(autoStart);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    setRemaining(totalSeconds);
    setRunning(false);
    setCompleted(false);
  }, [totalSeconds]);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          setRunning(false);
          setCompleted(true);
          playBeep();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification('Hết giờ!', { body: 'Bước nấu ăn hiện tại đã xong' });
          }
          onComplete?.();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, remaining, onComplete]);

  const reset = useCallback(() => {
    setRemaining(totalSeconds);
    setRunning(false);
    setCompleted(false);
  }, [totalSeconds]);

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
          onClick={() => setRunning((r) => !r)}
          disabled={completed && remaining === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#E85D26] text-[#E85D26] hover:bg-[#E85D26] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {running ? 'Tạm dừng' : 'Bắt đầu'}
        </button>
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#E8DDD4] text-[#7C6A56] hover:border-[#7C6A56] transition-colors text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Làm lại
        </button>
      </div>
    </div>
  );
}
