# Skin & cape upload for Yggdrasil client

`YggdrasilClient` exposes the full texture lifecycle for the authenticated user:

- `uploadSkin({ accessToken, file, variant? })`
- `uploadCape({ accessToken, file })`
- `deleteSkin({ accessToken })`
- `deleteCape({ accessToken })`

`accessToken` is sent as `Authorization: Bearer <token>` and identifies the owner server-side.

## Upload skin

```ts
import { SkinVariants } from '@loontail/yggdrasil-client';
import { readFile } from 'node:fs/promises';

const png = await readFile('./skin.png');

await client.uploadSkin({
  accessToken,
  file: png,
  // optional, defaults to SkinVariants.CLASSIC
  variant: SkinVariants.CLASSIC,
});
```

`file` accepts `Uint8Array` or `ArrayBuffer`.

Skin model values are:

- `SkinVariants.CLASSIC` (Steve, 4px arms),
- `SkinVariants.SLIM` (Alex, 3px arms).

## Validation

Client-side validation runs before network calls:

- `assertPngBuffer(file, kind)` from `@loontail/yggdrasil-core`,
- kind = `'skin'` allows `64×64` or `64×32`,
- kind = `'cape'` requires `64×32`.

When invalid, the client throws `YggdrasilCoreError(invalid_png)` immediately and the
upload does not start.

Server-side validation repeats the same checks, and also enforces:

- `accessToken` must exist and be valid (`yggdrasil-token-auth`),
- PNG size limit `<= 256 KB`.

## Delete skin/cape

```ts
await client.deleteSkin({ accessToken });
await client.deleteCape({ accessToken });
```

Deletes are idempotent; repeat calls return `204` and keep data in sync.

## Read textures

Use protocol-compliant profile read for signed data:

```ts
const profile = await client.profile(uuid, { signed: true });
```

Use `getTextures` for launcher UI convenience when signature is not needed:

```ts
const textures = await client.getTextures(uuid);
```

## Common upload pitfall

When using a custom HTTP adapter, do not set `Content-Type` manually for multipart
requests. Let `FormData`/`fetch` generate the boundary.
