# Agent Rules

## Git Workflow

- **Never commit or push directly to `main`**. Always create a feature branch and open a pull request.
- One PR per feature or fix. Keep PRs focused and small.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`).

## Library Components — Do Not Modify

The following directories contain vendored library code (AI SDK Elements + shadcn/ui). **Never edit these files directly:**

- `web/components/ai-elements/` — AI SDK Elements components (message, conversation, reasoning, terminal, code-block, task, shimmer)
- `web/components/ui/` — shadcn/ui primitives (button, collapsible, select, separator, tooltip, button-group)

If a library component needs changes, override behavior via props/className from the consumer side, or discuss replacing the component entirely.

## Styling

- **Use shadcn semantic tokens**, not hardcoded Tailwind colors. For example:
  - `bg-background` / `text-foreground` (not `bg-zinc-950` / `text-zinc-100`)
  - `text-muted-foreground` (not `text-zinc-500`)
  - `border-border` (not `border-zinc-800`)
  - `bg-muted` / `bg-secondary` / `bg-accent` for surfaces
  - `text-destructive` for errors
- Tokens are defined in `web/index.css` under `@theme {}`.
- **Tailwind CSS v4**: this project uses `@import "tailwindcss"` / `@theme {}` / `@custom-variant` syntax. There is no `tailwind.config.js`.
- **No custom CSS**: always use Tailwind utility classes. Do not write custom CSS rules, inline `style={}` for visual styling, or add new rules in `index.css`. If a Tailwind class doesn't exist, compose existing utilities — don't invent custom styles.

## Architecture

- **Frontend**: Vite + React 19 + Tailwind CSS 4. Not Next.js — no `"use server"`, no RSC.
- **Backend**: Hono server in `api/`. Do not modify backend code unless explicitly requested.
- **Path alias**: `@/` maps to `web/` (configured in `vite.config.ts` and `tsconfig.json`).
- **Font**: Geist Sans for body text, Geist Mono for code (`font-mono`). Both defined in `web/index.css`.

## Build & Verify

- `pnpm build` must pass before opening a PR.
- Large Shiki chunks in the build output are expected — do not attempt to fix chunk size warnings.
