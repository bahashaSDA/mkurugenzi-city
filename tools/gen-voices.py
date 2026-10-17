"""Render every voiced line (tools/voice-lines.mjs, tools/dump-mission-lines.mjs) to a clip and write
public/audio/voice/manifest.json, which src/systems/audio/voice.ts reads: a clip found there is
played positionally through Web Audio instead of the browser's speech synthesiser.

Two engines:
  edge   Microsoft Edge neural voices (sw-KE Rafiki / Zuri, en-KE Chilemba / Asilia). Needs internet,
         and the service sometimes refuses clients (HTTP 403) - then use piper.
  piper  Offline neural TTS (pip install piper-tts). Voice models are ~60 MB each and stay OUT of the
         repo; download them once into a folder and pass it with --models:
           python -m piper.download_voices sw_CD-lanfrica-medium en_GB-alan-medium \
             en_GB-southern_english_female-low en_GB-northern_english_male-medium   (run inside that folder)
         Licences (credited in the game): sw_CD-lanfrica (Lanfrica Kiswahili TTS dataset), en_GB-alan
         (Mimic 3 / CMU Arctic), en_GB-southern_english_female and en_GB-northern_english_male (OpenSLR 83,
         CC BY-SA 4.0). Avoid en_US-ryan: its dataset is CC BY-NC-SA (non-commercial).

  node tools/voice-lines.mjs > lines.json
  python tools/gen-voices.py lines.json [--engine edge|piper] [--models DIR]

Re-running only renders lines that have no clip yet (the manifest is rebuilt from what exists).
Clips that fail or come back empty are deleted, never left behind.
"""
import argparse
import asyncio
import json
import os
import re
import subprocess
import tempfile
import wave

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "public", "audio", "voice")

# who -> (voice, rate, pitch): each character sounds the same every time
VOICES = {
    "conductor": ("sw-KE-RafikiNeural", "+14%", "+4Hz"),  # fast, bright, selling seats
    "conductor2": ("sw-KE-RafikiNeural", "+6%", "-10Hz"),  # older, gruffer
    "attendant_f": ("sw-KE-ZuriNeural", "+0%", "+0Hz"),
    "attendant_m": ("sw-KE-RafikiNeural", "-2%", "-6Hz"),
    "host": ("en-KE-ChilembaNeural", "+4%", "+0Hz"),
    "storyteller": ("en-KE-ChilembaNeural", "-12%", "-8Hz"),
    "driver": ("sw-KE-RafikiNeural", "+0%", "-14Hz"),
    "passenger": ("sw-KE-ZuriNeural", "+4%", "+6Hz"),
    # mission characters
    "abel": ("en-KE-ChilembaNeural", "+0%", "-2Hz"),
    "man1": ("en-KE-ChilembaNeural", "+6%", "+8Hz"),
    "man2": ("sw-KE-RafikiNeural", "+0%", "+0Hz"),
    "man3": ("en-KE-ChilembaNeural", "-6%", "-14Hz"),
    "woman1": ("en-KE-AsiliaNeural", "+0%", "+0Hz"),
    "woman2": ("sw-KE-ZuriNeural", "+2%", "+0Hz"),
    "woman3": ("en-KE-AsiliaNeural", "+6%", "+10Hz"),
}

# who -> (piper model, speed (length_scale: <1 faster), pitch in semitones): offline equivalents.
# Swahili/Sheng speakers use the Swahili model; there is no female Swahili model, so the women who
# speak Swahili use it a few semitones up.
PIPER = {
    "conductor": ("sw_CD-lanfrica-medium", 0.82, 1.0),
    "conductor2": ("sw_CD-lanfrica-medium", 0.9, -2.0),
    "attendant_f": ("sw_CD-lanfrica-medium", 1.0, 4.0),
    "attendant_m": ("sw_CD-lanfrica-medium", 1.02, -1.0),
    "host": ("en_GB-northern_english_male-medium", 0.95, 0.0),
    "storyteller": ("en_GB-alan-medium", 1.12, -1.5),
    "driver": ("sw_CD-lanfrica-medium", 1.0, -3.0),
    "passenger": ("sw_CD-lanfrica-medium", 0.96, 4.5),
    "abel": ("en_GB-northern_english_male-medium", 1.0, -1.0),
    "man1": ("en_GB-alan-medium", 0.95, 1.0),
    "man2": ("sw_CD-lanfrica-medium", 1.0, 0.0),
    "man3": ("en_GB-northern_english_male-medium", 1.06, -3.0),
    "woman1": ("en_GB-southern_english_female-low", 1.0, 0.0),
    "woman2": ("en_GB-southern_english_female-low", 0.97, 1.0),
    "woman3": ("en_GB-southern_english_female-low", 0.94, 2.0),
}


