# Architecture (internal)

This is the maintainer-oriented architecture overview. The user-facing
version in [docs-site/guides/architecture.md](../docs-site/guides/architecture.md)
has the system-level diagram; this file focuses on internal layering and
file organisation.

## Package boundaries

```
@loontail/yggdrasil-core         (no other workspace deps)
        ▲                                    ▲
        │                                    │
@loontail/yggdrasil-client            @loontail/strapi-plugin-yggdrasil
                                       (also depends on
                                        @loontail/minecraft-kit and skinview3d)
```

`yggdrasil-core` is the only package that can be imported by both of the
others. Cross-package consumption goes through `src/index.ts` only — deep
imports (`@loontail/yggdrasil-core/src/...`) are forbidden in CI via Biome's
restricted-import rules.

## `@loontail/yggdrasil-core`

```
src/
├── constants/           ← endpoint paths, asset dimensions
├── contracts/           ← Zod schemas for every wire payload
├── errors/              ← YggdrasilCoreError, codes, type guards
├── helpers/             ← uuid.ts, png.ts, textures-payload.ts
├── types/               ← TypeScript types, branded string aliases
└── index.ts             ← public re-exports
```

Public surface is exactly `src/index.ts`. Anything else is internal.

Layers within the package:

1. `types/` and `constants/` are leaves — they don't import from anywhere
   inside the package.
2. `errors/` depends on `types/`.
3. `helpers/` depends on `errors/`, `types/`, `constants/`.
4. `contracts/` depends on `types/`, `constants/`.
5. `index.ts` re-exports.

## `@loontail/yggdrasil-client`

```
src/
├── authlib-injector.ts  ← version constant, jar resolution, JVM arg builder
├── client.ts            ← YggdrasilClient class
├── errors/              ← YggdrasilClientError, codes, type guards
├── http.ts              ← postJson, getJson, putMultipart, deleteWithAuth
└── index.ts             ← public re-exports
scripts/
└── fetch-authlib-injector.mjs  ← downloads vendor/authlib-injector-<v>.jar at prebuild
vendor/
└── authlib-injector-<v>.jar    ← gitignored; ships in npm tarball via package.json#files
tests/
└── client.test.ts       ← mocks fetch; covers every method + error path
```

The client class composes the HTTP primitives in `http.ts`. The primitives
don't know anything about the Yggdrasil protocol — they're generic
`postJson / getJson / putMultipart / deleteWithAuth` helpers that take a
`fetch` and a Zod schema and produce a parsed response.

`authlib-injector.ts` is independent of the client class — it's filesystem
+ string operations only. The `AUTHLIB_INJECTOR_VERSION` constant is the
single source of truth for the bundled jar version; `scripts/fetch-authlib-injector.mjs`
reads it.

## `@loontail/strapi-plugin-yggdrasil`

```
server/
├── bootstrap.ts                            ← orchestrates startup steps
├── bootstrap-steps/
│   ├── ensure-users-uuid-column.ts
│   ├── ensure-texture-foreign-keys.ts
│   ├── grant-public-permissions.ts
│   └── token-cleanup.ts
├── register.ts                             ← appends error-shape middleware before routes load
├── config.ts                               ← defaults, validator, readConfig helper
├── types.ts                                ← StrapiInstance / KnexLike / KoaContext shapes
│
├── utils/
│   ├── strapi-runtime.ts                   ← pluginService<T>(strapi, name)
│   └── http.ts                             ← parseListQuery, buildPaginationMeta
│
├── controllers/
│   ├── root.ts                             ← GET /
│   ├── authserver.ts                       ← /authserver/*
│   ├── sessionserver.ts                    ← /sessionserver/*
│   ├── api.ts                              ← /api/profiles/minecraft
│   ├── textures.ts                         ← /textures/* (public reads + self-service)
│   ├── textures-admin.ts                   ← /yggdrasil/textures/* (admin namespace)
│   ├── textures-helpers.ts                 ← persistAsset, validatePngOrThrow, parseVariant
│   └── helpers.ts                          ← parseOrThrow, YggdrasilHttpError, re-exports pluginService
│
├── routes/
│   ├── root.routes.ts
│   ├── authserver.routes.ts
│   ├── sessionserver.routes.ts
│   ├── api.routes.ts
│   ├── textures.routes.ts                  ← content-api namespace
│   ├── textures-admin.routes.ts            ← admin namespace
│   └── index.ts                            ← combines both namespaces
│
├── services/
│   ├── crypto.ts                           ← RSA key generation, loading, SHA1withRSA signing
│   ├── tokens.ts                           ← issue / validate / refresh / invalidate / cleanupExpired
│   ├── users.ts                            ← findByUuid, findByIdentifier, ensureUuid
│   ├── passwords.ts                        ← thin wrapper around users-permissions.user.validatePassword
│   ├── storage.ts                          ← init, file I/O, revision-tagged filename builder
│   ├── textures-store.ts                   ← yggdrasil_player_{skins,capes} CRUD (kind-parameterised)
│   ├── textures-property.ts                ← build(user) → signed GameProfileProperty
│   ├── join-sessions.ts                    ← memory backend (db backend stubbed)
│   └── index.ts                            ← factory exports
│
├── content-types/
│   ├── token/schema.json                   ← yggdrasil_tokens
│   ├── player-skin/schema.json             ← yggdrasil_player_skins
│   └── player-cape/schema.json             ← yggdrasil_player_capes
│
├── policies/
│   └── yggdrasil-token-auth.ts             ← Bearer-token extraction + validation
│
├── middlewares/
│   └── error-shape.ts                      ← wraps errors into Yggdrasil envelopes
│
├── migrations/
│   └── skins-registry-merge.ts             ← one-shot legacy-data migration
│
└── index.ts                                ← plugin definition object

admin/
└── src/
    ├── index.ts                            ← plugin registration in Strapi admin UI
    ├── pluginId.ts                         ← 'yggdrasil'
    ├── pages/
    │   ├── App/                            ← root navigation, tabs
    │   ├── TexturesPage/
    │   │   ├── index.tsx                   ← page composition + state
    │   │   ├── PageHeader.tsx              ← title, subtitle, action buttons
    │   │   ├── TabNav.tsx                  ← Skins / Capes switcher
    │   │   ├── AssetTab.tsx                ← list body (generic on kind)
    │   │   ├── SkinCard.tsx                ← grid card
    │   │   ├── SkinDetailModal.tsx         ← full-detail modal with skinview3d
    │   │   ├── UploadModal.tsx             ← admin upload form
    │   │   └── Paginator.tsx
    │   └── SessionsPage/                   ← placeholder
    ├── components/
    │   ├── PluginIcon/                     ← sidebar icon
    │   ├── SkinViewer3D/                   ← skinview3d wrapper
    │   └── SkinPreview2D/                  ← static PNG preview
    ├── hooks/                              ← usePaginatedList, useTranslate
    ├── api/texturesApi.ts                  ← fetch calls to /yggdrasil/textures/*
    ├── types/                              ← API response types
    └── translations/                       ← i18n JSON

loader.js                                    ← CommonJS bootstrap: requires dist/server, unwraps .default
strapi-server.ts                             ← stub TS entry for source-tree resolution
```

