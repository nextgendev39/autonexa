-- Cancelling a booking whose deposit was received records how much of the deposit went back
-- to the customer, how, and who refunded it. The amount may be less than the deposit (for
-- example a cancellation fee is kept); null means no deposit was refunded.

alter table public.reservations
  add column if not exists refund_amount numeric(14, 2),
  add column if not exists refund_method public.payment_method,
  add column if not exists refund_reference text,
  add column if not exists refunded_at timestamptz,
  add column if not exists refunded_by uuid references public.profiles (id) on delete set null;

do $$ begin
  alter table public.reservations
    add constraint reservations_refund_amount_valid
    check (refund_amount is null or (refund_amount >= 0 and refund_amount <= amount));
exception when duplicate_object then null; end $$;

comment on column public.reservations.refund_amount is
  'Deposit returned to the customer when the booking was cancelled. Null: nothing refunded.';

-- Like the cancellation hold, only the server (service role, where auth.uid() is null) may
-- write refund details, after it has checked that a Super Admin is cancelling.
create or replace function public.reservations_guard_refund()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.refund_amount is not null or new.refunded_at is not null or new.refunded_by is not null then
      raise exception 'not authorized to set a refund';
    end if;
  elsif new.refund_amount is distinct from old.refund_amount
     or new.refund_method is distinct from old.refund_method
     or new.refund_reference is distinct from old.refund_reference
     or new.refunded_at is distinct from old.refunded_at
     or new.refunded_by is distinct from old.refunded_by then
    raise exception 'not authorized to change the refund';
  end if;

  return new;
end;
$$;

drop trigger if exists reservations_guard_refund on public.reservations;
create trigger reservations_guard_refund
before insert or update on public.reservations
for each row execute function public.reservations_guard_refund();
