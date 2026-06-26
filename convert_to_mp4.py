"""WebP アニメーション → 白背景 mp4(H.264) 変換スクリプト。

ペット映像を ImageDecoder + canvas 方式から <video> 方式へ移行するための素材生成。
背景は常に白(bg-white)前提のため、透過(RGBA)を白背景に合成して不透明 mp4 にする。
iOS Safari の自動再生互換のため yuv420p + baseline profile + 偶数解像度でエンコードする。

使い方:
    python convert_to_mp4.py

入力 : frontend/public/webp/<name>.webp
出力 : frontend/public/movie/<name>.mp4
"""

import os
import subprocess
import tempfile

from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
WEBP_DIR = os.path.join(ROOT, "frontend", "public", "webp")
OUT_DIR = os.path.join(ROOT, "frontend", "public", "movie")
FPS = 24

# 変換対象。home: hand/shake/stretch/hand_stretch、exchange: interact_normal/interact_happy。
# hand は探索フェーズと共有。blink は未使用(AVAILABLE_ANIMS でコメントアウト)のため対象外。
TARGETS = [
    "hand",
    "shake",
    "stretch",
    "hand_stretch",
    "interact_normal",
    "interact_happy",
]


def extract_white_bg_frames(webp_path: str, tmp_dir: str) -> int:
    """WebP の全フレームを白背景に合成し PNG 連番として書き出す。フレーム数を返す。"""
    im = Image.open(webp_path)
    n_frames = getattr(im, "n_frames", 1)
    for i in range(n_frames):
        im.seek(i)
        frame = im.convert("RGBA")
        bg = Image.new("RGB", frame.size, (255, 255, 255))
        bg.paste(frame, mask=frame.split()[3])  # アルファをマスクに合成
        bg.save(os.path.join(tmp_dir, f"{i:04d}.png"))
    return n_frames


def encode_mp4(tmp_dir: str, out_path: str) -> None:
    """PNG 連番を iOS 互換 mp4 にエンコードする。"""
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(FPS),
        "-i", os.path.join(tmp_dir, "%04d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-profile:v", "baseline",
        "-level", "3.0",
        "-movflags", "+faststart",
        "-an",
        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        out_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for name in TARGETS:
        webp_path = os.path.join(WEBP_DIR, f"{name}.webp")
        out_path = os.path.join(OUT_DIR, f"{name}.mp4")
        if not os.path.exists(webp_path):
            print(f"SKIP {name}: {webp_path} not found")
            continue
        with tempfile.TemporaryDirectory() as tmp_dir:
            n = extract_white_bg_frames(webp_path, tmp_dir)
            encode_mp4(tmp_dir, out_path)
        size_kb = os.path.getsize(out_path) // 1024
        print(f"Saved {name}.mp4: {size_kb} KB, {n} frames @ {FPS}fps")


if __name__ == "__main__":
    main()
