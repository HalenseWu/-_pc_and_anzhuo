import os
from PIL import Image, ImageDraw, ImageFont

BASE = r"D:\DSH\小说阅读器"
BUILD = os.path.join(BASE, "build")
os.makedirs(BUILD, exist_ok=True)

SIZE = 512
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 朱砂印章底
d.rounded_rectangle([16, 16, SIZE - 16, SIZE - 16], radius=112, fill=(168, 65, 47, 255))
# 内描边
d.rounded_rectangle([16, 16, SIZE - 16, SIZE - 16], radius=112, outline=(255, 255, 255, 46), width=3)
d.rounded_rectangle([38, 38, SIZE - 38, SIZE - 38], radius=92, outline=(255, 255, 255, 30), width=2)

font_path = r"C:\Windows\Fonts\STZHONGS.TTF"
font = ImageFont.truetype(font_path, 300)
text = "涯"
bbox = d.textbbox((0, 0), text, font=font)
w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
d.text(((SIZE - w) / 2 - bbox[0], (SIZE - h) / 2 - bbox[1] - 8), text, font=font, fill=(251, 243, 230, 255))

img.save(os.path.join(BUILD, "icon.png"))
img.save(
    os.path.join(BUILD, "icon.ico"),
    sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
)
print("icon saved", os.path.getsize(os.path.join(BUILD, "icon.ico")), "bytes")
