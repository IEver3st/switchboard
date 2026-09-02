# Releasing Switchboard for Windows

Switchboard uses `electron-updater` with the NSIS artifacts and `latest.yml` published by the `Release Windows` GitHub Actions workflow.

## Distribution prerequisites

1. The update feed must be anonymously readable by installed clients. `IEver3st/switchboard` is public, so GitHub can serve release metadata without a token on user machines. Do not embed a personal access token in the application. Before describing delivery as live, publish a release with the NSIS installer, block map, and `latest.yml`, then verify those assets from an unauthenticated client.
2. Production releases should be Authenticode-signed. Add repository secrets named `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`. `WINDOWS_CSC_LINK` can contain the base64-encoded `.pfx` accepted by electron-builder. The workflow remains buildable without these secrets, but that produces an unsigned installer and does not provide a trusted publisher identity or a good SmartScreen experience.
3. Keep `package.json` and the release tag at the same semantic version.

## Release flow

1. Update the version and release notes on a reviewed commit.
2. Run the repository validation and build gates.
3. Push a tag such as `v0.2.0` whose version exactly matches `package.json`.
4. The workflow builds the native hosts and Electron app, runs the source and native test gates, creates the GitHub Release, and uploads the NSIS installer, block map, `latest.yml` update metadata, and a SHA-256 checksum manifest. The job fails if any required release asset is missing.
5. Install the previous release, use **Settings → About → Check now**, and verify both automatic and manual download, renderer close/reopen survival, explicit **Restart to update**, and install-for-next-startup behavior.

Release tags normally belong to `main`. If the default branch has temporarily diverged from an already reviewed release revision, push that immutable revision to `release/vX.Y.Z` before its matching tag. The workflow accepts only `main` or that exact protected release branch; it does not publish arbitrary detached tags.

Fresh installations check 15 seconds after launch, check every six hours, download releases in the background, and apply a downloaded update when Switchboard closes. The next launch then uses the new version. Each policy remains independently configurable in **Settings → About**. Disabling automatic checks removes the timer, and manual checks remain available. When **Install for the next startup** is disabled, installation begins only from **Restart to update**.
