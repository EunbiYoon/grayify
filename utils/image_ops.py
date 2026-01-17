# image_ops.py
# Runs in Pyodide: convert image bytes -> grayscale PNG using Pillow

from io import BytesIO
from PIL import Image


def to_grayscale_png(input_bytes):
    """
    input_bytes: byte sequence from JS (Uint8Array via pyodide.toPy)
    returns: dict { ok: bool, data?: bytes, error?: str, info?: str }
    """
    try:
        # Normalize input (may be memoryview in Pyodide)
        if isinstance(input_bytes, memoryview):
            raw = input_bytes.tobytes()
        else:
            raw = bytes(input_bytes)

        # Load image from bytes
        img = Image.open(BytesIO(raw))

        # Check if image has alpha channel
        has_alpha = (img.mode in ("RGBA", "LA")) or ("transparency" in img.info)

        if has_alpha:
            # Preserve alpha channel
            rgba = img.convert("RGBA")
            r, g, b, a = rgba.split()
            gray = Image.merge("RGB", (r, g, b)).convert("L")
            out_img = Image.merge("LA", (gray, a))
        else:
            # Standard grayscale conversion
            out_img = img.convert("RGB").convert("L")

        # Save result as PNG
        out = BytesIO()
        out_img.save(out, format="PNG")
        out_bytes = out.getvalue()

        return {"ok": True, "data": out_bytes, "info": "Converted to grayscale PNG."}

    except Exception as e:
        # Return error info to JS
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
