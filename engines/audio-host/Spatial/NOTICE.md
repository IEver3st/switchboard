# MIT KEMAR HRTF measurements

Copyright 1994 MIT Media Laboratory. Measurements by Bill Gardner and Keith Martin.

Source: https://sound.media.mit.edu/resources/KEMAR.html
Diffuse-field equalized archive: https://sound.media.mit.edu/resources/KEMAR/diffuse.zip

The authors permit unrestricted research and commercial use provided they are cited.
Switchboard uses their measured left/right ear impulse responses for headphone
spatialization. This is a generic KEMAR head response, not a personalized HRTF.

`scripts/build-kemar.py` verifies the original archive SHA256, resamples its stereo
PCM WAV responses from 44.1 to 48 kHz using windowed sinc, and pads to 160 taps.
Azimuth symmetry is expanded at load time. No measurement is synthesized.
The binary and this notice are embedded in Audio.Host, including single-file builds.
