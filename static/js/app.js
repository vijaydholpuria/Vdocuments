/* ==========================================================================
   Public browse page: fetch files/categories, live search, filter, sort,
   locked/unlocked file cards, PIN-gated preview + download.
   ========================================================================== */

let ALL_CATEGORIES = [];
let ALL_FILES = [];
let ACTIVE_CATEGORY = null; // null = all
let CURRENT_SORT = "latest";
let SEARCH_TERM = "";
let searchDebounce = null;
let CURRENT_PREVIEW_ID = null; // file currently shown in the preview modal, if any

async function init() {
  await applySiteSettings();
  bindEvents();
  await loadEverything();
}

async function loadEverything() {
  await Promise.all([loadCategories(), loadFiles()]);
  loadStats();
}

async function loadStats() {
  try {
    document.getElementById("statFiles").textContent = ALL_FILES.length;
    document.getElementById("statDownloads").textContent = ALL_FILES.reduce((a, f) => a + (f.downloads || 0), 0);
    document.getElementById("statCats").textContent = ALL_CATEGORIES.length;
  } catch (e) { /* stats are decorative, fail silently */ }
}

async function loadCategories() {
  try {
    const res = await apiRequest("/categories");
    ALL_CATEGORIES = res.data || [];
    renderChips();
  } catch (e) {
    toast("Could not load categories.", "error");
  }
}

function renderChips() {
  const wrap = document.getElementById("categoryChips");
  const chips = [`<button class="chip ${ACTIVE_CATEGORY === null ? "active" : ""}" data-cat="">All Files</button>`];
  ALL_CATEGORIES.forEach((c) => {
    chips.push(`<button class="chip ${ACTIVE_CATEGORY === c.id ? "active" : ""}" data-cat="${c.id}">${escapeHtml(c.name)} <span style="opacity:.65">(${c.file_count})</span></button>`);
  });
  wrap.innerHTML = chips.join("");
  wrap.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      ACTIVE_CATEGORY = chip.dataset.cat ? parseInt(chip.dataset.cat, 10) : null;
      renderChips();
      loadFiles();
    });
  });
}

