# AI agent context

If you are an AI agent picking up work on `loontail-yggdrasil`, read this
first.

## Read these in order

1. [`code-guidelines.md`](./code-guidelines.md) — rules every change must satisfy.
2. [`architecture.md`](./architecture.md) — layer map, ownership, package
   boundaries.
3. [`modules.md`](./modules.md) — one-paragraph orientation per source module
   across all three packages.
4. [`error-codes.md`](./error-codes.md) — every stable error code.

Skip the user-facing tree (`docs-site/`) unless you're editing public
documentation.

## Repo layout

```
loontail-yggdrasil/
├── docs/              ← you are here. AI / maintainer docs.
├── docs-site/         ← user-facing VitePress site.
├── packages/
│   ├── yggdrasil-core/              ← pure protocol library
│   ├── yggdrasil-client/            ← launcher-side HTTP client
│   └── strapi-plugin-yggdrasil/     ← Strapi v5 plugin
├── package.json       ← workspace root, turbo config, docs scripts
├── turbo.json         ← task pipeline (`yggdrasil-core` builds first)
├── biome.json         ← formatter + linter
└── tsconfig.base.json ← shared compiler options
```

## Conventions worth memorising

- **Public surface = `src/index.ts`** (per package). Anything not re-exported
  there is internal and may be renamed / removed without a release note. The
  plugin's public surface is whatever Strapi sees through `loader.js`
  (controllers, routes, services, content-types, policies, middlewares,
  bootstrap, register, config); deep imports into `server/` are not stable.
- **Errors:** always `YggdrasilCoreError` or `YggdrasilClientError` with a
  stable `code`. Wrap lower-level errors as `cause`. Never throw bare
  `Error` from a public surface.
- **No magic strings.** Endpoint paths → `YggdrasilEndpoints`. Skin variants
  → `SkinVariants`. Texture kinds → `TextureKinds`. Asset kinds →
  `SkinAssetKinds`. Error envelopes → `YggdrasilErrorKinds`. Error codes →
  the codes maps. Add new strings to those maps; don't sprinkle literals at
  call sites.
- **TypeScript `private`**, not `#`-prefixed ECMAScript private fields. The
  TypeScript compiler enforces it; identifiers stay readable in compiled
  output; mocks / stubs in tests work as expected.
- **`import type`** for type-only imports. Biome enforces this.
- **Plugin loader unwrap.** The plugin ships as CommonJS. `loader.js` reads
  `dist/server/index.js` and unwraps `.default` so the shape matches what
  Strapi's plugin loader expects. Don't rename or move it — Strapi only
  loads `.js` / `.json` for plugin entry points.
- **Boundary validation via Zod.** Every wire crossing parses through a
  schema from `@loontail/yggdrasil-core/contracts/`. Hand-rolled predicates
  appear only after the boundary check.
- **English** for comments, commit messages, and PR descriptions.
- **Biome** is the only formatter / linter. Do not propose adding ESLint or
  Prettier configs — they were removed deliberately.

## Common gotchas

- **Plugin name is `yggdrasil`**, not `strapi-plugin-yggdrasil`. The
  `strapi.name` field in `package.json` of the plugin sets this; `config/plugins.js`
  keys by it. Strapi mounts public routes under `/api/<plugin-name>/*`, so a
  rename would shift every URL the launcher knows about. Don't rename.
- **`up_users.uuid`** is added via Knex during bootstrap, *not* declared as
  a Strapi schema field. This is deliberate — touching the
  `users-permissions` schema would force host projects to re-migrate on
  every Strapi minor version bump.
- **`detectSkinVariant` is imported from `@loontail/minecraft-kit`**,
  not re-implemented here. The plugin uses it for legacy rows that don't
  carry a stored `variant`. New uploads always supply the variant explicitly.
- **PNG validation lives in `@loontail/yggdrasil-core`** —
  `validatePngBuffer` and `assertPngBuffer`. Reuse it on both server and
  client. Don't write a parallel IHDR parser in either consumer.
- **`signaturePublickeys[]`** (plural) is the rotation surface. The metadata
  endpoint exposes both the active key and any archived public keys in
  `data/yggdrasil/keys/archive/*.pub.pem`. authlib-injector tries them in
  order.
- **`encodeTexturesPayloadBase64` is what gets signed**, not the underlying
  JSON. The base64 string is the canonical signed form — same as Mojang's
  signature scheme.
- **Empty `skinDomains` array** in plugin config is *not* an error — the
  `readConfig` helper derives `[hostname(publicUrl)]` from the public URL.
  Always go through `readConfig` to get the resolved value.
- **SQLite** cannot add foreign keys to existing tables. The
  `ensureTextureForeignKeys` bootstrap step catches that case and logs a
  debug note. The admin UI's Validate + Purge-missing flow is the
  documented manual cleanup path for SQLite deployments.
- **The `yggdrasil-token-auth` policy attaches the loaded user to
  `ctx.state.yggdrasilUser`.** Texture mutation controllers read it from
  there — don't re-validate the token inside the controller.
- **`joinBackend: 'db'`** is reserved. Today both `'memory'` and `'db'` route
  to the in-memory backend. A future SQL-backed implementation will be
  shareable across multi-node deployments.
- **No silent catches.** Empty `catch` blocks need a one-line comment
  explaining why (e.g. "ENOENT during best-effort cleanup; we are about to
  throw the real error").

## Tests live in `packages/<pkg>/tests/`

- **`packages/yggdrasil-core/tests/`** — pure unit tests for UUID, PNG, and
  textures-payload helpers; schema round-trip tests.
- **`packages/yggdrasil-client/tests/`** — mocked-fetch tests for every method
  on `YggdrasilClient`. Coverage threshold: 70% across all metrics.
- **`packages/strapi-plugin-yggdrasil/server/**/*.test.ts`** — service and
  policy tests (`crypto.test.ts`, `join-sessions.test.ts`,
  `yggdrasil-token-auth.test.ts`). Strapi instance is stubbed via the
  `StrapiInstance` minimal-surface type from `server/types.ts`.

Coverage thresholds in `vitest.config.ts` are floors, not goals. Aim for
≥ 80% on any module you change.

## When you write user-facing docs

User-facing docs live in `docs-site/`. The site is a single VitePress
project at the monorepo root, configured to host all three packages from one
URL. Rules:

- One paragraph per concept. Don't pad.
- Code samples must compile against the real package API. If a sample needs
  updating because the API changed, update the sample in the same PR.
- Use the Russian-friendly hostname pattern (`auth.example.com`) — many of
  the project's users deploy under their own domains in CIS regions.

## History

Use `git log` for the change record. There is no CHANGELOG — breaking
changes are flagged in PR titles with `feat!:` / `fix!:`, so they're
findable with `git log --grep='!:'`.

Per-package release tags use the short name: `yggdrasil-core-v0.1.0`,
`yggdrasil-client-v0.1.0`, `strapi-plugin-yggdrasil-v0.1.0`. CI handles
auto-bumps for `patch` releases; minor / major bumps require a manual
`chore(release): …` commit as documented in
[`dev-workflow.md`](./dev-workflow.md).
