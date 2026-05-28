# Bootstrap & migrations

`server/bootstrap.ts` runs every time Strapi starts. It orchestrates a
sequence of idempotent steps from `server/bootstrap-steps/` — each one is
safe to re-run, so a partial failure on step N can be fixed and the server
restarted without manual cleanup.

```
strapi.start()
   │
   ▼
plugin::yggdrasil bootstrap
   │
   ├── 1. ensureUsersUuidColumn
   ├── 2. runSkinsRegistryMerge          (skipped if marker present or no legacy data)
   ├── 3. ensureTextureForeignKeys
   ├── 4. grantPublicPermissions
   ├── 5. crypto.init                     (load or generate active.key.pem)
   ├── 6. storage.init                    (mkdir public/yggdrasil/textures/{skins,capes})
   ▼
plugin starts serving + token cleanup tick begins (1-hour interval)
```

## 1. `ensureUsersUuidColumn`

Adds a single `uuid varchar(32)` column to the `up_users` table, plus a partial
unique index:

```sql
ALTER TABLE up_users ADD COLUMN uuid VARCHAR(32);
CREATE UNIQUE INDEX IF NOT EXISTS up_users_uuid_uniq
  ON up_users (uuid) WHERE uuid IS NOT NULL;
```

The `WHERE` clause makes the index partial — Postgres requires this so that
multiple rows with `NULL` uuid don't clash. SQLite ignores the clause but still
creates a valid unique index because SQLite doesn't index `NULL`. MySQL also
tolerates the clause.

Idempotent via `knex.schema.hasColumn`. If the column already exists, the call
is a no-op.

A user's UUID is assigned on first authentication: the `authserver/authenticate`
controller calls `users.ensureUuid(user.id)`, which generates a
`randomUndashedUuid()` if `up_users.uuid` is null. Existing users get one
lazily — nobody is upgraded en masse.

## 2. `runSkinsRegistryMerge`

A one-shot data migration from the legacy `skins-registry` plugin into the new
texture tables. The legacy plugin stored skin paths in `up_users.skin` /
`up_users.cape`; this migration:

1. Reads every populated row from `up_users` where `skin` or `cape` is not
   null.
2. Copies each file from `public/skins-registry/<original>` to
   `public/yggdrasil/textures/{skins,capes}/<uuid>-<random>.png`.
3. Detects the skin variant via
   `detectMojangSkinVariant(buffer)` from `@loontail/minecraft-kit`.
4. Insert rows into `yggdrasil_player_skins` / `yggdrasil_player_capes`.
5. Drops `up_users.skin` and `up_users.cape` columns.
6. Inserts a marker row into `yggdrasil_migrations` so the migration never
   runs again.

Wrapped in a single Knex transaction so a mid-migration failure rolls back
cleanly. The `yggdrasil_migrations` table is the only DB primitive that exists
purely for migration bookkeeping — it carries `(key, completedAt)` rows; the
marker key for this migration is `skins-registry-merge`.

If you don't have a legacy `skins-registry` install, the migration's row scan
finds nothing, writes the marker, and finishes in milliseconds.

## 3. `ensureTextureForeignKeys`

Adds two cascade foreign keys:

```sql
ALTER TABLE yggdrasil_player_skins
  ADD CONSTRAINT yggdrasil_player_skins_userId_fk
  FOREIGN KEY (user_id) REFERENCES up_users(id) ON DELETE CASCADE;

ALTER TABLE yggdrasil_player_capes
  ADD CONSTRAINT yggdrasil_player_capes_userId_fk
  FOREIGN KEY (user_id) REFERENCES up_users(id) ON DELETE CASCADE;
```

Deleting a Strapi user cascades into their texture row(s). The disk file is not
deleted automatically — the admin UI's "Validate" + "Purge missing" workflow
mops up orphans.

::: warning SQLite caveat
SQLite cannot add a FOREIGN KEY to an existing table — it requires a full table
rebuild. The phase catches that case and logs a debug-level note instead of
failing the bootstrap. Use the admin "Validate / Purge missing" flow to clean
up texture rows after `up_users` deletions on SQLite.
:::

## 4. `grantPublicPermissions`

Creates `users-permissions`-format permission rows for the Public role for
every Yggdrasil endpoint. The list is hard-coded in the bootstrap step; if a
permission row already exists (matched by `action` + `role`), the insert is
skipped.

The vanilla Minecraft client and authlib-injector both send no `Authorization`
header to these endpoints — granting Public is necessary. The texture mutation
routes additionally pass through the `yggdrasil-token-auth` policy, so a Public
permission gets you to the controller but the policy still enforces a Bearer
token.

You can revoke a permission from Settings → Users & Permissions Plugin → Roles
→ Public — but doing so will break the corresponding endpoint for both
launchers and the vanilla client.

## 5. `crypto.init`

The signing key step:

1. Read `config.privateKeyPath` (resolved relative to the Strapi root).
2. If the file exists, load it with `crypto.createPrivateKey`.
3. If not, generate a fresh RSA-4096 keypair (PKCS#8 private, SPKI public).
4. Persist the keypair: private at the configured path, public alongside as
   `active.pub.pem`.
5. Glob `data/yggdrasil/keys/archive/*.pub.pem` and load them so the metadata
   endpoint can advertise multiple keys during rotation.

After this step, `services.crypto.signBase64(payload)` is available to the
controllers that need to sign the `textures` property.

## Token cleanup tick

After the bootstrap phases, `startTokenCleanup` (from
`bootstrap-steps/token-cleanup.ts`) schedules a recurring task:

```ts
const interval = setInterval(tick, 60 * 60 * 1000);
interval.unref?.();
```

`tick` calls `services.tokens.cleanupExpired()`, which runs the equivalent of:

```sql
DELETE FROM yggdrasil_tokens WHERE expiresAt <= NOW();
```

The returned `{ stop() }` handle is stored in a per-`strapi` `WeakMap` so
the `destroy` hook can stop it on hot reload and graceful shutdown without
leaking timers across reloads.

## `destroy` hook

```ts
async destroy({ strapi }) {
  runtimeHandles.get(strapi)?.stop();
  runtimeHandles.delete(strapi);
  services.joinSessions.dispose();
}
```

Runs on hot reload (Strapi dev mode) and on graceful shutdown. Strapi's
reload model otherwise stacks intervals across reloads, so stopping the
cleanup tick is mandatory.

## What can go wrong

| Symptom | Cause | Fix |
|---|---|---|
| `up_users.uuid` column missing after start | DB user lacks `ALTER` permission | Grant `ALTER` and restart |
| `signaturePublickey` is empty in `/api/yggdrasil/` | `crypto.init` failed | Check the log around `init crypto`; usually a permissions issue on `data/yggdrasil/keys/` |
| Public role can't hit `/api/yggdrasil/authserver/authenticate` (403) | `users-permissions` cache stale after `grantPublicPermissions` ran | Restart Strapi; the permission cache rebuilds on boot |
| `migration skins-registry-merge skipped: legacy table missing` | No legacy data | Expected — the marker is still written |
| `failed to add FK on yggdrasil_player_skins.userId` (debug log) | SQLite backend | Expected — use admin Validate / Purge missing |

## Running migrations again

The bootstrap phases run on every restart, but the *data* migration in phase 2
is marker-guarded. To re-run it (e.g. you restored a backup that includes
legacy `up_users.skin` rows but predates the marker):

```sql
DELETE FROM yggdrasil_migrations WHERE key = 'skins-registry-merge';
```

…then restart Strapi. The migration picks up where it left off.
