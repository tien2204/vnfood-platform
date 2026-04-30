# Design System — VNFood Platform
# UI UX Pro Max Skill — Category: Recipe & Cooking

## Design Decision
- Style: Warm Organic + Food Photography
- Primary: #E85D26 (Warm Orange)
- Secondary: #2D6A4F (Deep Green)
- Accent: #F4A261 (Sandy Orange)
- Background: #FFFBF5 (Warm White — không pure white)
- Font: Playfair Display (heading) + Inter (body)

## Tailwind Config
```js
colors: {
  primary: { DEFAULT: '#E85D26', hover: '#D44E1E' },
  secondary: '#2D6A4F',
  accent: '#F4A261',
  warm: { bg: '#FFFBF5', muted: '#F7F0E8', border: '#E8DDD4' }
},
fontFamily: {
  heading: ['Playfair Display', 'Georgia', 'serif'],
  body: ['Inter', 'system-ui', 'sans-serif'],
},
```

## Shadows
```css
--shadow-sm:   0 1px 3px rgba(0,0,0,0.08);
--shadow-md:   0 4px 12px rgba(0,0,0,0.10);
--shadow-warm: 0 4px 16px rgba(232,93,38,0.15);
```

## shadcn/ui components dùng
Button, Input, Textarea, Select, Dialog, Sheet, Tabs,
Avatar, Badge, Skeleton, Toast (Sonner), Card, ScrollArea

## RecipeCard
```
┌──────────────────────┐
│   [Food Image 16:9]  │  ← rounded-top, object-cover
│   [♡ Save icon]      │  ← absolute top-right
├──────────────────────┤
│ ★★★★☆ 4.2 (50)      │
│ Tên món ăn           │  ← Playfair Display
│ ⏱ 30 phút  👥 4     │
│ [Avatar] Tên tác giả │
└──────────────────────┘
hover: scale(1.02) + shadow-warm, 200ms
```

## Responsive Grid
- Mobile 375px:  1 cột
- Tablet 768px:  2 cột
- Desktop 1024px: 3 cột
- Wide 1440px:   4 cột

## Bottom Nav (Mobile)
Home | Search | 📷 AI Scan | Meal Plan | Profile

## Anti-patterns
- ❌ Neon / blue tones lạnh
- ❌ Pure white #FFFFFF background
- ❌ AI purple/pink gradients
- ❌ Transitions > 400ms
