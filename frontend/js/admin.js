/* ==========================================================================
   Admin dashboard: view routing, dashboard stats, upload (PIN required),
   manage files (edit/change-pin/delete), categories CRUD, settings, password.
   ========================================================================== */

let CATEGORIES_CACHE = [];
let CONFIRM_CALLBACK = null;
const SWATCH_COLORS = ["#2563EB", "#7C3AED", "#DB2777", "#DC2626", "#D97706", "#16A34A", "#0891B2", "#1E293B"];

/* ---------------- Guard + init ---------------- */
document.addEventListener("DOMContentLoaded", () => {
  if (!Auth.isLoggedIn()) {
    window.location.href = "./login.html";
    return;
  }
  const admin = Auth.getAdmin();
  if (admin && admin.email) {
    document.getElementById("avatarInitial").textContent = admin.email[0].toUpperCase();
  }

  applySiteSettings();
  initSidebar();
  initRouting();
  bindLogout();
  loadDashboard();
  loadCategoriesForForms();
  bindUploadForm();
  bindManageFiles();
  bindCategoriesView();
  bindSettingsView();
  bindEditModal();
  bindChangePinModal();
  bindConfirmModal();
});

/* ---------------- Sidebar + routing ---------------- */
function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const toggle = document.getElementById("sidebarToggle");
  toggle.addEventListener("click", () => { sidebar.classList.toggle("open"); overlay.classList.toggle("show"); });
  overlay.addEventListener("click", () => { sidebar.classList.remove("open"); overlay.classList.remove("show"); });
}

function initRouting() {
  const titles = { dashboard: "Dashboard", upload: "Upload File", files: "Manage Files", categories: "Categories", settings: "Settings" };

  function goTo(view) {
    document.querySelectorAll(".admin-view").forEach((v) => v.classList.remove("active"));
    document.getElementById(`view-${view}`).classList.add("active");
    document.querySelectorAll(".side-link[data-view]").forEach((l) => l.classList.toggle("active", l.dataset.view === view));
    document.getElementById("pageTitle").textContent = titles[view] || "Dashboard";
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("show");
    if (view === "files") loadManageFiles();
    if (view === "categories") loadCategoriesView();
    if (view === "settings") loadSettingsView();
    if (view === "dashboard") loadDashboard();
  }

  document.querySelectorAll(".side-link[data-view]").forEach((link) => {
    link.addEventListener("click", (e) => { e.preventDefault(); goTo(link.dataset.view); });
  });
  document.querySelectorAll("[data-view-link]").forEach((link) => {
    link.addEventListener("click", (e) => { e.preventDefault(); goTo(link.dataset.viewLink); });
  });
}

function bindLogout() {
  document.getElementById("logoutBtn").addEventListener("click", (e) => {
    e.preventDefault();
    Auth.logout();
  });
}

/* ---------------- Dashboard ---------------- */
async function loadDashboard() {
  try {
    const res = await apiRequest("/dashboard");
    const d = res.data;
    document.getElementById("dTotalFiles").textContent = d.total_files;
    document.getElementById("dTotalDownloads").textContent = d.total_downloads;
    document.getElementById("dTodayUploads").textContent = d.todays_uploads;
    document.getElementById("dTotalCats").textContent = d.total_categories;
    document.getElementById("dStorageUsed").textContent = d.storage_used_human;
    document.getElementById("topStorage").textContent = d.storage_used_human;
    document.getElementById("topDownloads").textContent = d.total_downloads;

    const body = document.getElementById("recentUploadsBody");
    if (d.recent_uploads.length === 0) {
      body.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:30px">No uploads yet.</td></tr>`;
    } else {
      body.innerHTML = d.recent_uploads.map(recentRowHtml).join("");
    }
  } catch (e) {
    toast(e.message, "error");
  }
}

