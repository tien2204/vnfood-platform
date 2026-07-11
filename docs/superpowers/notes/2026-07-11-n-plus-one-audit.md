# N+1 query audit — recipe / meal-plan / social / admin / user services

**Summary: no N+1 gaps found across all audited list/detail endpoints. All
multi-row queries that read a related entity (`author`/`user`/`steps`/
`ingredients`/`recipe`) either (a) join the related table into the same
`select(...)` statement, (b) use `selectinload(...)` on the relationship, or
(c) batch-fetch related rows in a second `WHERE id.in_(...)` query and build
an in-memory dict/map before iterating — never a per-row lazy load inside a
loop. No code changes made (Step 3 skipped: "không có chỗ sót").**

Audit method: ran the brief's grep for `.author|.steps|.ingredients|.user|.recipe`
attribute access across `app/services/*.py`, then read each hit's surrounding
function in full (`recipe_service.py`, `meal_plan_service.py`,
`social_service.py`, `user_service.py`, `admin_service.py`).

## recipe_service.py

| Endpoint / function | Query location | Load strategy | Verdict |
|---|---|---|---|
| `list_recipes` (GET /recipes) | `recipe_service.py:43-51` `_base_approved_query()` = `select(Recipe, User).outerjoin(User, Recipe.author_id == User.id)`, used at `:181` | join (Recipe+User in same row) | clean |
| `get_related_recipes` | `:280-285` reuses `_base_approved_query()` | join | clean |
| `get_recipe_detail` (GET /recipes/{id}) | `:325-333` `select(Recipe).options(selectinload(Recipe.ingredients), selectinload(Recipe.steps), selectinload(Recipe.author))` | selectinload | clean |
| `search_recipes` (GET /recipes/search) | `:495` reuses `_base_approved_query()` | join | clean |
| `get_featured_recipes` (homepage) | `:547-554` inline `select(Recipe, User).outerjoin(User, ...)` | join | clean |
| `get_user_recipes` (GET /users/{id}/recipes) | `:623-627` `select(Recipe, User).outerjoin(User, ...)` | join | clean |
| `get_my_recipes` / admin `list_recipes_for_review`-style (`:938-945`, `:909-915`) | `select(Recipe, User).outerjoin(User, ...)` | join | clean |
| `list_review_queue` (admin review queue) | `:975-990` join for author + separate batch `select(User.id, User.full_name).where(User.id.in_(claimer_ids))` for `claimed_by_name` (no per-row query) | join + batched second query | clean |
| `_build_recipe_mini` (used for `variants`/`derived_from`/`derived_variants` at `:397-432`) | queries only select `Recipe` columns; `_build_recipe_mini` reads only `id/title/variant_label/image_url` — no relationship touched | n/a (no relation access) | clean |

## meal_plan_service.py

| Endpoint | Query location | Load strategy | Verdict |
|---|---|---|---|
| `_aggregate_from_items` (grocery list ingredient rollup) | `:43-47` `select(RecipeIngredient, Recipe).join(Recipe, Recipe.id == RecipeIngredient.recipe_id).where(RecipeIngredient.recipe_id.in_(recipe_ids))` — one query for all recipes in the plan, explicitly commented "avoid N+1 across meal items" | join | clean |
| `get_meal_plan_full` (GET /meal-plans/{id}) | `:86-90` `selectinload(MealPlan.items)`; recipe titles/images resolved via a single follow-up `select(Recipe).where(Recipe.id.in_(recipe_ids))` at `:103-106` built into `recipe_map` before the per-item loop at `:108` | selectinload + batched second query | clean |
| `list_user_meal_plans` | `:147-153` `selectinload(MealPlan.items)`, loop only reads `len(p.items)` (already loaded) | selectinload | clean |
| `generate_grocery_list` / `get_grocery_list` | no relationship access — operates on `GroceryItem` rows and the `aggregated` dict from `_aggregate_from_items` | n/a | clean |

## social_service.py

| Endpoint | Query location | Load strategy | Verdict |
|---|---|---|---|
| `list_comments` (GET /recipes/{id}/comments) | `:27-31` `select(Comment).options(selectinload(Comment.user))` | selectinload | clean |
| `create_comment` / `update_comment` (re-fetch after write) | `:89-90`, `:132-133` `select(Comment)...options(selectinload(Comment.user))` | selectinload | clean |
| `list_saved_recipes` (GET /me/saved) | `:311-317` `select(SavedRecipe, Recipe, User).join(Recipe, ...).outerjoin(User, Recipe.author_id == User.id)` | join (3-way) | clean |

## user_service.py

| Endpoint | Query location | Load strategy | Verdict |
|---|---|---|---|
| `get_user_profile` (GET /users/{id}) | `:35-40` `select(Recipe).where(Recipe.author_id == user_id)...limit(6)`; author info in `RecipeCardOut` built from the already-fetched `user` object (`:53`), not per-row `.author` | n/a — author is the query subject, not a per-row relation | clean |

## admin_service.py

| Endpoint | Query location | Load strategy | Verdict |
|---|---|---|---|
| `list_admin_users` | `:149-166` fetches users, then two batched `GROUP BY` queries (`recipe_map`, `comment_map`) keyed by `user_ids.in_(...)` before building output | batched second queries (no per-row query) | clean |
| `get_admin_user_detail` | `:202-214` fetches `recent_recipes`/`recent_comments` directly, plus a batched `select(Recipe).where(Recipe.id.in_(recipe_ids))` → `recipes_map` for comment→recipe titles | batched second query | clean |
| `list_admin_comments` | `:316-331` batched `users_map` and `recipes_map` via `.in_()` queries before building output list | batched second query | clean |

## Conclusion

Every list/detail path already uses one of: (1) a join that fetches the
related row in the same statement, (2) `selectinload` for ORM relationships,
or (3) an explicit second batched query collapsed into a dict/map prior to
the per-row loop. No lazy relationship attribute is read inside a loop after
a multi-row query without prior eager-loading. **Step 3 (patch) skipped — no
gap found.** No service files were modified.
