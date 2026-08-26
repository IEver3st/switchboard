# Switchboard noise bridge

This small `cdylib` exposes the pinned BSD-3-Clause `nnnoiseless` RNNoise
implementation to `Audio.Host`. It accepts normalized 48 kHz mono `float32`
frames and owns the RNNoise model state. The normal application never invokes
Cargo and never downloads this library; release staging builds it once and
packages the resulting `switchboard_noise.dll` beside `Audio.Host.exe`.

Upstream source: <https://github.com/jneem/nnnoiseless>

Pinned revision: `924a2dd143ccad7bce9e5bda061b60ca32911a67` (`v0.5.2`)

License: BSD-3-Clause. See `THIRD_PARTY_NOTICES.md` at the repository root.
