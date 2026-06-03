"use client";

/** Extract the YouTube video id from a watch / youtu.be / embed URL. */
function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

export function RecipeVideo({ url }: { url?: string | null }) {
  if (!url) return null;
  const id = youtubeId(url);
  if (!id) return null;
  return (
    <section className="my-6">
      <h2
        className="text-lg font-bold text-[#2D2417] mb-3"
        style={{ fontFamily: "var(--font-playfair)" }}
      >
        Video hướng dẫn
      </h2>
      <div className="relative w-full overflow-hidden rounded-xl border border-[#E8DDD4]" style={{ paddingBottom: "56.25%" }}>
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube.com/embed/${id}`}
          title="Video hướng dẫn nấu ăn"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </section>
  );
}
