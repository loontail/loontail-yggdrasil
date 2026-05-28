# Architecture

```
            ┌─────────────────────────────────────────────────────────┐
            │                Vanilla Minecraft client                  │
            │                                                          │
            │      JVM   ←   -javaagent: authlib-injector.jar=<api>    │
            └─────────────┬──────────────────────────────┬─────────────┘
                          │                              │
                  authlib-injector              authlib-injector
                  rewrites GET /                rewrites session calls
                          │                              │
                          ▼                              ▼
┌────────────────────────────────────────────────────────────────────────┐
│           Strapi v5 host with @loontail/strapi-plugin-yggdrasil        │
│                                                                        │
│  /api/yggdrasil/  (mounted by the plugin)                              │
│    /                              ALI metadata + signaturePublickey    │
│    /authserver/{authenticate,refresh,validate,invalidate}              │
│    /sessionserver/session/minecraft/{join,hasJoined,profile/:uuid}     │
│    /api/profiles/minecraft        bulk username → profile lookup       │
│    /textures/{:uuid,skin,cape}    GET / PUT / DELETE skin/cape         │
│                                                                        │
│  /admin/plugins/yggdrasil/        Texture browser UI                   │
│  /yggdrasil/textures/*  Admin-only texture management        │
│                                                                        │
│  Database:                                                             │
│    up_users (+ uuid column)                                            │
│    yggdrasil_tokens                                                    │
│    yggdrasil_player_skins                                              │
│    yggdrasil_player_capes                                              │
│                                                                        │
│  Disk:                                                                 │
│    public/yggdrasil/textures/skins/<uuid>-<rev>.png                    │
│    public/yggdrasil/textures/capes/<uuid>-<rev>.png                    │
│    data/yggdrasil/keys/active.key.pem  (RSA-4096 private key)          │
└─────────┬───────────────────────────────────────────────┬──────────────┘
          ▲                                               ▲
          │ HTTPS                                         │ HTTPS + Bearer
          │                                               │
┌─────────┴────────────────────────────┐    ┌─────────────┴──────────────┐
│   Your launcher                      │    │   Your launcher (Electron) │
│   @loontail/yggdrasil-client         │    │   uploads / replaces skin  │
│                                      │    │   via PUT /textures/skin   │
│   YggdrasilClient.authenticate(...)  │    └────────────────────────────┘
│   YggdrasilClient.refresh(...)       │
│   buildAuthlibInjectorJvmArg(...)    │
└──────────────────────────────────────┘
```

## Packages

### `@loontail/yggdrasil-core`

Pure protocol library. No HTTP, no Strapi, no Node-only APIs except where
`globalThis.Buffer` is opportunistically used to speed up base64. The server and
the client both depend on it for:

- Protocol **types** — `YggdrasilSession`, `GameProfile`, `YggdrasilMeta`,
  `TexturesPayload`, …
- **Zod schemas** for every endpoint payload — `AuthenticateRequestSchema`,
  `YggdrasilSessionSchema`, `JoinRequestSchema`, …
- **UUID helpers** — `randomUndashedUuid`, `undashUuid`, `dashUuid`, type guards.
- **PNG validation** — `validatePngBuffer`, `assertPngBuffer`. Inspects bytes;
  rejects spoofed `Content-Type` payloads, oversized skins, wrong-dimension capes.
- **Textures payload codec** — `buildTexturesPayload`, `encodeTexturesPayloadBase64`,
  `decodeTexturesPayloadBase64`.
- **Endpoint constants** — `YggdrasilEndpoints` for path strings.
- **Error registry** — `YggdrasilCoreError` with stable codes (`invalid_uuid`,
  `invalid_textures_input`, `invalid_png`).

### `@loontail/strapi-plugin-yggdrasil`

The server side. A Strapi v5 plugin that:

- **Mounts routes** under `/api/yggdrasil/*` (public, content-API namespace) and
  `/yggdrasil/*` (admin JWT-protected).
- **Owns three tables**: `yggdrasil_tokens`, `yggdrasil_player_skins`,
  `yggdrasil_player_capes`. None are visible in the content manager — they're
  pure infrastructure.
- **Adds one column** to `up_users`: a nullable `uuid varchar(32)` with a partial
  unique index. The user table itself is left otherwise untouched.
