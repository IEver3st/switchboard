# Noise suppression supply chain

Switchboard packages a CPU RNNoise implementation as the legally clear production backend. It prefers DeepFilterNet3 only when a developer or user has separately built `libDF` and explicitly acquired the exact pinned model. No dependency is downloaded when Switchboard starts.

| Component | Upstream revision | Artifact integrity | License and distribution |
| --- | --- | --- | --- |
| `nnnoiseless` 0.5.2 | `924a2dd143ccad7bce9e5bda061b60ca32911a67` | `scripts/build-noise-native.mjs` records the built DLL SHA-256 in `noise-native-manifest.json` | BSD-3-Clause, including its embedded RNNoise model data; attribution is in `THIRD_PARTY_NOTICES.md` |
| DeepFilterNet `libDF` v0.5.6 | `978576aa8400552a4ce9730838c635aa30db5e61` | The optional build records the DLL SHA-256 in `deepfilternet-native-manifest.json` | Source code is dual MIT/Apache-2.0. The build patch prevents pretrained weights from being embedded. |
| `DeepFilterNet3_onnx.tar.gz` | model in the pinned v0.5.6 repository | SHA-256 `C94D91F70911001C946E0FABB4AA9ADC37045F45A03B56008CB0C8244CB63616` | The explicit weights redistribution license remains unresolved in upstream issue 697. Switchboard does not commit or package it. |

`bun run acquire:deepfilternet-model -- --acknowledge-model-license-unresolved` is a deliberate, user-initiated official-source acquisition path. It writes the verified artifact and a receipt under `%LOCALAPPDATA%\Switchboard\models\deepfilternet`. This acknowledgement is not a license grant; redistributors must resolve the weights license independently.

The optional source build requires the release machine to provide Rust's MSVC target and `cargo-c`. Packaged applications require none of Rust, Cargo, Python, Visual Studio, or an internet connection.
