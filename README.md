# Loontail Minecraft Auth

Self-hosted Minecraft authentication and player profile server.
Implements the Yggdrasil protocol (so the vanilla client can play in
online mode against a private server via `authlib-injector`) and
owns the player's profile assets — skins, capes — through a single
Strapi v5 plugin.

A custom launcher signs in against the server, plays online, uploads
and replaces its skin / cape, all using one access token. The same
plugin powers the admin UI for ops to browse and manage uploaded
textures.

## Packages

| Package | Purpose |
|---|---|
| [`@loontail/yggdrasil-core`](./packages/yggdrasil-core)              | Protocol types, Zod schemas, UUID helpers, PNG byte-level validation, textures-payload codec, error registry. Pure functions, runtime-agnostic. |
| [`@loontail/strapi-plugin-yggdrasil`](./packages/strapi-plugin-yggdrasil) | Strapi v5 plugin: Yggdrasil endpoints under `/api/yggdrasil/*`, owns the `yggdrasil_tokens` / `yggdrasil_player_skins` / `yggdrasil_player_capes` tables, ships the admin UI under `/admin/plugins/yggdrasil`. |
| [`@loontail/yggdrasil-client`](./packages/yggdrasil-client)          | TypeScript HTTP client + bundled `authlib-injector.jar` + `-javaagent` argument builder, for use in a Minecraft launcher. |

## Topology

- **Source of truth for users**: Strapi `up_users` (the plugin adds a
  single `uuid` column at bootstrap; no other schema changes to the
  user table).
- **Skins / capes**: owned by the same Yggdrasil plugin —
  `yggdrasil_player_skins` and `yggdrasil_player_capes` tables, served
  from `public/yggdrasil/textures/{skins,capes}/<uuid>-<rev>.png`.
  Mutations protected by a Yggdrasil access token (`PUT /textures/{skin,cape}`).
- **Skin variant detection** (classic / slim): stored at upload time
  and re-detected via `detectSkinVariant` from
  `@loontail/minecraft-kit` for legacy rows.
- **authlib-injector**: the Java agent ships inside the
  `@loontail/yggdrasil-client` package as a bundled jar.

## Workspace

```sh
npm install
npm run verify         # turbo run lint typecheck test build
```

Turborepo handles task ordering (`yggdrasil-client` and
`strapi-plugin-yggdrasil` depend on `yggdrasil-core` being built first).

## Releases

Independent per-package semver via [Changesets](https://github.com/changesets/changesets).
One PR = one changeset. CI publishes on merge to `main`.

## License

MIT.
