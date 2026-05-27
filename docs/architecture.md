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
├── constants/           ← endpoint paths, error kind strings, asset dimensions
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
├── bootstrap.ts                  ← 5 idempotent boot phases + token cleanup tick
├── register.ts                   ← appends error-shape middleware before routes load
├── config.ts                     ← defaults, validator, readConfig helper
├── types.ts                      ← StrapiInstance / KnexLike / KoaContext shapes
│
├── controllers/
│   ├── root.ts                   ← GET /
│   ├── authserver.ts             ← /authserver/*
│   ├── sessionserver.ts          ← /sessionserver/*
│   ├── api.ts                    ← /api/profiles/minecraft
│   ├── textures.ts               ← /textures/* (public reads + token-protected writes)
│   ├── textures-admin.ts         ← /admin/api/yggdrasil/textures/* (admin namespace)
│   └── helpers.ts                ← pluginService(), parseOrThrow(), YggdrasilHttpError
│
├── routes/
│   ├── root.routes.ts
│   ├── authserver.routes.ts
│   ├── sessionserver.routes.ts
│   ├── api.routes.ts
│   ├── textures.routes.ts        ← content-api namespace
│   ├── textures-admin.routes.ts  ← admin namespace
│   └── index.ts                  ← combines both namespaces
│
├── services/
│   ├── crypto.ts                 ← RSA key generation, loading, SHA1withRSA signing
│   ├── tokens.ts                 ← issue / validate / refresh / invalidate / cleanupExpired
│   ├── users.ts                  ← findByUuid, findByIdentifier, ensureUuid
│   ├── passwords.ts              ← thin wrapper around users-permissions.user.validatePassword
│   ├── storage.ts                ← file I/O + revision-tagged filename builder
│   ├── textures-store.ts         ← yggdrasil_player_{skins,capes} CRUD + pagination
│   ├── textures.ts               ← buildTexturesProperty (signs and absolutises URL)
│   ├── join-sessions.ts          ← memory backend (db backend stubbed)
│   └── index.ts                  ← factory exports
│
├── content-types/
│   ├── token/schema.json         ← yggdrasil_tokens
│   ├── player-skin/schema.json   ← yggdrasil_player_skins
│   └── player-cape/schema.json   ← yggdrasil_player_capes
│
├── policies/
│   └── yggdrasil-token-auth.ts   ← Bearer-token extraction + validation
│
├── middlewares/
│   └── error-shape.ts            ← wraps errors into Yggdrasil envelopes
│
├── migrations/
│   └── skins-registry-merge.ts   ← one-shot legacy-data migration
│
└── index.ts                      ← plugin definition object

admin/
└── src/
    ├── index.ts                  ← plugin registration in Strapi admin UI
    ├── pluginId.ts               ← 'yggdrasil'
    ├── pages/
    │   ├── App/                  ← root navigation, tabs
    │   ├── TexturesPage/         ← skin / cape browser, upload, detail modal
    │   └── SessionsPage/         ← placeholder
    ├── components/
    │   ├── PluginIcon/           ← sidebar icon
    │   ├── SkinViewer3D/         ← skinview3d wrapper
    │   └── SkinPreview2D/        ← static PNG preview
    ├── hooks/                    ← usePaginatedList, useTranslate
    ├── api/texturesApi.ts        ← fetch calls to /admin/api/yggdrasil/textures/*
    ├── types/                    ← API response types
    └── translations/             ← i18n JSON

loader.js                          ← CommonJS bootstrap: requires dist/server, unwraps .default
strapi-server.ts                   ← stub TS entry for source-tree resolution
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
server/types.ts, server/policies/, server/middlewares/
@loontail/yggdrasil-core                     ← shape validation, signing helpers, PNG
@loontail/minecraft-kit                      ← detectMojangSkinVariant for legacy rows
```

Admin (`admin/src/`) and server (`server/`) never import from each other.
Shared types live in their own `shared/` directory if and when they exist.
Today both sides hand-write what they need.

### Plugin definition

`server/index.ts` exports:

```ts
export default {
  register,
  bootstrap,
  destroy,
  config,         // { default, validator }
  contentTypes,   // { token, playerSkin, playerCape }
  controllers,    // { root, authserver, sessionserver, api, textures, texturesAdmin }
  routes,         // { 'content-api', admin }
  services,       // { crypto, tokens, users, passwords, storage, texturesStore, textures, joinSessions }
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
  `services.textures.buildTexturesProperty()` which calls
  `services.crypto.signBase64()`.
- **One file per route group.** A new endpoint adds a route to
  `routes/<group>.routes.ts`, a handler to `controllers/<group>.ts`, and
  optionally a service method. The boilerplate stops at three files per
  endpoint.
- **Bootstrap phases are idempotent.** Every phase can run multiple times
  without effect; partial failures don't require a special recovery path.
- **No silent catches.** Empty `catch { }` blocks need a one-line comment
  explaining why.
