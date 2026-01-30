# Toolchain and Developer Workflow

## Bun is mandatory

All installs, scripts, and CI use Bun.

- Vercel Functions runtime is configured via `bunVersion: "1.x"` in `vercel.json`.
  ([Vercel Bun runtime](https://vercel.com/docs/functions/runtimes/bun))
- Vercel detects Bun installs via the lockfile.
  ([Vercel package managers](https://vercel.com/docs/package-managers))
- Bun blocks lifecycle scripts by default; allowlist with `trustedDependencies`.
  ([trustedDependencies](https://bun.com/docs/guides/install/trusted))

## Script conventions (current)

The repository uses `bun --bun next ...` to execute Next.js under Bun. This is
the preferred style because it is explicit and avoids PATH ambiguity.

Examples:

- `dev`: `bun --bun next dev`
- `build`: `bun --bun next build`
- `typegen`: `bun --bun next typegen`

## Required lockfile policy

CI runs `bun install --frozen-lockfile`.

This requires a committed Bun lockfile (`bun.lock` or `bun.lockb`).

Policy:

- Commit exactly one Bun lockfile.
- Treat lockfile diffs as meaningful changes that should be reviewed.

## One-off CLIs

Use `bunx` for ephemeral CLI execution, e.g.:

- `bunx drizzle-kit studio` (or use `bun run db:studio`)
- `bunx shadcn@latest add ...` (once UI libraries are added)
- `bunx @next/codemod agents-md` (updates AGENTS.md index)

## Agent-first constraints

AGENTS.md defines repo invariants that are treated as policy:

- No `useMemo` / `useCallback` (React Compiler handles memoization).
- Strict TS: no `any`.
- TSDoc/JSDoc required for exported APIs.

Keep AGENTS.md updated whenever:

- Next.js docs index changes
- tooling commands change
