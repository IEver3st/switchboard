"""Rebuild the embedded 48 kHz MIT KEMAR dataset with Python's standard library."""
import hashlib, io, math, pathlib, re, struct, urllib.request, wave, zipfile

URL = 'https://sound.media.mit.edu/resources/KEMAR/diffuse.zip'
SHA256 = 'a48e73137390626ef1e45d1de6a4d98530c6aa570e71b40f7c4442241ed5fa22'
archive = urllib.request.urlopen(URL).read()
assert hashlib.sha256(archive).hexdigest() == SHA256, 'Upstream archive changed; review before updating.'
rows = []
with zipfile.ZipFile(io.BytesIO(archive)) as z:
    for name in sorted(z.namelist()):
        match = re.search(r'H(-?\d+)e(\d+)a.wav$', name)
        if not match: continue
        with wave.open(io.BytesIO(z.read(name))) as wav:
            assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()) == (2, 2, 44100, 128)
            pcm = struct.unpack('<256h', wav.readframes(128))
        ears = []
        for ear in range(2):
            signal = [v / 32768 for v in pcm[ear::2]]
            # Windowed sinc, 32 source samples each side; retain interaural delays.
            for n in range(160):
                t = n * 44100 / 48000
                value = 0.0
                for j in range(max(0, math.ceil(t - 32)), min(128, math.floor(t + 32) + 1)):
                    x = t - j
                    sinc = 1 if abs(x) < 1e-12 else math.sin(math.pi*x)/(math.pi*x)
                    value += signal[j] * sinc * (0.5 + 0.5 * math.cos(math.pi*x/32))
                ears.append(value)
        rows.append((int(match[1]), int(match[2]), ears))
target = pathlib.Path(__file__).resolve().parents[1] / 'engines/audio-host/Spatial/kemar-48000.bin'
target.parent.mkdir(parents=True, exist_ok=True)
with target.open('wb') as output:
    output.write(struct.pack('<ii', len(rows), 160))
    for elevation, azimuth, ears in rows:
        output.write(struct.pack('<ff320f', elevation, azimuth, *ears))
print(f'{len(rows)} measured directions; {target.stat().st_size} bytes; SHA256 {hashlib.sha256(target.read_bytes()).hexdigest()}')
