"""花砖物语（Azul）的 PixelLab 美术：五种花砖、起始玩家标记、首页主图。

结果直接写进 apps/web/public/art/（Vite 把它当静态资源在 /art/ 下服务）。
每种图先出两个候选（-c1 / -c2），人工挑好后再复制成正式文件名。
"""
from __future__ import annotations

import pathlib
import sys

import pixellab

WEB_PUBLIC = pixellab.ART.parent / "apps" / "web" / "public" / "art"

# 颜色: (提示词, 宽, 高)
TILES = {
    "blue": (
        "a single square azulejo ceramic tile in royal blue, repeating pattern of small white dots, glossy glaze, top-down view, the tile fills the whole image, crisp pixel art, flat lighting",
        64, 64,
    ),
    "yellow": (
        "a single square azulejo ceramic tile in warm golden yellow, repeating pattern of small diamond shapes, glossy glaze, top-down view, the tile fills the whole image, crisp pixel art, flat lighting",
        64, 64,
    ),
    "red": (
        "a single square azulejo ceramic tile in deep crimson red, repeating diagonal stripe pattern in darker red, glossy glaze, top-down view, the tile fills the whole image, crisp pixel art, flat lighting",
        64, 64,
    ),
    "black": (
        "a single square azulejo ceramic tile in charcoal black, repeating crosshatch grid pattern in slate grey, glossy glaze, top-down view, the tile fills the whole image, crisp pixel art, flat lighting",
        64, 64,
    ),
    "white": (
        "a single square azulejo ceramic tile in ivory white, subtle plain glaze with a faint embossed floral motif, top-down view, the tile fills the whole image, crisp pixel art, flat lighting",
        64, 64,
    ),
}

MARKER = (
    "a small round wooden disc token painted with a big number 1 in the center, game marker, top-down view, transparent background",
    48, 48,
)

HERO = (
    "hands arranging colorful azulejo tiles on a blue and white tiled pattern board, several square ceramic tiles in blue yellow red black and white scattered on a warm wooden table, top-down view, cozy warm light, pixel art",
    400, 224,
)


def tile(color: str, seed: int) -> None:
    prompt, width, height = TILES[color]
    pixellab.generate_image(f"{color}-c{seed % 10}", {
        "description": prompt,
        "image_size": {"width": width, "height": height},
        "no_background": False,
        "outline": "lineless",
        "seed": seed,
    }, WEB_PUBLIC / "tiles")


def marker(seed: int) -> None:
    prompt, width, height = MARKER
    pixellab.generate_image(f"marker-c{seed % 10}", {
        "description": prompt,
        "image_size": {"width": width, "height": height},
        "no_background": True,
        "outline": "single color black outline",
        "seed": seed,
    }, WEB_PUBLIC / "ui")


def hero(seed: int) -> None:
    prompt, width, height = HERO
    pixellab.generate_image(f"hero-c{seed % 10}", {
        "description": prompt,
        "image_size": {"width": width, "height": height},
        "no_background": False,
        "outline": "lineless",
        "seed": seed,
    }, WEB_PUBLIC / "ui")


if __name__ == "__main__":
    argv = sys.argv[1:] or ["tiles", "marker", "hero"]
    if "tiles" in argv:
        for color in TILES:
            for seed in (201, 202):
                tile(color, seed)
            print(color, "done; spent", round(pixellab.spent_usd(), 4), flush=True)
    if "marker" in argv:
        for seed in (301, 302):
            marker(seed)
        print("marker done; spent", round(pixellab.spent_usd(), 4), flush=True)
    if "hero" in argv:
        for seed in (401, 402):
            hero(seed)
        print("hero done; spent", round(pixellab.spent_usd(), 4), flush=True)
