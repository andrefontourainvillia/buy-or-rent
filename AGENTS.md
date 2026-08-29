# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript/React financing simulator built with Next-compatible Vinext and Vite.

- `app/page.tsx`: client UI, form state, table, chart, and CSV export.
- `app/financing.ts`: pure SAC calculations, TR validation, constants, and shared types.
- `app/globals.css`: global theme and responsive component styles.
- `app/layout.tsx`: document metadata and root layout.
- `scripts/verify-financing.mjs`: deterministic finance checks.
- `public/`: static assets such as `favicon.svg` and `og.png`.
- `.openai/hosting.json`: Sites project binding; preserve its existing project ID.

Keep financial logic out of UI components when it can be expressed as a pure function in `app/financing.ts`.

## Build, Test, and Development Commands

Use pnpm and Node.js 22.13 or newer:

- `pnpm dev`: start the local Vinext development server.
- `pnpm build`: create and validate the production bundle.
- `pnpm start`: serve the production build locally.
- `pnpm lint`: run ESLint, excluding generated output.
- `pnpm test:finance`: run SAC/TR calculation assertions.

Before submitting changes, run `pnpm lint`, `pnpm test:finance`, and `pnpm build`.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, single quotes, semicolons, and strict typing. Use `PascalCase` for React components and types, `camelCase` for functions and state, and `UPPER_SNAKE_CASE` for fixed external constants such as `TR_API_URL`. Prefer `import type` for type-only imports. Keep UI copy in Brazilian Portuguese and monetary formatting in `pt-BR`/BRL.

ESLint is the source of truth for static style checks. Avoid editing generated directories such as `.next/` and `dist/`.

## Testing Guidelines

Finance tests use Node's built-in `assert` module. Add cases to `scripts/verify-financing.mjs` for every calculation change, especially TR zero/positive scenarios, API payload validation, first-installment values, and final balance tolerance (maximum R$ 0.01). Tests must be deterministic and must not depend on live network availability.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, sentence-case subjects, for example `Rename payment total to boleto`. Keep each commit focused on one coherent change.

Pull requests should explain the user-visible impact, note calculation assumptions, and list verification commands run. Include screenshots for layout or responsive changes and sample before/after values for financial changes. Link the relevant issue when one exists; never commit credentials, API tokens, or generated build artifacts.
