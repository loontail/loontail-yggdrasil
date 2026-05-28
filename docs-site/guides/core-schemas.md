# Schemas & types

`@loontail/yggdrasil-core` ships a Zod schema for every payload that crosses
the wire — requests and responses on every Yggdrasil endpoint — plus TypeScript
types for everything internal to the protocol.

The schemas are what the plugin uses to validate request bodies, and what the
client uses to validate response bodies. If you write a custom controller or
ad-hoc HTTP layer, depend on them directly — don't re-derive them.

## Imports

```ts
import {
  // Endpoint payload schemas
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

  // Domain object schemas
  YggdrasilSessionSchema,
  GameProfileSchema,
  GameProfilePropertySchema,
  YggdrasilUserSchema,
  YggdrasilMetaSchema,
  YggdrasilMetaInfoSchema,
  YggdrasilMetaFeaturesSchema,
  YggdrasilErrorBodySchema,

  // TS types
  type YggdrasilSession,
  type GameProfile,
  type GameProfileProperty,
  type YggdrasilUser,
  type YggdrasilMeta,
  type YggdrasilErrorBody,
  type YggdrasilAuthAgent,
  type YggdrasilMetaFeatures,

  // Constants
  YggdrasilErrorKinds,
  YggdrasilEndpoints,
} from '@loontail/yggdrasil-core';
```

## Request schemas

### `AuthenticateRequestSchema`

```ts
z.object({
  username:     z.string().min(1),
  password:     z.string().min(1),
  clientToken:  z.string().min(1).optional(),
  requestUser:  z.boolean().optional(),
  agent: z.object({
    name:    z.literal('Minecraft'),
    version: z.literal(1),
  }).optional(),
});
```

Validates `POST /authserver/authenticate` body. The `agent` field, if present,
must be `{ name: 'Minecraft', version: 1 }` — that's the only shape the vanilla
client sends.

### `RefreshRequestSchema`

```ts
z.object({
  accessToken:     z.string().min(1),
  clientToken:     z.string().min(1).optional(),
  requestUser:     z.boolean().optional(),
  selectedProfile: GameProfileSchema.optional(),
});
```

`selectedProfile` is part of the Mojang spec for cases where the user has
multiple profiles. This plugin issues one profile per user; pass it through
unchanged if present.

### `ValidateRequestSchema`, `InvalidateRequestSchema`

Both are the same shape:

```ts
z.object({
  accessToken: z.string().min(1),
  clientToken: z.string().min(1).optional(),
});
```

### `JoinRequestSchema`

```ts
z.object({
  accessToken:     z.string().min(1),
  selectedProfile: z.string().regex(/^[0-9a-f]{32}$/i, '…'),
  serverId:        z.string().min(1),
});
```

The 32-char undashed regex is enforced server-side — clients should
`undashUuid()` the value before posting.

### `HasJoinedQuerySchema`

```ts
z.object({
  username: z.string().min(1),
  serverId: z.string().min(1),
  ip:       z.string().optional(),
});
```

Query parameters for `GET /sessionserver/session/minecraft/hasJoined`. The `ip`
parameter is what the multiplayer server saw as the client's address; the
plugin uses it to bind a join session to a specific IP if the value matches
one stored on `/join`.

### `ProfileLookupParamSchema`, `ProfileLookupQuerySchema`

```ts
ProfileLookupParamSchema = z.object({
  uuid: z.string().regex(/^[0-9a-f]{32}$/i, '…'),
});

ProfileLookupQuerySchema = z.object({
  unsigned: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});
```

The query schema accepts `'true'`, `'false'`, `true`, `false`, or omitted, and
normalises to a boolean `unsigned` flag. `unsigned=true` strips the signature.
The default (when omitted) is `unsigned: false`, so profile lookups are signed
because that's what the vanilla client expects.

### `BulkProfilesRequestSchema`

```ts
z.array(z.string().min(1)).max(10);
```

Flat array of usernames. The cap is hard — 11 names is a `400 IllegalArgumentException`.
The client enforces the same cap on its side (`YggdrasilClientError(invalid_request)`)
to avoid a wasted round-trip.

### `TexturesLookupResponseSchema`

```ts
z.object({
  skin: z.object({
    url:     z.string().min(1),
    variant: z.enum(['CLASSIC', 'SLIM']),
  }).nullable(),
  cape: z.object({
    url: z.string().min(1),
  }).nullable(),
});
```

Body of the non-protocol convenience `GET /textures/:uuid`. Either field can
be `null` if the player hasn't uploaded that asset.

## Domain schemas

### `YggdrasilSessionSchema`, `YggdrasilSession`

```ts
z.object({
  accessToken:       z.string().min(1),
  clientToken:       z.string().min(1),
  availableProfiles: z.array(GameProfileSchema),
  selectedProfile:   GameProfileSchema,
  user:              YggdrasilUserSchema.optional(),
});
```

Response body for `/authserver/authenticate` and `/authserver/refresh`. `user`
is present only when the request set `requestUser: true`.

### `GameProfileSchema`, `GameProfile`

```ts
z.object({
  id:         z.string().regex(/^[0-9a-f]{32}$/i, '…'),
  name:       z.string().min(1),
  properties: z.array(GameProfilePropertySchema).optional(),
});
```

The standard Yggdrasil profile. `properties[]` carries the signed `textures`
property when requested.

### `GameProfilePropertySchema`, `GameProfileProperty`

```ts
z.object({
  name:      z.string().min(1),
  value:     z.string(),
  signature: z.string().optional(),
});
```

