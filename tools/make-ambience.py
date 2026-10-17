"""Cut the city's sound beds and one-shot calls out of long field recordings, choosing each window
by MEASUREMENT (no listening needed, and repeatable):

  steady   level stays even, no close-up spike (a horn at the mic, someone talking into it)
  insects  strong cricket band (3-8 kHz), nothing big and low (no hyena, hippo or lion calls)
  busy     like steady but prefers the livelier part of the recording

Beds are loudness-normalised (beds -24 LUFS: they sit under everything else) and encoded to Opus;
the game crossfades each into itself, so they loop without a seam (src/systems/audio/tracks LoopBed).
One-shots (Hadada ibis, roosters, bulbul, wagtail, crickets) are found as the loudest calls in
their recordings, trimmed with a little air, and normalised.

  python tools/make-ambience.py <downloads dir> <commons dir>
Output: public/audio/amb/*.webm, public/audio/shots/*.webm, and a report of what was chosen.
"""
import json
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
AMB = os.path.join(ROOT, "public", "audio", "amb")
SHOTS = os.path.join(ROOT, "public", "audio", "shots")
SR = 16000


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def bands(x, hop=SR // 2):
    """Per half-second dB in low (<350 Hz), mid (350-3k) and high (3-8k) bands."""
    n = len(x) // hop
    out = np.zeros((n, 4))
    win = np.hanning(hop)
    f = np.fft.rfftfreq(hop, 1 / SR)
    lo, mid, hi = f < 350, (f >= 350) & (f < 3000), (f >= 3000) & (f < 8000)
    for i in range(n):
        s = np.abs(np.fft.rfft(x[i * hop:(i + 1) * hop] * win)) ** 2
        tot = s.sum() + 1e-12
        out[i] = [10 * np.log10(s[lo].sum() + 1e-12), 10 * np.log10(s[mid].sum() + 1e-12), 10 * np.log10(s[hi].sum() + 1e-12), 10 * np.log10(tot)]
    return out


def choose(b, seconds, mode, avoid=()):
    """Best start (s) for a window of `seconds`, by the mode's score. `avoid`: ranges already used."""
    w = seconds * 2  # half-second frames
    best, best_s = None, 1e9
    for i in range(0, len(b) - w, 4):
        if any(i / 2 < e and i / 2 + seconds > s for s, e in avoid):
            continue
        seg = b[i:i + w]
        tot = seg[:, 3]
        med = np.median(tot)
        spike = np.percentile(tot, 99.5) - med  # a close horn / shout / bang
        if mode == "insects":
            low_spike = np.percentile(seg[:, 0], 99.5) - np.median(seg[:, 0])  # big animal calls
            score = low_spike * 2 + spike - (np.median(seg[:, 2]) - np.median(seg[:, 0])) * 0.5
        elif mode == "busy":
            score = spike * 1.5 + np.std(tot) - med * 0.15
        else:  # steady
            score = spike * 1.5 + np.std(tot)
        if score < best_s:
            best, best_s = i / 2, score
    return best, best_s


def encode(src, start, seconds, out, lufs, mono=False, bitrate="48k"):
    af = f"loudnorm=I={lufs}:TP=-2:LRA=11,afade=t=in:d=0.05,afade=t=out:st={seconds - 0.05}:d=0.05"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-t", str(seconds), "-i", src, "-af", af,
                    "-ac", "1" if mono else "2", "-c:a", "libopus", "-b:a", bitrate, out], check=True)


