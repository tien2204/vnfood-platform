# Thiết kế — Cooking Mode Advanced + Voice — sub-project 4/6

**Ngày:** 2026-06-02
**Branch:** `feat/canonical-recipes`
**Bối cảnh:** Sub-project 4 trong decomposition 6 phần (đã xong 1 meal-plan, 6 smart-shopping). Cooking mode cơ bản (Prompt 15) đã có: overlay fullscreen từng bước, phím ←/→, countdown timer mỗi bước, wake lock, progress dots, ảnh bước, xin quyền Notification. Sub-project này thêm lớp **voice (TTS + STT)** và **fix timer persist**.

---

## 1. Mục tiêu

Nâng cấp cooking mode để nấu **rảnh tay**:
- **TTS**: tự đọc bước hiện tại thành tiếng.
- **STT**: điều hướng bằng giọng nói (tiếp / lùi / đọc lại).
- **Timer bền**: 1 timer sống qua việc chuyển bước (hiện tại timer chết khi rời bước).

Frontend-only, dùng Web Speech API có sẵn trong trình duyệt. **Không backend, không model, không migration, không DB.**

## 2. Ràng buộc cứng

- **STT chỉ chạy Chrome/Edge (+ Chrome Android), cần internet** (stream audio lên server Google). KHÔNG Firefox, iOS yếu. → bắt buộc feature-detect, ẩn control khi không hỗ trợ, **luôn giữ nút + phím làm primary**.
- **TTS** hỗ trợ rộng hơn nhưng voice `vi-VN` phụ thuộc OS cài đặt; không có → đọc bằng voice default (vẫn phát, có thể sai giọng) — degrade graceful, không crash.
- Web Speech API là browser API, không phải AI hiểu ngữ nghĩa: giọng → text → **so khớp chuỗi** (keyword spotting).
- Dự án **không có test runner frontend** → verify bằng `tsc --noEmit` + pure function test qua node + manual smoke.
- Next.js client component (`'use client'` đã có); mọi browser API phải guard SSR (`typeof window`, feature-detect).

## 3. Quyết định đã chốt (với user)

- **Voice scope:** TTS + lệnh điều hướng cơ bản (`tiếp`/`lùi`/`đọc lại`). KHÔNG làm lệnh điều khiển timer bằng giọng.
- **TTS behavior:** tự đọc `"Bước N: <nội dung>"` mỗi khi chuyển bước; mặc định **BẬT**; có nút loa tắt.
- **Timer:** **1 timer bền duy nhất** — sống khi chuyển bước; bắt đầu timer bước khác thì **thay** timer cũ (không chạy song song nhiều timer).
- **Mic (STT):** mặc định **TẮT** — user bấm mic 1 lần (permission + opt-in), sau đó rảnh tay. (Tránh continuous mic hao pin + kích nhầm.)
- **Không** panel nguyên liệu trong cooking mode (giữ gọn; nguyên liệu xem ở trang detail trước khi vào).
- **Kiến trúc:** 3 unit tách bạch (hướng A): `useSpeech`, `useVoiceCommands`, timer state nhấc lên `CookingMode` + `CountdownTimer` thành presentational.

### Non-goals
- Không lệnh giọng nói cho timer ("bắt đầu hẹn giờ"/"dừng").
- Không nhiều timer song song.
- Không panel/checklist nguyên liệu.
- Không backend/model/STT offline/on-device.
- Không lưu trạng thái nấu (progress) sang session sau.

---

## 4. Thiết kế chi tiết

### 4.1 `frontend/lib/hooks/useSpeech.ts` (TTS)

```ts
interface UseSpeech {
  supported: boolean;              // 'speechSynthesis' in window
  enabled: boolean;                // user toggle, default true
  setEnabled: (b: boolean) => void;
  speak: (text: string) => void;   // cancel câu trước, chọn voice vi-VN, đọc
  cancel: () => void;
}
function useSpeech(): UseSpeech;
```

- `supported` = `typeof window !== 'undefined' && 'speechSynthesis' in window`.
- Chọn voice: `speechSynthesis.getVoices().find(v => v.lang.toLowerCase().startsWith('vi'))`. Voices load **bất đồng bộ** → đăng ký `speechSynthesis.onvoiceschanged` để cập nhật voice đã chọn. Không có voice vi → để `utterance.lang = 'vi-VN'` và không set `.voice` (browser tự chọn) — vẫn phát.
- `speak(text)`: nếu `!supported || !enabled` → no-op. Ngược lại `speechSynthesis.cancel()` rồi tạo `SpeechSynthesisUtterance(text)`, set `lang='vi-VN'` + voice (nếu có), `speechSynthesis.speak(u)`.
- `cancel()`: `speechSynthesis.cancel()` nếu supported.
- Cleanup: hook không tự cancel on unmount (consumer gọi); nhưng expose `cancel` để `CookingMode` gọi khi đóng.