function recentRowHtml(f) {
  const meta = fileMeta(f.file_ext);
  return `<tr>
    <td><div class="cell-file"><div class="file-icon" style="background:${meta.color}">${meta.label}</div><span class="ftitle">${escapeHtml(f.title)}</span></div></td>
    <td><span class="badge">${escapeHtml(f.category)}</span></td>
    <td>${f.filesize_human}</td>
    <td>${timeAgo(f.upload_date)}</td>
    <td>${f.downloads}</td>
  </tr>`;
}

/* ---------------- Categories (shared cache for dropdowns) ---------------- */
async function loadCategoriesForForms() {
  try {
    const res = await apiRequest("/categories");
    CATEGORIES_CACHE = res.data || [];
    populateCategorySelect(document.getElementById("uploadCategory"));
    populateCategorySelect(document.getElementById("editCategory"));
  } catch (e) { /* silent */ }
}

function populateCategorySelect(select) {
  if (!select) return;
  select.innerHTML = `<option value="">Uncategorized</option>` +
    CATEGORIES_CACHE.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
}

/* ---------------- Upload ---------------- */
function bindUploadForm() {
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const chosen = document.getElementById("fileChosen");
  const titleInput = document.getElementById("uploadTitle");
  const categorySelect = document.getElementById("uploadCategory");
  const pinInput = document.getElementById("uploadPin");
  const pinConfirmInput = document.getElementById("uploadPinConfirm");
  const uploadBtn = document.getElementById("uploadBtn");
  let selectedFile = null;

  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    if (e.dataTransfer.files.length) setSelectedFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length) setSelectedFile(fileInput.files[0]);
  });
  document.getElementById("clearFile").addEventListener("click", (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = "";
    chosen.classList.remove("show");
    updateUploadBtnState();
  });

  function setSelectedFile(file) {
    selectedFile = file;
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
    const meta = fileMeta(ext);
    document.getElementById("chosenIcon").textContent = meta.label;
    document.getElementById("chosenIcon").style.background = meta.color;
    document.getElementById("chosenName").textContent = file.name;
    document.getElementById("chosenSize").textContent = humanSize(file.size);
    chosen.classList.add("show");
    if (!titleInput.value) {
      titleInput.value = file.name.replace(/\.[^/.]+$/, "");
    }
    updateUploadBtnState();
  }

  // Digits-only PIN inputs + upload button stays disabled until everything is valid.
  function sanitizePinField(el) {
    el.value = el.value.replace(/\D/g, "").slice(0, 6);
  }
  [pinInput, pinConfirmInput].forEach((el) => {
    el.addEventListener("input", () => { sanitizePinField(el); updateUploadBtnState(); });
  });
  titleInput.addEventListener("input", updateUploadBtnState);
  categorySelect.addEventListener("change", updateUploadBtnState);

  function updateUploadBtnState() {
    const validPin = /^\d{6}$/.test(pinInput.value);
    const pinsMatch = pinInput.value === pinConfirmInput.value;
    const ready = !!selectedFile && titleInput.value.trim().length > 0 && validPin && pinsMatch;
    uploadBtn.disabled = !ready;
  }
  updateUploadBtnState();

  document.getElementById("togglePinVisibility").addEventListener("click", () => {
    const showing = pinInput.type === "text";
    pinInput.type = showing ? "password" : "text";
    pinConfirmInput.type = showing ? "password" : "text";
  });

  document.getElementById("uploadForm").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!selectedFile) { toast("Please choose a file to upload.", "error"); return; }
    if (!/^\d{6}$/.test(pinInput.value)) { toast("PIN must be exactly 6 digits.", "error"); return; }
    if (pinInput.value !== pinConfirmInput.value) { toast("PIN and confirmation PIN do not match.", "error"); return; }

    const form = new FormData();
    form.append("file", selectedFile);
    form.append("title", titleInput.value);
    form.append("description", document.getElementById("uploadDesc").value);
    form.append("category_id", categorySelect.value);
    form.append("pin", pinInput.value);
    form.append("confirm_pin", pinConfirmInput.value);

    const btn = document.getElementById("uploadBtn");
    const progressWrap = document.getElementById("progressWrap");
    const fill = document.getElementById("progressFill");
    const pct = document.getElementById("progressPct");

    btn.disabled = true;
    progressWrap.classList.add("show");
    fill.style.width = "0%";
    pct.textContent = "0%";

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/files/upload`);
    xhr.withCredentials = true;

    xhr.upload.addEventListener("progress", (ev) => {
      if (ev.lengthComputable) {
        const percent = Math.round((ev.loaded / ev.total) * 100);
        fill.style.width = `${percent}%`;
        pct.textContent = `${percent}%`;
      }
    });

    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) {
        toast("File uploaded successfully!", "success");
        document.getElementById("uploadForm").reset();
        selectedFile = null;
        chosen.classList.remove("show");
        updateUploadBtnState();
        setTimeout(() => progressWrap.classList.remove("show"), 800);
        loadDashboard();
      } else {
        toast(data.message || "Upload failed.", "error");
        progressWrap.classList.remove("show");
        btn.disabled = false;
      }
    };
    xhr.onerror = () => {
      btn.disabled = false;
      progressWrap.classList.remove("show");
      toast("Upload failed. Check your connection.", "error");
    };
    xhr.send(form);
  });
}

/* ---------------- Manage Files ---------------- */
let manageSearchDebounce = null;
let MANAGE_FILES_CACHE = [];

function bindManageFiles() {
  document.getElementById("manageSearch").addEventListener("input", (e) => {
    clearTimeout(manageSearchDebounce);
    manageSearchDebounce = setTimeout(() => loadManageFiles(e.target.value), 250);
  });
}

async function loadManageFiles(search = "") {
  const body = document.getElementById("manageFilesBody");
  body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px">Loading…</td></tr>`;
  try {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    const res = await apiRequest(`/files?${params.toString()}`);
    const files = res.data || [];
    MANAGE_FILES_CACHE = files;
    if (files.length === 0) {
      body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:30px">No files found.</td></tr>`;
      return;
    }
    body.innerHTML = files.map(manageRowHtml).join("");
    body.querySelectorAll("[data-edit-id]").forEach((el) => el.addEventListener("click", () => openEditModal(el.dataset.editId)));
    body.querySelectorAll("[data-delete-id]").forEach((el) => el.addEventListener("click", () => confirmDeleteFile(el.dataset.deleteId, el.dataset.deleteName)));
    body.querySelectorAll("[data-view-id]").forEach((el) => el.addEventListener("click", () => viewFileAsAdmin(el.dataset.viewId)));
    body.querySelectorAll("[data-changepin-id]").forEach((el) => el.addEventListener("click", () => openChangePinModal(el.dataset.changepinId, el.dataset.changepinTitle)));
  } catch (e) {
    body.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger);padding:30px">${escapeHtml(e.message)}</td></tr>`;
  }
}

