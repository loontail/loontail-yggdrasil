# `@loontail/strapi-plugin-yggdrasil`

[![npm](https://img.shields.io/npm/v/@loontail/strapi-plugin-yggdrasil.svg)](https://www.npmjs.com/package/@loontail/strapi-plugin-yggdrasil)

Strapi v5 plugin: Yggdrasil-compatible authentication endpoints, player skin
and cape storage, and an admin UI for browsing both.

```bash
npm install @loontail/strapi-plugin-yggdrasil @loontail/yggdrasil-core
```

Then in `config/plugins.js`:

```js
module.exports = ({ env }) => ({
  yggdrasil: {
    enabled: true,
    resolve: '@loontail/strapi-plugin-yggdrasil',
    config: {
      publicUrl: env('YGGDRASIL_PUBLIC_URL', 'http://localhost:1337/api/yggdrasil'),
    },
  },
});
```

Full configuration in the [plugin config reference](../reference/plugin-config).

## Guides

- [Installation](../guides/plugin-install)
- [Configuration](../guides/plugin-config)
- [Bootstrap & migrations](../guides/plugin-bootstrap)
- [Admin UI](../guides/plugin-admin)
- [Content types](../guides/plugin-content-types)
- [Texture signing](../guides/signing)
- [Texture storage](../guides/textures)
- [Tokens & sessions](../guides/tokens)
- [Yggdrasil protocol primer](../guides/protocol)

## What it mounts

### Public API namespace

Under `/api/yggdrasil/*`. Public users-permissions role; texture mutation
routes additionally pass through the `yggdrasil-token-auth` policy.

- Metadata: `GET /`
- Auth: `POST /authserver/{authenticate,refresh,validate,invalidate}`
- Session: `POST /sessionserver/session/minecraft/join`,
  `GET /sessionserver/session/minecraft/hasJoined`,
  `GET /sessionserver/session/minecraft/profile/:uuid`
- Bulk profiles: `POST /api/profiles/minecraft`
- Textures: `GET /textures/:uuid`, `PUT /textures/skin`, `PUT /textures/cape`,
  `DELETE /textures/skin`, `DELETE /textures/cape`

### Admin namespace

Under `/yggdrasil/textures/*`. Standard Strapi admin JWT.

- Skin / cape listing, search, pagination
- Admin upload on behalf of users
- Delete by row id
- Validate / purge-missing flow for filesystem ↔ DB consistency

### Admin UI

Under `/admin/plugins/yggdrasil`. Texture browser with 3D previews
(`skinview3d`), search, pagination, upload, delete.

## What it owns

| Resource | Notes |
|---|---|
| `up_users.uuid` | One added column. 32-char undashed hex. Filled lazily on first auth. |
| `yggdrasil_tokens` table | Access tokens with TTL and per-user cap. |
| `yggdrasil_player_skins` table | One row per user (unique on `userId`). |
| `yggdrasil_player_capes` table | One row per user (unique on `userId`). |
| `yggdrasil_migrations` table | Bookkeeping for one-shot data migrations. |
| `public/yggdrasil/textures/{skins,capes}/` | PNG files keyed by `<uuid>-<rev>`. |
| `data/yggdrasil/keys/active.key.pem` | RSA-4096 signing key (generated on first boot). |

See the [database schema reference](../reference/db) for the column layout.

## What it depends on

- `@strapi/strapi` v5 (peer)
- `@strapi/plugin-users-permissions` v5 (peer) — owns `up_users` and password
  verification
- `@loontail/yggdrasil-core` — protocol schemas, signing helpers, PNG validators
- `@loontail/minecraft-kit` — `detectSkinVariant` (for legacy skin rows
  missing the `variant` column)
- `skinview3d` — admin UI 3D skin preview

## Engine

- Node ≥ 20.
- CommonJS — published as `"type": "commonjs"` because Strapi v5 still
  expects CommonJS plugins.
- Built with `tsc` (not bundled — Strapi's plugin loader expects the source
  tree shape).
