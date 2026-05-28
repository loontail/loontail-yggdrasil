# `@loontail/yggdrasil-core`

[![npm](https://img.shields.io/npm/v/@loontail/yggdrasil-core.svg)](https://www.npmjs.com/package/@loontail/yggdrasil-core)

Shared protocol library used by both the server (`@loontail/strapi-plugin-yggdrasil`)
and the client (`@loontail/yggdrasil-client`). Pure, runtime-agnostic — works in
Node ≥ 20, modern browsers, and Deno. Depends only on `zod`.

```bash
npm install @loontail/yggdrasil-core
```

## What it exports

```ts
import {
  // ── Helpers ────────────────────────────────────────────────────
  isUuidUndashed,
  isUuidDashed,
  undashUuid,
  dashUuid,
  randomUndashedUuid,
  asPlayerUuid,

  validatePngBuffer,
  assertPngBuffer,

  buildTexturesPayload,
  encodeTexturesPayloadBase64,
  decodeTexturesPayloadBase64,

  // ── Schemas (Zod) ──────────────────────────────────────────────
  AuthenticateRequestSchema,
  RefreshRequestSchema,
  ValidateRequestSchema,
  InvalidateRequestSchema,
  JoinRequestSchema,
  HasJoinedQuerySchema,
  ProfileLookupParamSchema,
  ProfileLookupQuerySchema,
  BulkProfilesRequestSchema,
  TexturesLookupResponseSchema,
  YggdrasilSessionSchema,
  GameProfileSchema,
  GameProfilePropertySchema,
  YggdrasilUserSchema,
  YggdrasilMetaSchema,
  YggdrasilMetaInfoSchema,
  YggdrasilMetaFeaturesSchema,
  YggdrasilErrorBodySchema,

  // ── Types ──────────────────────────────────────────────────────
  type PlayerUuid,
  type AccessToken,
  type ClientToken,
  type ServerId,
  type YggdrasilSession,
  type GameProfile,
  type GameProfileProperty,
  type YggdrasilUser,
  type YggdrasilMeta,
  type YggdrasilMetaInfo,
  type YggdrasilMetaFeatures,
  type YggdrasilErrorBody,
  type YggdrasilAuthAgent,
  type TexturesPayload,
  type TexturesPayloadTextures,
  type TextureSkinEntry,
  type TextureCapeEntry,
  type BuildTexturesPayloadInput,
  type SkinVariant,
  type TextureKind,
  type SkinAssetKind,
  type PngValidationResult,

  // ── Constants ──────────────────────────────────────────────────
  SkinVariants,
  TextureKinds,
  SkinAssetKinds,
  SKIN_VALID_DIMENSIONS,
  CAPE_VALID_DIMENSIONS,
  YggdrasilEndpoints,
  YggdrasilErrorKinds,

  // ── Errors ─────────────────────────────────────────────────────
  YggdrasilCoreError,
  YggdrasilCoreErrorCodes,
  type YggdrasilCoreErrorCode,
  type YggdrasilCoreErrorOptions,
  isYggdrasilCoreError,
  isYggdrasilCoreErrorCode,
} from '@loontail/yggdrasil-core';
```

## Guides

- [UUID helpers](../guides/core-uuid)
- [PNG validation](../guides/core-png)
- [Textures payload](../guides/core-textures-payload)
- [Schemas & types](../guides/core-schemas)

## At a glance

| Area | What you get |
|---|---|
| UUID conversion | `undashUuid` / `dashUuid` (validating round-trip, lowercase) |
| UUID generation | `randomUndashedUuid` (uses `globalThis.crypto`) |
| PNG validation | `validatePngBuffer` (returning union) / `assertPngBuffer` (throwing) |
| Textures payload | `buildTexturesPayload` + base64 codec |
| Wire schemas | Zod schemas for every request / response shape |
| Endpoint paths | `YggdrasilEndpoints` constants |
| Error envelope kinds | `YggdrasilErrorKinds` |
| Stable error class | `YggdrasilCoreError` + type guards |

## Why a separate package?

- The plugin and the client both need the same shape definitions; vendoring
  them would drift.
- The plugin needs `buildTexturesPayload` for signing; the client needs
  `decodeTexturesPayloadBase64` for parsing. Both flow through the same code
  path.
- PNG validation lives here so the client can short-circuit broken uploads
  before they hit the wire, and the server can run the exact same checks on
  incoming bytes.

## Engine

- Node ≥ 20, modern browser, Deno.
- ESM + CommonJS dual build (`./dist/index.js` + `./dist/index.cjs`).
- Zero runtime dependencies other than `zod`.
- `sideEffects: false` — tree-shakeable.
