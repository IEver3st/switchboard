# Module system

## Package shape

```json
{
  "id": "device.logitech-hidpp",
  "version": "1.0.0",
  "minimumCoreVersion": "0.1.0",
  "entrypoint": "dist/index.js",
  "sha256": "…",
  "signature": "…",
  "permissions": {
    "hid": ["046d:*"]
  }
}
```

## Installation flow

1. Core enumerates VID/PID and usage information.
2. Installed modules receive only matching discovery events.
3. If no installed module claims a device, the registry can offer compatible support.
4. The package is downloaded to a staging directory.
5. Hash, signature, core compatibility, and permission declarations are verified.
6. Package contents are unpacked into a versioned directory.
7. A pointer is atomically switched to the new version.
8. The previous version remains available for rollback.

## Community code

Do not load arbitrary community JavaScript with ambient Node access. Initial releases should support official reviewed modules only. A community ecosystem requires a constrained host process, capability permissions, signed packages, revocation, and an incident response path.

## Capability rendering

Common controls are owned by the core UI:

- mouse DPI and polling rate;
- button assignment;
- battery and charging state;
- microphone gain and monitoring;
- static lighting;
- profiles and application association.

A module may request a custom surface only for hardware that cannot be represented by canonical capabilities.
