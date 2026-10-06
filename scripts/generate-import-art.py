"""Local SDXL outpainting experiment. Never modifies the source card or app state."""
import argparse
import json
import os
import time
from pathlib import Path

os.environ.setdefault('HF_HOME', r'D:\GeradorCartas-AI\huggingface')
os.environ.setdefault('HF_HUB_DISABLE_SYMLINKS_WARNING', '1')

import numpy as np
from PIL import Image, ImageFilter
from outpaint_composite import composite_preserving_original

parser = argparse.ArgumentParser()
parser.add_argument('--source', default=r'D:\LOTR EXPANSIONS\Enhanced Proxies\01 - Core Set\Player\001 - Aragorn.jpg')
parser.add_argument('--output', default='scratch/local-ai/aragorn-sdxl')
parser.add_argument('--type', required=True)
parser.add_argument('--seed', type=int, default=421)
parser.add_argument('--steps', type=int, default=30)
parser.add_argument('--prepare-only', action='store_true')
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
source = Image.open(args.source).convert('RGB')
# Manually inspected art-only rectangle for this specific Aragorn printing.
# Deliberately excludes stat ribbons, title ornament, and printed text.
profiles = {
    'hero': (.332, .019, .925, .542), 'ally': (.32, .02, .94, .54),
    'enemy': (.33, .02, .94, .49), 'attachment': (.17, .15, .86, .48),
    'treasure': (.21, .16, .83, .49), 'event': (.23, .02, .86, .46),
    'treachery': (.23, .02, .92, .49), 'location': (.27, .17, .87, .46),
    'objective': (.12, .18, .84, .46), 'quest': (.20, .22, .80, .545),
}
if args.type not in profiles:
    raise ValueError('Unsupported card type')
if args.type == 'quest':
    # Duplex proxies can rotate A and B in opposite directions. The broad rules
    # panel belongs at the bottom; select orientation by its light paper area.
    candidates = [source.transpose(Image.Transpose.ROTATE_90), source.transpose(Image.Transpose.ROTATE_270)] if source.height > source.width else [source, source.transpose(Image.Transpose.ROTATE_180)]
    def orientation_score(image):
        small = np.asarray(image.resize((160, 112)).convert('L'))
        return float(np.median(small[75:100, 30:135])) - float(np.median(small[27:52, 30:135]))
    source = max(candidates, key=orientation_score)
bounds = profiles[args.type]
crop_box = tuple(round(v * (source.width if i % 2 == 0 else source.height)) for i, v in enumerate(bounds))
crop = source.crop(crop_box)
crop.save(out / 'original-art.png')
size = (1536, 656) if args.type == 'quest' else (1536, 1280)
# Retain the crop's native pixels in the saved composition. Expand its canvas to
# the art-window aspect ratio instead of stretching the original illustration.
retained_width = .86 if args.type == 'quest' else .64
canvas_h = max(crop.height + 96, round(crop.width / retained_width / (size[0] / size[1])))
canvas_w = round(canvas_h * size[0] / size[1])
size = (canvas_w, canvas_h)
position = (round((canvas_w-crop.width) * (.82 if args.type in ['hero','ally','enemy','event','treachery'] else .5)), 48)
inference_size = (1024, 448) if args.type == 'quest' else (1024, 832)
x, y = position
w, h = crop.size
array = np.pad(np.asarray(crop), ((y, size[1]-y-h), (x, size[0]-x-w), (0, 0)), mode='edge')
initial = Image.fromarray(array).filter(ImageFilter.GaussianBlur(24))
initial.paste(crop, position)
# Feather only the edge of the retained rectangle; the interior stays byte-identical.
yy, xx = np.mgrid[0:h, 0:w]
distance = np.minimum.reduce([xx, yy, w-1-xx, h-1-yy])
alpha_crop = Image.fromarray(np.uint8(np.clip(distance / 24, 0, 1) * 255))
keep = Image.new('L', size, 0)
keep.paste(alpha_crop, position)
mask = Image.fromarray(255 - np.asarray(keep))
initial.save(out / 'input-canvas.png')
mask.save(out / 'generation-mask.png')
if args.prepare_only:
    print('Prepared source and mask:', out, flush=True)
    raise SystemExit(0)

