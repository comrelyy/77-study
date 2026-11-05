"""Offline artwork contact sheet. Does not load the app or any business database."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[1]
catalog=json.loads((root/'static/content/catalog.json').read_text(encoding='utf-8'))
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',16)
canvas=Image.new('RGB',(1858,len(catalog['previewScenes'])*190),(248,242,230))
draw=ImageDraw.Draw(canvas)
for row,scene_id in enumerate(catalog['previewScenes']):
    pack=json.loads((root/'static'/catalog['scenes'][scene_id]).read_text(encoding='utf-8'))
    draw.text((10,row*190+5),pack['title'],font=font,fill='#574b40')
    for col,scene in enumerate(pack['modules']['story']):
        with Image.open(root/'reports/content-art'/f"{scene['id']}.png") as picture:
            picture=picture.convert('RGBA').resize((300,140))
            canvas.paste(picture,(10+col*308,row*190+30),picture)
        draw.text((10+col*308,row*190+171),scene['title'],font=font,fill='#574b40')
canvas.save(root/'reports/content-art-contact-sheet.png')
