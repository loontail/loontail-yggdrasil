# Endpoints

Every HTTP route the plugin mounts. All public routes live under
`/api/yggdrasil/*`; the admin routes live under `/yggdrasil/*` and
require an admin JWT.

## Public Yggdrasil endpoints

These are the routes authlib-injector and `@loontail/yggdrasil-client` hit.
All are reachable to the `Public` users-permissions role (set up by the
[bootstrap step](../guides/plugin-bootstrap)). Texture mutation additionally
goes through the `yggdrasil-token-auth` policy.

### Metadata

| Method | Path | Body / params | Auth | Returns | Purpose |
|---|---|---|---|---|---|
| `GET` | `/` | — | none | `YggdrasilMeta` | ALI discovery — server name, skin domains, public keys. |

### Authentication

| Method | Path | Body | Auth | Returns | Purpose |
|---|---|---|---|---|---|
| `POST` | `/authserver/authenticate` | `{ username, password, clientToken?, requestUser?, agent? }` | none | `YggdrasilSession` | Exchange credentials for tokens + selected profile. |
| `POST` | `/authserver/refresh` | `{ accessToken, clientToken?, requestUser?, selectedProfile? }` | none | `YggdrasilSession` | Rotate the access token. |
| `POST` | `/authserver/validate` | `{ accessToken, clientToken? }` | none | `204` or `403` | Check token validity without rotating. |
| `POST` | `/authserver/invalidate` | `{ accessToken, clientToken? }` | none | `204` | Drop the token row. |

### Session server

| Method | Path | Body / params | Auth | Returns | Purpose |
|---|---|---|---|---|---|
| `POST` | `/sessionserver/session/minecraft/join` | `{ accessToken, selectedProfile, serverId }` | none | `204` | Record a join session (TTL 30s). |
| `GET` | `/sessionserver/session/minecraft/hasJoined` | `?username=…&serverId=…&ip=…` | none | `GameProfile` or `204` | Verify a player joined; returns signed profile. |
| `GET` | `/sessionserver/session/minecraft/profile/:uuid` | `?unsigned=true \| false` | none | `GameProfile` | Look up a profile; signed by default. |

### Bulk profile lookup

| Method | Path | Body | Auth | Returns | Purpose |
|---|---|---|---|---|---|
| `POST` | `/api/profiles/minecraft` | `string[]` (max 10) | none | `GameProfile[]` | Resolve usernames to `{ id, name }` pairs. |

### Texture lookup (public, read-only)

| Method | Path | Auth | Returns | Purpose |
|---|---|---|---|---|
| `GET` | `/textures/:uuid` | none | `TexturesLookupResponse` | Convenience: raw skin / cape URLs for a player. |

### Texture mutation (token-protected)

All require `Authorization: Bearer <accessToken>` validated by the
`yggdrasil-token-auth` policy.

| Method | Path | Body | Returns | Purpose |
|---|---|---|---|---|
| `PUT` | `/textures/skin` | `multipart/form-data` with `file` + optional `variant` | `204` | Upload / replace the caller's skin. |
| `PUT` | `/textures/cape` | `multipart/form-data` with `file` | `204` | Upload / replace the caller's cape. |
| `DELETE` | `/textures/skin` | — | `204` | Remove the caller's skin. |
| `DELETE` | `/textures/cape` | — | `204` | Remove the caller's cape. |

## Admin endpoints

Mounted under `/yggdrasil/*`. Authentication is Strapi's admin JWT
— there are no per-route policies beyond Strapi's default admin guard.

| Method | Path | Body / params | Returns |
|---|---|---|---|
| `GET` | `/yggdrasil/textures/skins` | `?page&pageSize&search` | `{ data: SkinRow[], meta: { pagination } }` |
| `GET` | `/yggdrasil/textures/capes` | `?page&pageSize&search` | `{ data: CapeRow[], meta: { pagination } }` |
| `POST` | `/yggdrasil/textures/upload/skin` | `{ userId, fileBase64, variant?, username? }` | The created skin row. |
| `POST` | `/yggdrasil/textures/upload/cape` | `{ userId, fileBase64, username? }` | The created cape row. |
| `DELETE` | `/yggdrasil/textures/skins/:id` | — | `{ success: true }` |
| `DELETE` | `/yggdrasil/textures/capes/:id` | — | `{ success: true }` |
| `POST` | `/yggdrasil/textures/validate` | — | `{ missingSkins: number[], missingCapes: number[] }` |
| `POST` | `/yggdrasil/textures/purge-missing` | — | `{ deletedSkins: number, deletedCapes: number }` |

## Status codes

| Status | Meaning |
|---|---|
| `200` | Success with body. |
| `204` | Success without body (validate, invalidate, join, texture mutation). |
| `400` | Body failed schema validation. `IllegalArgumentException`. |
| `401` | Missing or malformed bearer token on a texture mutation. `ForbiddenOperationException`. |
| `403` | Token expired or refused; bad credentials. `ForbiddenOperationException`. |
| `404` | Profile / texture not found. `ResourceException`. |
| `500` | Internal error. The error-shape middleware still wraps the response as a Yggdrasil envelope. |

`hasJoined` returns `204` (not `404`) when the player hasn't joined the server
— that matches the Mojang reference.

## Error envelope

```jsonc
{
  "error":        "ForbiddenOperationException",
  "errorMessage": "Invalid credentials.",
  "cause":        "optional, additional context"
}
```

The canonical `error` values:

- `ForbiddenOperationException` — bad credentials, expired or invalid token.
- `IllegalArgumentException` — body failed schema validation, dimensions
  wrong, malformed PNG, > 10 names in bulkProfiles.
- `ResourceException` — texture file missing, profile not found.

`@loontail/yggdrasil-core` exports these as `YggdrasilErrorKinds`.

## Examples

### Authenticate

```http
POST /api/yggdrasil/authserver/authenticate
Content-Type: application/json

{
  "username": "steve@example.com",
  "password": "changeme",
  "agent": { "name": "Minecraft", "version": 1 }
}
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "accessToken": "8f3c…",
  "clientToken": "01e1…",
  "availableProfiles": [{ "id": "1111…", "name": "steve" }],
  "selectedProfile":   { "id": "1111…", "name": "steve" }
}
```

### Validate

```http
POST /api/yggdrasil/authserver/validate
Content-Type: application/json

{ "accessToken": "8f3c…" }
```

```http
HTTP/1.1 204 No Content
```

### Upload skin

```http
PUT /api/yggdrasil/textures/skin
Authorization: Bearer 8f3c…
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary…

------WebKitFormBoundary…
Content-Disposition: form-data; name="file"; filename="asset.png"
Content-Type: image/png

<PNG bytes>
------WebKitFormBoundary…
Content-Disposition: form-data; name="variant"

CLASSIC
------WebKitFormBoundary…--
```

```http
HTTP/1.1 204 No Content
```

### hasJoined

```http
GET /api/yggdrasil/sessionserver/session/minecraft/hasJoined?username=steve&serverId=abc123&ip=1.2.3.4
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "11111111111111111111111111111111",
  "name": "steve",
  "properties": [
    { "name": "textures", "value": "eyJ0aW1lc3RhbXAi…", "signature": "RmF…" }
  ]
}
```

…or, if no join session exists:

```http
HTTP/1.1 204 No Content
```
