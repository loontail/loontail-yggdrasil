# UUID helpers

Yggdrasil profile IDs (player UUIDs) live in two shapes on the wire:

- **Undashed**, 32 hex chars: `11111111111111111111111111111111` — used in
  the JSON profile fields (`GameProfile.id`, `selectedProfile.id`, the
  `texturesPayload.profileId`).
- **Dashed**, 36 chars (RFC 4122): `11111111-1111-1111-1111-111111111111` —
  used by the vanilla Minecraft client when it logs in (`--uuid` launch arg)
  and by Java's `java.util.UUID`.

`@loontail/yggdrasil-core` ships helpers for converting between them and
generating fresh values.

## Exports

```ts
import {
  // Detection
  isUuidUndashed,
  isUuidDashed,
  // Conversion
  undashUuid,
  dashUuid,
  // Generation
  randomUndashedUuid,
  // Branded constructors (compile-time only, no validation)
  asPlayerUuid,
  // Type
  type PlayerUuid,
} from '@loontail/yggdrasil-core';
```

## Detection

```ts
isUuidUndashed('11111111111111111111111111111111');           // true
isUuidUndashed('11111111-1111-1111-1111-111111111111');       // false
isUuidDashed('11111111-1111-1111-1111-111111111111');         // true
```

Plain regex checks. Case-insensitive (`/^[0-9a-f]{32}$/i` and
`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`).

## Conversion

```ts
undashUuid('11111111-1111-1111-1111-111111111111');
// → '11111111111111111111111111111111' (PlayerUuid)

undashUuid('11111111111111111111111111111111');
// → '11111111111111111111111111111111' (no-op normalisation to lowercase)

dashUuid('11111111111111111111111111111111');
// → '11111111-1111-1111-1111-111111111111'

dashUuid('11111111-1111-1111-1111-111111111111');
// → '11111111-1111-1111-1111-111111111111' (no-op)
```

Both accept either form. Both return lowercase. Both throw
`YggdrasilCoreError(invalid_uuid)` if the input doesn't match either shape.

The throw's `context.value` carries the offending input (truncated to 48 chars
inside the message) so logs are useful without dumping huge payloads.

## Generation

```ts
randomUndashedUuid();
// → 'a3f7c2…' (32-char lowercase hex, branded as PlayerUuid)
```

Uses `globalThis.crypto.randomUUID()` under the hood — Node ≥ 19, every modern
browser, Deno. The plugin calls this once per user on first authentication
and writes the result into `up_users.uuid`.

## Branded types

```ts
type PlayerUuid    = string & { readonly __brand: 'PlayerUuid' };
type AccessToken   = string & { readonly __brand: 'AccessToken' };
type ClientToken   = string & { readonly __brand: 'ClientToken' };
type ServerId      = string & { readonly __brand: 'ServerId' };
```

These are compile-time only — no runtime cost. They prevent passing a
ClientToken where a PlayerUuid is expected (TypeScript flags the mismatch).
`PlayerUuid` ships with a runtime-free cast helper:

```ts
function asPlayerUuid(value: string): PlayerUuid {
  return value as PlayerUuid;
}
```

It doesn't validate — use after `undashUuid` or equivalent has run. The
other brands (`AccessToken`, `ClientToken`, `ServerId`) are type-only; cast
with a plain `as AccessToken` at the boundary where the string is verified.
The pattern in the codebase:

```ts
function load(rawUuid: string): PlayerUuid {
  return undashUuid(rawUuid);  // already returns PlayerUuid
}
```

The helpers that the launcher actually calls (`undashUuid`, `dashUuid`,
`randomUndashedUuid`) all return `PlayerUuid` directly, so you rarely need
`asPlayerUuid` in application code. It exists for internal helpers and tests.

## When to use which

| You have | You want | Use |
|---|---|---|
| dashed UUID from the launcher CLI | undashed for a profile lookup | `undashUuid(input)` |
| undashed from a profile | dashed for the JVM args | `dashUuid(input)` |
| unknown string | typed `PlayerUuid` | `undashUuid(input)` (validates + brands) |
| nothing | a fresh undashed UUID | `randomUndashedUuid()` |

## Round-tripping

`undashUuid` and `dashUuid` are inverses on valid inputs:

```ts
dashUuid(undashUuid(any)) === any.toLowerCase();
undashUuid(dashUuid(any)) === any.toLowerCase();
```

Both lowercase as part of normalisation. The protocol expects lowercase — the
vanilla client and authlib-injector compare UUIDs case-sensitively in some
code paths.

## Errors

`undashUuid` and `dashUuid` throw `YggdrasilCoreError(invalid_uuid)` on
malformed input. Catch it like any other core error:

```ts
import {
  YggdrasilCoreError,
  YggdrasilCoreErrorCodes,
  isYggdrasilCoreErrorCode,
  undashUuid,
} from '@loontail/yggdrasil-core';

try {
  undashUuid(userInput);
} catch (err) {
  if (isYggdrasilCoreErrorCode(err, YggdrasilCoreErrorCodes.INVALID_UUID)) {
    showError(`Not a valid UUID: ${err.context?.value}`);
  } else {
    throw err;
  }
}
```