A single name/value/signature triple. The plugin emits only one property
(`name: 'textures'`); the schema doesn't restrict it.

### `YggdrasilUserSchema`, `YggdrasilUser`

```ts
z.object({
  id:         z.string().min(1),
  properties: z.array(GameProfilePropertySchema).optional(),
});
```

User info returned in `YggdrasilSession.user`. Mojang puts the player's
language preference and similar metadata in `properties[]`; this plugin
doesn't, but the schema leaves the door open.

### `YggdrasilMetaSchema`, `YggdrasilMeta`

```ts
z.object({
  meta:                YggdrasilMetaInfoSchema,
  skinDomains:         z.array(z.string().min(1)),
  signaturePublickey:  z.string().min(1),
  signaturePublickeys: z.array(z.string().min(1)).optional(),
});
```

Body of `GET /`. `signaturePublickeys[]` lists every known public key (active
+ archived); use it to verify signatures across rotations.

### `YggdrasilMetaInfoSchema`, `YggdrasilMetaInfo`

```ts
z.object({
  serverName:            z.string().min(1),
  implementationName:    z.string().min(1),
  implementationVersion: z.string().min(1),
  links: z.object({
    homepage: z.string().url().optional(),
    register: z.string().url().optional(),
  }).optional(),
  feature: YggdrasilMetaFeaturesSchema.optional(),
});
```

### `YggdrasilMetaFeaturesSchema`, `YggdrasilMetaFeatures`

```ts
z.object({
  non_email_login:             z.boolean().optional(),
  username_check:              z.boolean().optional(),
  legacy_skin_api:             z.boolean().optional(),
  no_mojang_namespace:         z.boolean().optional(),
  enable_mojang_anti_features: z.boolean().optional(),
  enable_profile_key:          z.boolean().optional(),
}).partial();
```

authlib-injector feature flags. All optional. The plugin doesn't set most of
them today; flip them in your custom config via a Strapi `lifecycle` if you
need to.

### `YggdrasilErrorBodySchema`, `YggdrasilErrorBody`

```ts
z.object({
  error:        z.string().min(1),
  errorMessage: z.string().min(1),
  cause:        z.string().optional(),
});
```

The error envelope shape used by every non-2xx Yggdrasil response.
`YggdrasilClientError(http_error)` parses this into `context.body`.

## Constants

### `YggdrasilErrorKinds`

The canonical `error` strings:

```ts
YggdrasilErrorKinds.Forbidden        // 'ForbiddenOperationException'
YggdrasilErrorKinds.IllegalArgument  // 'IllegalArgumentException'
YggdrasilErrorKinds.Resource         // 'ResourceException'
```

Branch on these instead of bare strings:

```ts
if (err.context?.body?.error === YggdrasilErrorKinds.Forbidden) {
  // bad credentials, expired token, missing permission
}
```

### `YggdrasilEndpoints`

Every path string in one place:

```ts
YggdrasilEndpoints.root             // '/'
YggdrasilEndpoints.authenticate     // '/authserver/authenticate'
YggdrasilEndpoints.refresh          // '/authserver/refresh'
YggdrasilEndpoints.validate         // '/authserver/validate'
YggdrasilEndpoints.invalidate       // '/authserver/invalidate'
YggdrasilEndpoints.sessionJoin      // '/sessionserver/session/minecraft/join'
YggdrasilEndpoints.sessionHasJoined // '/sessionserver/session/minecraft/hasJoined'
YggdrasilEndpoints.sessionProfile   // '/sessionserver/session/minecraft/profile'
YggdrasilEndpoints.bulkProfiles     // '/api/profiles/minecraft'
YggdrasilEndpoints.textures         // '/textures'
YggdrasilEndpoints.texturesSkin     // '/textures/skin'
YggdrasilEndpoints.texturesCape     // '/textures/cape'
```

Useful when building a URL from a known root:

```ts
fetch(`${apiRoot}${YggdrasilEndpoints.authenticate}`, { …, method: 'POST' });
```

## Type aliases

The schemas all have matching TypeScript types:

```ts
import {
  type YggdrasilSession,
  type GameProfile,
  type GameProfileProperty,
  type YggdrasilUser,
  type YggdrasilMeta,
  type YggdrasilAuthAgent,
} from '@loontail/yggdrasil-core';
```

The types are derived where possible (`z.infer<typeof Schema>` is the runtime
equivalent), but they're also hand-shaped where the protocol calls for things
Zod doesn't quite express:

- `YggdrasilAuthAgent` is `{ name: 'Minecraft'; version: 1 }` — a literal
  intersection.
- `PlayerUuid`, `AccessToken`, `ClientToken`, `ServerId` are
  branded `string` aliases (compile-time only).

## When to use which

| You want to | Use |
|---|---|
| Validate a request body in a custom controller | The matching `…RequestSchema.parse(body)` |
| Validate a response body in custom HTTP code | The matching `…ResponseSchema.parse(json)` or domain schema |
| Type your function parameter as a player UUID | `PlayerUuid` (branded) + run `undashUuid` to construct |
| Type a function returning a session | `YggdrasilSession` |
| Branch on an error envelope | `YggdrasilErrorKinds` constant |
| Build a URL relative to an API root | `YggdrasilEndpoints` constant |

`safeParse(value)` returns a discriminated union instead of throwing — use it
when you want to map the error to a custom shape:

```ts
const parsed = YggdrasilSessionSchema.safeParse(json);
if (!parsed.success) {
  return wrapAsClientError('invalid_response', parsed.error);
}
return parsed.data;
```
