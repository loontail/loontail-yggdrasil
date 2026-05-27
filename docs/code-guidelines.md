# Code guidelines

Hard rules that every change in this repo must follow. CI enforces the
automatable ones; reviewers enforce the rest.

## §1. Language

- TypeScript only for new source. JS is acceptable for build / vendor
  scripts (`scripts/`) and the plugin's `loader.js`.
- Target `ES2022` via the shared `tsconfig.base.json`.
- `verbatimModuleSyntax: true` — every type-only import must be written as
  `import type ...`. Biome enforces.
- `strict: true`, `noUncheckedIndexedAccess: true`,
  `useUnknownInCatchVariables: true`, `noImplicitOverride: true`,
  `noUnusedLocals: true`, `noUnusedParameters: true`. Don't relax these.

## §2. Class encapsulation

- Use the TypeScript `private` keyword. Not `#`-prefixed ECMAScript private
  fields.
- Rationale: TS-private is enforced by the compiler, mocks / stubs in tests
  work as expected, identifiers stay readable in compiled output, no
  mangling.
- Default-public is fine for exported APIs. Reach for `public` only when
  the visibility is non-obvious.

## §3. Errors

- Public throws use `YggdrasilCoreError` (core) or `YggdrasilClientError`
  (client) only. Never bare `Error` from a public surface.
- The plugin's HTTP layer uses `YggdrasilHttpError` (inside
  `server/controllers/helpers.ts`), caught by the `error-shape` middleware
  to produce the Yggdrasil envelope.
- Always set `cause` when wrapping a lower-level exception.
- Add new codes to the codes object only when a *new* recovery path is
  needed; otherwise reach for `context.kind` on an existing code.

## §4. Magic strings

Finite sets live as `as const` maps in `constants/` or `types/`:

- Endpoint paths → `YggdrasilEndpoints`
- Skin variants → `SkinVariants`
- Texture kinds → `TextureKinds`
- Asset kinds → `SkinAssetKinds`
- Error envelope kinds → `YggdrasilErrorKinds`
- Core error codes → `YggdrasilCoreErrorCodes`
- Client error codes → `YggdrasilClientErrorCodes`

Reference the constant, not the literal. Type unions derive from the maps
(e.g. `(typeof SkinVariants)[keyof typeof SkinVariants]`).

## §5. Boundary validation

- Every wire crossing parses through a Zod schema from
  `@loontail/yggdrasil-core/contracts/`.
- The plugin's controllers call
  `parseOrThrow(SchemaFromCore, ctx.request.body)`. Internal services don't
  re-validate.
- The client parses every response body. The HTTP primitives
  (`postJson` / `getJson` / `putMultipart` / `deleteWithAuth`) take a Zod
  schema generic; pass `null` for 204 endpoints.

## §6. No silent catches

- An empty `catch { }` requires a one-line comment naming the explicit
  reason. Example: `// ENOENT during best-effort cleanup; the real error is
  about to throw above.`
- Otherwise, `catch (err) { /* log, transform, or re-throw */ }`.
- `catch (err: unknown)` — `useUnknownInCatchVariables` enforces this.

## §7. Cleanup discipline

- Long-running operations (timers, intervals, subscriptions, file handles)
  go inside `try / finally` so they're cleaned up even on abort or throw.
- The plugin's bootstrap step stores the cleanup interval ID on the strapi
  instance so `destroy` can clear it on hot reload. Don't skip this — Strapi
  dev mode reloads stack intervals across reloads.
- Don't demote a successful operation back to its "not done" state on a
  trailing bookkeeping failure. Log a warn, keep the user-visible outcome
  correct.

## §8. User-facing docs

- Live in `docs-site/`. Single VitePress project at the monorepo root.
- One paragraph per concept. Don't pad.
- Code samples must compile against the real API. Treat them as
  documentation tests — if the API changed, the samples change in the same
  PR.
- The audience is launcher developers and Strapi operators. Don't assume
  Mojang-protocol knowledge — link to
  [Yggdrasil protocol primer](../docs-site/guides/protocol.md) when
  introducing new endpoints.
- Maintainer / AI-agent docs live in `docs/` (this directory). The site
  doesn't render them.

## §9. Linting and formatting

- Biome is the single formatter / linter. Don't add ESLint or Prettier
  configs.
- Settings live in `biome.json` at the repo root. Per-package overrides go
  in `packages/*/biome.json` only when justified — favour repo-wide rules.
- `npm run lint:fix` is safe to run; `npm run format` is formatter-only.
- The pre-commit hook runs Biome on staged files; CI runs `biome check .`
  across everything.

## §10. Tests

- Vitest is the single test framework.
- Tests live in `packages/<pkg>/tests/` (for core and client) or alongside
  source in `packages/strapi-plugin-yggdrasil/server/**/*.test.ts` (for the
  plugin).
- Coverage thresholds in `vitest.config.ts` are floors, not goals. Aim for
  ≥ 80% on any module you change.
- Stubs / mocks use `vi.fn()` and `vi.spyOn()`. No third-party mocking
  library.
- Database tests in the plugin use the `StrapiInstance` minimal-surface type
  from `server/types.ts` — don't pull in `@strapi/types`.

## §11. Performance and bundle size

- `sideEffects: false` on every published package.
- Tree-shaking is non-negotiable. Don't add side-effectful top-level code
  (no `const foo = compute()` at module scope unless `compute` is pure).
- Don't import the entire core package by namespace; named imports keep the
  bundler honest.
- `tsup` is the bundler for the two libraries; the plugin builds via plain
  `tsc` because Strapi wants the source tree shape.

## §12. Commits

See [dev-workflow.md → Commit style](./dev-workflow.md#commit-style) for the
full Conventional Commits policy. Summary:

- One logical change per PR.
- Scope is the package short name (`yggdrasil-core`, `yggdrasil-client`,
  `strapi-plugin-yggdrasil`) or `docs-site` / `docs` for documentation.
- `!` suffix marks breaking changes.

## §13. Permissions and bootstrap idempotency

- Every bootstrap phase in the plugin must be idempotent. Re-running it on
  a clean restart, on a hot reload, on a partial-failure recovery — none of
  those should produce a different result than the first run.
- Permission grants check for existing rows before insert (`hasPermission(role, action)`).
- DB migrations are marker-protected via `yggdrasil_migrations`.
- Key generation checks for an existing file before generating.