### 4.2 `frontend/lib/hooks/useVoiceCommands.ts` (STT)

```ts
export type VoiceCommand = "next" | "back" | "repeat";

// Pure — test được bằng node.
export function matchCommand(transcript: string): VoiceCommand | null;

interface UseVoiceCommands {
  supported: boolean;     // SpeechRecognition | webkitSpeechRecognition in window
  listening: boolean;
  toggle: () => void;     // start/stop; default OFF
}
function useVoiceCommands(onCommand: (cmd: VoiceCommand) => void): UseVoiceCommands;
```

- `matchCommand(transcript)`: lowercase + trim. Trả `VoiceCommand` đầu tiên khớp:
  - `next`: chứa `"tiếp"` | `"sau"` | `"tiếp theo"`
  - `back`: chứa `"lùi"` | `"trước"` | `"quay lại"`
  - `repeat`: chứa `"đọc lại"` | `"nhắc lại"` | `"lặp lại"`
  - không khớp → `null`. (Thứ tự kiểm tra: repeat → back → next, để cụm dài ưu tiên; "quay lại" chứa "lại" không được nhầm thành repeat vì repeat dùng "đọc lại"/"lặp lại"/"nhắc lại" — kiểm cụm đủ.)
- `supported` = có `window.SpeechRecognition || window.webkitSpeechRecognition`.
- Recognition config: `lang='vi-VN'`, `continuous=true`, `interimResults=false`.
- `onresult`: lấy transcript của result cuối → `matchCommand` → nếu khác null gọi `onCommandRef.current(cmd)`.
- **`onCommand` lưu trong `useRef`** và cập nhật mỗi render → tránh re-create recognition khi parent re-render (đúng bug effect-deps đã ghi session-state: callback trong deps gây churn).
- `onend`: nếu `listeningRef.current === true` → `recognition.start()` lại (Chrome tự ngắt sau im lặng), bọc `try/catch` (Chrome đôi khi throw nếu start quá nhanh).
- `toggle()`: bật → `start()` (browser xin quyền mic), set listening true; tắt → set listening false rồi `stop()` (onend không restart vì cờ false).
- Cleanup on unmount: set listening false + `stop()`.

### 4.3 `CountdownTimer.tsx` → controlled/presentational

Hiện tại `CountdownTimer` tự giữ `remaining/running/completed` + interval nội bộ → bị reset khi remount theo `key`. Refactor thành **controlled**:

```ts
interface CountdownTimerProps {
  totalSeconds: number;
  remaining: number;
  running: boolean;
  completed: boolean;
  onToggle: () => void;   // start/pause
  onReset: () => void;
}
```

- Bỏ `useState`/`useEffect` interval + bỏ `playBeep`/Notification khỏi đây (chuyển lên parent vì timer phải tick cả khi component này không mount).
- Chỉ render vòng tròn SVG (progress = `(totalSeconds - remaining)/totalSeconds`), số phút:giây, 2 nút (toggle/reset) gọi callback.
- Giữ nguyên style/màu hiện có.

### 4.4 `CookingMode.tsx` — wiring + timer state

**Timer state (nhấc lên):**
```ts
type CookTimer = { stepIndex: number; totalSeconds: number; remaining: number; running: boolean; completed: boolean };
const [timer, setTimer] = useState<CookTimer | null>(null);
```
- Một `useEffect` chạy `setInterval(1000)` khi `timer?.running && timer.remaining > 0`: giảm `remaining`; chạm 0 → `running=false, completed=true`, `playBeep()` + Notification "Hết giờ!". Cleanup clear interval.
- Bước hiện tại `step.timer_seconds > 0`:
  - Nếu `timer?.stepIndex === currentStep` → render `CountdownTimer` controlled bằng `timer`.
  - Nếu không → render `CountdownTimer` ở trạng thái idle (`totalSeconds = step.timer_seconds`, `remaining = step.timer_seconds`, `running=false`); bấm toggle → `setTimer({ stepIndex: currentStep, totalSeconds, remaining, running:true, completed:false })` (thay timer cũ).
- **Indicator nổi**: khi `timer && timer.stepIndex !== currentStep` → badge góc dưới ("Bước {stepIndex+1} · mm:ss", màu xanh nếu completed); bấm → `setCurrentStep(timer.stepIndex)`.
- `playBeep` (giữ logic AudioContext cũ) + Notification dời vào CookingMode.

