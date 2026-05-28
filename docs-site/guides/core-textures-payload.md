# Textures payload

A `GameProfile.properties[]` array can carry an entry named `textures`. Its
`value` is the base64-encoded JSON representation of the player's skin and
cape URLs. The `signature` field is the server's RSA-SHA1 signature over the
base64 bytes.

`@loontail/yggdrasil-core` exposes three helpers for building, encoding, and
decoding that payload.

## Exports

```ts
import {
  // Build
  buildTexturesPayload,
  // Encode / decode
  encodeTexturesPayloadBase64,
  decodeTexturesPayloadBase64,
  // Types
  type TexturesPayload,
  type TexturesPayloadTextures,
  type TextureSkinEntry,
  type TextureCapeEntry,
  type BuildTexturesPayloadInput,
  type SkinVariant,
  type TextureKind,
  // Constants
  SkinVariants,
  TextureKinds,
} from '@loontail/yggdrasil-core';
```

## Shape

```ts
type TexturesPayload = {
  readonly timestamp: number;            // ms since epoch
  readonly profileId: string;            // 32-char undashed lowercase hex UUID
  readonly profileName: string;          // in-game name
  readonly textures: TexturesPayloadTextures;
};

type TexturesPayloadTextures = {
  readonly SKIN?: TextureSkinEntry;
  readonly CAPE?: TextureCapeEntry;
};

type TextureSkinEntry = {
  readonly url: string;
  readonly metadata?: { readonly model: 'slim' }; // present iff variant === 'SLIM'
};

type TextureCapeEntry = {
  readonly url: string;
};
```

This is exactly the shape Mojang uses. authlib-injector parses it the same way.

## Building

```ts
import {
  buildTexturesPayload,
  SkinVariants,
} from '@loontail/yggdrasil-core';

const payload = buildTexturesPayload({
  profileId:   '11111111111111111111111111111111',
  profileName: 'Steve',
  skin: {
    url:     'https://auth.example.com/yggdrasil/textures/skins/1111…-abcdef.png',
    variant: SkinVariants.CLASSIC,
  },
  cape: {
    url: 'https://auth.example.com/yggdrasil/textures/capes/1111…-fedcba.png',
  },
});
```

Validation runs at build time. Throws `YggdrasilCoreError(invalid_textures_input)`
if:

- `profileId` isn't 32 hex chars (regex `/^[0-9a-f]{32}$/i`).
- `profileName` is empty.

`skin` and `cape` are independently optional — pass either, both, or neither.

Variant behaviour:

| Variant | What ends up in the payload |
|---|---|
| `CLASSIC` (default) | `SKIN: { url }` — no `metadata` field. |
| `SLIM` | `SKIN: { url, metadata: { model: 'slim' } }`. |

The vanilla Minecraft client reads `metadata.model === 'slim'` to switch arm
geometry. No `metadata` ⇒ classic.

`timestamp` defaults to `Date.now()` if you don't pass one. Mojang's payloads
carry the timestamp so the client can detect skin changes; this plugin uses
the upload time of the latest texture so consecutive `hasJoined` responses
for the same player keep the same timestamp until they re-upload.

## Encoding

```ts
const base64 = encodeTexturesPayloadBase64(payload);
// → "eyJ0aW1lc3RhbXAiOj…"
```

Returns the base64-encoded JSON. This is what goes into
`GameProfileProperty.value`. The server then RSA-signs *this base64 string*
(not the underlying JSON bytes) and puts the signature in
`GameProfileProperty.signature`.

The encoder uses `Buffer.from(JSON.stringify(p)).toString('base64')` when
`Buffer` is available (Node) and falls back to manual UTF-8 → base64 via
`TextEncoder` + `btoa` in browsers.

## Decoding

```ts
const payload = decodeTexturesPayloadBase64(property.value);
console.log(payload.textures.SKIN?.url);
console.log(payload.textures.SKIN?.metadata?.model);
console.log(payload.textures.CAPE?.url);
```

Reverse of the encoder. Returns a fully-typed `TexturesPayload`.

Throws `YggdrasilCoreError(invalid_textures_input)` with `cause` set to the
underlying exception if:

- The base64 doesn't decode (`textures payload is not valid base64`).
- The decoded text doesn't parse as JSON (`textures payload is not valid JSON`).

Note: the decoder does not run a Zod schema check. If you're consuming this
from untrusted sources, run `YggdrasilSessionSchema.parse(...)` or a hand-built
guard afterwards.

## End-to-end (server side)

```ts
import {
  buildTexturesPayload,
  encodeTexturesPayloadBase64,
} from '@loontail/yggdrasil-core';

function buildSignedTexturesProperty(user, skin, cape, sign) {
  const payload = buildTexturesPayload({
    profileId: user.uuid,
    profileName: user.username,
    skin: skin && {
      url: new URL(skin.fileUrl, config.publicUrl).toString(),
      variant: skin.variant,
    },
    cape: cape && {
      url: new URL(cape.fileUrl, config.publicUrl).toString(),
    },
  });
  const value = encodeTexturesPayloadBase64(payload);
  return {
    name: 'textures',
    value,
    signature: sign(value), // RSA-SHA1 base64
  };
}
```

The plugin's `services/textures-property.ts` is structurally identical to this — it
relies on the core helpers entirely so any tweak to the payload format flows
through one place.

## End-to-end (launcher side)

```ts
import {
  decodeTexturesPayloadBase64,
} from '@loontail/yggdrasil-client'; // re-exported from core

const profile = await client.profile(uuid, { signed: true });
const prop = profile.properties?.find((p) => p.name === 'textures');
if (!prop) return null;

const payload = decodeTexturesPayloadBase64(prop.value);
const skin = payload.textures.SKIN;
if (skin) {
  console.log('skin url:', skin.url);
  console.log('is slim:', skin.metadata?.model === 'slim');
}
const cape = payload.textures.CAPE;
if (cape) {
  console.log('cape url:', cape.url);
}
```

Signature verification (against a public key from `client.meta()`) is shown
in [Texture signing](./signing).

## Constants

```ts
SkinVariants.CLASSIC  // 'CLASSIC'
SkinVariants.SLIM     // 'SLIM'

TextureKinds.SKIN     // 'SKIN'
TextureKinds.CAPE     // 'CAPE'
```

Use the constants when you need the literal values — avoids drift if Mojang
ever extends the enum. They double as type guards via the derived `SkinVariant`
and `TextureKind` unions.
