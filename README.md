# Signal Database Tools

Small local scripts for exporting and querying a Signal Desktop database.

## Files

- `decrypt-database.js`
  Exports Signal's encrypted SQLCipher database into a plaintext SQLite file.
- `query-signal-db.js`
  Opens the exported plaintext database and runs a couple of example queries.
- `package.json`
  Declares the dependencies used by the scripts.
- `package-lock.json`
  Pins the dependency tree for reproducible installs.

## Requirements

- Linux desktop session with the same keyring backend Signal Desktop uses.
- Access to the same user profile that owns `~/.config/Signal`.
- Node.js and npm.

These scripts currently use the Signal Desktop paths:

- config: `~/.config/Signal/config.json`
- encrypted DB: `~/.config/Signal/sql/db.sqlite`
- decrypted export: `~/.config/Signal/sql/db-decrypted.sqlite`

## Install

Use the lockfile-backed install:

```bash
npm ci
```

If you intentionally change dependencies, update them with:

```bash
npm install
```

## How It Works

`decrypt-database.js` reads Signal's `config.json`, uses Electron `safeStorage` to decrypt `encryptedKey`, opens the SQLCipher database with `@signalapp/sqlcipher`, and exports a plaintext copy.

On Linux, the script also matches Signal's `safeStorageBackend` by setting Electron's `password-store` switch before Electron initializes.

`query-signal-db.js` prefers the exported plaintext database if it exists. If a plaintext key is present in Signal's config, it can also open an encrypted database directly.

## Usage

### 1. Export the decrypted database

```bash
npm run decrypt
```

Expected result:

```text
Decrypted database exported to: /home/<user>/.config/Signal/sql/db-decrypted.sqlite
```

Notes:

- The script relaunches itself under Electron automatically.
- If `db-decrypted.sqlite` already exists, it is replaced.
- The GTK warning about `font-antialiasing` can appear on Linux and does not affect the export.

### 2. Run example queries

```bash
npm run query
```

Current behavior:

- prints all table names from the database
- prints IDs of active private conversations with a name

## Reproducibility

This setup does not rely on manual edits inside `node_modules`.

Reproducibility comes from:

- `package.json`
- `package-lock.json`
- installing with `npm ci`

That gives you the same dependency tree on another machine of the same general platform class.

## Troubleshooting

### `safeStorage` decryption fails

Possible causes:

- the desktop keyring is locked
- the current desktop session is not the one Signal uses
- the selected Linux password store does not match Signal's recorded `safeStorageBackend`

### `file is not a database`

This usually means one of these:

- you are opening the encrypted `db.sqlite` without the correct key
- the plaintext export does not exist yet
- the export failed and needs to be rerun

Run `npm run decrypt` first, then retry `npm run query`.

## Extending the Query Script

`query-signal-db.js` is intentionally simple. The easiest next step is to replace the example statements with the queries you actually want, for example:

- list conversations with names and timestamps
- fetch recent messages for a conversation
- export selected rows to JSON or CSV