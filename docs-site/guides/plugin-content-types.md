# Content types

The plugin owns three tables. All of them have `pluginOptions.content-manager.visible`
and `pluginOptions.content-type-builder.visible` set to `false`, so they don't
appear in the Strapi admin UI's content manager or schema editor — they're
infrastructure, not editor-facing data.

It also adds one column to `up_users`. The user table itself is not redefined —
the column is added via Knex during bootstrap.

## `up_users` (one added column)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `uuid` | `varchar(32)` | yes | 32-char undashed lowercase hex; partial unique index `up_users_uuid_uniq`. Filled lazily on first authentication. |

Everything else in `up_users` is owned by `@strapi/plugin-users-permissions` and
is not redeclared by this plugin.

## `yggdrasil_tokens`

```json
{
  "kind": "collectionType",
  "collectionName": "yggdrasil_tokens",
  "options": { "draftAndPublish": false },
  "pluginOptions": {
    "content-manager":      { "visible": false },
    "content-type-builder": { "visible": false }
  },
  "attributes": {
    "userId":      { "type": "integer",  "required": true },
    "accessToken": { "type": "string",   "required": true, "maxLength": 64, "unique": true },
    "clientToken": { "type": "string",   "required": true, "maxLength": 64 },
    "issuedAt":    { "type": "datetime", "required": true },
    "expiresAt":   { "type": "datetime", "required": true }
  }
}
```

- One row per issued `accessToken`.
- `userId` is a plain integer (not a Strapi relation) — the cleanup queries
  index on it directly.
- `accessToken` is `unique` so the cleanup query doesn't risk hitting duplicates.
- TTL is enforced by the `expiresAt` column + the hourly cleanup tick.
- Per-user cap (`tokens.maxPerUser`, default 10) is enforced inside
  `services/tokens.ts#issue` — the oldest row is deleted before a new one is
  inserted.

## `yggdrasil_player_skins`

```json
{
  "kind": "collectionType",
  "collectionName": "yggdrasil_player_skins",
  "options": { "draftAndPublish": false },
  "pluginOptions": {
    "content-manager":      { "visible": false },
    "content-type-builder": { "visible": false }
  },
  "attributes": {
    "userId":   { "type": "integer", "required": true, "unique": true },
    "username": { "type": "string" },
    "filePath": { "type": "string", "required": true },
    "fileUrl":  { "type": "string", "required": true },
    "fileSize": { "type": "integer" },
    "variant":  { "type": "enumeration", "enum": ["CLASSIC", "SLIM"], "default": "CLASSIC" }
  }
}
```

- One row per player (`unique` on `userId`).
- `userId` carries a cascade FK to `up_users.id` on Postgres / MySQL — see the
  bootstrap step `ensureTextureForeignKeys`. SQLite skips the FK.
- `filePath` is absolute disk path; `fileUrl` is the relative public URL
  (`/yggdrasil/textures/skins/<file>.png`). The signed `textures` property
  prepends `publicUrl` origin at read time.
- `fileSize` is computed at upload and stored — used by the admin UI's card
  layout and for capacity tracking.
- `variant` carries the model type — `CLASSIC` (4px arms) or `SLIM` (3px arms).
  The uploader declares it; legacy rows fall back to
  `detectSkinVariant(buffer)` from `@loontail/minecraft-kit`.

## `yggdrasil_player_capes`

```json
{
  "kind": "collectionType",
  "collectionName": "yggdrasil_player_capes",
  "options": { "draftAndPublish": false },
  "pluginOptions": {
    "content-manager":      { "visible": false },
    "content-type-builder": { "visible": false }
  },
  "attributes": {
    "userId":   { "type": "integer", "required": true, "unique": true },
    "username": { "type": "string" },
    "filePath": { "type": "string", "required": true },
    "fileUrl":  { "type": "string", "required": true },
    "fileSize": { "type": "integer" }
  }
}
```

Identical shape to skins minus the `variant` column. Capes have a single model
in the vanilla client.

## `yggdrasil_migrations`

Not a content type — a Knex-created bookkeeping table used by one-shot
migrations.

| Column | Type | Notes |
|---|---|---|
| `key` | string, PK | The migration name (e.g. `skins-registry-merge`). |
| `completedAt` | datetime | When the migration finished. |

`server/migrations/skins-registry-merge.ts` inserts its marker into this table
inside the same transaction as the data move. Re-running the migration is a
matter of deleting the row and restarting Strapi.

## Why not use Strapi relations?

The plugin uses raw `userId integer` instead of declaring a Strapi
`relation` to `plugin::users-permissions.user`. Two reasons:

1. The relation tables Strapi creates would change with every Strapi minor
   release and force migrations in user projects. The plain integer column is
   stable.
2. The cascade FK gives the same semantics with simpler queries — `WHERE userId = ?`
   instead of joining through the relation table.

The cost is that the content manager wouldn't show a useful link even if these
content types were visible — but they're not, so the trade-off is one-sided.

## Why hide the content types from the content manager?

The token rows are sensitive (they're effectively long-lived auth credentials)
and the texture rows have a strict file ↔ DB invariant that the content manager
doesn't understand. Letting an admin edit them inline would invite breaking the
invariant and leaking tokens. The admin UI under `/admin/plugins/yggdrasil`
exposes the safe operations explicitly.

The `pluginOptions.content-type-builder.visible: false` flag additionally
prevents the schema editor from rewriting the schema JSON on save — preserving
the column types the migrations created.
