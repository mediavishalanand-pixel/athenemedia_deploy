# Athene Release Order Automation

Production desk for Athene Advertising — release orders, proformas and invoices in one secure workspace.

## Stack

- React + TanStack Start (Vite)
- Postgres via `@supabase/supabase-js`, cached with TanStack Query
- Tailwind CSS v4

## Development

```bash
bun install
bun run dev
```

Configure the following environment variables before running:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`
