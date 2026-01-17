// app.js (module)
// RULE: At any time, ONLY ONE button is enabled.
// Mode A (convert):  Convert ENABLED, Download DISABLED
// Mode B (download): Convert DISABLED, Download ENABLED

let pyodide = null;
let pyReady = false;
let selectedFile = null;

const el = (id) => document.getElementById(id);

function setStatus(text) {
  const s = el("pyStatus");
  if (s) s.textContent = text;
}

function setMsg(text, kind = "") {
  const m = el("msg");
  if (!m) return;
  m.textContent = text || "";
  m.dataset.kind = kind;
}

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
   Single-source-of-truth UI modes
   ========================= */

function setModeConvertOnly() {
  const convertBtn = el("convertBtn");
  const dl = el("downloadLink");

  // Convert enabled only if pyReady + file selected
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

function setModeDownloadOnly(downloadUrl, downloadName) {
  const convertBtn = el("convertBtn");
  const dl = el("downloadLink");

  // Convert OFF
  if (convertBtn) {
    convertBtn.disabled = true;
    convertBtn.classList.add("is-done");
  }

  // Download ON
  if (dl) {
    dl.href = downloadUrl;
    dl.download = downloadName || "grayscale.png";
    dl.classList.remove("disabled");
    dl.classList.add("enabled");
  }
}

function stripExt(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(0, i) : name;
}

/* =========================
   Pyodide
   ========================= */

async function initPyodide() {
  setStatus("Loading Pyodide…");
  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.2/full/",
  });

  setStatus("Loading Pillow…");
  await pyodide.loadPackage("pillow");

  setStatus("Loading image_ops.py…");
  // 현재 네 경로가 utils/image_ops.py로 되어 있음 :contentReference[oaicite:1]{index=1}
  const resp = await fetch(`./utils/image_ops.py?v=${Date.now()}`, { cache: "no-store" });
  if (!resp.ok) throw new Error("Failed to fetch image_ops.py (path/deploy 확인).");
  const pyCode = await resp.text();
  pyodide.runPython(pyCode);

  pyReady = true;
  setStatus("Ready");

  // Pyodide가 준비되면, 현재 상태에 맞게 모드 재적용
  // (파일이 선택돼있으면 ConvertOnly로 Convert가 켜짐)
  setModeConvertOnly();
}

/* =========================
   Convert
   ========================= */

async function convertToGrayscale() {
  // Convert 버튼은 이 함수 호출 시점에 이미 enabled여야 정상
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
    const ab = await selectedFile.arrayBuffer();
    const u8 = new Uint8Array(ab);
    pyBytes = pyodide.toPy(u8);

    fn = pyodide.globals.get("to_grayscale_png");
    pyResult = fn(pyBytes);
    const result = pyResult.toJs();

    if (!result || result.ok !== true) {
      const err = result?.error || "Conversion failed (unknown error).";
      setStatus("Error");
      setMsg(err, "error");

      // 실패하면 다시 ConvertOnly 유지 (Download는 계속 비활성)
      setModeConvertOnly();
      return;
    }

    const outU8 = result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data);
    const blob = new Blob([outU8], { type: "image/png" });
    const url = URL.createObjectURL(blob);

    showGrayscaleFromUrl(url);

    // ✅ 변환 성공 순간에 즉시 "DownloadOnly"로 전환 => 동시에 켜질 일이 없음
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
    try { pyResult?.destroy?.(); } catch {}
    try { fn?.destroy?.(); } catch {}
    try { pyBytes?.destroy?.(); } catch {}
  }
}

/* =========================
   UI bindings
   ========================= */

function bindUI() {
  const dropZone = el("dropZone");
  const fileInput = el("fileInput");
  const fileName = el("fileName");
  const convertBtn = el("convertBtn");
  const downloadLink = el("downloadLink");

  if (!dropZone || !fileInput || !fileName || !convertBtn || !downloadLink) {
    throw new Error("Missing required DOM elements. Check index.html ids.");
  }

  // Initial state: no file, py not ready => ConvertOnly (Convert disabled, Download disabled)
  setModeConvertOnly();

  function handleFile(file) {
    if (!file) return;

    if (!file.type || !file.type.startsWith("image/")) {
      setMsg("Only image files are supported (png/jpg/webp…).", "warn");
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

    // ✅ 새 파일 선택 = 무조건 ConvertOnly로 리셋 (Download 꺼짐)
    setMsg(pyReady ? "" : "Pyodide is loading… conversion will be enabled when ready.", "info");
    setModeConvertOnly();
  }

  // click -> open picker
  dropZone.addEventListener("click", () => fileInput.click());

  // drag & drop (CSS: .dropzone.dragover) :contentReference[oaicite:2]{index=2}
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

  // Convert click
  convertBtn.addEventListener("click", () => {
    convertToGrayscale();
  });

  // Download click (DownloadOnly 모드에서만 가능)
  downloadLink.addEventListener("click", () => {
    // Download는 enabled일 때만 눌릴 수 있지만, 안전장치
    if (!downloadLink.classList.contains("enabled")) return;

    // 다운로드 후에도 "하나만 활성화" 규칙 유지:
    // DownloadOnly 계속 유지 (Convert는 계속 OFF)
    setModeDownloadOnly(downloadLink.href, downloadLink.download);
  });
}

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
