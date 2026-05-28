# PNG validation

`Content-Type: image/png` is not a guarantee — clients regularly send JPEGs,
zero-byte uploads, or PNGs of the wrong size. The Yggdrasil core library
ships a byte-level validator so the server and the launcher can both check
PNGs the same way before they ever hit disk.

## Exports

```ts
import {
  // Validators
  validatePngBuffer,
  assertPngBuffer,
  // Types
  type SkinAssetKind,
  type PngValidationResult,
  // Constants
  SkinAssetKinds,
  SKIN_VALID_DIMENSIONS,
  CAPE_VALID_DIMENSIONS,
} from '@loontail/yggdrasil-core';
```

## What it checks

```
bytes 0..7   PNG signature (89 50 4E 47 0D 0A 1A 0A)
bytes 8..11  IHDR chunk length (read but not validated against 13)
bytes 12..15 chunk type — must be "IHDR"
bytes 16..19 width  — big-endian uint32
bytes 20..23 height — big-endian uint32
```

The validator inspects bytes 0..23 only — it does not parse the rest of the
file. The rules:

- Length must be ≥ 24 bytes (no shorter file could be a valid PNG).
- Signature must match the literal PNG magic bytes.
- First chunk type must be `IHDR`.
- Width × height must appear in the kind's allowed list.

## Allowed dimensions

```ts
SKIN_VALID_DIMENSIONS  // ['64x64', '64x32']
CAPE_VALID_DIMENSIONS  // ['64x32']

SkinAssetKinds.SKIN    // 'skin'
SkinAssetKinds.CAPE    // 'cape'
```

The Minecraft vanilla client supports HD skins via authlib-injector's
`feature.skin_size` flag — this plugin does not advertise that flag, so HD
sizes are not accepted. If you change the policy, the constants here are the
single point to update; every validator branches on them.

## `validatePngBuffer` — non-throwing

```ts
const result = validatePngBuffer(buffer, 'skin');
if (result.ok) {
  console.log(result.width, result.height);
} else {
  console.error(result.reason);
}
```

Returns a discriminated union:

```ts
type PngValidationResult =
  | { readonly ok: true;  readonly width: number;  readonly height: number }
  | { readonly ok: false; readonly reason: string };
```

`reason` is a human-readable English string. Examples:

```
file too small to be a PNG (need at least 24 bytes)
file is not a PNG (header 4944 5400 0000 0000)
first PNG chunk is "sBIT", expected "IHDR"
skin dimensions 128x128 are not supported (expected 64x64 or 64x32)
```

The "header" hex dump on the second line uses the actual first 8 bytes of the
buffer — handy for debugging spoofed `Content-Type`.

## `assertPngBuffer` — throwing variant

```ts
import { assertPngBuffer } from '@loontail/yggdrasil-core';

const { width, height } = assertPngBuffer(buffer, 'skin');
```

Same checks, throws
`YggdrasilCoreError(invalid_png, reason, { context: { kind, reason } })` on
failure. `context.kind` tells you whether the check was for a skin or a cape;
`context.reason` carries the validator reason for structured logs.

## Accepted input types

Both validators accept `ArrayBuffer` or `Uint8Array`:

```ts
validatePngBuffer(arrayBuffer, 'skin');
validatePngBuffer(new Uint8Array(arrayBuffer), 'skin');
validatePngBuffer(await file.arrayBuffer(), 'cape');
validatePngBuffer(buffer /* Node Buffer is a Uint8Array */, 'skin');
```

Internally they coerce to `Uint8Array` once and share the rest of the code
path.

## Why not parse the whole PNG?

The validators stop after the IHDR chunk because that's all the protocol
cares about. A pixel-perfect parse would reject otherwise-valid PNGs for
trivia (zlib version, CRC mismatches on optional chunks) and increase the
attack surface. Minecraft's own pipeline loads PNGs through libpng / `BufferedImage`,
which tolerates much wider input than the protocol implies.

If you need to do something more involved (frame extraction, palette
inspection, transparency analysis), use a real PNG library on top — but call
`validatePngBuffer` first to bounce obvious garbage.

## Server vs. client

Both validate. The client validates *before* the upload request is built so
broken files fail without a round-trip. The server validates again on receipt
because it can't trust that the client did.

## Examples

### Reject an upload synchronously

```ts
import { assertPngBuffer } from '@loontail/yggdrasil-core';

async function handleUpload(file: File) {
  const buffer = await file.arrayBuffer();
  try {
    assertPngBuffer(buffer, 'skin');
  } catch (err) {
    notifyUser('PNG could not be read.');
    return;
  }
  await client.uploadSkin({ accessToken, file: buffer });
}
```

### Show the rejection reason in the UI

```ts
import { validatePngBuffer } from '@loontail/yggdrasil-core';

const result = validatePngBuffer(buffer, 'cape');
if (!result.ok) {
  setError(result.reason); // 'cape dimensions 64x64 are not supported (expected 64x32)'
  return;
}
```

### Drop unsupported uploads in a custom Strapi route

```ts
import { assertPngBuffer, SkinAssetKinds } from '@loontail/yggdrasil-core';

export default {
  async upload(ctx) {
    const file = ctx.request.files?.file;
    if (!file) return ctx.badRequest('file required');
    const buffer = await readFile(file.filepath);
    assertPngBuffer(buffer, SkinAssetKinds.SKIN);
    // …
  },
};
```

The plugin's controllers do exactly this — pull the buffer, call
`assertPngBuffer`, let the throw propagate to the `error-shape` middleware
which converts it to a Yggdrasil error envelope.
