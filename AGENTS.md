# Repository Guidelines

## Project Structure & Module Organization

This is a TypeScript/React financing simulator built with Next-compatible Vinext and Vite.

- `app/page.tsx`: client UI, form state, table, chart, and CSV export.
- `app/financing.ts`: pure SAC calculations, TR validation, constants, and shared types.
- `app/globals.css`: global theme and responsive component styles.
- `app/layout.tsx`: document metadata and root layout.
- `scripts/verify-financing.mjs`: deterministic finance checks.
- `public/`: static assets such as `favicon.svg` and `og.png`.
- `.github/workflows/deploy-pages.yml`: authoritative GitHub Pages build and publish workflow.

Keep financial logic out of UI components when it can be expressed as a pure function in `app/financing.ts`.

## Build, Test, and Development Commands

Use pnpm and Node.js 22.13 or newer:

- `pnpm dev`: start the local Vinext development server.
- `pnpm build`: create and validate the production bundle.
- `pnpm start`: serve the production build locally.
- `pnpm lint`: run ESLint, excluding generated output.
- `pnpm test:finance`: run SAC/TR calculation assertions.
- `pnpm test:coverage`: run the finance assertions with coverage thresholds.

Before submitting changes, run `pnpm lint`, `pnpm test:finance`, `pnpm test:coverage`, and `pnpm build`.

## Coding Style & Naming Conventions

Follow the existing TypeScript style: two-space indentation, single quotes, semicolons, and strict typing. Use `PascalCase` for React components and types, `camelCase` for functions and state, and `UPPER_SNAKE_CASE` for fixed external constants such as `TR_API_URL`. Prefer `import type` for type-only imports. Keep UI copy in Brazilian Portuguese and monetary formatting in `pt-BR`/BRL.

ESLint is the source of truth for static style checks. Avoid editing generated directories such as `.next/` and `dist/`.

## Domain and Deployment Pitfalls

- `app/financing.ts` also owns TR payload validation and fallback behavior, FGTS and extra-amortization rules, and buy-versus-rent projections. Preserve the existing operation order: boleto, monthly extra amortization, then FGTS amortization.
- TR, insurance, and FGTS rates are percentages at the input boundary and decimals inside calculations. Keep this convention consistent.
- Schedule values retain decimal precision internally and are rounded mainly for display/export. Financial assertions generally allow a maximum difference of R$ 0.01 and must not depend on live network access.
- `TR_FALLBACK` is the local reference used when the BCB request fails or returns an invalid payload; update it deliberately when its reference date becomes stale.
- `app/asset-path.ts` must be used for public asset URLs because deployment sets `NEXT_PUBLIC_BASE_PATH`. New files in `public/` must also be added to the explicit copy list in `.github/workflows/deploy-pages.yml`.
- Do not edit or commit `.next/`, `.vinext/`, `dist/`, `coverage/`, or `node_modules/`; they are generated or local-only.
- The chart in `app/page.tsx` is browser-only canvas rendering, and CSV export uses semicolon delimiters, comma decimals, and a UTF-8 BOM.

## Testing Guidelines

Finance tests use Node's built-in `assert` module. Add cases to `scripts/verify-financing.mjs` for every calculation change, especially TR zero/positive scenarios, API payload validation, first-installment values, and final balance tolerance (maximum R$ 0.01). Tests must be deterministic and must not depend on live network availability.

## Commit & Pull Request Guidelines

Recent commits use short, imperative, sentence-case subjects, for example `Rename payment total to boleto`. Keep each commit focused on one coherent change.

Pull requests should explain the user-visible impact, note calculation assumptions, and list verification commands run. Include screenshots for layout or responsive changes and sample before/after values for financial changes. Link the relevant issue when one exists; never commit credentials, API tokens, or generated build artifacts.
