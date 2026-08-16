-- ============================================================================
-- V Doc — Supabase (PostgreSQL) schema
-- Run this once in the Supabase SQL editor (or via `psql`) against a fresh
-- project before starting the app.
-- ============================================================================

create table if not exists admins (
    id            bigserial primary key,
    email         text unique not null,
    password_hash text not null,           -- Werkzeug hash, never plaintext
    created_at    timestamptz not null default now()
);

create table if not exists categories (
    id         bigserial primary key,
    name       text unique not null,
    created_at timestamptz not null default now()
);

create table if not exists files (
    id                     bigserial primary key,
    title                  text not null,
    description            text default '',
    category_id            bigint references categories(id) on delete set null,

    original_filename      text not null,          -- name shown to users
    cloudinary_url          text not null,          -- base secure_url (never served directly to locked visitors)
    cloudinary_public_id    text not null,
    resource_type          text not null,          -- 'image' | 'video' | 'raw'
    file_format             text default '',        -- extension
    file_size               bigint default 0,        -- bytes

    downloads              bigint not null default 0,

    -- Hashed 6-digit per-file access PIN (Werkzeug hash). NEVER store the
    -- plaintext PIN, and NEVER expose this column through a public API.
    access_pin_hash        text not null,

    created_at             timestamptz not null default now()
);

create index if not exists idx_files_category   on files(category_id);
create index if not exists idx_files_created_at on files(created_at desc);
create index if not exists idx_files_downloads  on files(downloads desc);
create index if not exists idx_files_title      on files using gin (to_tsvector('english', title));

create table if not exists settings (
    id            bigserial primary key,
    website_name  text default 'V Doc',
    logo          text default '',
    theme         text default 'light',        -- 'light' | 'dark'
    primary_color text default '#2563EB',
    updated_at    timestamptz not null default now()
);

-- Keep settings.updated_at current automatically.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_settings_updated_at on settings;
create trigger trg_settings_updated_at
    before update on settings
    for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- Row Level Security: the Flask backend uses the service_role key, which
-- bypasses RLS entirely, so these tables can stay locked down to that one
-- trusted server-side credential. The browser never talks to Supabase
-- directly, so no public/anon policies are needed.
-- ----------------------------------------------------------------------------
alter table admins     enable row level security;
alter table categories enable row level security;
alter table files      enable row level security;
alter table settings   enable row level security;
-- (No policies are added — service_role bypasses RLS; anon/authenticated
--  keys have zero access by default, which is what we want.)
