-- Tax configuration and invoices. Tax rates are data, not app constants.

create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(8, 4) not null,
  country char(2) not null default 'AE',
  is_active boolean not null default true,
  effective_from date not null default (timezone('utc', now()))::date,
  effective_to date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tax_rates_name_not_blank check (length(trim(name)) > 0),
  constraint tax_rates_rate_non_negative check (rate >= 0),
  constraint tax_rates_effective_window check (
    effective_to is null or effective_to >= effective_from
  )
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  sale_id uuid references public.sales (id) on delete set null,
  customer_id uuid not null references public.customers (id) on delete restrict,
  branch_id uuid not null references public.branches (id),
  tax_rate_id uuid references public.tax_rates (id) on delete set null,
  invoice_date date not null default (timezone('utc', now()))::date,
  subtotal numeric(14, 2) not null,
  discount_amount numeric(14, 2) not null default 0,
  tax_amount numeric(14, 2) not null default 0,
  total_amount numeric(14, 2) not null,
  currency char(3) not null default 'AED',
  status public.invoice_status not null default 'draft',
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint invoices_number_unique unique (invoice_number),
  constraint invoices_subtotal_non_negative check (subtotal >= 0),
  constraint invoices_discount_non_negative check (discount_amount >= 0),
  constraint invoices_tax_non_negative check (tax_amount >= 0),
  constraint invoices_total_non_negative check (total_amount >= 0),
  constraint invoices_currency_format check (currency ~ '^[A-Z]{3}$')
);

create trigger tax_rates_set_updated_at
before update on public.tax_rates
for each row execute function public.set_updated_at();

create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

comment on table public.tax_rates is
  'Configurable VAT/tax. Seed UAE 5% for development; never hardcode rates in the app.';
comment on table public.invoices is
  'Sales invoices. Cancel via status. Never hard-delete issued invoices.';
