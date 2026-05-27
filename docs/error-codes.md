# Error codes

Canonical list of every stable error code in the project. Public surface —
renames are breaking and ship with a major version bump.

The user-facing version of this page lives at
[docs-site/reference/errors.md](../docs-site/reference/errors.md). The
file you're reading is the maintainer-oriented index used when adding new
codes or auditing throw sites.

## `YggdrasilCoreError` codes

Defined in `packages/yggdrasil-core/src/errors/yggdrasil-core-error.ts`.

| Code | Thrown by | Trigger | Context |
|---|---|---|---|
| `invalid_uuid` | `undashUuid`, `dashUuid` | Input doesn't match either UUID regex. | `{ value: string }` — the offending input (truncated to 48 chars). |
| `invalid_textures_input` | `buildTexturesPayload` | `profileId` not 32 hex chars, or `profileName` empty. | `{ field: 'profileId' \| 'profileName' }`. |
| `invalid_textures_input` | `decodeTexturesPayloadBase64` | base64 doesn't decode, or decoded text isn't JSON. | `{ stage: 'base64' \| 'json' }`. `cause` set to the underlying exception. |
| `invalid_png` | `assertPngBuffer` | Buffer < 24 bytes / signature mismatch / first chunk not IHDR / dimensions not in allowed list. | `{ kind: 'skin' \| 'cape', reason: string }`. |

## `YggdrasilClientError` codes

Defined in `packages/yggdrasil-client/src/errors/yggdrasil-client-error.ts`.

| Code | Thrown by | Trigger | Context |
|---|---|---|---|
| `network` | `runFetch` | `fetch` rejected (DNS / TCP / TLS / abort). | `{ url }`. `cause` is the original `TypeError`. |
| `http_error` | `handleResponse` | Response status not 2xx (and not the `validate`-specific 403 shortcut). | `{ status, body?, url }`. `body` is the parsed Yggdrasil envelope when shape matched. |
| `invalid_response` | `handleResponse` | Response was 2xx but body failed Zod schema. | `{ url }`. `cause` is the `ZodError`. |
| `invalid_request` | `bulkProfiles` | More than 10 names supplied. | `{ count }`. |
| `authlib_injector_missing` | `resolveAuthlibInjectorJarPath` | Jar not found in vendor dir or env override. | `{ vendorDir, envOverride?, files: string[] }`. |

## Yggdrasil HTTP envelope kinds

Defined in `packages/yggdrasil-core/src/types/error.ts` as
`YggdrasilErrorKinds`.

| Kind | Typical HTTP status | Used in |
|---|---|---|
| `ForbiddenOperationException` | 401, 403 | Bad credentials, expired token, missing permission. |
| `IllegalArgumentException` | 400 | Body failed schema validation, > 10 names in `bulkProfiles`, invalid PNG, missing required field. |
| `ResourceException` | 404 | Profile not found, texture file missing. |

## When to add a new code

A new error code is appropriate when:

- A caller needs to programmatically distinguish a new failure mode from
  existing ones (different recovery flow).
- The condition isn't a subclass of an existing code's semantics.

Otherwise, attach the variant to the `context` of an existing code:

```ts
throw new YggdrasilClientError(
  YggdrasilClientErrorCodes.HTTP_ERROR,
  `HTTP ${status} from ${url}`,
  { context: { status, body, url, kind: 'profile-lookup' } },
);
```

The `kind: 'profile-lookup'` here lets a top-level handler branch without
needing a fresh code.

### Migration when a code is renamed

1. Add the new code to the codes object.
2. Update every throw site (the value is `as const`, so TS catches misses).
3. Bump the package major version. Mention the rename in the PR title with
   `feat!:`.
4. Removed codes stay listed in `error-codes.md` for one major version with
   a "removed" note, then disappear.

## Throw-site discipline

- Public API surface throws `YggdrasilCoreError` / `YggdrasilClientError`
  only.
- Wrap lower-level exceptions as `cause` — never lose the original stack:

  ```ts
  try {
    return await fetcher(...);
  } catch (err) {
    throw new YggdrasilClientError(
      YggdrasilClientErrorCodes.NETWORK,
      err instanceof Error ? err.message : String(err),
      { cause: err, context: { url } },
    );
  }
  ```

- Inside the plugin, controllers throw `YggdrasilHttpError(kind, message, { status })`
  which the `error-shape` middleware turns into the Yggdrasil envelope. Never
  call `ctx.body = { error: '…' }` directly — the middleware is the single
  exit point.

## Audit grep

To find every throw site that might need a code, search for:

```bash
rg -n 'throw new YggdrasilCoreError'  packages/yggdrasil-core
rg -n 'throw new YggdrasilClientError' packages/yggdrasil-client
rg -n 'throw new YggdrasilHttpError'   packages/strapi-plugin-yggdrasil/server
```

Anything matching `throw new Error(` in `packages/*/src` is a bug — public
surface must use the typed errors.
