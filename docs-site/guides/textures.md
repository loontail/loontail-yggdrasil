# Texture storage

The plugin owns the skin and cape PNGs end to end — disk layout, DB rows, public
URLs. There is no second service to deploy and no S3 bucket to provision (you can
front the static path with a CDN — see below).

## On-disk layout

```
public/yggdrasil/
└── textures/
    ├── skins/
    │   ├── 11111111111111111111111111111111-aabbccddeeff.png
    │   └── 22222222222222222222222222222222-001122334455.png
    └── capes/
        └── 11111111111111111111111111111111-998877665544.png
```

- Files live under `<strapi-root>/public/yggdrasil/textures/{skins,capes}/`.
  Strapi's `strapi::public` middleware serves the entire `public/` tree at the
  HTTP root, so the URLs are `/yggdrasil/textures/skins/<file>` and the same for
  capes.
- Filenames are `<32-char undashed UUID>-<6 random hex bytes>.png`. The 12-hex
  suffix is the "revision": it changes on every upload, so the public URL
  changes too. Browsers, CDNs, and authlib-injector's internal cache all bust
  cleanly.
- One PNG per player per asset type — uploading a new skin deletes the previous
  file as part of the same upsert.

## Database rows

Two collection types — both hidden from the content manager and the type
builder, because they're infrastructure:

### `yggdrasil_player_skins`

| Field | Type | Notes |
|---|---|---|
| `userId` | integer, required, unique | FK to `up_users.id` (cascade on delete). |
| `username` | string | Cached at upload time, used by the admin UI. |
| `filePath` | string, required | Absolute path on disk. |
| `fileUrl` | string, required | Public path (e.g. `/yggdrasil/textures/skins/<file>.png`). |
| `fileSize` | integer | Bytes. |
| `variant` | enum `CLASSIC` \| `SLIM`, default `CLASSIC` | Model type — see below. |

### `yggdrasil_player_capes`

| Field | Type | Notes |
|---|---|---|
| `userId` | integer, required, unique | FK to `up_users.id` (cascade on delete). |
| `username` | string | Cached at upload time. |
| `filePath` | string, required | Absolute path on disk. |
| `fileUrl` | string, required | Public path. |
| `fileSize` | integer | Bytes. |

Both `userId` columns are `unique`, which gives us the "one skin / one cape per
player" invariant for free.

## URL absolutisation

`fileUrl` is stored as a relative path. The signed `textures` property needs an
absolute URL, so the plugin prepends the `publicUrl` origin at read time:

```ts
const absoluteSkinUrl = new URL(skin.fileUrl, config.publicUrl).toString();
```

This means changing `publicUrl` rewrites every served URL automatically — useful
when moving from staging to production or adding HTTPS. Existing files on disk
don't need to be renamed.

## Upload flow

`PUT /textures/skin` and `PUT /textures/cape` go through the
`yggdrasil-token-auth` policy first. With the user identified, the controller:

1. Reads the uploaded file from the Koa multipart body.
2. Calls `assertPngBuffer(buffer, kind)` from `@loontail/yggdrasil-core` —
   inspects the PNG signature, IHDR chunk, and dimensions against the kind's
   allowed list (`SKIN_VALID_DIMENSIONS = ['64x64', '64x32']`,
   `CAPE_VALID_DIMENSIONS = ['64x32']`).
3. Caps the size at 256 KB — generous for HD packs, blocks accidental multi-MB
   uploads.
4. For skins only: re-detects the variant via
   `detectSkinVariant(buffer)` from `@loontail/minecraft-kit` if the
   uploader didn't supply one (legacy `up_users.skin` rows during migration use
   this path).
5. Builds the new filename: `<uuid>-<randomBytes(6).toString('hex')>.png`.
6. Writes the file and upserts the DB row. The old file (if any) is deleted in
   the same step.

## PNG validation rules

`validatePngBuffer` (returning a discriminated union) and `assertPngBuffer`
(throwing `YggdrasilCoreError(invalid_png)`) reject:

- Buffers smaller than 24 bytes (no room for signature + IHDR).
- Non-PNG signatures (the first 8 bytes must match `89 50 4E 47 0D 0A 1A 0A`).
- Files whose first chunk type isn't `IHDR`.
- Dimensions outside the kind's allowed list — skins must be `64×64` or `64×32`;
  capes must be `64×32`. Anything else (HD skins, oversized packs, JPEGs renamed
  to `.png`) is rejected.

The same validator runs on the client side before `PUT /textures/skin` is even
sent — invalid files throw synchronously and never hit the network.

## Variant detection

The `variant` column is the model type Minecraft uses to render the skin:

- `CLASSIC` — the original 4-pixel-wide arms.
- `SLIM` — the 3-pixel-wide arms ("Alex" model).

When the launcher uploads, it must declare the variant via the `variant` form
field. The plugin trusts that value — there's no way to look at a PNG and
deterministically know which model is intended (the difference is in how
Minecraft maps the texture, not in the texture itself).

For *legacy* rows migrated from the pre-plugin `skins-registry`, the variant
isn't stored. Those rows fall back to `detectSkinVariant(buffer)` from
`@loontail/minecraft-kit`, which uses Mojang's transparency heuristics on the
image data.

## Deletion semantics

`DELETE /textures/skin` (and `…/cape`) does two things:

1. Delete the file from disk (best-effort — a missing file is not an error).
2. Delete the DB row.

There is no soft-delete. A subsequent `GET /textures/:uuid` returns `null` for
the missing kind.

Because `up_users.id → yggdrasil_player_skins.userId` is a cascade FK (set up in
the bootstrap step `ensureTextureForeignKeys`), deleting a Strapi user also
deletes their skin and cape rows automatically. The disk files become orphans —
clean them up via the [admin UI](./plugin-admin) `purge-missing` flow.

::: tip SQLite caveat
SQLite cannot add a FOREIGN KEY constraint to an existing table. On SQLite the
cascade FK setup is silently skipped at debug-log level — disk + DB cleanup is
the host application's responsibility. Postgres / MySQL get the cascade.
:::

## Admin-side upload

Operators can upload on behalf of a user from
`/admin/plugins/yggdrasil/textures`. The endpoint is `POST /yggdrasil/textures/upload/skin`
with a JSON body `{ userId, fileBase64, variant?, username? }`. The admin JWT
guards it (same as every other admin route). Internally the controller calls
the same store + validate path as the user-facing upload.

## Sizing & caching

- Max PNG: **256 KB**. Higher caps invite abuse without any visual benefit —
  Minecraft renders these textures small.
- The revision suffix in filenames means you can serve the textures folder
  with `Cache-Control: public, max-age=31536000, immutable` once you're confident
  in the revision scheme. Strapi's default `public::public` middleware does
  *not* set this — wire it up at the proxy (nginx / Cloudflare).
- CDN-friendly: every PNG URL is content-addressed by the revision suffix.
  Putting a CDN in front of `/yggdrasil/textures/` is purely additive.

## Disaster recovery

Texture files live on disk; the DB has the canonical path/url. If files and DB
drift (a restore from different timestamps, a wiped volume, …):

- The admin UI offers **Validate** — scans `yggdrasil_player_skins` /
  `yggdrasil_player_capes` and reports rows whose `filePath` is missing on disk.
- And **Purge missing** — deletes those rows so the next upload can recreate
  them cleanly.

Both surfaces are also available as REST: `POST /yggdrasil/textures/validate`
returns `{ missingSkins: [id…], missingCapes: [id…] }`; `POST /yggdrasil/textures/purge-missing`
deletes them and returns counts.
