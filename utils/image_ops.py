# image_ops.py
# Pyodide에서 실행: Pillow로 입력 이미지(bytes) -> grayscale PNG(bytes) 변환
from io import BytesIO

from PIL import Image


def to_grayscale_png(input_bytes):
    """
    input_bytes: JS Uint8Array -> pyodide.toPy()로 넘어온 바이트 시퀀스 (bytes/memoryview)
    return: dict { ok: bool, data?: bytes, error?: str, info?: str }
    """
    try:
        # Pyodide에서 넘어오는 경우 memoryview일 수 있어 bytes로 정규화
        if isinstance(input_bytes, memoryview):
            raw = input_bytes.tobytes()
        else:
            raw = bytes(input_bytes)

        img = Image.open(BytesIO(raw))

        # 알파 포함 이미지는 RGBA -> L로 가면 알파가 날아가므로
        # L(그레이스케일) + alpha를 유지하고 싶으면 LA로 처리할 수 있음.
        # 여기서는 "결과는 PNG"로 통일하되, 알파가 있으면 LA로 유지.
        has_alpha = (img.mode in ("RGBA", "LA")) or ("transparency" in img.info)

        if has_alpha:
            rgba = img.convert("RGBA")
            r, g, b, a = rgba.split()
            gray = Image.merge("RGB", (r, g, b)).convert("L")  # RGB -> L
            out_img = Image.merge("LA", (gray, a))             # L + alpha
        else:
            out_img = img.convert("RGB").convert("L")

        out = BytesIO()
        out_img.save(out, format="PNG")
        out_bytes = out.getvalue()

        return {"ok": True, "data": out_bytes, "info": "Converted to grayscale PNG."}

    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}