- **Generates an RSA-4096 keypair** on first run; signs the `textures` profile
  property with SHA1withRSA. Archived public keys are surfaced in the meta
  endpoint so old signatures still verify after rotation.
- **Stores skin/cape PNGs** under `public/yggdrasil/textures/{skins,capes}/<uuid>-<rev>.png`
  with a 12-hex-char revision suffix that cache-busts on every upload.
- **Ships an admin UI** under `/admin/plugins/yggdrasil` — a texture browser with
  3D previews powered by `skinview3d`.

### `@loontail/yggdrasil-client`

The launcher side. A small TypeScript HTTP client that wraps every Yggdrasil
endpoint with input validation, response schema parsing, and a single error
class (`YggdrasilClientError` with codes `network` / `http_error` /
`invalid_response` / `invalid_request` / `authlib_injector_missing`).

Also bundles `authlib-injector-1.2.5.jar` inside the package's `vendor/` folder
(downloaded at `prebuild` time from the upstream GitHub release) and exposes:

- `resolveAuthlibInjectorJarPath()` — locate the bundled jar, with an env-var
  override for packaged Electron apps.
- `buildAuthlibInjectorJvmArg({ jarPath, apiRoot })` — produce
  `-javaagent:<jar>=<apiRoot>` for the JVM.

The client carries no internal state. It never persists tokens, never opens
files, never spawns processes. Token storage is entirely the host launcher's
responsibility.

## Dependency direction

```
yggdrasil-core     ←  yggdrasil-client      (HTTP wrapper imports types + schemas + helpers)
yggdrasil-core     ←  strapi-plugin-yggdrasil (server imports same schemas + signing helpers)
```

`yggdrasil-core` depends on nothing except `zod`. The client depends on core +
`zod`. The plugin depends on core, `@loontail/minecraft-kit` (for skin variant
detection on legacy rows), and `skinview3d` (admin 3D preview).

## Boundary validation

Every wire crossing goes through a Zod schema from `@loontail/yggdrasil-core`:

- Inside the plugin, controllers call `parseOrThrow(Schema, ctx.request.body)`
  before handing data to services.
- Inside the client, every response body is parsed against the matching schema
  before being returned. A failure throws `YggdrasilClientError(invalid_response)`
  with the path of the offending field.

Hand-written predicates only appear where the input has already been validated
at the boundary and we just need narrowing inside.

## Where state lives

| State | Lives in | Notes |
|---|---|---|
| User credentials | `up_users` | Owned by `users-permissions`. |
| Player UUID | `up_users.uuid` | One nullable column added by the plugin. |
| Access / client tokens | `yggdrasil_tokens` | Per-user cap, TTL, hourly cleanup. |
| Join sessions | In-memory (default) | `joinBackend: 'memory'` — 30-second TTL, swept every 5s. A DB backend is reserved (`'db'`) but currently routes to memory. |
| Skin / cape rows | `yggdrasil_player_skins` / `yggdrasil_player_capes` | One row per user; PK on `userId`. |
| Skin / cape files | `public/yggdrasil/textures/{skins,capes}/` | Filename = `<uuid>-<6 random bytes>.png`. |
| Active signing key | `data/yggdrasil/keys/active.key.pem` | RSA-4096, PKCS#8. |
| Archived public keys | `data/yggdrasil/keys/archive/*.pub.pem` | Surfaced in meta `signaturePublickeys[]`. |

## What the launcher does NOT do

- It does not persist `accessToken` for you — that's a security-posture decision
  for the host app (Keychain, libsecret, etc).
- It does not retry — failed requests throw immediately.
- It does not set a timeout — pass an aborting `fetch` if you need one.
- It does not own the `up_users` row — accounts are created through
  `users-permissions` as usual.

## What the plugin does NOT do

- It does not provide a sign-out endpoint. Tokens expire by TTL. Launchers
  discard their local session on logout.
- It does not enable email-as-login at the plugin level — set
  `feature.non_email_login` in your `users-permissions` config and Yggdrasil
  picks it up via `findByIdentifier`.
- It does not modify the Strapi `up_users` schema beyond adding `uuid`. The
  column is managed entirely from inside the plugin via Knex.
