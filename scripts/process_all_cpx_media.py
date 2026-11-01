import os
import shutil
from PIL import Image, ImageDraw

CPX = '/Users/anshbhatt/Downloads/CPX'
OUT_BASE = '/Users/anshbhatt/Downloads/MD J/public/images/products/cpx'

os.makedirs(f'{OUT_BASE}/jewellery-sets', exist_ok=True)
os.makedirs(f'{OUT_BASE}/earrings', exist_ok=True)
os.makedirs(f'{OUT_BASE}/rings', exist_ok=True)
os.makedirs(f'{OUT_BASE}/bracelets', exist_ok=True)
os.makedirs(f'{OUT_BASE}/pendants', exist_ok=True)

def fit_to_canvas(im, target_w=1200, target_h=1500, bg_color=(255, 255, 255), padding=0.90):
    max_w = int(target_w * padding)
    max_h = int(target_h * padding)
    
    scale = min(max_w / im.width, max_h / im.height)
    new_w = int(im.width * scale)
    new_h = int(im.height * scale)
    
    resized = im.resize((new_w, new_h), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', (target_w, target_h), bg_color)
    
    offset_x = (target_w - new_w) // 2
    offset_y = (target_h - new_h) // 2
    
    if resized.mode == 'RGBA':
        canvas.paste(resized.convert('RGB'), (offset_x, offset_y), mask=resized.split()[3])
    else:
        canvas.paste(resized, (offset_x, offset_y))
    return canvas

def autocrop_bbox(im, bg_color=(255, 255, 255), tolerance=15):
    # Find bounding box of non-background pixels
    if im.mode == 'RGBA':
        return im.split()[3].getbbox()
    # For RGB with white or uniform bg
    rgb = im.convert('RGB')
    diff = Image.new('L', rgb.size, 0)
    for x in range(rgb.width):
        for y in range(rgb.height):
            p = rgb.getpixel((x, y))
            if any(abs(p[i] - bg_color[i]) > tolerance for i in range(3)):
                diff.putpixel((x, y), 255)
    return diff.getbbox()

print("--- 1. Processing Jewellery Sets ---")
# 100769
im_769 = Image.open(f'{CPX}/100769.png')
bg_769 = Image.new('RGB', im_769.size, (0, 0, 0))
bg_769.paste(im_769.convert('RGB'), mask=im_769.split()[3])
fit_to_canvas(bg_769, bg_color=(0, 0, 0)).save(f'{OUT_BASE}/jewellery-sets/100769.jpg', quality=95)
fit_to_canvas(bg_769, bg_color=(0, 0, 0)).save(f'{OUT_BASE}/jewellery-sets/100769_spec.jpg', quality=95)

# 100771
im_771 = Image.open(f'{CPX}/100771.png').convert('RGBA')
# clear lower left text
draw_771 = ImageDraw.Draw(im_771)
draw_771.rectangle([0, 500, 350, 763], fill=(0, 0, 0, 0))
bg_771 = Image.new('RGB', im_771.size, (0, 0, 0))
bg_771.paste(im_771.convert('RGB'), mask=im_771.split()[3])
fit_to_canvas(bg_771, bg_color=(0, 0, 0)).save(f'{OUT_BASE}/jewellery-sets/100771.jpg', quality=95)
# spec
orig_771 = Image.open(f'{CPX}/100771.png').convert('RGBA')
bg_spec_771 = Image.new('RGB', orig_771.size, (0, 0, 0))
bg_spec_771.paste(orig_771.convert('RGB'), mask=orig_771.split()[3])
fit_to_canvas(bg_spec_771, bg_color=(0, 0, 0)).save(f'{OUT_BASE}/jewellery-sets/100771_spec.jpg', quality=95)

# 100775
im_775 = Image.open(f'{CPX}/100775.png').convert('RGBA')
draw_775 = ImageDraw.Draw(im_775)
draw_775.rectangle([650, 130, 850, 300], fill=(0, 0, 0, 0))
draw_775.rectangle([750, 750, 1000, 1000], fill=(0, 0, 0, 0))
bg_775 = Image.new('RGB', im_775.size, (0, 0, 0))
bg_775.paste(im_775.convert('RGB'), mask=im_775.split()[3])
fit_to_canvas(bg_775, bg_color=(0, 0, 0)).save(f'{OUT_BASE}/jewellery-sets/100775.jpg', quality=95)
orig_775 = Image.open(f'{CPX}/100775.png').convert('RGBA')
bg_spec_775 = Image.new('RGB', orig_775.size, (0, 0, 0))
bg_spec_775.paste(orig_775.convert('RGB'), mask=orig_775.split()[3])
fit_to_canvas(bg_spec_775, bg_color=(0, 0, 0)).save(f'{OUT_BASE}/jewellery-sets/100775_spec.jpg', quality=95)

# 7 Black-Bust Suites
suites_clean_boxes = {
    '100796.png': [(0.23, 0.19, 0.67, 0.40), (0.54, 0.74, 1.0, 1.0)],
    '100799.png': [(0.24, 0.22, 0.72, 0.49), (0.54, 0.75, 1.0, 1.0)],
    '100802.png': [(0.20, 0.31, 0.64, 0.51), (0.56, 0.72, 1.0, 1.0)],
    '100804.png': [(0.28, 0.29, 0.72, 0.43), (0.50, 0.70, 1.0, 1.0), (0.35, 0.0, 0.61, 0.16)],
    '100820.png': [(0.20, 0.25, 0.65, 0.44), (0.49, 0.74, 1.0, 1.0), (0.27, 0.0, 0.60, 0.06)],
    '100821.png': [(0.24, 0.22, 0.70, 0.44), (0.52, 0.76, 1.0, 1.0)],
    '100823.png': [(0.18, 0.19, 0.70, 0.50), (0.49, 0.72, 1.0, 1.0)],
}

for sname, boxes in suites_clean_boxes.items():
    code = sname.replace('.png', '')
    raw = Image.open(f'{CPX}/{sname}')
    w, h = raw.size
    # Canvas
    c = Image.new('RGB', (w, h), (0, 0, 0))
    c.paste(raw.convert('RGB'), mask=raw.split()[3])
    draw = ImageDraw.Draw(c)
    for b in boxes:
        draw.rectangle([w * b[0], h * b[1], w * b[2], h * b[3]], fill=(0, 0, 0))
    fit_to_canvas(c, bg_color=(0, 0, 0)).save(f'{OUT_BASE}/jewellery-sets/{code}.jpg', quality=95)
    
    # Spec image
    c_spec = Image.new('RGB', (w, h), (0, 0, 0))
    c_spec.paste(raw.convert('RGB'), mask=raw.split()[3])
    fit_to_canvas(c_spec, bg_color=(0, 0, 0)).save(f'{OUT_BASE}/jewellery-sets/{code}_spec.jpg', quality=95)

print("Jewellery sets processed: 10 suites.")

print("--- 2. Processing Fine Earrings ---")
earrings = ['100096', '100100', '100101', '100102', '100103', '100107', '100111', '100114', '100131', '100135', '100136']
for code in earrings:
    orig = Image.open(f'{CPX}/{code}.jpg')
    # Crop right render (x from 925 to width)
    render_crop = orig.crop((925, 0, orig.width, orig.height))
    fit_to_canvas(render_crop, bg_color=(255, 255, 255)).save(f'{OUT_BASE}/earrings/{code}.jpg', quality=95)
    # Spec
    fit_to_canvas(orig, bg_color=(255, 255, 255)).save(f'{OUT_BASE}/earrings/{code}_spec.jpg', quality=95)

print(f"Earrings processed: {len(earrings)} pieces.")

print("--- 3. Processing Rings ---")
# 101312
im_1312_p = Image.open(f'{CPX}/101312 (8).jpg')
fit_to_canvas(im_1312_p).save(f'{OUT_BASE}/rings/101312.jpg', quality=95)
im_1312_a = Image.open(f'{CPX}/101312 (6).jpg')
fit_to_canvas(im_1312_a).save(f'{OUT_BASE}/rings/101312_b.jpg', quality=95)

# 101313
im_1313_p = Image.open(f'{CPX}/101313 (8).jpg')
fit_to_canvas(im_1313_p).save(f'{OUT_BASE}/rings/101313.jpg', quality=95)
im_1313_a = Image.open(f'{CPX}/101313 (2).jpg')
fit_to_canvas(im_1313_a).save(f'{OUT_BASE}/rings/101313_b.jpg', quality=95)

# 101399
im_1399_p = Image.open(f'{CPX}/101399 (2).jpg')
fit_to_canvas(im_1399_p).save(f'{OUT_BASE}/rings/101399.jpg', quality=95)
im_1399_a = Image.open(f'{CPX}/101399 (8).jpg')
fit_to_canvas(im_1399_a).save(f'{OUT_BASE}/rings/101399_b.jpg', quality=95)

# 101433
im_1433_p = Image.open(f'{CPX}/101433 (2).jpg')
fit_to_canvas(im_1433_p).save(f'{OUT_BASE}/rings/101433.jpg', quality=95)
im_1433_a = Image.open(f'{CPX}/101433 (8).jpg')
fit_to_canvas(im_1433_a).save(f'{OUT_BASE}/rings/101433_b.jpg', quality=95)

# 101437
im_1437_p = Image.open(f'{CPX}/101437 (2).jpg')
fit_to_canvas(im_1437_p).save(f'{OUT_BASE}/rings/101437.jpg', quality=95)
im_1437_a = Image.open(f'{CPX}/101437 (7).jpg')
fit_to_canvas(im_1437_a).save(f'{OUT_BASE}/rings/101437_b.jpg', quality=95)

# 101521
im_1521 = Image.open(f'{CPX}/101521.jpg')
# Crop perspective from right half (x: 680 to 1360, y: 0 to 520)
crop_1521 = im_1521.crop((680, 0, 1360, 520))
fit_to_canvas(crop_1521).save(f'{OUT_BASE}/rings/101521.jpg', quality=95)
fit_to_canvas(im_1521).save(f'{OUT_BASE}/rings/101521_spec.jpg', quality=95)

# 101524
im_1524 = Image.open(f'{CPX}/101524.jpg')
crop_1524 = im_1524.crop((680, 0, 1360, 520))
fit_to_canvas(crop_1524).save(f'{OUT_BASE}/rings/101524.jpg', quality=95)
fit_to_canvas(im_1524).save(f'{OUT_BASE}/rings/101524_spec.jpg', quality=95)

# 11 LR rings
lr_rings = [
    ('117216', '117216-LR-018-0273.jpg'),
    ('117217', '117217-LR-019-0294.jpg'),
    ('117286', '117286-LR-080-0409.jpg'),
    ('117294', '117294-LR-088-0416.jpg'),
    ('117365', '117365-LR-172-0634.jpg'),
    ('117426', '117426-LR-233-0973.jpg'),
    ('117430', '117430-LR-238-0985.jpg'),
    ('117432', '117432-LR-240-0994.jpg'),
    ('117459', '117459-LR-267-1146.jpg'),
    ('117470', '117470-LR-278-1158.jpg'),
    ('117494', '117494-LR-303-0389.jpg'),
    ('117498', '117498-LR-307-0815.jpg'),
    ('117503', '117503-LR-312-1286-3D.jpg'),
]
for code, fname in lr_rings:
    im = Image.open(f'{CPX}/{fname}')
    fit_to_canvas(im).save(f'{OUT_BASE}/rings/{code}.jpg', quality=95)

print(f"Rings processed: {7 + len(lr_rings)} rings.")

print("--- 4. Processing Bracelets & Bangles ---")
bangles = [
    ('101621', '101621 (2).jpg'),
    ('101622', '101622 (2).jpg'),
    ('101624', '101624.jpg'),
    ('101634', '101634 (2).jpg'),
    ('101637', '101637 (2).jpg'),
    ('101638', '101638 (2).jpg'),
    ('101640', '101640 (2).jpg'),
    ('101645', '101645 (2).jpg'),
    ('101648', '101648 (2).jpg'),
    ('101649', '101649 (2).jpg'),
]
for code, fname in bangles:
    im = Image.open(f'{CPX}/{fname}')
    fit_to_canvas(im).save(f'{OUT_BASE}/bracelets/{code}.jpg', quality=95)

tennis_bracelets = [
    ('122941', '122941-GBR-004-1598.jpg'),
    ('122945', '122945-GBR-006-2058.jpg'),
    ('122949', '122949-GBR-0009B-7830.jpg'),
    ('122950', '122950-GBR-009-2062.jpg'),
    ('122951', '122951-GBR-009A-6403.jpg'),
    ('122954', '122954-GBR-011-0953.jpg'),
    ('122956', '122956-GBR-013-3807.jpg'),
    ('122958', '122958-GBR-017-1038.jpg'),
    ('122960', '122960-GBR-019-1547.jpg'),
    ('122961', '122961-GBR-019A-6218.JPG'),
]
for code, fname in tennis_bracelets:
    im = Image.open(f'{CPX}/{fname}')
    fit_to_canvas(im).save(f'{OUT_BASE}/bracelets/{code}.jpg', quality=95)

print(f"Bracelets & bangles processed: {len(bangles) + len(tennis_bracelets)} pieces.")

print("--- 5. Processing Pendants ---")
pendant_pairs = [
    ('127685', '127685-AL1ZE-C1-PD024-A.jpg', '127685-AL1ZE-C1-PD024-B.jpg'),
    ('127689', '127689-AL1ZE-C1-PD028-A.jpg', '127689-AL1ZE-C1-PD028-B.jpg'),
    ('127690', '127690-AL1ZE-C1-PD029-A.jpg', '127690-AL1ZE-C1-PD029-B.jpg'),
    ('127691', '127691-AL1ZE-C1-PD030-A.jpg', '127691-AL1ZE-C1-PD030-B.jpg'),
    ('127698', '127698-AL1ZE-C1-PD037-A.jpg', '127698-AL1ZE-C1-PD037-B.jpg'),
    ('141961', '141961-PD1264F PENDENT A.jpg', '141961-PD1264F PENDENT S.jpg'),
    ('141965', '141965-PD1282f F PENDENT A.jpg', '141965-PD1282f F PENDENT S.jpg'),
    ('141966', '141966-PD-1302F PENDENT F.jpg', '141966-PD-1302F PENDENT S.jpg'),
    ('141969', '141969-PD-1312F PENDENT A.jpg', '141969-PD-1312F PENDENT A.jpg'),
    ('142007', '142007-P-1803-1-View-Perspective.jpg', '142007-P-1803-1-View-Perspective.jpg'),
    ('142011', '142011-P-1806-1-View-Perspective - Copy (2).jpg', '142011-P-1806-2-View-Perspective - Copy (2).jpg'),
    ('142023', '142023-P-1818-1jpg.jpg', '142023-P-1818-2jpg.jpg'),
]
for code, f_a, f_b in pendant_pairs:
    im_a = Image.open(f'{CPX}/{f_a}')
    fit_to_canvas(im_a).save(f'{OUT_BASE}/pendants/{code}.jpg', quality=95)
    im_b = Image.open(f'{CPX}/{f_b}')
    fit_to_canvas(im_b).save(f'{OUT_BASE}/pendants/{code}_b.jpg', quality=95)

print(f"Pendants processed: {len(pendant_pairs)} pieces.")
print("\nALL CPX MEDIA SUCCESSFULLY PROCESSED AND NORMALIZED!")
