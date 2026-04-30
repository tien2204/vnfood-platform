# 08 — Cooking Mode & Scale Recipe

## Actors: User, Guest

## Use Cases

### UC-40: Cooking Mode (Frontend only)
**Flow:**
1. User mở recipe detail
2. Click button "🍳 Bắt đầu nấu"
3. Màn hình chuyển sang full-screen cooking mode
4. Hiển thị từng bước một, lớn rõ, tối giản UI
5. Có timer countdown nếu `step.timer_seconds > 0`
6. Wake Lock API → giữ màn hình không tắt khi đang nấu
7. User swipe hoặc click Prev/Next để chuyển bước
8. Click "Thoát" để về recipe detail

**Không cần API mới** — pure frontend feature.

**Layout:**
```
┌────────────────────────────────────────┐
│ ✕ Thoát        Bánh xèo miền Tây       │
│                                        │
│ ┌──────────────────────────────────┐  │
│ │  Bước 3 / 7                      │  │
│ │                                  │  │
│ │  Đổ bột vào chảo nóng có dầu...  │  │
│ │                                  │  │
│ │  ┌──────────────┐                │  │
│ │  │   ⏱ 02:45    │  ← Countdown   │  │
│ │  │   /  03:00    │                │  │
│ │  └──────────────┘                │  │
│ │                                  │  │
│ │  [Step image nếu có]             │  │
│ └──────────────────────────────────┘  │
│                                        │
│ ●●●○○○○                                │
│                                        │
│ ◀ Bước trước          Bước sau ▶       │
└────────────────────────────────────────┘
```

**Wake Lock implementation:**
```typescript
// frontend/lib/wakeLock.ts
let wakeLock: WakeLockSentinel | null = null;

export async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) {
      console.warn('Wake Lock fail:', err);
    }
  }
}

export async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}
```

**Timer logic:**
```typescript
// useCountdown hook
const [remaining, setRemaining] = useState(timerSeconds);
const [running, setRunning] = useState(false);

useEffect(() => {
  if (!running || remaining <= 0) return;
  const id = setInterval(() => setRemaining(r => r - 1), 1000);
  return () => clearInterval(id);
}, [running, remaining]);

useEffect(() => {
  if (remaining === 0 && timerSeconds > 0) {
    // Beep sound + notification
    playSound('/sounds/timer-end.mp3');
    if (Notification.permission === 'granted') {
      new Notification('Hết giờ!', { body: `Bước ${stepNumber} đã xong` });
    }
  }
}, [remaining]);
```

### UC-41: Scale Recipe (Frontend only)
**Flow:**
1. Trên recipe detail, hiển thị "Khẩu phần: 4 người" với +/- buttons
2. User click +/- để đổi số người (giới hạn 1-20)
3. Tất cả ingredients trong list tự động cập nhật theo tỷ lệ
4. Steps không scale, giữ nguyên text

**Logic scale:**
```typescript
// frontend/lib/scaleRecipe.ts
function scaleQuantity(text: string, factor: number): string {
  // Regex: tìm số (int hoặc decimal hoặc fraction) ở đầu hoặc giữa text
  // VD: "200g bột"          → match "200"
  //     "1.5 muỗng cà phê"  → match "1.5"
  //     "1/2 quả chanh"     → match "1/2"

  return text.replace(
    /(\d+\.?\d*)(\s*\/\s*(\d+\.?\d*))?/g,
    (match, num1, _, num2) => {
      let value: number;
      if (num2) {
        value = parseFloat(num1) / parseFloat(num2);
      } else {
        value = parseFloat(num1);
      }
      const scaled = value * factor;
      // Format: nếu scaled là số nguyên → hiển thị int, không thì giữ 1 decimal
      return Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1);
    }
  );
}

// Ví dụ:
// scaleQuantity("200g bột gạo", 2)        → "400g bột gạo"
// scaleQuantity("1/2 quả chanh", 4)        → "2 quả chanh"
// scaleQuantity("Vừa đủ muối", 2)          → "Vừa đủ muối"  (không có số → giữ nguyên)
// scaleQuantity("1.5 muỗng cà phê tiêu", 3) → "4.5 muỗng cà phê tiêu"
```

**Edge cases scale:**
- Text không có số (vd "Vừa đủ", "Một ít") → giữ nguyên
- Số quá lớn sau scale → hiển thị bình thường, không round
- Fraction phức tạp → convert sang decimal

**UI:**
```
┌──────────────────────────────────────┐
│ Khẩu phần:  [−]  4 người  [+]        │
│                                      │
│ Nguyên liệu:                         │
│ • 200g bột gạo  → 400g (×2)         │  ← highlight số đã scale
│ • 1/2 quả chanh → 1 quả              │
│ • Vừa đủ muối                        │
│ • ...                                 │
└──────────────────────────────────────┘
```

## Frontend Components
- `CookingMode` — Full-screen overlay (Sheet/Dialog của shadcn)
  - Props: `recipe` (full object với steps)
  - State: `currentStep`, `wakeLockActive`
- `StepCard` — Card hiển thị 1 bước nấu
  - Props: `step`, `stepNumber`, `total`
- `CountdownTimer` — Circular progress timer với play/pause/reset
  - Props: `seconds`, `onComplete`
- `ServingsScaler` — Component +/- input với scaled ingredients display
  - Props: `originalServings`, `ingredients[]`
  - Internal state: `currentServings`

## Notes về implementation
- Cooking mode dùng `<Dialog>` hoặc full-screen `<Sheet>` của shadcn/ui
- Wake Lock chỉ khả dụng trên HTTPS hoặc localhost
- Notification permission cần xin trước khi vào cooking mode
- Timer audio file đặt ở `frontend/public/sounds/timer-end.mp3`
- Scale là pure frontend, không persist số lượng đã đổi

## Edge Cases
- User đóng tab giữa cooking mode → wake lock tự release
- Timer chạy khi user không ở tab → vẫn chạy (setInterval), nhưng có thể bị throttled
- Recipe có 0 steps → disable button "Bắt đầu nấu"
- Step không có content → skip step đó (rare case)
- Servings = 0 → disable button "−"
- Servings = 20 → disable button "+"
