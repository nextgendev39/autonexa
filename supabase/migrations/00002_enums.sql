-- Controlled business states. Prefer lookup tables for values the business will customize often.

do $$ begin
  create type public.uae_emirate as enum (
    'abu_dhabi',
    'dubai',
    'sharjah',
    'ajman',
    'umm_al_quwain',
    'ras_al_khaimah',
    'fujairah'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_status as enum (
    'active',
    'invited',
    'suspended',
    'disabled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_status as enum (
    'acquired',
    'under_inspection',
    'inspection_failed',
    'under_repair',
    'ready_for_sale',
    'reserved',
    'sold',
    'delivered',
    'returned',
    'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_source as enum (
    'direct_purchase',
    'auction',
    'trade_in',
    'import',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_condition as enum (
    'excellent',
    'good',
    'fair',
    'poor'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.transmission_type as enum (
    'automatic',
    'manual',
    'cvt',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.fuel_type as enum (
    'petrol',
    'diesel',
    'hybrid',
    'electric',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_origin as enum (
    'gcc',
    'imported'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_expense_category as enum (
    'purchase',
    'auction',
    'transportation',
    'customs',
    'registration',
    'repair',
    'detailing',
    'inspection',
    'advertising',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_photo_category as enum (
    'front',
    'rear',
    'left',
    'right',
    'interior',
    'dashboard',
    'engine',
    'odometer',
    'tyres',
    'damage',
    'vin',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.acquisition_status as enum (
    'draft',
    'pending',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_status as enum (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_result as enum (
    'pass',
    'pass_with_repairs',
    'fail'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_item_result as enum (
    'pass',
    'warning',
    'fail',
    'not_applicable'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_status as enum (
    'open',
    'in_progress',
    'waiting_parts',
    'completed',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_priority as enum (
    'low',
    'medium',
    'high',
    'urgent'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.workshop_item_type as enum (
    'part',
    'labor',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_status as enum (
    'new',
    'contacted',
    'interested',
    'test_drive',
    'negotiation',
    'reserved',
    'won',
    'lost'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lead_activity_type as enum (
    'call',
    'whatsapp',
    'email',
    'note',
    'meeting',
    'test_drive',
    'follow_up',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reservation_status as enum (
    'active',
    'expired',
    'cancelled',
    'converted'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sale_status as enum (
    'quotation',
    'negotiation',
    'booked',
    'payment_pending',
    'paid',
    'delivery_pending',
    'delivered',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum (
    'pending',
    'partial',
    'paid',
    'failed',
    'refunded',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum (
    'cash',
    'bank_transfer',
    'card',
    'financing',
    'deposit',
    'installment',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum (
    'draft',
    'issued',
    'paid',
    'partially_paid',
    'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.document_status as enum (
    'active',
    'expired',
    'archived'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.preferred_language as enum (
    'en',
    'ar'
  );
exception when duplicate_object then null; end $$;