def clip_key(who: str, text: str) -> str:
    """Same as clipKey() in voice.ts: FNV-1a over the UTF-16 code units, base 36."""
    h = 2166136261
    for ch in f"{who}|{text}":
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    out = ""
    while True:
        h, r = divmod(h, 36)
        out = digits[r] + out
        if h == 0:
            return out


def spoken(text: str) -> str:
    """What is actually said (voice.ts spokenText): no stage directions or emphasis marks."""
    t = re.sub(r"\([^)]*\)", "", text)
    t = re.sub(r"[*_]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def ok(path: str) -> bool:
    return os.path.exists(path) and os.path.getsize(path) > 500


def drop(path: str):
    if os.path.exists(path):
        os.remove(path)  # never leave an empty clip for voice.ts to choke on


async def render_edge(lines, stats):
    import edge_tts

    sem = asyncio.Semaphore(6)

    async def one(line):
        who, text = line["who"], line["text"]
        voice, rate, pitch = VOICES[who]
        path = os.path.join(OUT, f"{clip_key(who, text)}.mp3")
        if ok(path):
            stats["kept"] += 1
            return
        err = None
        async with sem:
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(spoken(text), voice, rate=rate, pitch=pitch).save(path)
                    if not ok(path):
                        raise RuntimeError("empty clip")
                    stats["made"] += 1
                    return
                except Exception as e:  # network hiccup: back off and retry
                    drop(path)
                    err = e
                    await asyncio.sleep(2 + attempt * 3)
        stats["failed"].append(f"{who}: {text} ({err})")

    await asyncio.gather(*(one(l) for l in lines))


def render_piper(lines, stats, models):
    from piper import PiperVoice, SynthesisConfig

    loaded = {}
    tmp = tempfile.mkdtemp()
    for line in lines:
        who, text = line["who"], line["text"]
        path = os.path.join(OUT, f"{clip_key(who, text)}.mp3")
        if ok(path):
            stats["kept"] += 1
            continue
        model, speed, semis = PIPER[who]
        try:
            if model not in loaded:
                loaded[model] = PiperVoice.load(os.path.join(models, f"{model}.onnx"))
            v = loaded[model]
            wav = os.path.join(tmp, "line.wav")
            with wave.open(wav, "wb") as w:
                v.synthesize_wav(spoken(text), w, syn_config=SynthesisConfig(length_scale=speed))
            sr = v.config.sample_rate
            f = 2 ** (semis / 12)
            # pitch shift without changing speed; trim the silence piper leaves at both ends;
            # a little room tone so it doesn't sound like it was recorded in a vacuum
            af = (
                f"asetrate={sr * f:.0f},aresample={sr},atempo={1 / f:.5f},"
                "silenceremove=start_periods=1:start_threshold=-50dB,"
                "areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                "highpass=f=90,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,"
                "aecho=0.8:0.6:28:0.08,loudnorm=I=-17:TP=-1.5"
            )
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", af, "-ar", "24000", "-ac", "1",
                 "-c:a", "libmp3lame", "-b:a", "40k", path],
                check=True,
            )
            if not ok(path):
                raise RuntimeError("empty clip")
            stats["made"] += 1
        except Exception as e:
            drop(path)
            stats["failed"].append(f"{who}: {text} ({e})")
        if (stats["made"] + stats["kept"]) % 100 == 0:
            print(f"[voices] {stats['made'] + stats['kept']}/{len(lines)}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("lines", nargs="+")
    ap.add_argument("--engine", choices=["edge", "piper"], default="edge")
    ap.add_argument("--models", default=".", help="folder with the piper .onnx voices")
    ap.add_argument("--redo", default="", help="comma-separated speakers to re-render (their clips are replaced)")
    a = ap.parse_args()
    lines = []
    for p in a.lines:
        lines += json.load(open(p, encoding="utf8"))
    os.makedirs(OUT, exist_ok=True)
    for l in lines:
        if l["who"] in a.redo.split(","):
            drop(os.path.join(OUT, f"{clip_key(l['who'], l['text'])}.mp3"))
    stats = {"made": 0, "kept": 0, "failed": []}
    if a.engine == "edge":
        asyncio.run(render_edge(lines, stats))
    else:
        render_piper(lines, stats, a.models)
    # merge with what's already there (several line lists render into one manifest)
    mpath = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf8")) if os.path.exists(mpath) else {}
    manifest = {k: v for k, v in manifest.items() if ok(os.path.join(OUT, v))}
    for l in lines:
        key = clip_key(l["who"], l["text"])
        if ok(os.path.join(OUT, f"{key}.mp3")):
            manifest[key] = f"{key}.mp3"
    with open(mpath, "w", encoding="utf8") as f:
        json.dump(manifest, f, separators=(",", ":"))
    print(f"[voices] made {stats['made']}, kept {stats['kept']}, failed {len(stats['failed'])}; manifest {len(manifest)} clips")
    for e in stats["failed"][:10]:
        print("  FAILED", e)


main()
