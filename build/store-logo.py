"""Draws the toolbar icon at any size, for the stores: python3 build/store-logo.py 300 store/logo-300.png"""
import sys
from PIL import Image, ImageDraw

size, out = int(sys.argv[1]), sys.argv[2]
k = size * 4 / 128  # drawn four times larger, then reduced, for smooth edges
im = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
s = lambda *v: [round(x * k) for x in v]
d.rounded_rectangle(s(0, 0, 127, 127), radius=round(20 * k), fill=(36, 86, 199, 255))
white = (255, 255, 255, 255)
d.rectangle(s(49, 26, 79, 62), fill=white)
d.polygon([tuple(s(29, 61)), tuple(s(99, 61)), tuple(s(64, 97))], fill=white)
d.rectangle(s(29, 103, 99, 112), fill=white)
im.resize((size, size), Image.LANCZOS).save(out)
