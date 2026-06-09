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
          <circle cx="64" cy="64" r={radius} stroke="var(--border)" strokeWidth="8" fill="none" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            stroke={completed ? '#2D6A4F' : 'var(--primary)'}
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>
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
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-primary text-primary hover:bg-primary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {running ? 'Tạm dừng' : 'Bắt đầu'}
        </button>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-muted-foreground hover:border-muted-foreground transition-colors text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          Làm lại
        </button>
      </div>
    </div>
  );
}
