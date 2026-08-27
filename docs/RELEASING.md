# Releasing Switchboard for Windows

Switchboard uses `electron-updater` with the NSIS artifacts and `latest.yml` published by the `Release Windows` GitHub Actions workflow.

## Distribution prerequisites

1. The update feed must be anonymously readable by installed clients. The current `IEver3st/switchboard` repository is private, so its releases can be produced for internal testing but cannot serve end-user automatic updates without putting a GitHub token on every user machine. Do not embed a personal access token in the application. Make this repository public or move the generated release assets to a public update repository/service before describing delivery as live.
2. Production releases should be Authenticode-signed. Add repository secrets named `WINDOWS_CSC_LINK` and `WINDOWS_CSC_KEY_PASSWORD`. `WINDOWS_CSC_LINK` can contain the base64-encoded `.pfx` accepted by electron-builder. The workflow remains buildable without these secrets, but that produces an unsigned installer and does not provide a trusted publisher identity or a good SmartScreen experience.
3. Keep `package.json` and the release tag at the same semantic version.

## Release flow

1. Update the version and release notes on a reviewed commit.
2. Run the repository validation and build gates.
3. Push a tag such as `v0.2.0` whose version exactly matches `package.json`.
4. The workflow builds the native hosts and Electron app, runs the source and test gates, creates the GitHub Release, and uploads the NSIS installer, block map, and `latest.yml` update metadata.
5. Install the previous release, use **Settings → About → Check now**, and verify the new version downloads, survives closing and reopening the renderer, and installs through **Restart to update**.

The application checks 15 seconds after launch and every six hours while automatic application updates are enabled. Disabling the preference removes the timer; manual checks remain available. A downloaded update is never launched during an ordinary quit or Windows session shutdown. Installation begins only from the explicit restart action.

