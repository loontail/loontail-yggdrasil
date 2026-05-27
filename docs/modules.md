# Modules

One-paragraph orientation per source module across the three packages.

## `@loontail/yggdrasil-core`

### `src/constants/endpoints.ts`
`YggdrasilEndpoints` — the canonical path strings the Yggdrasil API uses
(`/authserver/authenticate`, `/sessionserver/session/minecraft/join`, etc).
Anything HTTP-related should reach for these instead of inlining literals,
both for find-by-grep and to keep the protocol in one place.

### `src/contracts/*`
Zod schemas for every wire payload, one file per logical group: `authserver.ts`,
`sessionserver.ts`, `api.ts`, `meta.ts`, `profile.ts`, `session.ts`,
`textures-api.ts`, `error.ts`. Schemas validate both request bodies (server
side) and response bodies (client side). Use `safeParse` if you want to map
errors to a custom shape, `parse` if a throw is fine.

### `src/errors/yggdrasil-core-error.ts`
`YggdrasilCoreError` class with stable `code` field, `context` map, and the
type guards `isYggdrasilCoreError` / `isYggdrasilCoreErrorCode`. Codes:
`invalid_uuid`, `invalid_textures_input`, `invalid_png`. Always set
`cause` on the error when wrapping a lower-level exception.

### `src/helpers/uuid.ts`
UUID detection, conversion, and generation: `isUuidUndashed`, `isUuidDashed`,
`undashUuid`, `dashUuid`, `randomUndashedUuid`, branded constructors
(`asPlayerUuid`, `asAccessToken`, `asClientToken`, `asServerId`). Generation
uses `globalThis.crypto.randomUUID()` so it works in Node 19+, modern
browsers, and Deno. Throws `YggdrasilCoreError('invalid_uuid')` with the
input in `context.value` on shape mismatch.

### `src/helpers/png.ts`
Byte-level PNG validation. `validatePngBuffer(buffer, kind)` returns a
discriminated union with width / height on success or a reason string on
failure; `assertPngBuffer` throws `YggdrasilCoreError('invalid_png')`. Both
accept `ArrayBuffer` and `Uint8Array`. Validation is shallow on purpose —
signature + IHDR + dimensions — because that's what the Yggdrasil protocol
actually cares about; libpng / `BufferedImage` handle the rest.

### `src/helpers/textures-payload.ts`
The `texturesPayload` JSON codec: `buildTexturesPayload` (validates and
assembles), `encodeTexturesPayloadBase64` (Buffer when available, manual
UTF-8 → base64 otherwise), `decodeTexturesPayloadBase64` (reverse). The
plugin signs `encodeTexturesPayloadBase64`'s output and ships it inside a
`GameProfile.properties[0]`.

### `src/types/*`
Domain types: `branded.ts` (compile-time string brands), `agent.ts`,
`error.ts`, `meta.ts`, `profile.ts`, `session.ts`, `textures.ts`. Types
that map 1:1 to a Zod schema live next to the schema in `contracts/` and
are derived via `z.infer<typeof Schema>`.

## `@loontail/yggdrasil-client`

