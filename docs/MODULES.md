# Module system

## Module Workshop visual contract

- **Surface and job:** Settings > Modules is an authoring workbench whose first job is to create, link, validate, and enable a local add-on project; bundled-module maintenance is secondary.
- **Visual authority:** `DESIGN.md`, the existing Settings shell and controls, and the product-truth boundaries in this document.
- **First viewport:** The add-on project definition, exact device match, permission boundary, package preview, and primary Create action remain visible at 1080 x 720. At least the beginning of linked or bundled module management remains discoverable below it.
- **Hierarchy and density:** One compact split workbench leads. Form fields and package review share a stable grid; module inventory uses flat rows rather than equal-weight cards.
- **Type roles:** Route heading near 20px, workbench titles near 14px, body and validation copy near 11px, and manifest paths, IDs, versions, VID/PID values, and schema output in Cascadia Mono.
- **Color and material:** Existing nearly-black surfaces, hairline dividers, and baby-blue interaction state. Warning and failure colors are reserved for real permission, compatibility, validation, or runtime states.
- **Control grammar:** Native text fields and selects define a draft; buttons create, link, validate, reveal, or unlink; switches enable validated modules. Disabled future APIs state why they are unavailable.
- **Signature:** The package preview acts like a compact module workbench readout: it mirrors the exact manifest that will be written and pairs every permission with its enforced runtime boundary.
- **Anti-reference:** Avoid a marketplace, a generic SaaS card grid, decorative code-editor chrome, or a wizard that hides the security and hardware-match contract.
- **Critical states:** Empty, draft validation error, folder-dialog cancellation, linked and disabled, validating, active, incompatible, invalid manifest, runtime failure, missing project, and unlink confirmation.
- **Responsive constraints:** No page-level horizontal overflow at 1080 x 720, 1420 x 900, or 1920 x 1080. The split workbench stacks before fields or actions clip, and all scrolling remains owned by the Settings content region.

## What ships now

Switchboard has two module paths with deliberately different trust models:

1. **Bundled capability modules** are reviewed with the application, can own native protocol adapters, and may provide confirmed writable controls through the canonical device contract.
2. **Local add-on projects** are author-controlled folders linked from Settings > Modules. Module Host API v1 runs their single JavaScript entrypoint in a sandboxed Chromium renderer and supports permission-filtered device discovery and identity only.

The local path is useful immediately: an author can identify a new USB HID device, give it a correct model and device kind, test the match without recompiling Switchboard, and share the project source. It does not pretend that a community script has performed or confirmed a hardware write.

## Create a local add-on

1. Connect the target device so Switchboard can offer its real VID/PID, or choose manual entry.
2. Open **Settings > Modules**.
3. Define the module name, namespaced ID, author, manufacturer, model, device kind, and exact four-digit VID/PID.
4. Review the generated manifest and enforced runtime boundary in the package preview.
5. Select **Create starter project…** and choose a parent directory.
6. Edit `src/index.js`, run its tests, then select **Validate** on the linked project.
7. Enable the project. Switchboard starts its sandbox only while the project is enabled and device discovery is active.
8. Refresh Devices after changing an entrypoint or connecting hardware. Revalidate before Switchboard loads changed source.

Creation writes a new child directory only. It never overwrites an existing folder. Unlinking removes the project from Switchboard but keeps every project file on disk.

## Generated project

```text
device.example.control-pad/
├── .gitignore
├── switchboard.module.json
├── switchboard-module.schema.json
├── package.json
├── README.md
├── src/
│   └── index.js
└── test/
    └── module.test.js
```

The starter has no runtime dependencies and its checks use Node's built-in syntax checker and test runner. Bun can run the same test file.

## Local manifest format

```json
{
  "$schema": "./switchboard-module.schema.json",
  "schemaVersion": 1,
  "id": "device.example.control-pad",
  "name": "Example Control Pad",
  "description": "Adds identity and discovery support for Example Control Pad hardware.",
  "author": "Example Author",
  "version": "0.1.0",
  "minimumCoreVersion": "0.5.0",
  "kind": "device",
  "entrypoint": "src/index.js",
  "capabilities": ["device-discovery"],
  "permissions": {
    "hid": [
      {
        "vendorId": "1a2b",
        "productIds": ["3c4d"]
      }
    ]
  }
}
```

Rules enforced before a project can run:

