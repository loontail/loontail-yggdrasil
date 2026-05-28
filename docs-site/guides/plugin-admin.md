# Admin UI

The plugin ships an admin section under `/admin/plugins/yggdrasil`. It's the
operator-facing surface for browsing and managing the texture tables. Strapi's
default admin JWT guards everything — there's no separate auth.

## Layout

The plugin adds one menu entry — **Yggdrasil** — under the admin sidebar. Inside,
the page is split into two tabs.

### Textures (default)

Subtabs for **Skins** and **Capes**:

- **List mode** — paginated grid of cards. Each card shows the player's username,
  the file size, the variant (skins only), and a thumbnail. Clicking a card
  opens a detail modal with a 3D `skinview3d` preview, the full URL, and a
  delete button.
- **Upload mode** — admin-side upload form. Pick a user from the list, pick a
  PNG, choose a variant (skins), submit. Same validators as the user-facing
  endpoint, so a bad PNG is rejected the same way.

The pagination controls live at the bottom: page size (10 / 25 / 50 / 100) and
page navigation.

### Sessions

A placeholder tab for the in-memory join sessions store. The current build shows
the `joinBackend` config value and a static description; future revisions will
list active join sessions.

## REST surface

The admin UI is backed by an admin-only REST namespace under
`/yggdrasil/textures/*`. You can hit it directly with an admin JWT if
you want to script texture management.

| Method | Path | Body / query | Purpose |
|---|---|---|---|
| `GET` | `/yggdrasil/textures/skins` | `?page=1&pageSize=25&search=…` | Paginated skins list. |
| `GET` | `/yggdrasil/textures/capes` | `?page=1&pageSize=25&search=…` | Paginated capes list. |
| `POST` | `/yggdrasil/textures/upload/skin` | `{ userId, fileBase64, variant?, username? }` | Upload on behalf of a user. |
| `POST` | `/yggdrasil/textures/upload/cape` | `{ userId, fileBase64, username? }` | Upload on behalf of a user. |
| `DELETE` | `/yggdrasil/textures/skins/:id` | — | Delete by row id. |
| `DELETE` | `/yggdrasil/textures/capes/:id` | — | Delete by row id. |
| `POST` | `/yggdrasil/textures/validate` | — | Returns `{ missingSkins: [id…], missingCapes: [id…] }`. |
| `POST` | `/yggdrasil/textures/purge-missing` | — | Deletes rows whose files are missing; returns counts. |

The `search` query is a `LIKE %…%` over `username` plus the formatted UUID. It's
case-insensitive on Postgres / MySQL, case-sensitive on SQLite (the engine's
default behaviour — not something the plugin overrides).

## 3D preview

The plugin embeds `skinview3d` for live skin previews in the detail modal.
Clicking and dragging rotates the model; the controls are the upstream library's
defaults. Capes render in a separate `skinview3d` instance — the model wears
the user's current cape if one is uploaded.

For users who haven't uploaded a skin yet, the preview falls back to Steve.

## Validate & purge missing

When you delete a Strapi user, the cascade FK drops their `yggdrasil_player_skins`
/ `yggdrasil_player_capes` rows automatically (where the backend supports it).
The PNG file on disk becomes an orphan. Likewise, if you restore the DB from
backup without the matching filesystem snapshot, you can end up with rows whose
`filePath` points at a missing file.

The **Validate** action scans the database, opens each `filePath` (sync stat),
and reports rows where the file is missing. It returns IDs only — nothing is
mutated.

**Purge missing** then deletes those rows. The next upload from the same user
recreates them cleanly.

There is no orphan-file finder in the admin UI today — listing files on
disk that don't match a DB row is a manual job. The matching direction
(DB rows whose files are missing) is exposed via the `validate` /
`purge-missing` endpoints above and via `services.textures-store.findMissing`.

## i18n

Translation files live in `admin/src/translations/` (`en.json`, …). The plugin
ships with English; PRs adding other locales are welcome. Strapi's
`useIntl()` is used throughout the page tree — no hard-coded user-facing strings.

## Customisation

The admin UI is built into the plugin's distribution bundle. To override it:

1. Fork the plugin and patch `admin/src/`.
2. Or, use Strapi's [admin injection zones](https://docs.strapi.io/dev-docs/plugins/admin-panel-api#zones)
   to insert custom UI alongside the plugin's. The plugin doesn't expose its
   own injection zones today.

For one-off operational tasks, hitting the REST surface above directly is
usually faster than building UI.
