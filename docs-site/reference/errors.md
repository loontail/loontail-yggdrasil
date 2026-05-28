# Error codes

Two error classes carry every documented failure mode in the project:

- **`YggdrasilCoreError`** — from `@loontail/yggdrasil-core`. Input shape
  errors. Server *and* client throw these.
- **`YggdrasilClientError`** — from `@loontail/yggdrasil-client`. HTTP and
  packaging errors raised by the client.

Both extend `Error`, both carry a stable string `code`, both carry an optional
`context` object. Codes are part of the public API — renames are breaking and
ship with a major version bump.

## `YggdrasilCoreErrorCode`

```ts
type YggdrasilCoreErrorCode =
  | 'invalid_uuid'
  | 'invalid_textures_input'
  | 'invalid_png';
```

### `invalid_uuid`

Raised by `undashUuid` and `dashUuid` when the input doesn't match either the
32-char undashed or 36-char dashed form.

| Field | Meaning |
|---|---|
| `code` | `'invalid_uuid'` |
| `message` | `"value is not a valid UUID: <truncated input>"` |
| `context.value` | The original input string (truncated to 48 chars). |

### `invalid_textures_input`

Raised by:

- `buildTexturesPayload` when `profileId` isn't 32 hex chars or `profileName`
  is empty.
- `decodeTexturesPayloadBase64` when the base64 doesn't decode or the decoded
  text isn't JSON, or when decoded JSON doesn't match the textures payload
  schema.

| Field | Meaning |
|---|---|
| `code` | `'invalid_textures_input'` |
| `message` | Human-readable description (e.g. `"profileId must be a 32-char undashed hex UUID"`). |
| `context.stage` | `'base64'`, `'json'`, or `'shape'` for decoder failures. |
| `cause` | The original `Error` from `atob` / `JSON.parse` when available, or the `ZodError` when the decoder failed shape validation. |

### `invalid_png`

Raised by `assertPngBuffer`. The non-throwing `validatePngBuffer` returns
`{ ok: false, reason }` instead.

| Field | Meaning |
|---|---|
| `code` | `'invalid_png'` |
| `message` | Human-readable reason (e.g. `"skin dimensions 128x128 are not supported (expected 64x64 or 64x32)"`). |
| `context.kind` | `'skin'` or `'cape'`. |
| `context.reason` | Same reason string as `message`, suitable for logs or structured telemetry. |

## `YggdrasilClientErrorCode`

```ts
type YggdrasilClientErrorCode =
  | 'network'
  | 'http_error'
  | 'invalid_response'
  | 'invalid_request'
  | 'authlib_injector_missing';
```

### `network`

Thrown when `fetch` rejected — DNS, TCP, TLS, abort. The user almost certainly
sees this as "the server is unreachable".

| Field | Meaning |
|---|---|
| `code` | `'network'` |
| `message` | The underlying `Error.message`. |
| `context.url` | The URL we tried to reach. |
| `cause` | The original `TypeError` from `fetch`. |

### `http_error`

Thrown for any non-2xx response (with the exception of `client.validate`,
which treats 403 as a `false` return).

| Field | Meaning |
|---|---|
| `code` | `'http_error'` |
| `message` | `"HTTP <status> from <url>"` |
| `context.status` | The HTTP status code (number). |
| `context.body` | The parsed Yggdrasil error envelope when it matched the schema. Otherwise `undefined`. |
| `context.url` | The URL we hit. |

Common branches:

- `status === 403` + `body.error === 'ForbiddenOperationException'` → token
  expired or credentials wrong.
- `status === 400` + `body.error === 'IllegalArgumentException'` → caller
  sent a malformed payload.
- `status === 404` → no such profile.

### `invalid_response`

Server returned a 2xx but the body didn't match the Zod schema. Indicates a
server bug or version skew.

| Field | Meaning |
|---|---|
| `code` | `'invalid_response'` |
| `message` | `"server returned a response that did not match the expected schema"` |
| `context.url` | The URL we hit. |
| `cause` | The underlying `ZodError`. |

### `invalid_request`

Caller violated a documented client-side invariant — the throw happens *before*
the HTTP layer is touched. Today the only case is `bulkProfiles(names)` with
more than 10 names. PNG validation errors raised from upload methods bubble
up as `YggdrasilCoreError(invalid_png)`, not `invalid_request`.

| Field | Meaning |
|---|---|
| `code` | `'invalid_request'` |
| `message` | Human-readable description. |
| `context` | Method-specific. For `bulkProfiles`: `{ count }`. |

### `authlib_injector_missing`

`resolveAuthlibInjectorJarPath()` couldn't find the bundled jar.

| Field | Meaning |
|---|---|
| `code` | `'authlib_injector_missing'` |
| `message` | `"authlib-injector jar not found in <vendorDir>"` |
| `context.vendorDir` | The directory it looked in. |
| `context.envOverride` | The value of `LOONTAIL_AUTHLIB_INJECTOR_VENDOR_DIR` if set. |
| `context.files` | The actual filenames present in the vendor directory. |

This is a packaging error — the user cannot recover at runtime. See
[authlib-injector](../guides/authlib-injector) for Electron packaging.

## Yggdrasil error envelope

The HTTP envelope (`YggdrasilErrorBody`):

```jsonc
{
  "error":        "ForbiddenOperationException",
  "errorMessage": "Invalid credentials.",
  "cause":        "optional, additional context"
}
```

The canonical `error` values (`YggdrasilErrorKinds` from
`@loontail/yggdrasil-core`):

| Kind | Typical status | When |
|---|---|---|
| `ForbiddenOperationException` | 401, 403 | Bad credentials, expired token, missing permission. |
| `IllegalArgumentException` | 400 | Body failed schema validation, > 10 names in bulkProfiles, invalid PNG, missing required field. |
| `ResourceException` | 404 | Profile not found, texture file missing. |

These show up on the client side as `YggdrasilClientError(http_error)` with
`context.body.error` set to the canonical kind.

## Type guards

```ts
import {
  isYggdrasilCoreError,
  isYggdrasilCoreErrorCode,
} from '@loontail/yggdrasil-core';

import {
  isYggdrasilClientError,
  isYggdrasilClientErrorCode,
} from '@loontail/yggdrasil-client';

isYggdrasilCoreError(err);
isYggdrasilCoreErrorCode(err, 'invalid_png');
isYggdrasilClientError(err);
isYggdrasilClientErrorCode(err, 'http_error');
```

The `…ErrorCode` variants narrow `err` to the correct class *and* type the
`code` field as the literal you passed, so the next branch can read
`err.context.status` without a cast:

```ts
if (isYggdrasilClientErrorCode(err, 'http_error')) {
  console.log(err.context?.status); // number | undefined
}
```