### Allowed dependency direction

```
loader.js                                    ← Strapi's plugin loader
  ↓
server/index.ts                              ← exports plugin definition
  ↓
server/bootstrap.ts, register.ts, config.ts
server/controllers/*, routes/*
  ↓
server/services/*                            ← cross-imports allowed within services/
  ↓
server/utils/*, server/types.ts, server/policies/, server/middlewares/
@loontail/yggdrasil-core                     ← shape validation, signing helpers, PNG
@loontail/minecraft-kit                      ← detectSkinVariant for legacy rows
```

`server/utils/` is leaf code — its only imports are `server/types.ts` and
node built-ins. Both controllers and services import from `utils/`.
Services never import from controllers. Admin (`admin/src/`) and server
(`server/`) never import from each other.

### Plugin definition

`server/index.ts` exports:

```ts
export default {
  register,
  bootstrap,
  destroy,
  config,         // { default, validator }
  contentTypes,   // { token, playerSkin, playerCape }
  controllers,    // { root, authserver, sessionserver, api, textures, 'textures-admin' }
  routes,         // { 'content-api', admin }
  services,       // { crypto, tokens, users, passwords, storage, 'textures-store', 'textures-property', 'join-sessions' }
  middlewares,    // { 'error-shape' }
  policies,       // { 'yggdrasil-token-auth' }
};
```

Strapi reads these keys via its plugin loader. The `loader.js` exists
because Strapi's loader only recognises `.js` / `.json` for plugin entries,
and it does `module.exports = require('./dist/server').default` to unwrap
the TypeScript default export.

## Key design choices

- **Schema validation at the boundary.** Every controller calls
  `parseOrThrow(SchemaFromCore, ctx.request.body)`. Internal services don't
  re-validate.
- **Stateful concerns are explicit.** Tokens live in `yggdrasil_tokens`; join
  sessions live in the join-sessions service (memory map by default); files
  live on disk under `public/yggdrasil/`. No fourth state primitive.
- **Crypto is one service.** `services/crypto.ts` is the only consumer of
  the private key. Controllers that need a signed property call
  `services.textures-property.build()` which calls
  `services.crypto.signBase64()`.
- **Skin/cape twins collapse on `kind`.** `textures-store` exposes
  `findByUserId(kind, ...)` / `upsert(kind, ...)` / etc. instead of two
  near-identical methods. The same `AssetKind` discriminator threads
  through the controllers via `textures-helpers.persistAsset`.
- **Bootstrap is a flat list.** `bootstrap.ts` is purely orchestration —
  each step is its own file under `bootstrap-steps/`. Adding a step is
  one new file plus one line in the orchestrator.
- **Bootstrap phases are idempotent.** Every phase can run multiple times
  without effect; partial failures don't require a special recovery path.
- **No silent catches.** Empty `catch { }` blocks need a one-line comment
  explaining why.
