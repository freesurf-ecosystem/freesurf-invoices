-- cnxt to invoices — Database Schema
-- Run this AFTER the shared schema in cnxt-to-auth/supabase/setup.sql
-- Shared tables (profiles, user_products) are managed in the auth project.

create extension if not exists pgcrypto;

-- ── Invoice Business Profiles ─────────────────────────────────────────────
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null,
  display_name text,
  email text,
  phone text,
  website text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state_region text,
  postal_code text,
  country text,
  logo_url text,
  default_currency text not null default 'USD',
  accent_color text,
  payment_terms_days integer not null default 14,
  invoice_prefix text not null default 'INV-',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_profile_id uuid not null references public.invoice_business_profiles(id) on delete cascade,
  client_name text not null,
  contact_name text,
  email text,
  phone text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state_region text,
  postal_code text,
  country text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_name text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_profile_id uuid not null references public.invoice_business_profiles(id) on delete cascade,
  client_id uuid references public.invoice_clients(id) on delete set null,
  invoice_number text not null,
  status text not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'USD',
  notes text,
  subtotal_cents integer not null default 0,
  tax_cents integer not null default 0,
  discount_cents integer not null default 0,
  total_cents integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_status_check
    check (status in ('draft', 'sent', 'paid', 'overdue', 'void')),
  constraint invoices_owner_number_unique unique (user_id, invoice_number)
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price_cents integer not null default 0,
  line_total_cents integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint invoice_items_quantity_check check (quantity >= 0),
  constraint invoice_items_unit_price_check check (unit_price_cents >= 0),
  constraint invoice_items_line_total_check check (line_total_cents >= 0)
);

create table if not exists public.recurring_invoice_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_profile_id uuid not null references public.invoice_business_profiles(id) on delete cascade,
  client_id uuid references public.invoice_clients(id) on delete set null,
  template_name text not null,
  frequency text not null,
  next_run_at timestamptz,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_invoice_templates_frequency_check
    check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly'))
);

alter table public.user_products enable row level security;
alter table public.invoice_business_profiles enable row level security;
alter table public.invoice_clients enable row level security;
alter table public.invoice_drafts enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.recurring_invoice_templates enable row level security;

drop policy if exists "users manage own product memberships" on public.user_products;
create policy "users manage own product memberships"
  on public.user_products
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage own business profiles" on public.invoice_business_profiles;
create policy "users manage own business profiles"
  on public.invoice_business_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage own clients" on public.invoice_clients;
create policy "users manage own clients"
  on public.invoice_clients
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage own invoice drafts" on public.invoice_drafts;
create policy "users manage own invoice drafts"
  on public.invoice_drafts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage own invoices" on public.invoices;
create policy "users manage own invoices"
  on public.invoices
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users manage own invoice items" on public.invoice_items;
create policy "users manage own invoice items"
  on public.invoice_items
  for all
  using (
    exists (
      select 1
      from public.invoices
      where public.invoices.id = invoice_items.invoice_id
        and public.invoices.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.invoices
      where public.invoices.id = invoice_items.invoice_id
        and public.invoices.user_id = auth.uid()
    )
  );

drop policy if exists "users manage own recurring templates" on public.recurring_invoice_templates;
create policy "users manage own recurring templates"
  on public.recurring_invoice_templates
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_invoice_business_profiles_updated_at on public.invoice_business_profiles;
create trigger set_invoice_business_profiles_updated_at
before update on public.invoice_business_profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_invoice_clients_updated_at on public.invoice_clients;
create trigger set_invoice_clients_updated_at
before update on public.invoice_clients
for each row execute function public.set_updated_at();

drop trigger if exists set_invoice_drafts_updated_at on public.invoice_drafts;
create trigger set_invoice_drafts_updated_at
before update on public.invoice_drafts
for each row execute function public.set_updated_at();

drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

drop trigger if exists set_recurring_invoice_templates_updated_at on public.recurring_invoice_templates;
create trigger set_recurring_invoice_templates_updated_at
before update on public.recurring_invoice_templates
for each row execute function public.set_updated_at();

create or replace function public.handle_new_invoice_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_products (user_id, product_key, status)
  values (new.id, 'invoice', 'active')
  on conflict (user_id, product_key) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_invoice on auth.users;
create trigger on_auth_user_created_invoice
after insert on auth.users
for each row execute function public.handle_new_invoice_user();

-- ---- Storage: logos bucket ----
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload logos" on storage.objects;
create policy "Authenticated users can upload logos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'logos');

drop policy if exists "Authenticated users can update logos" on storage.objects;
create policy "Authenticated users can update logos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'logos');

drop policy if exists "Public can read logos" on storage.objects;
create policy "Public can read logos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'logos');

