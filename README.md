# dsh-plugin-sorter

RimCrow-inspired plugin sorter for DeepSeek Harness (DSH).

Manage your DSH web profile plugins with a two-column board:

- **Enabled / Disabled** two-column drag-and-drop UI
- Drag between columns to enable / disable
- Drag to reorder the enabled plugins (load order)
- Click a plugin to see README, author, repository, version, diagnostics
- Save drafts first, then apply changes; restarts are left to the user
- Group plugins and add notes
- Loader-entry view: two-column list of actual Cordis loader entries, with protected entries greyed out and details (id / name / description / version / repository)

## Install

From GitHub:

```sh
dsh plugin --profile web add github:inks-knowledge/dsh-plugin-sorter
```

From npm (after publishing):

```sh
dsh plugin --profile web add dsh-plugin-sorter
```

Then restart DSH / the desktop app and open **Settings → 插件排序**.

## Usage

1. Open **Settings → Plugin Sorter**.
2. Drag packages between the enabled / disabled columns.
3. Drag enabled packages to change load order.
4. Click a package for details and diagnostics.
5. Click **Save Draft** to keep your edits without applying them.
6. Click **保存** to write the changes to the profile.
7. Restart DSH manually to make the changes take effect.

The **Loader Entries** section shows the underlying Cordis loader rows:

- Active entries are listed on the left, disabled entries on the right.
- Protected architecture entries are greyed out and cannot be toggled.
- Click an entry to see its id, name, description, version and repository.

## Development

The plugin is a plain ESM DSH bundle:

```text
lib/       host-side routes and profile logic
client/    browser bundle (window.__ModuleLoader__ format)
```

### Local test

```sh
# In a built DSH checkout:
node --expose-internals apps/cli/lib/bin.js web --port 3999
```

Set `DSH_HOME` to a test home if you want to avoid touching your real profile.

## License

MIT