### `src/index.ts`
Public re-exports. Curated subset of `@loontail/yggdrasil-core` types and
constants (so consumers don't usually need to depend on core directly) plus
the client class, the authlib-injector helpers, and the error registry.

### `src/client.ts`
The `YggdrasilClient` class. Constructor takes `apiRoot` and an optional
`fetch` override. One method per endpoint; each method composes the HTTP
primitives in `src/http.ts` with a Zod schema from `@loontail/yggdrasil-core`.
No retries, no built-in timeouts, no header hook — wrap them into your
`fetch` instance if you need them. PNG validation in `uploadSkin` /
`uploadCape` runs synchronously via `assertPngBuffer` before the request is
built.

### `src/http.ts`
Generic HTTP primitives: `postJson`, `getJson`, `putMultipart`,
`deleteWithAuth`, `runFetch` (wraps `fetch` failures into
`YggdrasilClientError('network')`), `handleResponse` (parses the Yggdrasil
error envelope on non-2xx, runs the response schema on 2xx). Each primitive
takes a Zod schema generic so the return type is inferred — pass `null` for
204 endpoints.

### `src/authlib-injector.ts`
`AUTHLIB_INJECTOR_VERSION` constant (`'1.2.5'`),
`AUTHLIB_INJECTOR_VENDOR_DIR_ENV` (env var name override),
`resolveAuthlibInjectorJarPath()` (env override first, then package's own
`vendor/`), and `buildAuthlibInjectorJvmArg({ jarPath, apiRoot })` (just a
string formatter). Missing jar throws
`YggdrasilClientError('authlib_injector_missing')` with the searched
directory in context.

### `src/errors/yggdrasil-client-error.ts`
`YggdrasilClientError` class with stable codes: `network`, `http_error`,
`invalid_response`, `invalid_request`, `authlib_injector_missing`. Type
guards mirror the core package's. The `context` shape carries `status` /
`body` / `url` when applicable, plus the original error in `cause`.

### `scripts/fetch-authlib-injector.mjs`
Build script that downloads `authlib-injector-<version>.jar` from upstream
GitHub releases and writes it to `vendor/`. Idempotent — skips if the file
exists. Reads the version from `AUTHLIB_INJECTOR_VERSION` in the source
tree. Wired into the package's `prebuild` hook.

### `tests/client.test.ts`
Vitest tests covering every method on `YggdrasilClient`. Fetcher is mocked
via `vi.fn()`. Covers happy path + every error code path. Also tests
`buildAuthlibInjectorJvmArg` and `bulkProfiles`'s client-side cap.

## `@loontail/strapi-plugin-yggdrasil`

### `loader.js`
CommonJS bootstrap that Strapi's plugin loader resolves. Does
`require('./dist/server').default` and re-exports the result. Required
because Strapi's plugin loader only matches `.js` / `.json` entries.

### `strapi-server.ts`
Stub TS entry that re-exports from `./server/index`. Used when the plugin
is consumed via source-tree resolution (`npm link`, monorepo workspaces).

### `server/index.ts`
Plugin definition object: `register`, `bootstrap`, `destroy`, `config`,
`contentTypes`, `controllers`, `routes`, `services`, `middlewares`,
`policies`. This is what Strapi reads.

### `server/bootstrap.ts`
Runs five idempotent boot phases (uuid column, skins-registry merge,
texture FKs, public permissions, crypto init), then starts the hourly
token cleanup tick. Sets `strapi.yggdrasilTokenCleanupInterval` so
`destroy` can clear it on hot reload.

### `server/register.ts`
Appends the `plugin::yggdrasil.error-shape` middleware to the global chain
before routes load. The middleware catches Yggdrasil errors thrown by
controllers and rewrites the Koa response into a Yggdrasil error envelope.

### `server/config.ts`
Default config object, validator, and `readConfig(strapi)` helper. The
validator runs on plugin load and throws if `publicUrl` is empty / invalid,
`tokens.accessTtlSeconds <= 0`, `tokens.maxPerUser <= 0`, or `joinBackend`
isn't `'memory' | 'db'`. `readConfig` derives `skinDomains` from
`publicUrl` when the array is empty.

### `server/types.ts`
Minimal-surface types for the Strapi instance, Knex, and Koa contexts. Avoids
a direct `@strapi/types` dependency so the plugin doesn't break on every
Strapi version bump. Loose enough that mocks in tests work.

### `server/controllers/root.ts`
`GET /` — returns `YggdrasilMeta` (server name, skin domains, signature
public keys).

### `server/controllers/authserver.ts`
`authenticate`, `refresh`, `validate`, `invalidate`. Each parses the
request body via the matching schema, calls
`services.{users, passwords, tokens}`, and returns `YggdrasilSession` or
`204` no-body.

### `server/controllers/sessionserver.ts`
`join` (record a join session in the in-memory store), `hasJoined` (look up
by username + serverId + ip, return signed profile), `profile` (look up
by uuid, signed or unsigned based on `?unsigned`).

### `server/controllers/api.ts`
`bulkProfiles` — flat array of usernames → flat array of `{ id, name }`.
Names not found are omitted (Mojang behaviour).

### `server/controllers/textures.ts`
Public reads (`getTextures`) and token-protected writes (`uploadSkin`,
`uploadCape`, `deleteSkin`, `deleteCape`). Uploads run `assertPngBuffer`,
detect variant via minecraft-kit for legacy rows, and call
`services.texturesStore.upsert*`. Owner is identified from
`ctx.state.yggdrasilUser`, set by the `yggdrasil-token-auth` policy.

### `server/controllers/textures-admin.ts`
Admin namespace controllers: list (paginated, searchable), upload on
behalf of a user, delete by row id, validate (find rows with missing
files), purge-missing.

### `server/controllers/helpers.ts`
`pluginService(strapi, name)` (typed accessor), `parseOrThrow(schema, value, errorKind?)`
(boundary validator that throws `YggdrasilHttpError`), `YggdrasilHttpError`
class (caught by the error-shape middleware to produce the Yggdrasil
envelope).

### `server/routes/*.routes.ts`
Strapi route definitions, one file per controller group. Each route lists
its handler, optional `config.policies`, and optional `config.auth: false`
for public endpoints. `routes/index.ts` combines them into the two
namespaces — `content-api` (public Yggdrasil) and `admin`.

### `server/services/crypto.ts`
Single owner of the private key. `init()` loads or generates the RSA-4096
keypair and reads archived public keys from the archive directory.
`signBase64(payload)` signs via SHA1withRSA / PKCS#1 v1.5 (Mojang-compatible).
`activePublicPem()` / `allPublicPems()` are read by the root controller.

### `server/services/tokens.ts`
`issue(userId, clientToken?)` (with FIFO per-user cap eviction), `validate`,
`refresh`, `invalidate`, `cleanupExpired`. Tokens are 32 random bytes →
64-char hex. The cleanup loop runs hourly from bootstrap.

### `server/services/users.ts`
`findByUuid`, `findById`, `findByIdentifier` (username or email — flips
based on `users-permissions.feature.non_email_login`), `ensureUuid`
(lazy assignment on first authentication).

### `server/services/passwords.ts`
Thin wrapper around `users-permissions.plugin.user.validatePassword`.
Exists as a separate service so tests can stub it.

### `server/services/storage.ts`
`buildFilename(uuid)` (`${uuid}-${randomBytes(6).toString('hex')}.png`),
`write(kind, filename, buffer)`, `deleteIfExists(path)`, `publicUrlFor(kind, filename)`.

### `server/services/textures-store.ts`
`findSkinByUserId`, `findCapeByUserId`, `upsertSkin`, `upsertCape`,
`deleteSkin`, `deleteCape`, plus `listSkins(page, pageSize, search)` /
`listCapes(...)` for the admin UI. Combines the file-system call with the
DB row update in a single method so the invariant "file ↔ row" doesn't
drift.

### `server/services/textures.ts`
`buildTexturesProperty(user, skin, cape)` — builds the textures payload via
core, absolutises URLs against `publicUrl`, signs via crypto, returns the
`GameProfileProperty` ready to put into `GameProfile.properties[]`.

### `server/services/join-sessions.ts`
In-memory backend for `/sessionserver/session/minecraft/join`. `put`,
`take`, internal sweep every 5s, 30s TTL. The `'db'` config value is
reserved; today it routes to memory.

### `server/policies/yggdrasil-token-auth.ts`
Extracts `Authorization: Bearer <token>` (also accepts `?accessToken=…` for
some clients), validates against `yggdrasil_tokens`, attaches the loaded
user to `ctx.state.yggdrasilUser`. Returns 401 + Yggdrasil envelope on
missing / malformed header; returns 403 + envelope on expired / invalid
token.

### `server/middlewares/error-shape.ts`
Global Koa middleware that catches `YggdrasilHttpError` (and bare Zod
errors) and rewrites the response into a Yggdrasil envelope
(`{ error, errorMessage, cause? }`).

### `server/migrations/skins-registry-merge.ts`
One-shot migration from the legacy `skins-registry` plugin. Marker-guarded
via `yggdrasil_migrations` table. Three phases: copy files → atomic Knex
transaction (insert rows, drop old tables and columns, write marker) →
cleanup legacy directory best-effort.

### `server/content-types/*/schema.json`
Strapi content-type schemas for `yggdrasil_tokens`, `yggdrasil_player_skins`,
`yggdrasil_player_capes`. All three are hidden from the content manager
and the type builder.

### `admin/src/index.ts`
Strapi admin registration: side-menu link with `PluginIcon`, lazy-loaded
`App` page tree, i18n translations.

### `admin/src/pages/App/index.tsx`
Tab nav between Textures and Sessions. Routes `/plugins/yggdrasil/textures`
and `/plugins/yggdrasil/sessions`.

### `admin/src/pages/TexturesPage/*`
Tabbed Skins / Capes browser. `AssetTab.tsx` toggles list / upload mode.
`SkinCard.tsx` is the grid card. `SkinDetailModal.tsx` is the full-detail
modal with `SkinViewer3D`. `UploadModal.tsx` is the admin upload form.
`Paginator.tsx` is the page navigation control.

### `admin/src/components/SkinViewer3D/index.tsx`
`skinview3d` wrapper. Mounts the WebGL canvas, applies the user's skin URL
and (optionally) cape URL, exposes pause / resume / dispose controls.

### `admin/src/api/texturesApi.ts`
Wraps fetch calls to `/admin/api/yggdrasil/textures/*` with the admin JWT
already in scope (Strapi adds it for you when you go through its
`useFetchClient` hook).
