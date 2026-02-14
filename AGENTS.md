# Agent Rules

## Git Workflow

- **Never commit or push directly to `main`**. Always create a feature branch and open a pull request.
- One PR per feature or fix. Keep PRs focused and small.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`).

## Styling

- **Use semantic CSS tokens** defined in `web/index.css` under `@theme {}`, not hardcoded Tailwind colors. For example:
  - `bg-background` / `text-foreground` (not `bg-zinc-950` / `text-zinc-100`)
  - `text-muted-foreground` (not `text-zinc-500`)
  - `border-border` (not `border-zinc-800`)
  - `bg-muted` / `bg-card` / `bg-accent` for surfaces
  - `text-destructive` for errors
- **Tailwind CSS v4**: this project uses `@import "tailwindcss"` / `@theme {}` / `@plugin` syntax. There is no `tailwind.config.js`.
- **No custom CSS**: always use Tailwind utility classes. Do not write custom CSS rules, inline `style={}` for visual styling, or add new rules in `index.css` (except for `@theme` token definitions and `@keyframes` animations).

## Architecture

- **Frontend**: Vite + React 19 + Tailwind CSS 4. Not Next.js — no `"use server"`, no RSC.
- **Backend**: Rust with Axum in `src/`. Do not modify backend code unless explicitly requested.
- **Font**: Geist Sans for body text, Geist Mono for code (`font-mono`). Both defined in `web/index.css`.

## Build & Verify

- `pnpm build:web` must pass before opening a PR.
