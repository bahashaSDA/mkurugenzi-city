"""Measure recorded mixes (tools/audio-test.mjs): level, clipping, band balance, beat strength
(music), syllable rhythm (speech). Not a substitute for ears, but it tells silence from sound,
music from talk, a cricket night from a traffic jam, and catches clipping.
  python tools/audio-analyse.py <dir>"""
import os
import subprocess
import sys

import numpy as np

SR = 16000


def load(p):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def band_env(x, lo, hi, hop=160):
    n = len(x) // hop
    f = np.fft.rfftfreq(512, 1 / SR)
    sel = (f >= lo) & (f < hi)
    win = np.hanning(512)
    env = np.zeros(n)
    for i in range(n - 4):
        seg = x[i * hop:i * hop + 512]
        if len(seg) < 512:
            break
        env[i] = np.sqrt((np.abs(np.fft.rfft(seg * win))[sel] ** 2).sum())
    return env  # 100 Hz frame rate


def mod_peak(env, lo, hi, fr=100):
    e = env - env.mean()
    if np.allclose(e, 0):
        return 0.0, 0.0
    spec = np.abs(np.fft.rfft(e * np.hanning(len(e))))
    f = np.fft.rfftfreq(len(e), 1 / fr)
    sel = (f >= lo) & (f <= hi)
    ref = spec[(f > 0.3) & (f < 20)].mean() + 1e-9
    i = np.argmax(spec[sel])
    return float(spec[sel][i] / ref), float(f[sel][i])


def main():
    d = sys.argv[1]
    print(f"{'clip':22s} {'dBFS':>6s} {'peak':>5s} {'clip%':>6s}  {'low%':>5s} {'mid%':>5s} {'high%':>6s}  {'beat':>9s}  {'speech':>9s}")
    for f in sorted(os.listdir(d)):
        if not f.endswith(".webm"):
            continue
        x = load(os.path.join(d, f))
        if len(x) < SR:
            print(f"{f:22s} (empty)")
            continue
        x = x[SR // 2:]  # skip the recorder's start-up
        rms = np.sqrt(np.mean(x ** 2)) + 1e-12
        spec = np.abs(np.fft.rfft(x[: SR * 8] * np.hanning(min(len(x), SR * 8)))) ** 2
        fr = np.fft.rfftfreq(min(len(x), SR * 8), 1 / SR)
        tot = spec.sum() + 1e-12
        low = spec[fr < 300].sum() / tot * 100
        mid = spec[(fr >= 300) & (fr < 3000)].sum() / tot * 100
        high = spec[(fr >= 3000) & (fr < 8000)].sum() / tot * 100
        beat, bf = mod_peak(band_env(x, 30, 200), 1.2, 3.2)  # kick drum pulse, 72-190 bpm
        sp, sf = mod_peak(band_env(x, 300, 3000), 2.5, 7.5)  # syllables
        print(f"{f:22s} {20 * np.log10(rms):6.1f} {np.abs(x).max():5.2f} {np.mean(np.abs(x) > 0.98) * 100:6.2f}  {low:5.1f} {mid:5.1f} {high:6.1f}  {beat:5.1f}@{bf:3.1f}  {sp:5.1f}@{sf:3.1f}")


main()
