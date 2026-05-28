# @loontail/strapi-plugin-yggdrasil

A Strapi v5 plugin that exposes a Yggdrasil-compatible authentication
and session API on top of the existing `users-permissions` plugin and
the `skins-registry` plugin. Mounted under `/api/yggdrasil/`.

It is the server side of `loontail-yggdrasil` — see the repo root for
the protocol overview and the client package.

## Install

```sh
npm install @loontail/strapi-plugin-yggdrasil @loontail/minecraft-kit
```

Register the plugin in `config/plugins.js`:

```js
module.exports = ({ env }) => ({
  '@loontail/strapi-plugin-yggdrasil': {
    enabled: true,
    resolve: '@loontail/strapi-plugin-yggdrasil',
    config: {
      publicUrl: env('YGGDRASIL_PUBLIC_URL', ''),
      skinDomains: env.array('YGGDRASIL_SKIN_DOMAINS', []),
      serverName: env('YGGDRASIL_SERVER_NAME', 'Loontail Yggdrasil'),
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

## What the plugin does to your database

On `bootstrap`, the plugin:

1. Adds a single `uuid varchar(32)` column to `up_users` (idempotent
   via `hasColumn`), and a `up_users_uuid_uniq` partial unique index.
2. Creates `yggdrasil_tokens` and (optionally) `yggdrasil_join_sessions`.
3. Generates an RSA-4096 key pair under `data/yggdrasil/keys/` on first
   run if none exists.

The plugin does **not** modify the `up_users` Strapi schema — the
`uuid` column is managed entirely from inside the plugin via Knex.
This keeps your host Strapi project unchanged except for the
`config/plugins.js` registration.

## What it does NOT do

- It does **not** upload, delete, or otherwise mutate skin/cape files.
  Skin management lives in `skins-registry`. The Yggdrasil plugin
  reads `up_users.skin` and `up_users.cape` (relative paths) at
  `hasJoined` time, opens the PNG from disk to detect classic/slim
  via `@loontail/minecraft-kit`'s `detectMojangSkinVariant`, and
  serves the texture URL as-is.
- It does **not** ship a `/authserver/signout` endpoint. Access
  tokens expire by TTL only. Launchers should simply discard their
  local session on logout.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| `GET`    | `/`                                              | ALI metadata |
| `POST`   | `/authserver/authenticate`                       | login |
| `POST`   | `/authserver/refresh`                            | rotate accessToken |
| `POST`   | `/authserver/validate`                           | 204 / 403 |
| `POST`   | `/authserver/invalidate`                         | 204; deletes the token |
| `POST`   | `/sessionserver/session/minecraft/join`          | server-join cache push |
| `GET`    | `/sessionserver/session/minecraft/hasJoined`     | signed profile |
| `GET`    | `/sessionserver/session/minecraft/profile/:uuid` | profile (signed by default; `?unsigned=true` strips the signature) |
| `POST`   | `/api/profiles/minecraft`                        | bulk name → profile lookup |