def main():
    dl, commons = sys.argv[1], sys.argv[2]
    os.makedirs(AMB, exist_ok=True)
    os.makedirs(SHOTS, exist_ok=True)
    report = {}
    # bed name -> (source file, seconds, mode, lufs)
    beds = [
        ("city_day", "city_day.webm", 150, "busy", -24),
        ("city_day_b", "city_day.webm", 150, "steady", -24),
        ("city_night", "city_night_full.webm", 150, "steady", -25),
        ("suburb_morning", "suburb_full.webm", 150, "steady", -24),
        ("birds_amboseli", "birds_amboseli_full.webm", 150, "steady", -25),
        ("birds_laikipia", "birds_laikipia_full.webm", 150, "steady", -25),
        ("wind", "wind_full.webm", 120, "steady", -27),
        ("night_insects", "night_tsavo_full.webm", 150, "insects", -26),
        ("night_insects_b", "night_tsavo_full.webm", 150, "insects", -26),
        ("dusk", "dusk_full.webm", 120, "insects", -26),
        ("sea_diani", "sea_diani_full.webm", 120, "steady", -23),
        ("market", "kenya_mix_full.webm", 58, "busy", -24),
    ]
    used = {}
    for name, f, secs, mode, lufs in beds:
        path = os.path.join(dl, f)
        if not os.path.exists(path):
            print("  missing", f)
            continue
        x = decode(path)
        b = bands(x)
        dur = len(x) / SR
        secs = min(secs, int(dur) - 1)
        start, score = choose(b, secs, mode, used.get(f, []))
        if start is None:
            print("  no window for", name)
            continue
        used.setdefault(f, []).append((start, start + secs))
        encode(path, start, secs, os.path.join(AMB, f"{name}.webm"), lufs)
        report[name] = {"source": f, "start_s": start, "seconds": secs, "mode": mode, "score": round(float(score), 2)}
        print(f"  bed {name:16s} {f} @ {start:7.1f}s  {secs}s  score {score:.1f}")

    # one-shots: the loudest calls in each recording
    shots = [
        ("hadada", ["Bostrychia_hagedash_call.flac", "Bostrychia_hagedash_hagadash,_roepe_20s,_2022-09-25_06h43,_Pretoria,_a.mp3",
                    "Bostrychia_hagedash_hagadash,_roepe_in_Pta,_2022-05-24_06h53,_a.mp3"], 3, 5.0),
        ("rooster", ["Rooster_crowing.ogg", "Young_rooster_crowing.ogg", "Medium_rooster_crowing.ogg"], 1, 4.5),
        ("bulbul", ["Pycnonotus_cafer_-_Red-vented_Bulbul_XC129368.ogg"], 4, 2.5),
        ("wagtail", ["Motacilla_aguimp_-_African_Pied_Wagtail_XC366687.mp3"], 3, 3.0),
        ("cricket", ["Field_cricket_unedited.ogg", "Ringing_cricket_winding_down.ogg"], 2, 4.0),
    ]
    for name, files, per, secs in shots:
        k = 0
        for f in files:
            path = os.path.join(commons, f)
            if not os.path.exists(path):
                continue
            x = decode(path)
            dur = len(x) / SR
            if dur <= secs + 0.5:
                starts = [0.0]
            else:
                # loudest windows, non-overlapping
                hop = SR // 4
                e = np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(len(x) // hop)])
                win = int(secs * 4)
                sums = np.convolve(e, np.ones(win), "valid")
                starts = []
                for i in np.argsort(-sums):
                    st = max(0.0, i / 4 - 0.25)
                    if all(abs(st - s) > secs for s in starts):
                        starts.append(st)
                    if len(starts) >= per:
                        break
            for st in starts:
                out = os.path.join(SHOTS, f"{name}_{k}.webm")
                length = min(secs, dur - st)
                af = f"loudnorm=I=-20:TP=-1.5,afade=t=in:d=0.04,afade=t=out:st={max(0.1, length - 0.3)}:d=0.3"
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(st), "-t", str(length), "-i", path, "-af", af, "-ac", "1", "-c:a", "libopus", "-b:a", "40k", out], check=True)
                report[f"{name}_{k}"] = {"source": f, "start_s": round(st, 2), "seconds": round(length, 2)}
                k += 1
        print(f"  shots {name}: {k}")
    json.dump(report, open(os.path.join(ROOT, "public", "audio", "ambience-report.json"), "w"), indent=1)


main()
