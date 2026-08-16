# V Doc — Document Management & File Sharing

A secure document management site: admins upload files, each protected by
its own 6-digit PIN; visitors must enter the correct PIN before they can
view or download that file.

- **Frontend:** HTML5, CSS3, vanilla JavaScript (no frameworks)
- **Backend:** Python, Flask
- **Database:** Supabase (PostgreSQL)
- **File storage:** Cloudinary (private/authenticated assets, signed URLs)
- **Auth:** secure Flask sessions (signed httpOnly cookies) + Werkzeug password/PIN hashing

---

## 1. Prerequisites

- Python 3.10+
- A Supabase project (you said you've already created one)
- A Cloudinary account (you said you've already created one)

## 2. Set up the database

In the Supabase SQL editor, run, in order:

1. `supabase_schema.sql` — creates `admins`, `categories`, `files`, `settings`
2. `supabase_seed.sql` — seeds default categories + a settings row (no admin — see step 5)

## 3. Configure environment variables

```bash
cp .env.example .env
```

Then edit `.env` and fill in:

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API |
| `SUPABASE_KEY` | Supabase → Project Settings → API → **service_role** key (server-side only) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary Dashboard → Account Details |
| `FLASK_SECRET_KEY` | generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `FILE_ACCESS_SESSION_TIMEOUT` | seconds before a PIN-unlock (and the session) expires; default `1800` (30 min) |

`.env` is already in `.gitignore` — never commit it.

## 4. Install dependencies

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## 5. Create your first admin account

```bash
python scripts/create_admin.py
```

You'll be prompted for an email and password. The password is hashed with
Werkzeug before it's stored — nothing plaintext ever touches the database.

## 6. Run the app

```bash
python app.py
```

Visit:
- `http://localhost:5000/` — public file library
- `http://localhost:5000/login` — admin login
- `http://localhost:5000/admin` — admin dashboard (after login)

---

## How the PIN protection works

1. **Upload:** the admin sets a 6-digit PIN when uploading a file. The PIN
   is hashed with Werkzeug and stored as `access_pin_hash` — the plaintext
   PIN is never saved anywhere.
2. **Browsing:** every file appears in the public library (title,
   description, category, size, etc.) showing a 🔒 **Protected** badge.
   The actual Cloudinary URL is never sent to the browser at this stage.
3. **Unlocking:** clicking View or Download opens a PIN modal for *that
   file only*. The PIN is sent to the Flask backend, verified against the
   hash server-side, and — if correct — the file's id is stored in the
   visitor's **secure server-side session** (`session["unlocked_files"]`).
   No PIN, hash, or Cloudinary URL is ever written to `localStorage`,
   `sessionStorage`, or a URL query string.
4. **Staying unlocked:** for the rest of that valid session, View/Download/
   Back/View-again on the same file never asks for the PIN again. Only
   Flask's signed session cookie proves the unlock — there's nothing on
   the client to fake or replay.
5. **Session expiry:** the session (and every unlock in it) expires after
   `FILE_ACCESS_SESSION_TIMEOUT` seconds of inactivity (default 30 min).
   Staying active keeps it alive (`SESSION_REFRESH_EACH_REQUEST = True`).
6. **Direct URL / API bypass attempts:** `GET /api/files/<id>/view` and
   `GET /api/files/<id>/download` both check `is_file_unlocked()` first and
   return `403` if the file hasn't been unlocked in the current session —
   this is enforced in Flask regardless of what the frontend UI shows.
7. **Cloudinary privacy:** every file is uploaded with `type="authenticated"`,
   which Cloudinary will not serve via a plain/public URL under any
   circumstances. The backend only ever hands out a short-lived **signed**
   URL (10 minutes), and only after the PIN check above passes.
8. **Brute force:** 5 wrong PIN attempts on a file locks that file out for
   60 seconds for that browser session (`utils/gate.py`), then resets.
9. **Rate/session-scoped, not global:** because unlock state and PIN
   lockouts live in the Flask session (one per browser), deleting a file
   or changing its PIN immediately invalidates *that admin's* current
   knowledge of it, but a *different* browser that already had the old
   session's file unlocked before a PIN change would need to re-verify on
   its next request too, since `change-pin` clears the stored unlock and
   attempt state for that file id.

## A note on the brief's PIN requirement

The brief has one internal inconsistency: Feature 2 says every upload
**must** have a 6-digit PIN (and the upload button stays disabled until one
is entered), while the Feature 22 mockup shows an optional "Enable PIN
Protection" toggle. This implementation follows Feature 2 — **every file
requires a PIN** — since Features 4/5/23 (locked-by-default library, lock
icon on every card) depend on that being true for all files.

---

## API endpoints

```
POST   /api/login
POST   /api/logout
GET    /api/me
PUT    /api/change-password

GET    /api/files                       (?search=&category_id=&sort=)
GET    /api/files/<id>
POST   /api/files/upload                (admin, multipart: file, title, description, category_id, pin, confirm_pin)
PUT    /api/files/<id>                  (admin)
DELETE /api/files/<id>                  (admin)
POST   /api/files/<id>/verify-pin       (public, body: {pin})
GET    /api/files/<id>/view             (requires unlock)
GET    /api/files/<id>/download         (requires unlock)
POST   /api/files/<id>/change-pin       (admin, body: {new_pin, confirm_pin})

GET    /api/categories
POST   /api/categories                  (admin)
PUT    /api/categories/<id>             (admin)
DELETE /api/categories/<id>             (admin)

GET    /api/dashboard                   (admin)
GET    /api/settings
PUT    /api/settings                    (admin)
```

## Testing checklist

1. Log in as admin, upload a file with a 6-digit PIN — confirm the upload
   button stays disabled until file + title + category + matching PIN are
   all present.
2. Open the site in a private/incognito window. The file shows 🔒
   Protected — View and Download both open the PIN modal.
3. Enter the wrong PIN 5 times → confirm you're locked out for 60s. Wait,
   then enter the correct PIN → confirm it unlocks.
4. View the file, click Back, open it again — confirm it's still unlocked
   (no second PIN prompt) and the badge shows 🔓 Unlocked.
5. Directly call `GET /api/files/<id>/view` and `/download` with curl (no
   cookie) — confirm you get `403`.
6. In Manage Files, use **Change PIN** — confirm the old PIN no longer
   works and the new one does.
7. Delete a file — confirm it's gone from both Cloudinary and Supabase.
8. Confirm `access_pin_hash` never appears in any `/api/files` response
   (check the Network tab).
9. Log out — confirm `/admin` redirects to `/login`, and previously
   admin-only endpoints return 401.
10. Resize to a mobile width — confirm the PIN modal, upload form, admin
    sidebar, and file cards all remain usable.

## What's intentionally unchanged

Admin dashboard, categories, settings (site name/logo/theme/color), search,
sort, dark mode, and the responsive layout all work exactly as before —
only the storage/auth layer and the PIN feature are new.

## Not done yet (per your instructions)

- Nothing has been deployed (no Render/Vercel push).
- Nothing has been pushed to GitHub.
- No old `database.db` or local `uploads/` files existed in this project to
  begin with (the codebase you provided had none checked in), so there was
  nothing to migrate off of local storage — new uploads go straight to
  Cloudinary.
