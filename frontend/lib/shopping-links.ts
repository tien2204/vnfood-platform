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

// Priority order: Bách Hóa Xanh + Tiki have real keyword search; GrabMart/ShopeeFood
// have no stable public search URL so they open their homepage. (Cooky was dropped:
// its SSL cert is expired → browser security warning.) All URLs curl-verified 200.
export const SHOPPING_PLATFORMS: ShoppingPlatform[] = [
  {
    id: "bachhoaxanh",
    label: "Bách Hóa Xanh",
    searchUrl: (kw) => `https://www.bachhoaxanh.com/tim-kiem?key=${encodeURIComponent(kw)}`,
  },
  {
    id: "tiki",
    label: "Tiki",
    searchUrl: (kw) => `https://tiki.vn/search?q=${encodeURIComponent(kw)}`,
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

export function buildSearchUrl(platformId: ShoppingPlatformId, ingredientName: string): string {
  const platform = SHOPPING_PLATFORMS.find((p) => p.id === platformId) ?? SHOPPING_PLATFORMS[0];
  return platform.searchUrl(ingredientName);
}

export function openShopping(platformId: ShoppingPlatformId, ingredientName: string): void {
  if (typeof window === "undefined") return;
  window.open(buildSearchUrl(platformId, ingredientName), "_blank", "noopener,noreferrer");
}
