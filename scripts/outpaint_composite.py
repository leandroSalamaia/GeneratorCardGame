"""Match the generated border's color to the preserved source before compositing."""
import numpy as np
from PIL import Image, ImageFilter


def composite_preserving_original(generated, crop, size, position, feather=24, match_edges=False):
    x, y = position
    w, h = crop.size
    generated = generated.resize(size, Image.Resampling.LANCZOS)
    pixels = np.asarray(generated).astype(np.float32)
    reference = np.asarray(crop).astype(np.float32)
    generated_reference = pixels[y:y+h, x:x+w]
    # SDXL's VAE can shift exposure even inside the protected region. Match the
    # generated image to the source, never recolor the source to match the model.
    margin = feather
    a = reference[margin:-margin, margin:-margin].reshape(-1, 3)
    b = generated_reference[margin:-margin, margin:-margin].reshape(-1, 3)
    scale = np.clip(a.std(axis=0) / np.maximum(b.std(axis=0), 1), .5, 2)
    shift = a.mean(axis=0) - b.mean(axis=0) * scale
    adjusted = Image.fromarray(np.uint8(np.clip(pixels * scale + shift, 0, 255)))
    if match_edges:
        # A global exposure match cannot correct local differences along all four
        # edges. Transfer only low-frequency color residuals into the generated
        # border, with a smooth falloff outside the preserved rectangle.
        smooth_source = np.asarray(crop.filter(ImageFilter.GaussianBlur(20))).astype(np.float32)
        smooth_generated = np.asarray(adjusted.crop((x, y, x+w, y+h)).filter(ImageFilter.GaussianBlur(20))).astype(np.float32)
        residual = smooth_source - smooth_generated
        residual = np.pad(residual, ((y, size[1]-y-h), (x, size[0]-x-w), (0, 0)), mode='edge')
        gy, gx = np.mgrid[0:size[1], 0:size[0]]
        outside_x = np.maximum(np.maximum(x-gx, gx-(x+w-1)), 0)
        outside_y = np.maximum(np.maximum(y-gy, gy-(y+h-1)), 0)
        falloff = np.exp(-(outside_x**2 + outside_y**2) / (2 * 150**2))
        corrected = np.asarray(adjusted).astype(np.float32) + residual * falloff[..., None]
        adjusted = Image.fromarray(np.uint8(np.clip(corrected, 0, 255)))
    yy, xx = np.mgrid[0:h, 0:w]
    distance = np.minimum.reduce([xx, yy, w-1-xx, h-1-yy])
    alpha = Image.fromarray(np.uint8(np.clip(distance / feather, 0, 1) * 255))
    adjusted.paste(crop, position, alpha)
    return adjusted
