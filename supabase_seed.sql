-- ============================================================================
-- V Doc — safe initial data
-- Run AFTER supabase_schema.sql. Contains no real credentials — the first
-- admin account is created separately with `python scripts/create_admin.py`
-- (never with a hardcoded password in SQL).
-- ============================================================================

insert into categories (name) values
    ('Notes'), ('Books'), ('Assignments'), ('Images'),
    ('Videos'), ('Software'), ('Documents'), ('Others')
on conflict (name) do nothing;

insert into settings (website_name, theme, primary_color)
select 'V Doc', 'light', '#2563EB'
where not exists (select 1 from settings);