async function loadFiles() {
  const grid = document.getElementById("fileGrid");
  grid.innerHTML = Array(6).fill('<div class="skeleton"></div>').join("");
  document.getElementById("resultCount").textContent = "Loading files…";

  try {
    const params = new URLSearchParams();
    if (SEARCH_TERM) params.set("search", SEARCH_TERM);
    if (ACTIVE_CATEGORY) params.set("category_id", ACTIVE_CATEGORY);
    if (CURRENT_SORT) params.set("sort", CURRENT_SORT);

    const res = await apiRequest(`/files?${params.toString()}`);
    const files = res.data || [];
    ALL_FILES = files;
    document.getElementById("resultCount").textContent =
      `${files.length} file${files.length === 1 ? "" : "s"} found`;

    if (files.length === 0) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M11 15h2M9 11h6"/></svg>
          <h3>No files found</h3>
          <p>Try a different search term or category.</p>
        </div>`;
      return;
    }

    grid.innerHTML = files.map(fileCardHtml).join("");
    grid.querySelectorAll("[data-preview-id]").forEach((el) => {
      el.addEventListener("click", () => openPreview(el.dataset.previewId));
    });
    grid.querySelectorAll("[data-download-id]").forEach((el) => {
      el.addEventListener("click", (e) => { e.stopPropagation(); triggerDownload(el.dataset.downloadId); });
    });
  } catch (e) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>Couldn't load files</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

function findFile(id) {
  return ALL_FILES.find((f) => String(f.id) === String(id));
}

function fileCardHtml(f) {
  const meta = fileMeta(f.file_ext);
  const lockBadge = f.is_unlocked
    ? `<span class="lock-badge unlocked" title="Unlocked for this session">🔓 Unlocked</span>`
    : `<span class="lock-badge" title="PIN protected">🔒 Protected</span>`;
  return `
    <div class="file-card glass" data-preview-id="${f.id}" style="cursor:pointer">
      <div class="file-card-top">
        <div class="file-icon" style="background:${meta.color}">${meta.label}</div>
        <div style="min-width:0;flex:1">
          <div class="file-card-title">${escapeHtml(f.title)}</div>
          <div class="file-card-cat">${escapeHtml(f.category)}</div>
        </div>
      </div>
      <div class="file-card-desc">${escapeHtml(f.description || "No description provided.")}</div>
      <div class="file-card-meta">
        <span>${f.filesize_human}</span>
        <span>${timeAgo(f.upload_date)}</span>
        <span>⬇ ${f.downloads}</span>
      </div>
      ${lockBadge}
      <div class="file-card-actions">
        <button class="btn btn-outline btn-sm" style="flex:1" data-preview-id="${f.id}">View</button>
        <a class="btn btn-primary btn-sm" style="flex:1" data-download-id="${f.id}">Download</a>
      </div>
    </div>`;
}

/** Ensures the given file is unlocked in the current session, prompting the
 * PIN modal if needed. Returns true once unlocked, false if the visitor
 * cancels the modal. Never asks again for a file already unlocked this
 * session (FEATURE 8/9). */
async function ensureUnlocked(id) {
  const f = findFile(id);
  if (f && f.is_unlocked) return true;
  const unlocked = await PinModal.open(id, f ? f.title : null);
  if (unlocked && f) f.is_unlocked = true; // keep local cache in sync, refresh badge on next render
  return unlocked;
}

async function openPreview(id) {
  const ok1 = await ensureUnlocked(id);
  if (!ok1) return;

  CURRENT_PREVIEW_ID = id;
  const modal = document.getElementById("previewModal");
  try {
    const res = await apiRequest(`/files/${id}`); // safe metadata only — content comes from the src below
    const f = res.data;
    document.getElementById("modalTitle").textContent = f.title;
    document.getElementById("modalDesc").textContent = f.description || "No description provided.";
    document.getElementById("modalCat").textContent = f.category;
    document.getElementById("modalSize").textContent = f.filesize_human;
    document.getElementById("modalDate").textContent = formatDate(f.upload_date);
    document.getElementById("modalDownloads").textContent = f.downloads;
    document.getElementById("modalDownloadBtn").onclick = (e) => { e.preventDefault(); triggerDownload(id); };

    // The browser requests this URL directly (same-origin, cookie sent
    // automatically) — Flask streams the file from Cloudinary server-side,
    // so no Cloudinary URL is ever exposed to the page.
    const contentUrl = `${API_BASE}/files/${id}/view`;
    const previewBox = document.getElementById("modalPreview");
    const kind = previewKind(f.file_ext);
    if (kind === "image") {
      previewBox.innerHTML = `<img src="${contentUrl}" alt="${escapeHtml(f.title)}">`;
    } else if (kind === "pdf") {
      previewBox.innerHTML = `<iframe src="${contentUrl}"></iframe>`;
    } else if (kind === "video") {
      previewBox.innerHTML = `<video src="${contentUrl}" controls style="max-height:55vh;width:100%"></video>`;
    } else if (kind === "audio") {
      previewBox.innerHTML = `<audio src="${contentUrl}" controls style="width:100%;margin:30px"></audio>`;
    } else if (kind === "text") {
      previewBox.innerHTML = `<iframe src="${contentUrl}" style="background:#fff"></iframe>`;
    } else {
      const meta = fileMeta(f.file_ext);
      previewBox.innerHTML = `<div style="text-align:center;padding:40px"><div class="file-icon" style="background:${meta.color};width:64px;height:64px;font-size:.85rem;margin:0 auto 12px">${meta.label}</div><p style="color:var(--text-muted);font-size:.86rem">Preview not available for this file type.<br>Download it to view the contents.</p></div>`;
    }

    modal.classList.add("show");
    loadFiles(); // refresh lock badges now that this file is unlocked
  } catch (e) {
    toast(e.message, "error");
  }
}

function closePreview() {
  document.getElementById("previewModal").classList.remove("show");
  document.getElementById("modalPreview").innerHTML = "";
  if (CURRENT_PREVIEW_ID) {
    // Re-lock this file now that the visitor is done viewing it — the
    // next View/Download will ask for the PIN again.
    apiRequest(`/files/${CURRENT_PREVIEW_ID}/lock`, { method: "POST" }).catch(() => {});
    CURRENT_PREVIEW_ID = null;
    loadFiles();
  }
}

async function triggerDownload(id) {
  const ok1 = await ensureUnlocked(id);
  if (!ok1) return;
  // Direct browser navigation — the cookie goes along automatically, and
  // Flask responds with a Content-Disposition: attachment header, so the
  // browser's own download manager takes it from here.
  window.location.href = `${API_BASE}/files/${id}/download`;
  setTimeout(() => {
    // Re-lock immediately after the download completes/starts, rather
    // than leaving it unlocked for the rest of the session.
    apiRequest(`/files/${id}/lock`, { method: "POST" }).catch(() => {});
    loadFiles();
    loadStats();
  }, 1200);
}

function bindEvents() {
  document.getElementById("modalClose").addEventListener("click", closePreview);
  document.getElementById("modalCloseBtn").addEventListener("click", closePreview);
  document.getElementById("previewModal").addEventListener("click", (e) => {
    if (e.target.id === "previewModal") closePreview();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePreview(); });

  document.getElementById("sortSelect").addEventListener("change", (e) => {
    CURRENT_SORT = e.target.value;
    loadFiles();
  });

  const doSearch = (val) => {
    SEARCH_TERM = val.trim();
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(loadFiles, 250);
  };
  document.getElementById("heroSearchInput").addEventListener("input", (e) => doSearch(e.target.value));
  document.getElementById("heroSearchBtn").addEventListener("click", () => loadFiles());
  document.getElementById("navSearchInput").addEventListener("input", (e) => doSearch(e.target.value));

  // Re-lock everything the visitor unlocked this visit when they leave the
  // page/site (close the tab, navigate away, refresh). sendBeacon is used
  // because it's guaranteed to actually fire during page teardown, unlike
  // a normal fetch() which browsers can cancel mid-flight.
  window.addEventListener("pagehide", () => {
    navigator.sendBeacon(`${API_BASE}/files/lock-all`, new Blob([], { type: "application/json" }));
  });
}

document.addEventListener("DOMContentLoaded", init);