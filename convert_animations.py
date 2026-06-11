from PIL import Image
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
FPS = 24
DURATION_MS = round(1000 / FPS)  # 42ms per frame

def build_animated_webp(frame_nums: list, src_dir: str, out_path: str):
    frames = [
        Image.open(os.path.join(ROOT, src_dir, f"{n:04d}.png")).convert("RGBA")
        for n in frame_nums
    ]
    frames[0].save(
        out_path, format="WEBP", save_all=True,
        append_images=frames[1:],
        duration=DURATION_MS, loop=0, lossless=False, quality=80,
    )
    size_kb = os.path.getsize(out_path) // 1024
    print(f"Saved {os.path.basename(out_path)}: {size_kb} KB, {len(frames)} frames @ {FPS}fps")

# interact_normal: 0048→0024（逆）→0025→0048（正）= 49 frames
normal_frames = list(range(48, 23, -1)) + list(range(25, 49))
build_animated_webp(
    normal_frames, "interact_normal",
    os.path.join(ROOT, "frontend", "public", "webp", "interact_normal.webp")
)

# interact_happy: 0048→0072（正）→0071→0048（逆）= 49 frames
happy_frames = list(range(48, 73)) + list(range(71, 47, -1))
build_animated_webp(
    happy_frames, "interact_happy",
    os.path.join(ROOT, "frontend", "public", "webp", "interact_happy.webp")
)
