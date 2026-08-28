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
4. The workflow builds the native hosts and Electron app, runs the source and test gates, creates the GitHub Release, and uploads the NSIS installer, block map, and `latest.yml` update metadata.
5. Install the previous release, use **Settings → About → Check now**, and verify both automatic and manual download, renderer close/reopen survival, explicit **Restart to update**, and install-for-next-startup behavior.

The application checks 15 seconds after launch and every six hours while **Always keep Switchboard up to date** is enabled. Disabling it removes the timer; manual checks remain available. **Download updates automatically** controls background download after discovery. **Install for the next startup** applies a downloaded update when Switchboard closes so the next launch uses the new version; when disabled, installation begins only from **Restart to update**.
