-- Payments with allocation support for future multi-sale / multi-invoice accounting.
-- Decision: payments hold the money movement; payment_allocations link amounts to sales
-- (and later invoices). payments.sale_id remains as a convenience primary target when
-- a payment has a single sale. Preferred write path for Phase 5+: create payment +
-- allocation rows in one transaction.

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null,
  sale_id uuid references public.sales (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete restrict,
  branch_id uuid references public.branches (id) on delete set null,
  amount numeric(14, 2) not null,
  currency char(3) not null default 'AED',
  method public.payment_method not null,
  status public.payment_status not null default 'pending',
  reference_number text,
  payment_date date not null default (timezone('utc', now()))::date,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint payments_number_unique unique (payment_number),
  constraint payments_amount_positive check (amount > 0),
  constraint payments_currency_format check (currency ~ '^[A-Z]{3}$')
);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  sale_id uuid not null references public.sales (id) on delete restrict,
  amount numeric(14, 2) not null,
  currency char(3) not null default 'AED',
  created_at timestamptz not null default timezone('utc', now()),
  constraint payment_allocations_amount_positive check (amount > 0),
  constraint payment_allocations_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint payment_allocations_unique_sale unique (payment_id, sale_id)
);

create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

comment on table public.payments is
  'Customer money movements. Never hard-delete; cancel/refund via status.';
comment on table public.payment_allocations is
  'Splits a payment across one or more sales for future accounting integration.';
