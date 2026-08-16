/* ==========================================================================
   Shared utilities: API wrapper, toasts, theme, formatting, file icons.
   Loaded on every page before the page-specific script.

   Auth model: secure, httpOnly Flask session cookie (same-origin). The
   browser never sees a token — every request just needs credentials:
   "include" so the cookie rides along. A small non-secret UI flag
   (whether *some* admin is logged in) is cached client-side purely to
   decide instantly whether to redirect on page load; the server session
   is always the real source of truth and every API call is re-checked
   there regardless of this flag.
   ========================================================================== */

const API_BASE = "http://127.0.0.1:5000/api";

const Auth = {
  ADMIN_KEY: "vdoc_admin",
  getAdmin() { try { return JSON.parse(localStorage.getItem(this.ADMIN_KEY)); } catch { return null; } },
  setAdmin(admin) { localStorage.setItem(this.ADMIN_KEY, JSON.stringify(admin)); },
  isLoggedIn() { return !!this.getAdmin(); },
  clearLocal() { localStorage.removeItem(this.ADMIN_KEY); },
  async logout() {
    try { await apiRequest("/logout", { method: "POST" }); } catch { /* ignore */ }
    this.clearLocal();
    window.location.href = "./login.html";
  },
};

/** Thin fetch wrapper: sends the session cookie, parses JSON, throws readable errors. */
async function apiRequest(path, { method = "GET", body = null, isForm = false } = {}) {
  const headers = {};
  if (!isForm && body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body ? (isForm ? body : JSON.stringify(body)) : null,
  });

  let data = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (res.status === 401 && Auth.isLoggedIn()) {
    // Admin session actually expired server-side — send them back to login.
    Auth.clearLocal();
    if (!location.pathname.endsWith("/login.html")) {
    window.location.href = "./login.html";
}
  }
  if (!res.ok) {
    const err = new Error((data && data.message) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------------- Toasts ---------------- */
function ensureToastContainer() {
  let c = document.querySelector(".toast-container");
  if (!c) {
    c = document.createElement("div");
    c.className = "toast-container";
    document.body.appendChild(c);
  }
  return c;
}

function toast(message, type = "info", duration = 3800) {
  const container = ensureToastContainer();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  const icons = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };
  el.innerHTML = `<span>${icons[type] || ""}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s ease, transform .3s ease";
    el.style.opacity = "0";
    el.style.transform = "translateX(30px)";
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ---------------- Theme ---------------- */
const Theme = {
  KEY: "vdoc_theme",
  init() {
    const saved = localStorage.getItem(this.KEY);
    const theme = saved || "light";
    this.apply(theme);
  },
  apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(this.KEY, theme);
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      btn.innerHTML = theme === "dark" ? sunIcon() : moonIcon();
    });
    document.querySelectorAll("[data-theme-option]").forEach((opt) => {
      opt.classList.toggle("active", opt.dataset.themeOption === theme);
    });
  },
  toggle() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    this.apply(current === "dark" ? "light" : "dark");
  },
};

function moonIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
}
function sunIcon() {
  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`;
}

/* ---------------- Formatting ---------------- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function humanSize(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function timeAgo(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(iso);
}

/* ---------------- File type -> icon / color ---------------- */
const FILE_TYPE_MAP = {
  pdf: { label: "PDF", color: "#DC2626" },
  doc: { label: "DOC", color: "#2563EB" }, docx: { label: "DOC", color: "#2563EB" },
  xls: { label: "XLS", color: "#16A34A" }, xlsx: { label: "XLS", color: "#16A34A" }, csv: { label: "CSV", color: "#16A34A" },
  ppt: { label: "PPT", color: "#D97706" }, pptx: { label: "PPT", color: "#D97706" },
  txt: { label: "TXT", color: "#64748B" }, md: { label: "MD", color: "#64748B" },
  zip: { label: "ZIP", color: "#7C3AED" }, rar: { label: "RAR", color: "#7C3AED" }, "7z": { label: "7Z", color: "#7C3AED" }, tar: { label: "TAR", color: "#7C3AED" }, gz: { label: "GZ", color: "#7C3AED" },
  apk: { label: "APK", color: "#16A34A" },
  exe: { label: "EXE", color: "#1E293B" }, msi: { label: "MSI", color: "#1E293B" },
  mp4: { label: "MP4", color: "#DB2777" }, mov: { label: "MOV", color: "#DB2777" }, avi: { label: "AVI", color: "#DB2777" }, mkv: { label: "MKV", color: "#DB2777" }, webm: { label: "WEBM", color: "#DB2777" },
  mp3: { label: "MP3", color: "#0891B2" }, wav: { label: "WAV", color: "#0891B2" }, ogg: { label: "OGG", color: "#0891B2" }, flac: { label: "FLAC", color: "#0891B2" },
  png: { label: "IMG", color: "#EA580C" }, jpg: { label: "IMG", color: "#EA580C" }, jpeg: { label: "IMG", color: "#EA580C" }, gif: { label: "GIF", color: "#EA580C" }, webp: { label: "IMG", color: "#EA580C" }, svg: { label: "SVG", color: "#EA580C" }, bmp: { label: "IMG", color: "#EA580C" },
  py: { label: "PY", color: "#2563EB" }, java: { label: "JAVA", color: "#B91C1C" }, c: { label: "C", color: "#475569" }, cpp: { label: "C++", color: "#475569" }, h: { label: "H", color: "#475569" }, js: { label: "JS", color: "#CA8A04" }, html: { label: "HTML", color: "#EA580C" }, css: { label: "CSS", color: "#2563EB" }, json: { label: "JSON", color: "#475569" }, sql: { label: "SQL", color: "#0891B2" }, sh: { label: "SH", color: "#1E293B" }, xml: { label: "XML", color: "#475569" },
};

function fileMeta(ext) {
  return FILE_TYPE_MAP[(ext || "").toLowerCase()] || { label: (ext || "FILE").toUpperCase().slice(0, 4), color: "#64748B" };
}

const PREVIEW_KIND = {
  image: ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"],
  pdf: ["pdf"],
  video: ["mp4", "mov", "avi", "mkv", "webm"],
  audio: ["mp3", "wav", "ogg", "flac"],
  text: ["txt", "md", "csv", "json", "xml", "py", "java", "c", "cpp", "h", "js", "html", "css", "sql", "sh"],
};

function previewKind(ext) {
  ext = (ext || "").toLowerCase();
  for (const [kind, list] of Object.entries(PREVIEW_KIND)) {
    if (list.includes(ext)) return kind;
  }
  return "none";
}

/* ---------------- Site settings (name/logo/color) applied on every page ---------------- */
async function applySiteSettings() {
  try {
    const res = await apiRequest("/settings");
    const s = res.data || {};
    if (s.website_name) {
      document.querySelectorAll("[data-site-name]").forEach((el) => (el.textContent = s.website_name));
      document.title = document.title.replace("V Doc", s.website_name);
    }
    if (s.primary_color) {
      document.documentElement.style.setProperty("--primary", s.primary_color);
    }
    if (s.logo) {
      document.querySelectorAll("[data-site-logo]").forEach((el) => {
        el.innerHTML = `<img src="${API_BASE.replace('/api', '')}/static/${s.logo}" class="logo-img" alt="logo">`;
      });
    }
    if (!localStorage.getItem(Theme.KEY) && s.theme) {
      Theme.apply(s.theme);
    }
    return s;
  } catch (e) {
    return {};
  }
}

/* ---------------- Reusable 6-digit PIN modal (per-file unlock) ----------------
   One modal, reused for whichever file the visitor is currently trying to
   view/download. Resolves/rejects a promise so callers can `await` it. */
const PinModal = {
  _resolve: null,
  _fileId: null,

  init() {
    const boxes = [...document.querySelectorAll(".pin-box")];
    boxes.forEach((box, i) => {
      box.addEventListener("input", () => {
        box.value = box.value.replace(/\D/g, "").slice(0, 1);
        if (box.value && boxes[i + 1]) boxes[i + 1].focus();
      });
      box.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !box.value && boxes[i - 1]) boxes[i - 1].focus();
        if (e.key === "Enter") this.submit();
      });
      box.addEventListener("paste", (e) => {
        e.preventDefault();
        const text = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
        text.split("").forEach((ch, idx) => { if (boxes[idx]) boxes[idx].value = ch; });
        (boxes[Math.min(text.length, 5)] || boxes[5]).focus();
      });
    });

    document.getElementById("pinSubmitBtn").addEventListener("click", () => this.submit());
    document.getElementById("pinModalClose").addEventListener("click", () => this.close(false));
    document.getElementById("pinGate").addEventListener("click", (e) => {
      if (e.target.id === "pinGate") this.close(false);
    });
  },

  /** Opens the modal for a given file id/title. Resolves true once unlocked. */
  open(fileId, fileTitle) {
    this._fileId = fileId;
    document.getElementById("pinModalFileTitle").textContent = fileTitle || "this file";
    const boxes = [...document.querySelectorAll(".pin-box")];
    boxes.forEach((b) => (b.value = ""));
    document.getElementById("pinError").style.display = "none";
    document.getElementById("pinGate").style.display = "flex";
    requestAnimationFrame(() => boxes[0] && boxes[0].focus());
    return new Promise((resolve) => { this._resolve = resolve; });
  },

  close(result) {
    document.getElementById("pinGate").style.display = "none";
    if (this._resolve) { this._resolve(result); this._resolve = null; }
  },

  async submit() {
    const boxes = [...document.querySelectorAll(".pin-box")];
    const pin = boxes.map((b) => b.value).join("");
    const errorEl = document.getElementById("pinError");
    const card = document.getElementById("pinCard");

    if (pin.length !== 6) {
      errorEl.textContent = "Please enter all 6 digits.";
      errorEl.style.display = "block";
      return;
    }

    const btn = document.getElementById("pinSubmitBtn");
    btn.disabled = true;
    btn.textContent = "Verifying…";

    try {
      await apiRequest(`/files/${this._fileId}/verify-pin`, { method: "POST", body: { pin } });
      errorEl.style.display = "none";
      this.close(true);
    } catch (e) {
      errorEl.textContent = e.message || "Incorrect PIN. Please try again.";
      errorEl.style.display = "block";
      card.classList.add("shake");
      setTimeout(() => card.classList.remove("shake"), 450);
      boxes.forEach((b) => (b.value = ""));
      boxes[0].focus();
    } finally {
      btn.disabled = false;
      btn.textContent = "Unlock";
    }
  },
};

document.addEventListener("DOMContentLoaded", () => {
  Theme.init();
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => Theme.toggle());
  });
  if (document.getElementById("pinGate")) PinModal.init();
  const loader = document.querySelector(".page-loader");
  if (loader) {
    window.addEventListener("load", () => setTimeout(() => loader.classList.add("hide"), 250));
  }
});
