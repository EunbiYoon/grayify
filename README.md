# Pyodide Image Grayscale Converter

A static web application that converts an uploaded image to grayscale **entirely in the browser** using **Pyodide (Python running in WebAssembly)**.  
No backend or server-side processing is required.

**Live Demo:** (GitHub Pages)  
> https://eunbiyoon.github.io/pyodide/

**Source Code:** (GitHub Repository)  
> https://github.com/EunbiYoon/pyodide
---

## Features

- **Image upload** via file picker **or drag-and-drop**
- **Convert to Grayscale** action
- **Side-by-side comparison** of original and processed images
- **Download** the final grayscale image as PNG
- Runs **entirely in the browser** (no backend, no data upload)

---

## Project Structure

```text
.
├── index.html        # Static HTML entry point
├── style.css        # UI styling (cache-busted)
├── app.js            # Frontend logic (Vanilla JS)
├── utils/image_ops.py      # Python image processing (Pyodide)
├── AI_PROMPTS.md     # AI usage disclosure & prompts
└── README.md
```

---

## Design & Technical Decisions

### Why Pyodide?
- Pyodide allows Python code to run directly in the browser via WebAssembly. This makes it possible to use mature Python libraries (such as **Pillow**) for image processing while keeping all computation client-side.

### Image Processing
- All image logic lives in `image_ops.py`
- JavaScript passes raw image bytes (`Uint8Array`) to Python
- Python converts bytes → `PIL.Image`, processes the image, and returns PNG bytes
- JavaScript renders the result and enables download
- This ensures **all image processing is done in Python**, as required.

### JS–Python Bridge
- Data transfer uses `Uint8Array` → `bytes`
- Python returns a structured dictionary:
  - `{ ok: true, data: <png bytes> }` on success
  - `{ ok: false, error: "<message>" }` on failure
- This avoids uncaught tracebacks and keeps UI feedback user-friendly

### UI State Management
- Convert button is disabled until:
  1. Pyodide is fully loaded
  2. A valid image is selected
- Download is disabled until conversion succeeds
- Original and grayscale previews are shown side-by-side for clarity

### Edge Cases
- Handled gracefully without crashing the UI:
  - Non-image uploads
  - Corrupted files
  - Images with alpha channels
  - Large images (kept reasonable to avoid browser freezes)

---

## External Resources

- **Pyodide**: https://pyodide.org/
- **Pillow (PIL)**: https://python-pillow.org/
- **Pyodide CDN**: https://cdn.jsdelivr.net/pyodide/

