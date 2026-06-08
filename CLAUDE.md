@AGENTS.md

# Project Rules

## Language
- All program text MUST be in English only — UI labels, headings, buttons, messages, chart titles/labels, date formats, etc.
- The ONLY exception is code comments, which may be written in Korean.
- Never render Korean (or any non-English) text to the user-facing app.

## No-Code Maintainability (TOP PRIORITY)
The original developer's intern period is ending; non-coding teammates must keep
this app running afterward. Therefore EVERY feature must be configurable through
the admin UI (`/SWJ`) — never via code edits.
- NEVER hardcode business config (template lists, item names, thresholds, units,
  metric mappings, spec ranges, worker lists, etc.) in source files. Store it in
  the database and expose it through an admin screen.
- When adding a feature, also add the admin UI to manage it. A feature is not
  "done" until a non-coder can change its behavior without touching code.
- Existing pattern to follow: DB model → Prisma migration → server action in
  `app/admin/actions.ts` → admin page under `app/admin/**` → consumed by the
  app pages. (e.g. Trend Chart config = ChartTemplate/ChartMetric, not regex.)
- If you ever find hardcoded config, migrate it to DB + admin UI instead of
  extending the hardcode.

## Clean Code
- Keep UI and logic separated; extract shared logic into `lib/`.
- Prefer small, readable functions with clear names over clever one-liners.
- Korean comments are allowed to help future maintainers.
