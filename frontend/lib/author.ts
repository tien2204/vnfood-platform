// Provenance-aware author label for recipes.
//
// Imported recipes are all owned by one internal "Admin" account, so the raw
// author name is meaningless to readers. Surface the real provenance instead:
//   - scraped from monngonmoingay.com  → "Món ngon mỗi ngày"
//   - any other aggregated/imported set → "Tổng Hợp"
//   - genuine user submissions (source === "user") → the real author (linkable)

interface AuthorLike {
  id: string;
  full_name?: string | null;
  avatar_url?: string | null;
}

export interface RecipeAuthorDisplay {
  name: string;
  /** true only for a real platform user with a viewable profile */
  linkable: boolean;
  authorId?: string;
  avatarUrl?: string | null;
}

export function recipeAuthorDisplay(opts: {
  source: string;
  author?: AuthorLike | null;
  originalAuthorName?: string | null;
}): RecipeAuthorDisplay {
  const { source, author, originalAuthorName } = opts;

  if (source === "monngonmoingay") {
    return { name: "Món ngon mỗi ngày", linkable: false };
  }

  if (source === "user") {
    const name = author?.full_name || originalAuthorName || "Người dùng";
    return author
      ? { name, linkable: true, authorId: author.id, avatarUrl: author.avatar_url }
      : { name, linkable: false };
  }

  // llm-canonical, cookpad, curated-canonical, ai-generated, …
  return { name: "Tổng Hợp", linkable: false };
}
