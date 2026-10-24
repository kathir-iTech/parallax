from pathlib import Path
from PIL import Image
import sys
frames_path,assets=map(Path,sys.argv[1:3])
frames=[]
with Image.open(sorted(frames_path.glob('*.png'))[0]) as first:
    palette=first.convert('RGB').resize((1024,448),Image.Resampling.LANCZOS).quantize(colors=64,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
for file in sorted(frames_path.glob('*.png'))[::2]:
    with Image.open(file) as im:
        frames.append(im.convert('RGB').resize((1024,448),Image.Resampling.LANCZOS).quantize(palette=palette,dither=Image.Dither.NONE))
target=assets/'parallax-motion.gif'
frames[0].save(target,save_all=True,append_images=frames[1:],duration=[160 if i%3 else 180 for i in range(len(frames))],loop=0,optimize=True,disposal=1)
print(f'{len(frames)} frames; {target.stat().st_size:,} bytes; {target}')
