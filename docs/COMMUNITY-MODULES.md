# Community device modules

Users can install device discovery modules from public GitHub releases. These run through the same sandbox as local authoring projects. They identify devices covered by their declared USB vendor/product IDs. They cannot write hardware settings, access the network or filesystem, execute processes, or add pages.

## Install and manage

1. Open **Settings > Modules > Install from GitHub**.
2. Enter a public repository URL or `owner/repository` and select **Review**.
3. Read the author, version, device access, and trust information, then select **Install module**.
4. The module appears in Installed, switched off. Enable it to start device discovery.

An enabled module with no matching hardware reports Ready without creating a module host. Its device controls remain read-only. Disabling destroys its sandbox, and saved enablement survives application restart.

Open its details to review an update, roll back, or remove it. Updates and rollback leave the selected version disabled for explicit enablement. A rejected download or validation leaves the current version intact. Local authoring projects are never overwritten.

Removal offers a separate **block this signing key** option. It removes every installed module signed by that key and rejects future installs, startup loading, and rollback using that key. This is a local revocation policy, not a central security feed. Downloaded versions remain in the app's private package cache for recovery; removal stops execution and removes the installation record.

## Create and publish

Create a starter under **Settings > Modules > Developer tools**, or follow [the module API](MODULES.md). Declare exact VID/PID permissions for hardware you have tested. API v1 requires `kind: "device"` and exactly `capabilities: ["device-discovery"]`.

Run the packaging helper from a Switchboard source checkout with its Bun dependencies installed. Keep the authoring project in its own GitHub repository. Generate the signing key outside that project and keep a private backup:

```powershell
bun scripts/package-community-module.ts keygen C:/private/module-signing.pem
```

The command prints a public key fingerprint. Publish that fingerprint in your module README so users can compare it. Never commit or upload the private key. Parent directories must already exist.

After testing the project, package it for the exact GitHub repository that will distribute it:

```powershell
bun scripts/package-community-module.ts pack C:/projects/my-device owner/my-device C:/private/module-signing.pem C:/packages/switchboard-module.json
```

The helper validates the project and creates a signed, self-contained package with a normalized `src/index.js` entrypoint. It does not execute the module, install dependencies, or run build scripts. Existing keys and output files are never overwritten.

Create a **stable, published GitHub release** in `owner/my-device` and attach the output with the exact asset name `switchboard-module.json`. The installer uses the repository's latest stable release. Drafts and prereleases are excluded. GitHub supplies the asset digest used to check the download: [release asset API](https://docs.github.com/en/rest/releases/assets).

Share the repository URL. No central registry, GitHub account connection, or Switchboard release is needed for each new module. Private repositories are not supported.

For updates, change the manifest version, test, sign with the **same key**, and attach the new package to a new stable release. Existing installations reject a changed key, another repository claiming the same module ID, and a reused installed version. Users review updates manually; the application's automatic module update preference does not download community packages.

## Package and trust boundary

`switchboard-module.json` is a JSON envelope:

```text
format: 1
payload: base64 of UTF-8 JSON { repository, manifest, source }
publicKey: base64 of Ed25519 SPKI DER public key
signature: base64 of Ed25519 signature over the exact decoded payload bytes
```

Downloads are limited to 1 MiB, JavaScript source to 512 KiB, and GitHub API responses to 256 KiB. HTTPS downloads allow only GitHub API, release, and asset hosts, at most three redirects, and a 20-second deadline per request chain. Responses and IPC inputs are schema-validated. No repository checkout, archive extraction, package-manager installation, or remote install script runs on the user's machine.

A signature proves that a package matches a signing key. The first install is an explicit trust decision about a self-identified author; neither a signature nor a GitHub repository is Switchboard approval. Updates require the same key and repository. The signed payload binds the repository, manifest, access declarations, and source together.

Reviews are held in main, expire after ten minutes, and retain the exact downloaded bytes. Installation consumes a review ID, stages validated files, then renames them into a SHA-256-named directory before changing canonical module state. Package and source hashes are checked at startup and enablement, and source is checked again before sandbox execution. Corrupt files and blocked keys fail closed. No background updater or download timer runs. Shutdown aborts in-flight downloads.

Only the immediately previous version is offered as rollback. It must pass the same signature, source, compatibility, and publisher-block checks. Automatic runtime-health rollback, a reviewed catalogue, key rotation, and a remote revocation service remain future work.

## Validation

```powershell
bun test tests/community-modules.test.ts tests/module-authoring.test.ts tests/device-module-state.test.ts tests/device-registry-lifecycle.test.ts
bun run check
bun run check:types
bun run build
node scripts/verify-community-modules.mjs
bun run verify:module-sandbox
```

The native harness uses hidden Electron windows and an isolated profile. It exercises real IPC, signature checks, installation state, and lifecycle using a deterministic GitHub transport fixture. This does not prove a public publisher's release is downloadable or that a physical device is supported.
