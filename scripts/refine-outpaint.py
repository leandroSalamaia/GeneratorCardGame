"""Refine the accepted local generation without regenerating the character."""
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from outpaint_composite import composite_preserving_original

source = Path('scratch/local-ai/aragorn-sdxl')
out = Path('scratch/local-ai/aragorn-sdxl-v2')
out.mkdir(parents=True, exist_ok=True)
report = json.loads((source / 'report.json').read_text())
crop = Image.open(source / 'original-art.png').convert('RGB')
generated = Image.open(source / 'generated-raw.png').convert('RGB')
size, position = tuple(report['output_size']), tuple(report['preserved_position'])
result = composite_preserving_original(generated, crop, size, position, match_edges=True)
x, y = position
w, h = crop.size
assert np.array_equal(np.asarray(result)[y+24:y+h-24, x+24:x+w-24], np.asarray(crop)[24:-24, 24:-24])
result.save(out / 'extended-art.png')
report.update(refinement='Local low-frequency color matching at each boundary; no additional AI generation',
              original_interior_byte_identical=True, parent_result=str(source))
(out / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
comparison = Image.new('RGB', (1536, 664), '#dddddd')
draw = ImageDraw.Draw(comparison)
draw.text((16, 10), 'V1', fill='black')
draw.text((784, 10), 'V2 - juncoes refinadas', fill='black')
comparison.paste(Image.open(source / 'extended-art.png').resize((768, 624)), (0, 40))
comparison.paste(result.resize((768, 624)), (768, 40))
comparison.save(out / 'comparison.png')
print('Saved', out, '- original interior verified unchanged')
