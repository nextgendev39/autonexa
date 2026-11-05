-- Marking a booking sold records the balance the customer paid on completion, and
-- when and by whom the sale was closed. Deposit (amount) + balance_received is the
-- total collected for the booking.

alter table public.reservations
  add column if not exists balance_received numeric(14, 2),
  add column if not exists sold_at timestamptz,
  add column if not exists sold_by uuid references public.profiles (id) on delete set null;

do $$ begin
  alter table public.reservations
    add constraint reservations_balance_received_non_negative
    check (balance_received is null or balance_received >= 0);
exception when duplicate_object then null;
end $$;

comment on column public.reservations.balance_received is
  'Balance amount received from the customer when the booking was marked sold (on top of the deposit).';
comment on column public.reservations.sold_at is 'When the booking was marked sold.';
comment on column public.reservations.sold_by is 'Who marked the booking sold.';
