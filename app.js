// app.js (ES module)
//
// UI rule: ONLY one action is enabled at a time
// Mode A (Convert):   Convert ENABLED, Download DISABLED
// Mode B (Download):  Convert DISABLED, Download ENABLED

let pyodide = null;
let pyReady = false;
let selectedFile = null;

// Shortcut for DOM access
const el = (id) => document.getElementById(id);

// Update Pyodide status text
function setStatus(text) {
  const s = el("pyStatus");
  if (s) s.textContent = text;
}

// Show user messages (info / warn / error)
function setMsg(text, kind = "") {
  const m = el("msg");
  if (!m) return;
  m.textContent = text || "";
  m.dataset.kind = kind;
}

// Preview original image
function showOriginal(file) {
  const img = el("origPreview");
  const ph = el("origPlaceholder");
  if (!img || !ph) return;

  if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);

  const url = URL.createObjectURL(file);
  img.src = url;
  img.dataset.url = url;
  img.style.display = "block";
  ph.style.display = "none";
}

// Preview grayscale image from blob URL
function showGrayscaleFromUrl(url) {
  const img = el("grayPreview");
  const ph = el("grayPlaceholder");
  if (!img || !ph) return;

  if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);

  img.src = url;
  img.dataset.url = url;
  img.style.display = "block";
  ph.style.display = "none";
}

// Reset grayscale preview
function clearGrayscalePreview() {
  const img = el("grayPreview");
  const ph = el("grayPlaceholder");

  if (img?.dataset?.url) URL.revokeObjectURL(img.dataset.url);
  if (img) {
    img.removeAttribute("src");
    img.dataset.url = "";
    img.style.display = "none";
  }
  if (ph) ph.style.display = "block";
}

/* =========================
   UI state management
   ========================= */

// Convert enabled (only when ready + file selected)
function setModeConvertOnly() {
  const convertBtn = el("convertBtn");
  const dl = el("downloadLink");

  if (convertBtn) {
    convertBtn.classList.remove("is-done");
    convertBtn.disabled = !(pyReady && !!selectedFile);
  }

  if (dl) {
    dl.removeAttribute("href");
    dl.classList.remove("enabled");
    dl.classList.add("disabled");
  }
}

// Download enabled, Convert disabled
function setModeDownloadOnly(downloadUrl, downloadName) {
  const convertBtn = el("convertBtn");
  const dl = el("downloadLink");

  if (convertBtn) {
    convertBtn.disabled = true;
    convertBtn.classList.add("is-done");
  }

  if (dl) {
    dl.href = downloadUrl;
    dl.download = downloadName || "grayscale.png";
    dl.classList.remove("disabled");
    dl.classList.add("enabled");
  }
}

// Remove file extension
function stripExt(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}

/* =========================
   Pyodide initialization
   ========================= */

async function initPyodide() {
  setStatus("Loading Pyodide…");
  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/",
  });

  setStatus("Loading Pillow…");
  await pyodide.loadPackage("pillow");

  setStatus("Loading image_ops.py…");
  const resp = await fetch(`./utils/image_ops.py?v=${Date.now()}`, { cache: "no-store" });
  if (!resp.ok) throw new Error("Failed to load image_ops.py");
  const pyCode = await resp.text();
  pyodide.runPython(pyCode);

  pyReady = true;
  setStatus("Ready");

  // Re-apply UI state after Pyodide is ready
  setModeConvertOnly();
}

/* =========================
   Image conversion
   ========================= */

async function convertToGrayscale() {
  if (!pyReady || !selectedFile) {
    setMsg("Please wait for Pyodide and select an image.", "warn");
    setModeConvertOnly();
    return;
  }

  setMsg("");
  setStatus("Converting…");

  let pyBytes = null;
  let fn = null;
  let pyResult = null;

  try {
    // Read image bytes
    const ab = await selectedFile.arrayBuffer();
    const u8 = new Uint8Array(ab);
    pyBytes = pyodide.toPy(u8);

    // Call Python grayscale function
    fn = pyodide.globals.get("to_grayscale_png");
    pyResult = fn(pyBytes);
    const result = pyResult.toJs();

    if (!result || result.ok !== true) {
      setStatus("Error");
      setMsg(result?.error || "Conversion failed.", "error");
      setModeConvertOnly();
      return;
    }

    // Create output image
    const outU8 = new Uint8Array(result.data);
    const blob = new Blob([outU8], { type: "image/png" });
    const url = URL.createObjectURL(blob);

    showGrayscaleFromUrl(url);

    // Switch to Download-only mode
    const dlName = `${stripExt(selectedFile.name)}_gray.png`;
    setModeDownloadOnly(url, dlName);

    setStatus("Done");
    if (result.info) setMsg(result.info, "ok");
  } catch (e) {
    console.error(e);
    setStatus("Error");
    setMsg(e?.message || String(e), "error");
    setModeConvertOnly();
  } finally {
    // Cleanup Pyodide objects
    try { pyResult?.destroy?.(); } catch {}
    try { fn?.destroy?.(); } catch {}
    try { pyBytes?.destroy?.(); } catch {}
  }
}

/* =========================
   UI bindings & events
   ========================= */

function bindUI() {
  const dropZone = el("dropZone");
  const fileInput = el("fileInput");
  const fileName = el("fileName");
  const convertBtn = el("convertBtn");
  const downloadLink = el("downloadLink");

  if (!dropZone || !fileInput || !fileName || !convertBtn || !downloadLink) {
    throw new Error("Missing required DOM elements.");
  }

  // Initial UI state
  setModeConvertOnly();

  function handleFile(file) {
    if (!file) return;

    if (!file.type?.startsWith("image/")) {
      setMsg("Only image files are supported.", "warn");
      fileInput.value = "";
      selectedFile = null;
      fileName.textContent = "No file selected";
      clearGrayscalePreview();
      setModeConvertOnly();
      return;
    }

    selectedFile = file;
    fileName.textContent = file.name;

    showOriginal(file);
    clearGrayscalePreview();

    // Reset to Convert-only mode
    setMsg(pyReady ? "" : "Pyodide is loading…", "info");
    setModeConvertOnly();
  }

  // Click to open file picker
  dropZone.addEventListener("click", () => fileInput.click());

  // Drag & drop support
  dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
  dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("dragover");
  });
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    handleFile(e.dataTransfer?.files?.[0]);
  });

  fileInput.addEventListener("change", (e) => {
    handleFile(e.target.files?.[0]);
  });

  convertBtn.addEventListener("click", convertToGrayscale);

  // Download allowed only in Download-only mode
  downloadLink.addEventListener("click", () => {
    if (!downloadLink.classList.contains("enabled")) return;
    setModeDownloadOnly(downloadLink.href, downloadLink.download);
  });
}

// App entry point
window.addEventListener("DOMContentLoaded", async () => {
  try {
    bindUI();
    await initPyodide();
  } catch (e) {
    console.error(e);
    setStatus("Init failed");
    setMsg(e?.message || String(e), "error");
  }
});
