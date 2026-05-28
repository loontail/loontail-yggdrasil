# Using YggdrasilClient

`@loontail/yggdrasil-client` is the HTTP client for the Yggdrasil server. It
wraps every endpoint with Zod-validated input and output, surfaces a single
error class, and ships an `authlib-injector.jar` plus a `-javaagent` argument
builder.

The client carries no state. It never persists tokens, never opens files,
never spawns processes — every call is request / response.

## Construct

```ts
import { YggdrasilClient } from '@loontail/yggdrasil-client';

const client = new YggdrasilClient({
  apiRoot: 'https://auth.example.com/api/yggdrasil',
  // fetch: customFetch,   // optional
});
```

### Options

| Option | Type | Default | Notes |
|---|---|---|---|
| `apiRoot` | `string` | — (required) | Absolute URL of the Yggdrasil API root. Trailing slashes are stripped. |
| `fetch` | `typeof fetch` | `globalThis.fetch.bind(globalThis)` | Override for tests or custom HTTP behaviour (interceptors, retries, proxies). |

No timeouts, no retries, no headers hook. If you need any of those, wrap them
inside your `fetch` implementation and pass it in.

## Method surface

Grouped by what they do, not by where on the wire they hit.

### Authentication

| Method | HTTP | Returns |
|---|---|---|
| `client.authenticate({ username, password, clientToken?, requestUser? })` | `POST /authserver/authenticate` | `YggdrasilSession` |
| `client.refresh({ accessToken, clientToken?, requestUser? })` | `POST /authserver/refresh` | `YggdrasilSession` |
| `client.validate({ accessToken, clientToken? })` | `POST /authserver/validate` | `boolean` (true on 204, false on 403) |
| `client.invalidate({ accessToken, clientToken? })` | `POST /authserver/invalidate` | `void` |

### Profile lookup

| Method | HTTP | Returns |
|---|---|---|
| `client.profile(uuid, { signed?: boolean })` | `GET /sessionserver/session/minecraft/profile/{uuid}[?unsigned=true\|false]` | `GameProfile` |
| `client.bulkProfiles(names)` | `POST /api/profiles/minecraft` | `GameProfile[]` |
| `client.meta()` | `GET /` | `YggdrasilMeta` |

### Textures

| Method | HTTP | Returns |
|---|---|---|
| `client.getTextures(uuid)` | `GET /textures/{uuid}` | `TexturesLookupResponse` |
| `client.uploadSkin({ accessToken, file, variant? })` | `PUT /textures/skin` | `void` |
| `client.uploadCape({ accessToken, file })` | `PUT /textures/cape` | `void` |
| `client.deleteSkin({ accessToken })` | `DELETE /textures/skin` | `void` |
| `client.deleteCape({ accessToken })` | `DELETE /textures/cape` | `void` |

## Examples

### Sign in and persist

```ts
const session = await client.authenticate({
  username: 'steve@example.com',
  password: 'changeme',
});

await secureStorage.set('yggdrasil', {
  accessToken: session.accessToken,
  clientToken: session.clientToken,
  uuid: session.selectedProfile.id,
  username: session.selectedProfile.name,
});
```

`secureStorage` is your launcher's secret store (Keychain, Credential Manager,
libsecret, …). The client doesn't ship one — that's a platform choice.

### Validate-then-refresh on launcher start

```ts
const saved = await secureStorage.get('yggdrasil');
if (!saved) return promptLogin();

if (await client.validate(saved)) return saved;

try {
  const session = await client.refresh(saved);
  await secureStorage.set('yggdrasil', {
    accessToken: session.accessToken,
    clientToken: session.clientToken,
    uuid: session.selectedProfile.id,
    username: session.selectedProfile.name,
  });
  return await secureStorage.get('yggdrasil');
} catch {
  await secureStorage.del('yggdrasil');
  return promptLogin();
}
```

### Resolve a username to a profile

```ts
const [profile] = await client.bulkProfiles(['steve']);
if (profile) {
  console.log(profile.id);   // 32-char undashed hex UUID
  console.log(profile.name); // case-corrected username
}
```

Names that don't match a player are omitted from the response — matching
Mojang's behaviour. The client caps the request at 10 names; passing more
throws `YggdrasilClientError(invalid_request)` synchronously before any HTTP
goes out.

### Read the metadata

```ts
const meta = await client.meta();
console.log(meta.skinDomains);             // e.g. ['auth.example.com']
console.log(meta.signaturePublickey);      // active PEM-encoded RSA public key
console.log(meta.signaturePublickeys);     // active + archived
```

Useful for verifying the signed `textures` property yourself — see
[Texture signing](./signing).

### Read someone else's textures

```ts
const textures = await client.getTextures('11111111111111111111111111111111');
// { skin: { url, variant } | null, cape: { url } | null }
```

This is a non-protocol convenience endpoint. The protocol-compliant alternative
is `client.profile(uuid)` and decoding the `textures` property — but for "render
my friend's skin in my launcher UI", the convenience endpoint is simpler.

### Upload, replace, delete

```ts
import { SkinVariants } from '@loontail/yggdrasil-client';

// Upload a CLASSIC skin (default if you omit `variant`).
await client.uploadSkin({
  accessToken,
  file: await readPngFromDisk('./steve.png'),
});

// Replace with a SLIM skin (Alex-shaped).
await client.uploadSkin({
  accessToken,
  file: await readPngFromDisk('./alex.png'),
  variant: SkinVariants.SLIM,
});

// Drop the skin entirely.
await client.deleteSkin({ accessToken });
```

Capes work the same way without the `variant` parameter.

PNG validation runs synchronously before the upload — see
[Skin & cape upload](./client-skins).

## Re-exports

The client re-exports a curated subset of `@loontail/yggdrasil-core` so you
rarely need to depend on the core package directly:

```ts
import {
  // Types
  type AccessToken,
  type ClientToken,
  type GameProfile,
  type GameProfileProperty,
  type PlayerUuid,
  type ServerId,
  type SkinVariant,
  type TexturesLookupResponse,
  type TexturesPayload,
  type YggdrasilMeta,
  type YggdrasilSession,
  type YggdrasilUser,
  // Constants
  SkinVariants,
  TextureKinds,
  // Helpers
  decodeTexturesPayloadBase64,
} from '@loontail/yggdrasil-client';
```

If you need the full core surface (`buildTexturesPayload`, the Zod schemas, PNG
validators, error registry, UUID helpers), depend on `@loontail/yggdrasil-core`
explicitly.

## Notes

- The client uses **global `fetch`** by default — works in Node ≥ 20 and any
  modern browser / Electron. No `undici` import, no node-fetch shim.
- **No retries.** A network failure throws immediately. Wrap the call yourself
  if you want exponential backoff.
- **No timeout.** Pass an aborting `fetch` (`AbortSignal.timeout(5000)` etc) if
  you need one.
- **No request interceptors.** Build them into your `fetch` instance.
- **No undocumented endpoints.** If something isn't covered by a method, it
  doesn't exist on the server.
