// Per-ingredient shopping deep-links. No ordering/cart API exists for these
// platforms, so we open a search (Bách Hóa Xanh / Tiki) or the homepage
// (GrabMart / ShopeeFood) in a new tab; the user completes the order on the
// platform.

export type ShoppingPlatformId = "bachhoaxanh" | "tiki" | "grabmart" | "shopeefood";

export interface ShoppingPlatform {
  id: ShoppingPlatformId;
  label: string;
  /** Build the URL to open for a given ingredient name. */
  searchUrl: (keyword: string) => string;
}

// Priority order: Tiki + Bách Hóa Xanh have real keyword search; GrabMart/ShopeeFood
// have no stable public search URL so they open their homepage. (Cooky was dropped:
// its SSL cert is expired → browser security warning.) All URLs curl-verified 200.
export const SHOPPING_PLATFORMS: ShoppingPlatform[] = [
  {
    id: "tiki",
    label: "Tiki",
    searchUrl: (kw) => `https://tiki.vn/search?q=${encodeURIComponent(kw)}`,
  },
  {
    id: "bachhoaxanh",
    label: "Bách Hóa Xanh",
    searchUrl: (kw) => `https://www.bachhoaxanh.com/tim-kiem?key=${encodeURIComponent(kw)}`,
  },
  {
    id: "grabmart",
    label: "GrabMart",
    // No stable public search-by-keyword URL → open GrabMart (VN) homepage.
    searchUrl: () => "https://food.grab.com/vn/vi/",
  },
  {
    id: "shopeefood",
    label: "ShopeeFood",
    // No stable public search-by-keyword URL → open ShopeeFood homepage.
    searchUrl: () => "https://shopeefood.vn/",
  },
];

// Grocery ingredient names carry recipe-style quantities/qualifiers
// ("200 gram thịt heo băm có lẫn mỡ vừa đủ") that wreck a store search.
// Strip leading quantity+unit tokens and trailing filler so the search gets a
// clean product keyword ("thịt heo băm"). Used only for the search URL — the
// row label still shows the original name.

// Numbers / word-numbers that can lead a quantity (e.g. "200", "½", "nửa", "vài").
const QTY_WORDS = new Set([
  "nửa", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín", "mười",
  "vài", "dăm", "đôi",
]);
// Measure units that follow a quantity (e.g. "200 gram", "2 muỗng", "1 củ").
const UNIT_WORDS = new Set([
  "gram", "gr", "g", "kg", "ký", "ki", "lạng", "ml", "l", "lít", "lit", "cc",
  "muỗng", "thìa", "chén", "bát", "tô", "ly", "cốc",
  "củ", "quả", "trái", "nhánh", "tép", "cây", "bó", "nắm", "gói", "hộp", "lon",
  "chai", "miếng", "lát", "con", "khúc", "ổ", "cái", "nhúm", "xíu",
  "canh", "cà", "phê", "cafe", // tail words of "muỗng canh" / "muỗng cà phê"
]);
// Qualifier phrases to drop anywhere (kept conservative — must not eat real
// product words like "băm", "xay", "phi lê").
const FILLER_PHRASES = [
  "vừa đủ", "vừa ăn", "tùy thích", "tùy ý", "theo khẩu vị", "tùy khẩu vị",
  "có lẫn mỡ", "một ít", "đủ dùng", "tươi ngon",
];
// Bare nouns a store search returns nothing for; map to the term it indexes.
const KEYWORD_SYNONYMS: Record<string, string> = {
  tôm: "thịt tôm",
  mực: "thịt mực",
  cua: "thịt cua",
  ghẹ: "thịt ghẹ",
};

const NUMERIC_TOKEN = /^[\d.,/½¼¾⅓⅔–-]+$/;
// Number with an attached unit, no space: "500g", "200gr", "1kg", "250ml".
const NUMERIC_UNIT_TOKEN = /^[\d.,/]+(?:gram|gr|g|kg|ký|ki|lạng|ml|lít|lit|l|cc)$/;

export function cleanIngredientKeyword(name: string): string {
  let s = name.trim().toLowerCase().replace(/\s+/g, " ");
  for (const phrase of FILLER_PHRASES) s = s.split(phrase).join(" ");
  s = s.replace(/\s+/g, " ").trim();

  const tokens = s.split(" ").filter(Boolean);
  let i = 0;
  let droppedNumber = false;
  while (i < tokens.length) {
    const t = tokens[i];
    if (NUMERIC_TOKEN.test(t) || NUMERIC_UNIT_TOKEN.test(t) || QTY_WORDS.has(t)) {
      droppedNumber = true;
      i++;
    } else if (droppedNumber && UNIT_WORDS.has(t)) {
      // Only strip a unit word when it trailed a number (so "lá chanh",
      // "cà rốt" keep their leading noun).
      i++;
    } else {
      break;
    }
  }
  const core = tokens.slice(i).join(" ").trim();
  const result = core || s; // never return empty
  return KEYWORD_SYNONYMS[result] ?? result;
}

export function buildSearchUrl(platformId: ShoppingPlatformId, ingredientName: string): string {
  const platform = SHOPPING_PLATFORMS.find((p) => p.id === platformId) ?? SHOPPING_PLATFORMS[0];
  return platform.searchUrl(cleanIngredientKeyword(ingredientName));
}

export function openShopping(platformId: ShoppingPlatformId, ingredientName: string): void {
  if (typeof window === "undefined") return;
  window.open(buildSearchUrl(platformId, ingredientName), "_blank", "noopener,noreferrer");
}