**Voice wiring:**
```ts
const speech = useSpeech();
const voice = useVoiceCommands((cmd) => {
  if (cmd === "next") setCurrentStep((s) => Math.min(total - 1, s + 1));
  else if (cmd === "back") setCurrentStep((s) => Math.max(0, s - 1));
  else if (cmd === "repeat") speakStep(currentStep);
});
```
- `speakStep(i)`: `speech.speak(\`Bước ${i+1}: ${steps[i].content}\`)`.
- `useEffect([currentStep])`: nếu `speech.enabled && speech.supported` → `speakStep(currentStep)` (tự đọc khi đổi bước; cũng đọc bước đầu khi mở).
- **Lưu ý closure:** callback `useVoiceCommands` đọc `currentStep`/`speakStep` mới nhất qua ref (hook tự lo) — `setCurrentStep` dùng functional update nên an toàn; `repeat` cần currentStep mới → để `onCommand` ref cập nhật mỗi render (đã thiết kế ở 4.2).

**Header controls** (cạnh nút "Thoát"):
- Nếu `speech.supported`: nút loa `speech.enabled ? Volume2 : VolumeX` → `speech.setEnabled(!enabled)` (tắt thì cũng `speech.cancel()`).
- Nếu `voice.supported`: nút mic `voice.listening ? Mic + badge "Đang nghe" (pulse) : MicOff` → `voice.toggle()`.
- Cả hai control ẩn hoàn toàn khi không supported.

**Cleanup khi đóng** (`onClose` / unmount): `speech.cancel()`, voice stop (hook tự cleanup), clear interval (effect tự cleanup). Wake lock giữ nguyên.

### 4.5 Entry point
`RecipeDetailClient` mở `<CookingMode recipe={recipe} onClose=... />` — **không đổi signature** (không truyền currentServings vì bỏ panel nguyên liệu). Không thay đổi gì ở RecipeDetailClient.

---

## 5. Data flow tóm tắt

```
mở cooking mode → speakStep(0) [nếu loa bật]
đổi bước (nút/phím/voice) → setCurrentStep → effect → speakStep(N)
voice "tiếp"/"lùi" → setCurrentStep (functional)
voice "đọc lại" → speakStep(currentStep)
bấm Bắt đầu timer (bước có timer_seconds) → setTimer(stepIndex=current, running=true)
timer tick ở parent interval (độc lập step đang xem)
rời sang bước khác → indicator nổi hiện timer của bước cũ
timer = 0 → beep + Notification, indicator xanh
đóng → cancel TTS + stop STT + clear interval
```

## 6. Files
- **New:** `frontend/lib/hooks/useSpeech.ts`
- **New:** `frontend/lib/hooks/useVoiceCommands.ts` (gồm `matchCommand` export)
- **Modify:** `frontend/components/recipes/CountdownTimer.tsx` (controlled)
- **Modify:** `frontend/components/recipes/CookingMode.tsx` (timer state lifted + voice wiring + header controls + floating indicator)
- Không file backend, không migration.

## 7. Error handling / edge cases
- TTS/STT unsupported → ẩn control tương ứng; nút + phím ←/→ + click progress dots vẫn điều hướng đủ.
- STT auto-restart: guard bằng `listeningRef` + `try/catch` quanh `start()`.
- `speak` khi đang đọc → `cancel()` trước (tránh chồng tiếng khi lướt nhanh nhiều bước).
- Mất internet → STT lặng lẽ ngừng (không có lệnh nào fire) → fallback nút. Không cố detect online state.
- Timer hết giờ khi đang ở bước khác → beep + Notification vẫn fire (interval ở parent); indicator chuyển xanh.
- Voice command nghe nhầm (tiếng ồn bếp) → chỉ map đúng 3 keyword, từ lạ → `null` (no-op).
- Recipe không có step (`hasSteps` false) → nút mở cooking mode đã disabled ở detail (không đổi).

## 8. Testing / verification
- **Pure unit (node, như shopping-links):** `matchCommand` — feed transcript mẫu, assert: "tiếp theo nào"→next, "quay lại"→back, "đọc lại giúp"→repeat, "abc"→null, "" → null.
- **`npx tsc --noEmit`**: 0 lỗi mới (baseline: 3-5 lỗi pre-existing ở admin/profile/recognize pages).
- **Manual (Chrome desktop/Android):**
  1. Vào cooking mode → tự đọc "Bước 1: …".
  2. Bấm mic → cho phép → nói "tiếp" → sang bước 2 + tự đọc; "lùi" → về; "đọc lại" → đọc lại bước hiện tại.
  3. Tắt loa → không đọc nữa; bật lại → đọc.
  4. Bước có timer → Bắt đầu → sang bước khác → indicator nổi đếm tiếp → hết giờ beep + notification; bấm indicator → nhảy về bước timer.
  5. Firefox/iOS → nút mic ẩn, mọi thứ khác chạy.

## 9. Vị trí trong decomposition
Sub-project 4/6. Đã xong: 1 (meal-plan enhance), 6 (smart shopping). Còn lại sau cái này: 2 (personalization engine — embedding), 3 (substitution — curated + LLM), 5 (video).