function viewFileAsAdmin(id) {
  // Same-origin, cookie-authenticated — the admin session always passes
  // is_file_unlocked(), so this opens directly without a PIN prompt.
  window.open(`${API_BASE}/files/${id}/view`, "_blank");
}

function manageRowHtml(f) {
  const meta = fileMeta(f.file_ext);
  return `<tr>
    <td><div class="cell-file"><div class="file-icon" style="background:${meta.color}">${meta.label}</div><span class="ftitle">${escapeHtml(f.title)}</span></div></td>
    <td><span class="badge">${escapeHtml(f.category)}</span></td>
    <td>${f.filesize_human}</td>
    <td>${formatDate(f.upload_date)}</td>
    <td>${f.downloads}</td>
    <td><span class="badge protected-badge">🔒 PIN Protected</span></td>
    <td>
      <div class="row-actions">
        <button class="icon-btn" title="View" data-view-id="${f.id}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
        <button class="icon-btn" title="Edit" data-edit-id="${f.id}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>
        <button class="icon-btn" title="Change PIN" data-changepin-id="${f.id}" data-changepin-title="${escapeHtml(f.title)}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></button>
        <button class="icon-btn danger" title="Delete" data-delete-id="${f.id}" data-delete-name="${escapeHtml(f.title)}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg></button>
      </div>
    </td>
  </tr>`;
}

