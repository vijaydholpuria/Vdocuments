/* Login page logic */

document.addEventListener("DOMContentLoaded", () => {
  applySiteSettings();

  if (Auth.isLoggedIn()) {
    window.location.href = "/admin";
    return;
  }

  document.getElementById("togglePw").addEventListener("click", () => {
    const pw = document.getElementById("password");
    pw.type = pw.type === "password" ? "text" : "password";
  });

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("loginBtn");
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    btn.disabled = true;
    btn.textContent = "Signing in…";

    try {
      const res = await apiRequest("/login", { method: "POST", body: { email, password } });
      Auth.setAdmin(res.data.admin);
      toast("Welcome back!", "success");
      setTimeout(() => (window.location.href = "/admin"), 500);
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
  });
});
