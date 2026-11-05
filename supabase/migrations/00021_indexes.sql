-- Query-oriented indexes. Unique/partial indexes already live on their table migrations.

set search_path = public, extensions;

create index if not exists vehicles_branch_id_idx on public.vehicles (branch_id);
create index if not exists vehicles_status_idx on public.vehicles (status) where deleted_at is null;
create index if not exists vehicles_make_model_idx on public.vehicles (make, model) where deleted_at is null;
create index if not exists vehicles_year_idx on public.vehicles (year) where deleted_at is null;
create index if not exists vehicles_created_at_idx on public.vehicles (created_at desc);
create index if not exists vehicles_make_trgm_idx on public.vehicles using gin (make gin_trgm_ops);
create index if not exists vehicles_model_trgm_idx on public.vehicles using gin (model gin_trgm_ops);
create index if not exists vehicles_stock_trgm_idx on public.vehicles using gin (stock_number gin_trgm_ops);

create index if not exists vehicle_expenses_vehicle_id_idx on public.vehicle_expenses (vehicle_id);
create index if not exists vehicle_expenses_acquisition_id_idx on public.vehicle_expenses (acquisition_id);
create index if not exists vehicle_photos_vehicle_id_idx on public.vehicle_photos (vehicle_id);
create index if not exists vehicle_price_history_vehicle_id_idx on public.vehicle_price_history (vehicle_id);
create index if not exists vehicle_status_history_vehicle_id_idx on public.vehicle_status_history (vehicle_id);

create index if not exists acquisitions_vehicle_id_idx on public.acquisitions (vehicle_id);
create index if not exists acquisitions_branch_id_idx on public.acquisitions (branch_id);
create index if not exists acquisitions_status_idx on public.acquisitions (status);

create index if not exists inspections_vehicle_id_idx on public.inspections (vehicle_id);
create index if not exists inspections_status_idx on public.inspections (status);
create index if not exists inspections_branch_id_idx on public.inspections (branch_id);

create index if not exists workshop_orders_vehicle_id_idx on public.workshop_orders (vehicle_id);
create index if not exists workshop_orders_status_idx on public.workshop_orders (status);
create index if not exists workshop_orders_branch_id_idx on public.workshop_orders (branch_id);

create index if not exists customers_email_idx on public.customers (email) where deleted_at is null and email is not null;
create index if not exists customers_display_name_trgm_idx
  on public.customers using gin (display_name gin_trgm_ops);
create index if not exists customers_phone_trgm_idx
  on public.customers using gin (phone gin_trgm_ops);

create index if not exists leads_customer_id_idx on public.leads (customer_id);
create index if not exists leads_vehicle_id_idx on public.leads (vehicle_id);
create index if not exists leads_assigned_to_idx on public.leads (assigned_to);
create index if not exists leads_status_idx on public.leads (status) where deleted_at is null;
create index if not exists leads_branch_id_idx on public.leads (branch_id);

create index if not exists reservations_vehicle_id_idx on public.reservations (vehicle_id);
create index if not exists reservations_customer_id_idx on public.reservations (customer_id);
create index if not exists reservations_status_idx on public.reservations (status);
create index if not exists reservations_expires_at_idx on public.reservations (expires_at);

create index if not exists sales_vehicle_id_idx on public.sales (vehicle_id);
create index if not exists sales_customer_id_idx on public.sales (customer_id);
create index if not exists sales_salesperson_id_idx on public.sales (salesperson_id);
create index if not exists sales_status_idx on public.sales (status);
create index if not exists sales_sale_date_idx on public.sales (sale_date);
create index if not exists sales_branch_id_idx on public.sales (branch_id);

create index if not exists payments_sale_id_idx on public.payments (sale_id);
create index if not exists payments_customer_id_idx on public.payments (customer_id);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payment_allocations_sale_id_idx on public.payment_allocations (sale_id);

create index if not exists invoices_sale_id_idx on public.invoices (sale_id);
create index if not exists invoices_customer_id_idx on public.invoices (customer_id);
create index if not exists invoices_status_idx on public.invoices (status);

create index if not exists documents_entity_idx on public.documents (entity_type, entity_id)
  where deleted_at is null;
create index if not exists documents_expires_at_idx on public.documents (expires_at)
  where deleted_at is null and expires_at is not null;

create index if not exists notifications_user_id_idx on public.notifications (user_id);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where is_read = false;

create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_user_id_idx on public.audit_logs (user_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

create index if not exists profiles_branch_id_idx on public.profiles (branch_id) where deleted_at is null;
create index if not exists user_roles_user_id_idx on public.user_roles (user_id);
create index if not exists user_roles_role_id_idx on public.user_roles (role_id);