import torch
from diffusers import AutoPipelineForInpainting
if not torch.cuda.is_available():
    raise RuntimeError('CUDA unavailable; do not silently run this test on CPU.')
model = 'diffusers/stable-diffusion-xl-1.0-inpainting-0.1'
print('GPU:', torch.cuda.get_device_name(), 'PyTorch:', torch.__version__, flush=True)
# Execute an actual CUDA kernel to catch unsupported GPU architectures early.
print('CUDA kernel:', (torch.ones(4, device='cuda') * 2).sum().item(), flush=True)
started = time.perf_counter()
pipe = AutoPipelineForInpainting.from_pretrained(model, dtype=torch.float16, variant='fp16', use_safetensors=True)
pipe.enable_model_cpu_offload()
pipe.vae.enable_tiling()
loaded = time.perf_counter()
prompt = ('Extend the existing fantasy oil painting seamlessly outside the preserved image. '
          'Continue the existing scenery and natural forms at the image edges. Preserve the existing subjects, consistent painterly '
          'brushwork, perspective and soft warm lighting. Background scenery, full bleed illustration.')
negative = ('text, letters, numbers, logo, watermark, border, frame, trading card, UI, '
            'additional people, duplicate person, extra face, extra hands, extra arms, extra sword, '
            'gold ornaments, bright colors, photograph, blurry seams')
torch.cuda.reset_peak_memory_stats()
generated = pipe(prompt=prompt, negative_prompt=negative,
    image=initial.resize(inference_size, Image.Resampling.LANCZOS),
    mask_image=mask.resize(inference_size, Image.Resampling.BILINEAR),
    width=inference_size[0], height=inference_size[1], num_inference_steps=args.steps,
    strength=1.0, guidance_scale=6.5,
    generator=torch.Generator(device='cpu').manual_seed(args.seed)).images[0]
torch.cuda.synchronize()
finished = time.perf_counter()
generated.save(out / 'generated-raw.png')
final = composite_preserving_original(generated, crop, size, position, match_edges=True)
if args.type == 'quest':
    # SDXL can introduce a thin matte at very wide output edges. Trim only the
    # generated outer margin, keeping every original interior pixel untouched.
    trim_x = min(round(size[0] * .05), x, size[0] - x - w)
    trim_y = min(round(trim_x * size[1] / size[0]), y, size[1] - y - h)
    final = final.crop((trim_x, trim_y, size[0]-trim_x, size[1]-trim_y))
    x -= trim_x
    y -= trim_y
    position = (x, y)
    size = final.size
final.save(out / 'extended-art.png')
original_core = np.asarray(crop)[24:-24, 24:-24]
final_core = np.asarray(final)[y+24:y+h-24, x+24:x+w-24]
assert np.array_equal(original_core, final_core), 'Original art changed!'
report = dict(model=model, seed=args.seed, steps=args.steps, prompt=prompt,
    negative_prompt=negative, source=str(Path(args.source)), source_crop=crop_box,
    preserved_position=position, output_size=size, inference_size=inference_size,
    gpu=torch.cuda.get_device_name(), torch=torch.__version__, cuda=torch.version.cuda,
    load_seconds=round(loaded-started, 2), generation_seconds=round(finished-loaded, 2),
    peak_allocated_gib=round(torch.cuda.max_memory_allocated()/2**30, 2),
    peak_reserved_gib=round(torch.cuda.max_memory_reserved()/2**30, 2),
    original_interior_byte_identical=True, border_color_matched_to_original=True)
(out / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2), flush=True)
