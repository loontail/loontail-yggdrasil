# Dev workflow

## One-shot commands

| Command | What it does |
|---|---|
| `npm install` | Installs every workspace's dependencies and wires up husky hooks. |
| `npm run lint` | `biome check .` across the whole repo. |
| `npm run lint:fix` | Applies safe Biome fixes (formatting, import sorting). |
| `npm run format` | Biome formatting only. |
| `npm run typecheck` | `tsc --noEmit` per workspace (Turbo orders core first). |
| `npm test` | Vitest per workspace. |
| `npm run build` | tsup (libs) and `tsc` (plugin) bundles into each package's `dist/`. |
| `npm run verify` | `lint` + `typecheck` + `test` + `build` chained. |
| `npm run docs:dev` | VitePress dev server with hot reload. |
| `npm run docs:build` | Static build into `docs-site/.vitepress/dist`. |
| `npm run docs:preview` | Preview the built site. |

CI runs the same `verify` chain. Pre-push hook also runs `npm test`.

## Per-package work

Run a Turbo task in one workspace only with `--filter`:

```bash
npm run build -- --filter=@loontail/yggdrasil-core
npm test  -- --filter=@loontail/strapi-plugin-yggdrasil
npm run typecheck -- --filter=@loontail/yggdrasil-client
```

Turbo automatically rebuilds dependencies first — building yggdrasil-client
builds yggdrasil-core if it isn't already.

## Watch loops

```bash
# Type-check a package on save
npm --workspace=packages/yggdrasil-core run typecheck -- --watch

# Re-run a package's tests on save
npm --workspace=packages/yggdrasil-client run test:watch

# Re-build the docs site on save
npm run docs:dev
```

## Working on the plugin against a real Strapi

The plugin is consumed as a regular npm dependency. To work on it against a
real Strapi project:

```bash
# In the plugin workspace
cd packages/strapi-plugin-yggdrasil
npm run build -- --watch     # rebuild dist on save

# In the Strapi project
cd ../../../my-strapi-app
npm install ../loontail-yggdrasil/packages/strapi-plugin-yggdrasil
npm run develop
```

Strapi v5 dev mode reloads on changes to the plugin's `dist/`. Beware:
hot-reload-driven double bootstraps can leak intervals — the `destroy`
hook in `bootstrap.ts` clears the token-cleanup timer specifically because
of this.

## Git hooks

`npm install` wires up husky. Three hooks are active:

| Hook | Runs |
|---|---|
| `commit-msg` | `commitlint` — Conventional Commits, 100-char header cap. |
| `pre-commit` | `lint-staged` (Biome on staged `.ts/.tsx/.js/.jsx/.json`) + `npm run typecheck`. |
| `pre-push` | `npm test` + `npm run build`. |

Don't bypass with `--no-verify` — CI runs the same checks, the hook output
is what the reviewer will see anyway, and the Turbo cache makes
typecheck / test / build cheap on subsequent commits.

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/). Format:

```
<type>[(scope)][!]: <description>
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`. Use the package short name as the scope
when the change is package-local:

```
feat(yggdrasil-core): add textures payload decoder
fix(strapi-plugin-yggdrasil): drop expired tokens inside the cleanup tick
feat(yggdrasil-client)!: rename uploadSkin "variant" to "model"
docs(docs-site): add Electron packaging example
```

Suffix the type with `!` for breaking changes — see the [release section](#release)
for what counts as breaking in each package.

One logical change per PR. The release workflow only bumps + publishes
packages whose files actually changed; cross-package edits are normal and
fine.

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
npm --workspace=packages/yggdrasil-core version minor --no-git-tag-version
git add packages/yggdrasil-core/package.json package-lock.json
git commit -m "chore(release): yggdrasil-core-v0.1.0"
git push
```

The next regular commit on `main` auto-bumps from the new baseline.

### What counts as breaking

- **`yggdrasil-core`** — renamed / removed exports, changed `*Schema` shape,
  changed string-union members, renamed error codes.
- **`yggdrasil-client`** — renamed / removed `YggdrasilClient` methods,
  changed method input or response shape (Zod-validated already, but the
  TS signature matters), renamed exported error codes.
- **`strapi-plugin-yggdrasil`** — changed Yggdrasil endpoint URLs, changed
  endpoint payload shapes, dropped / renamed Strapi content-type fields,
  changed admin route paths, changed permission action names emitted by
  `bootstrap.ts`.

If you're unsure, mark the PR with `!` and let the reviewer decide.

## Adding a new package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json` (extending
   `tsconfig.base.json`), `vitest.config.ts`, `src/index.ts`, `tests/`.
2. Add the directory to `package.json#workspaces` — it's a glob (`packages/*`),
   so nothing to edit there in practice.
3. Make `npm install` aware via `npm install` from the repo root.
4. Add the standard scripts (`build`, `typecheck`, `test`, `lint`).
5. Add the package to the release workflow's matrix if it's intended to
   publish.
6. Write the public API surface docs in `docs-site/packages/<name>.md`.
7. Update the [modules](./modules.md) and [architecture](./architecture.md)
   files in `docs/`.

## Docs site updates

The docs site is a VitePress project rooted at `docs-site/`. Edits flow
the same way as any other source change — open a PR, get review, merge.
There is no separate docs deploy step; CI runs `npm run docs:build` as a
verification, and the deploy workflow publishes the build output to
GitHub Pages.

When a public API changes:

- Update the relevant guide page in `docs-site/guides/`.
- Update the package overview page in `docs-site/packages/`.
- Update the endpoint / error table in `docs-site/reference/` if the
  change touched them.
- Update `docs/modules.md` if the change moved code between modules.
- Mention the breakage in the PR title with `feat!:` / `fix!:`.
