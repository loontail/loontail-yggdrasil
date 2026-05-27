# Contributing

## Setup

- Node ≥ 22.13 (the dev toolchain — lint-staged 17, listr2 10, commitlint
  21 — requires Node ≥ 22; published packages still target Node 20 at
  runtime, see each package's `engines.node`)
- npm 10+ (ships with Node 22)

```bash
git clone <your-fork>
cd loontail-yggdrasil
npm install
```

`npm install` installs the git hooks via husky's `prepare` script.

The repo is a Turborepo with three workspaces under `packages/`:

| Workspace | npm name |
|---|---|
| `packages/yggdrasil-core`            | `@loontail/yggdrasil-core` |
| `packages/yggdrasil-client`          | `@loontail/yggdrasil-client` |
| `packages/strapi-plugin-yggdrasil`   | `@loontail/strapi-plugin-yggdrasil` |

## Commands

All commands run from the repo root; Turbo dispatches them to the affected
workspaces and reuses cached output where it can.

| Command | What it does |
|---|---|
| `npm run lint` | `biome check .` across the whole repo. |
| `npm run lint:fix` | Apply safe Biome fixes (import sort, formatting, etc.). |
| `npm run format` | Biome formatting only. |
| `npm run typecheck` | `tsc --noEmit` per workspace. |
| `npm test` | Vitest per workspace. |
| `npm run build` | `tsup` (libs) and `tsc` (plugin) bundles into each package's `dist/`. |
| `npm run verify` | `lint` + `typecheck` + `test` + `build` chained. |

Before opening a PR, all four must pass:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

CI runs exactly the same chain — see `.github/workflows/ci.yml`.

## Git hooks

`npm install` wires up husky. Three hooks are active:

| Hook | Runs |
|---|---|
| `commit-msg` | `commitlint` (Conventional Commits, 100-char header cap) |
| `pre-commit` | `lint-staged` (Biome on staged `.ts/.tsx/.js/.jsx/.json`) + `npm run typecheck` |
| `pre-push` | `npm test` + `npm run build` |

Don't bypass with `--no-verify` — CI runs the same checks and the hook
output is what the reviewer will see anyway. The Turbo cache makes
typecheck/test/build cheap on subsequent commits.

## Per-package work

Run a Turbo task in one package only with `--filter`:

```bash
npm run build -- --filter=@loontail/yggdrasil-core
npm test  -- --filter=@loontail/strapi-plugin-yggdrasil
```

The release pipeline auto-detects which packages changed since their last
release tag (`<short-name>-vX.Y.Z`); cross-package edits are normal and fine.

## Project conventions

- **TypeScript `private`**, not `#`-prefixed ECMAScript private fields — the
  TypeScript compiler enforces it, mocks/stubs in tests work as expected, and
  identifiers stay readable in compiled output.
- **No magic strings** for finite sets — use `as const` maps under each
  package's `constants/` or `types/`.
- **No silent `catch`** — inspect, log, or re-throw; lossy catches need a
  one-line comment explaining why.
- **English** for comments, commit messages, and PR descriptions.
- **Biome** is the only formatter / linter. Don't reach for ESLint / Prettier
  configs — we removed both deliberately.
- **Zod** at every wire boundary in `yggdrasil-core/contracts/`. Internal
  domain types live in `yggdrasil-core/types/` and don't carry runtime cost.
- **PNG validation lives in `@loontail/yggdrasil-core`**
  (`assertPngBuffer` / `validatePngBuffer`). Reuse it on both server and
  client — don't re-implement IHDR parsing in a consumer.

## Commit & PR

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[scope][!]: <description>
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`. Use the package short name as the scope when
the change is package-local:

```
feat(yggdrasil-core): add textures payload decoder
fix(strapi-plugin-yggdrasil): drop expired tokens inside the cleanup tick
feat(yggdrasil-client)!: rename uploadSkin "variant" to "model"
```

Suffix the type with `!` for breaking changes — see the [Release](#release)
section for what counts as breaking in each package.

- One logical change per PR.
- The release workflow only bumps + publishes packages whose files actually
  changed. Use the PR template's checkbox list to tell reviewers which package
  surfaces are affected.

## Release

Releases are automated. Pushing to `main` triggers
`.github/workflows/release.yml`, which:

1. Skips itself on commits whose message starts with `chore(release):`
   (loop guard).
2. For each package, diffs `packages/<pkg>/` against its last
   `<short-name>-vX.Y.Z` tag and, if anything changed, runs
   `npm version patch --no-git-tag-version`.
3. Commits the bumps as a single `chore(release): <tag>[, <tag>...]`,
   tags each bumped package, pushes commit + tags.
4. Publishes each bumped package to npm with `--provenance --access public`
   and creates a GitHub Release with auto-generated notes.

### Required secrets

| Secret | Purpose |
|---|---|
| `NPM_TOKEN` | npm automation token with publish scope on `@loontail/*`. |
| `RELEASE_TOKEN` | Fine-grained PAT (Contents: read/write) owned by a user in the repo's branch ruleset bypass list. The default `GITHUB_TOKEN` cannot push to a protected `main`; this one can. |

### Cutting a non-patch release

The workflow only auto-bumps the patch slot. To ship a minor or major:

```bash
# Pick the package and the bump scale.
npm --workspace=packages/yggdrasil-core version minor --no-git-tag-version

# Stage and commit as a release commit so the guard skips it.
git add packages/yggdrasil-core/package.json package-lock.json
git commit -m "chore(release): yggdrasil-core-v0.1.0"
git push
```

The next regular commit on `main` auto-bumps from the new baseline.

### What counts as breaking

- **`yggdrasil-core`** — renamed/removed exports, changed `*Schema` shape,
  changed string union members, renamed error codes.
- **`yggdrasil-client`** — renamed/removed `YggdrasilClient` methods, changed
  method input or response shape (Zod-validated already, but signature
  matters), renamed exported error codes.
- **`strapi-plugin-yggdrasil`** — changed Yggdrasil endpoint URLs, changed
  endpoint payload shapes, dropped/renamed Strapi content-type fields,
  changed admin route paths, changed permission action names emitted by
  `bootstrap.ts`.

If you're unsure, mark the PR with `!` and let the reviewer decide.

## Reporting bugs

Open an issue with the bug-report template filled in: which package, the
endpoint or method involved, the exact error (Yggdrasil envelope or
`YggdrasilClientError` / `YggdrasilCoreError` with `code` and `context`),
Strapi version, database backend, Node version. The migration / textures /
bootstrap log slice helps a lot.

## Asking before writing

For new public API on `yggdrasil-core` or `yggdrasil-client`, new Yggdrasil
endpoints, or new Strapi admin sections, open an issue first to align on
scope.
