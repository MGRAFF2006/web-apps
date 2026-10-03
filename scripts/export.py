#!/usr/bin/env python3
"""Encode real browser recordings; concatenate baseline followed by PR build."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
for product in ("word", "cell", "slide", "pdf"):
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
        "-i", str(root / f"media/{product}-before.webm"),
        "-i", str(root / f"media/{product}-after.webm"),
        "-filter_complex", "[0:v]fps=12,setsar=1[a];[1:v]fps=12,setsar=1[b];[a][b]concat=n=2:v=1:a=0[v]",
        "-map", "[v]", "-an", "-c:v", "libx264", "-threads", "2",
        "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        str(root / f"media/{product}-before-after.mp4")
    ], check=True)
    print(product + ": before/after MP4 encoded", flush=True)

subprocess.run([
    "ffmpeg", "-hide_banner", "-loglevel", "warning", "-y",
    "-i", str(root / "media/word-before-after.mp4"),
    "-filter_complex", "fps=6,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3",
    "-loop", "0", str(root / "media/word-before-after.gif")
], check=True)
print("Word: inline GIF encoded", flush=True)