- the ID is lowercase and namespaced;
- versions use semantic `major.minor.patch` form;
- the declared core version is not newer than the running core;
- API v1 accepts `device` projects with `device-discovery`;
- every HID match is an explicit four-digit VID plus one or more explicit PIDs;
- the entrypoint remains inside the project, uses `.js` or `.mjs`, is at most 512 KB, and has one default export;
- API v1 entrypoints are single-file modules and cannot import other files or packages;
- validation output is retained beside the linked module as ready, invalid, incompatible, missing, or runtime-error state.

## Add-on API v1

The default export implements one function:

```js
export default {
  async detect(context) {
    return context.hidDevices.map((device) => ({
      deviceKey: device.deviceKey,
      displayName: 'Example Control Pad',
      kind: 'keyboard',
      identity: {
        manufacturer: device.manufacturer || 'Example',
        model: 'Control Pad',
        connection: 'usb',
        connectionLabel: 'USB'
      }
    }));
  }
};
```

`context` contains:

- `apiVersion`, currently `1`;
- `platform`, normalized to `win32`, `darwin`, or `linux`;
- `hidDevices`, containing only devices covered by the manifest permission. Each item has a stable opaque `deviceKey`, numeric VID/PID, optional usage metadata, and descriptor strings reported by the device.

The add-on returns identity descriptors, not complete Switchboard `Device` objects. Electron main verifies that every returned `deviceKey` came from that invocation, rejects duplicates and excess results, limits text sizes, attaches the real VID/PID and descriptor identity, resolves a core-owned product asset, and publishes an empty capability set. The add-on cannot invent supported controls or mark a write as confirmed.

The shared author-facing types live in `src/shared/module-sdk.ts`.

## Runtime isolation and lifecycle

Each enabled local project gets an ephemeral, hidden BrowserWindow using a unique non-persistent session:

- Chromium sandbox enabled;
- context isolation enabled;
- Node integration disabled;
- no preload and therefore no Electron IPC surface;
- permission requests and permission checks denied;
- popups, webviews, and navigation denied;
- Content Security Policy blocks connections, frames, media, objects, forms, images, and styles;
- session-level request cancellation backs up the CSP network restriction;
- source is size-limited before loading;
- initialization and each discovery call have bounded timeouts;
- every result crosses a Zod schema in Electron main.

The sandbox is created lazily. Disabling a module destroys its window and retains no process, timer, subscription, or device handle. Re-enabling creates a fresh host from the last successfully validated source. A timeout, crash, invalid result, or load failure destroys the host, disables the module, preserves the diagnostic issue, and leaves other module discovery running.

## Product-truth boundary for controls

Writable device support is intentionally not part of the local API v1. A real control requires more than a script returning the requested value:

1. the module must declare a canonical capability understood by the core renderer;
2. Electron main must broker a narrowly scoped operation rather than expose a raw HID handle;
3. the adapter must distinguish request, acknowledgement, readback, and physical confirmation;
4. rejected, timed-out, and disconnected writes must preserve the last confirmed value;
5. lifecycle tests must cover disable, reconnect, repeated start/stop, crash recovery, and handle release;
6. physical hardware acceptance remains separate from deterministic fixture and protocol tests.

Until a brokered control API meets those requirements, authors can prototype the protocol in a reviewed core adapter under `src/main/modules`, then expose it through existing canonical capabilities. Custom renderer code is not loaded from local projects.

## Bundled and distributed packages

Bundled modules continue to follow the internal `DeviceModule` boundary. A future public package feed adds another layer above local projects:

1. stage the archive outside the active version;
2. verify package structure, hash, signature, core compatibility, and permission declarations;
3. check the signing key and package version against a revocation policy;
4. unpack into a versioned directory;
5. validate the entrypoint through the same Module Host boundary;
6. switch the active pointer atomically;
7. retain one known-good rollback version;
8. publish installation, activation, failure, rollback, and revocation state through the canonical snapshot.

Automatic bundled-module updates never edit local authoring projects.

## Capability rendering

Common controls remain owned by the core UI:

- mouse DPI and polling rate;
- button assignment;
- battery and charging state;
- microphone gain and monitoring;
- static lighting;
- profiles and application association.

Capture, audio, integration hooks, brokered HID transactions, package signing, distribution, revocation, and exceptional custom surfaces are explicit future API work. Their labels in the authoring surface must remain unavailable until the corresponding isolated host and canonical contract exist.
