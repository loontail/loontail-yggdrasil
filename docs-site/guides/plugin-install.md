# Installation (Strapi plugin)

## Add the dependency

```bash
npm install @loontail/strapi-plugin-yggdrasil @loontail/yggdrasil-core
```

`@loontail/yggdrasil-core` is a transitive dependency of the plugin, but
installing it explicitly lets you reach for `validatePngBuffer`,
`buildTexturesPayload`, and the Zod schemas from your own Strapi code (custom
controllers, routes, lifecycles).

::: tip
The plugin is published as CommonJS. Don't set `"type": "module"` on the Strapi
project — Strapi v5 expects CommonJS itself.
:::

## Register in `config/plugins.js`

Strapi reads plugin config from `config/plugins.{js,ts}` keyed by **plugin name**,
not package name. The Yggdrasil plugin advertises itself as `yggdrasil`:

```js
// config/plugins.js
module.exports = ({ env }) => ({
  yggdrasil: {
    enabled: true,
    resolve: '@loontail/strapi-plugin-yggdrasil',
    config: {
      publicUrl: env('YGGDRASIL_PUBLIC_URL', ''),
      skinDomains: env.array('YGGDRASIL_SKIN_DOMAINS', []),
      serverName: env('YGGDRASIL_SERVER_NAME', 'Loontail Yggdrasil'),
      implementationName: 'loontail-yggdrasil',
      implementationVersion: '1.0.0',
      tokens: {
        accessTtlSeconds: env.int('YGGDRASIL_TOKEN_TTL', 60 * 60 * 24 * 15),
        maxPerUser: env.int('YGGDRASIL_TOKEN_CAP', 10),
      },
      privateKeyPath: env('YGGDRASIL_PRIVATE_KEY_PATH', 'data/yggdrasil/keys/active.key.pem'),
      joinBackend: env('YGGDRASIL_JOIN_BACKEND', 'memory'),
    },
  },
});
```

`resolve` is mandatory because the plugin is loaded from `node_modules`, not from
`src/plugins/`. The key (`yggdrasil`) matches the `strapi.name` field in the
plugin's `package.json` — don't rename it.

The full config schema is in the [plugin config reference](../reference/plugin-config).

## Choose a `publicUrl`

`publicUrl` is the absolute URL clients will hit. The vanilla Minecraft client
embeds it into the authlib-injector `-javaagent` argument, so:

- **Include the `/api/yggdrasil` prefix.** That's the Strapi mount point. The
  plugin doesn't add it for you.
- **Don't add a trailing slash.** The plugin strips one if present, but config
  is easier to read without it.
- **For development**, `http://localhost:1337/api/yggdrasil` is fine. The kit
  binds the loopback redirect at a random port at runtime; nothing else needs
  to be public.
- **For production**, use HTTPS. authlib-injector hits the metadata endpoint at
  JVM start, and a hostile MITM can substitute keys if you skip TLS.

The `skinDomains` config defaults to the hostname of `publicUrl` (without the
port — Mojang's `URI.getHost()` strips ports, so `localhost:1338` wouldn't
match `localhost` and the client would refuse the texture URL). Override
`skinDomains` only if your skin and cape PNGs are served from a separate origin
(CDN, S3 with custom domain, …).

## First boot

```bash
npm run develop
```

The plugin runs five bootstrap phases on startup:

1. **`ensureUsersUuidColumn`** — adds `up_users.uuid varchar(32)` and a
   partial unique index. Idempotent.
2. **`runSkinsRegistryMerge`** — one-shot migration from a legacy
   `skins-registry` plugin. Marker-protected; skips when no legacy data exists.
3. **`ensureTextureForeignKeys`** — cascade FK from `yggdrasil_player_skins.userId`
   / `yggdrasil_player_capes.userId` to `up_users.id`. Skipped silently on SQLite.
4. **`grantPublicPermissions`** — creates Public-role permission rows for every
   Yggdrasil route so the vanilla client (which sends no auth header) can hit them.
5. **`crypto.init`** — load or generate the RSA-4096 signing key at
   `data/yggdrasil/keys/active.key.pem`.

Each phase logs one line in the Strapi log. If any phase throws, the plugin still
mounts its routes — but the texture signing flow won't work without a key, so
fix the underlying issue and restart.

See [Bootstrap & migrations](./plugin-bootstrap) for the full breakdown.

## Permissions

`grantPublicPermissions` adds permission rows under the Public role:

```
api::yggdrasil.yggdrasil.<endpoint>
```

…for every Yggdrasil endpoint (authenticate, refresh, validate, invalidate,
join, hasJoined, profile, bulkProfiles, the root meta, textures lookup, and the
texture mutations). The mutation routes additionally go through the
`yggdrasil-token-auth` policy — so the Public permission only gets you to the
controller; the policy still requires a valid `Authorization: Bearer …` header.

You can revoke a permission from the admin UI (Settings → Users & Permissions →
Roles → Public) — but the launcher and vanilla client both expect every Yggdrasil
route to be reachable without an admin JWT, so don't.

## Disabling the plugin

Set `enabled: false` in `config/plugins.js`. The plugin's routes disappear, but
the database columns and tables it created stay where they are. Nothing else
in your Strapi project reads them, so leaving them in place is fine; if you
want to clean up:

```sql
-- Postgres example. SQLite needs ALTER TABLE / table rebuild for the column drop.
DROP TABLE yggdrasil_tokens;
DROP TABLE yggdrasil_player_skins;
DROP TABLE yggdrasil_player_capes;
DROP TABLE yggdrasil_migrations;            -- marker table for one-shot migrations
ALTER TABLE up_users DROP COLUMN uuid;
```

…and remove the texture files: `rm -rf public/yggdrasil/textures/`. The signing
key under `data/yggdrasil/keys/` is independent of the plugin lifecycle — keep
it if you plan to bring the plugin back.