function confirmDeleteFile(id, name) {
  openConfirmModal(`Delete "${name}"?`, "This will permanently remove the file from Cloudinary and Supabase. This cannot be undone.", async () => {
    try {
      await apiRequest(`/files/${id}`, { method: "DELETE" });
      toast("File deleted.", "success");
      loadManageFiles(document.getElementById("manageSearch").value);
      loadDashboard();
    } catch (e) {
      toast(e.message, "error");
    }
  });
}

/* ---------------- Edit modal ---------------- */
function bindEditModal() {
  document.getElementById("editModalClose").addEventListener("click", closeEditModal);
  document.getElementById("editCancelBtn").addEventListener("click", closeEditModal);
  document.getElementById("editModal").addEventListener("click", (e) => { if (e.target.id === "editModal") closeEditModal(); });
  document.getElementById("editSaveBtn").addEventListener("click", saveEditedFile);
}

async function openEditModal(id) {
  try {
    const res = await apiRequest(`/files/${id}`);
    const f = res.data;
    document.getElementById("editFileId").value = f.id;
    document.getElementById("editTitle").value = f.title;
    document.getElementById("editDesc").value = f.description || "";
    populateCategorySelect(document.getElementById("editCategory"));
    document.getElementById("editCategory").value = f.category_id || "";
    document.getElementById("editModal").classList.add("show");
  } catch (e) {
    toast(e.message, "error");
  }
}
function closeEditModal() { document.getElementById("editModal").classList.remove("show"); }

async function saveEditedFile() {
  const id = document.getElementById("editFileId").value;
  const btn = document.getElementById("editSaveBtn");
  btn.disabled = true;
  try {
    await apiRequest(`/files/${id}`, {
      method: "PUT",
      body: {
        title: document.getElementById("editTitle").value,
        description: document.getElementById("editDesc").value,
        category_id: document.getElementById("editCategory").value || null,
      },
    });
    toast("File updated.", "success");
    closeEditModal();
    loadManageFiles(document.getElementById("manageSearch").value);
    loadDashboard();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- Change PIN modal ---------------- */
function bindChangePinModal() {
  document.getElementById("changePinModalClose").addEventListener("click", closeChangePinModal);
  document.getElementById("changePinCancelBtn").addEventListener("click", closeChangePinModal);
  document.getElementById("changePinModal").addEventListener("click", (e) => { if (e.target.id === "changePinModal") closeChangePinModal(); });
  [document.getElementById("newPinValue"), document.getElementById("confirmPinValue")].forEach((el) => {
    el.addEventListener("input", () => { el.value = el.value.replace(/\D/g, "").slice(0, 6); });
  });
  document.getElementById("changePinSaveBtn").addEventListener("click", saveNewPin);
}

function openChangePinModal(id, title) {
  document.getElementById("changePinFileId").value = id;
  document.getElementById("changePinFileTitle").textContent = title;
  document.getElementById("newPinValue").value = "";
  document.getElementById("confirmPinValue").value = "";
  document.getElementById("changePinModal").classList.add("show");
}
function closeChangePinModal() { document.getElementById("changePinModal").classList.remove("show"); }

async function saveNewPin() {
  const id = document.getElementById("changePinFileId").value;
  const newPin = document.getElementById("newPinValue").value;
  const confirmPin = document.getElementById("confirmPinValue").value;
  if (!/^\d{6}$/.test(newPin)) { toast("PIN must be exactly 6 digits.", "error"); return; }
  if (newPin !== confirmPin) { toast("PIN and confirmation PIN do not match.", "error"); return; }

  const btn = document.getElementById("changePinSaveBtn");
  btn.disabled = true;
  try {
    await apiRequest(`/files/${id}/change-pin`, { method: "POST", body: { new_pin: newPin, confirm_pin: confirmPin } });
    toast("Access PIN updated.", "success");
    closeChangePinModal();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- Categories view ---------------- */
function bindCategoriesView() {
  document.getElementById("addCategoryBtn").addEventListener("click", () => {
    document.getElementById("categoryAddRow").style.display = "flex";
    document.getElementById("newCategoryName").value = "";
    document.getElementById("newCategoryName").focus();
    delete document.getElementById("saveCategoryBtn").dataset.editId;
  });
  document.getElementById("cancelCategoryBtn").addEventListener("click", () => {
    document.getElementById("categoryAddRow").style.display = "none";
  });
  document.getElementById("saveCategoryBtn").addEventListener("click", async () => {
    const name = document.getElementById("newCategoryName").value.trim();
    if (!name) { toast("Category name is required.", "error"); return; }
    const editId = document.getElementById("saveCategoryBtn").dataset.editId;
    try {
      if (editId) {
        await apiRequest(`/categories/${editId}`, { method: "PUT", body: { name } });
        toast("Category updated.", "success");
      } else {
        await apiRequest("/categories", { method: "POST", body: { name } });
        toast("Category created.", "success");
      }
      document.getElementById("categoryAddRow").style.display = "none";
      loadCategoriesView();
      loadCategoriesForForms();
    } catch (e) {
      toast(e.message, "error");
    }
  });
}

async function loadCategoriesView() {
  const grid = document.getElementById("categoryGrid");
  grid.innerHTML = `<p style="color:var(--text-muted)">Loading…</p>`;
  try {
    const res = await apiRequest("/categories");
    const cats = res.data || [];
    CATEGORIES_CACHE = cats;
    if (cats.length === 0) {
      grid.innerHTML = `<p style="color:var(--text-muted)">No categories yet — create one above.</p>`;
      return;
    }
    grid.innerHTML = cats.map((c) => `
      <div class="glass category-card">
        <div><div class="cat-name">${escapeHtml(c.name)}</div><div class="cat-count">${c.file_count} file${c.file_count === 1 ? "" : "s"}</div></div>
        <div class="cat-actions">
          <button class="icon-btn" data-edit-cat="${c.id}" data-edit-name="${escapeHtml(c.name)}" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>
          <button class="icon-btn danger" data-delete-cat="${c.id}" data-delete-name="${escapeHtml(c.name)}" title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z"/></svg></button>
        </div>
      </div>`).join("");

    grid.querySelectorAll("[data-edit-cat]").forEach((el) => el.addEventListener("click", () => {
      document.getElementById("categoryAddRow").style.display = "flex";
      document.getElementById("newCategoryName").value = el.dataset.editName;
      document.getElementById("saveCategoryBtn").dataset.editId = el.dataset.editCat;
      document.getElementById("newCategoryName").focus();
    }));
    grid.querySelectorAll("[data-delete-cat]").forEach((el) => el.addEventListener("click", () => {
      openConfirmModal(`Delete "${el.dataset.deleteName}"?`, "Files in this category will become uncategorized.", async () => {
        try {
          await apiRequest(`/categories/${el.dataset.deleteCat}`, { method: "DELETE" });
          toast("Category deleted.", "success");
          loadCategoriesView();
          loadCategoriesForForms();
        } catch (e) {
          toast(e.message, "error");
        }
      });
    }));
  } catch (e) {
    grid.innerHTML = `<p style="color:var(--danger)">${escapeHtml(e.message)}</p>`;
  }
}

/* ---------------- Settings view ---------------- */
function bindSettingsView() {
  const swatchWrap = document.getElementById("colorSwatches");
  swatchWrap.innerHTML = SWATCH_COLORS.map((c) => `<div class="color-swatch" style="background:${c}" data-color="${c}"></div>`).join("");

  swatchWrap.querySelectorAll(".color-swatch").forEach((sw) => {
    sw.addEventListener("click", () => {
      swatchWrap.querySelectorAll(".color-swatch").forEach((s) => s.classList.remove("active"));
      sw.classList.add("active");
    });
  });

  document.querySelectorAll("[data-theme-option]").forEach((opt) => {
    opt.addEventListener("click", () => Theme.apply(opt.dataset.themeOption));
  });

  document.getElementById("logoBtn").addEventListener("click", () => document.getElementById("logoInput").click());
  document.getElementById("logoInput").addEventListener("change", () => {
    const file = document.getElementById("logoInput").files[0];
    if (file) document.getElementById("logoPreview").src = URL.createObjectURL(file);
  });

  document.getElementById("saveSettingsBtn").addEventListener("click", saveSettings);
  document.getElementById("changePwBtn").addEventListener("click", changePassword);
}

async function loadSettingsView() {
  try {
    const res = await apiRequest("/settings");
    const s = res.data;
    document.getElementById("settingsName").value = s.website_name || "";
    document.getElementById("logoPreview").src =
  s.logo ? `${API_BASE.replace("/api", "")}/static/${s.logo}` : "";
    document.querySelectorAll("[data-color]").forEach((sw) => sw.classList.toggle("active", sw.dataset.color.toLowerCase() === (s.primary_color || "").toLowerCase()));
    Theme.apply(s.theme || "light");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function saveSettings() {
  const btn = document.getElementById("saveSettingsBtn");
  btn.disabled = true;
  try {
    const form = new FormData();
    form.append("website_name", document.getElementById("settingsName").value);
    const activeSwatch = document.querySelector(".color-swatch.active");
    if (activeSwatch) form.append("primary_color", activeSwatch.dataset.color);
    const activeTheme = document.documentElement.getAttribute("data-theme") || "light";
    form.append("theme", activeTheme);
    const logoFile = document.getElementById("logoInput").files[0];
    if (logoFile) form.append("logo", logoFile);

    await apiRequest("/settings", { method: "PUT", body: form, isForm: true });
    toast("Settings saved.", "success");
    applySiteSettings();
  } catch (e) {
    toast(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

async function changePassword() {
  const btn = document.getElementById("changePwBtn");
  const current = document.getElementById("currentPw").value;
  const next = document.getElementById("newPw").value;
  if (!current || !next) { toast("Fill in both password fields.", "error"); return; }
  btn.disabled = true;
  try {
    await apiRequest("/change-password", { method: "PUT", body: { current_password: current, new_password: next } });
    toast("Password updated.", "success");
    document.getElementById("currentPw").value = "";
    document.getElementById("newPw").value = "";
  } catch (e) {
    toast(e.message, "error");
  } finally {
    btn.disabled = false;
  }
}

/* ---------------- Confirm modal (shared) ---------------- */
function bindConfirmModal() {
  document.getElementById("confirmCancelBtn").addEventListener("click", closeConfirmModal);
  document.getElementById("confirmModal").addEventListener("click", (e) => { if (e.target.id === "confirmModal") closeConfirmModal(); });
  document.getElementById("confirmOkBtn").addEventListener("click", async () => {
    if (CONFIRM_CALLBACK) await CONFIRM_CALLBACK();
    closeConfirmModal();
  });
}
function openConfirmModal(title, message, callback) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMessage").textContent = message;
  CONFIRM_CALLBACK = callback;
  document.getElementById("confirmModal").classList.add("show");
}
function closeConfirmModal() {
  document.getElementById("confirmModal").classList.remove("show");
  CONFIRM_CALLBACK = null;
}