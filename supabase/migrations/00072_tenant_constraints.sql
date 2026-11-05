-- SaaS Phase 1: make keys tenant-aware. With one tenant every statement here succeeds on
-- existing data and changes no row.
--
-- Foreign keys are replaced, not added beside the old ones: two keys between the same tables
-- make PostgREST reject joined selects as ambiguous. Each keeps its name and delete action.
-- ON DELETE SET NULL (column) nulls only the reference, never tenant_id. Requires Postgres 15+.
-- Unique indexes keep their names because the app matches them in error messages.
-- system_settings keeps its primary key until 00074: the deployed app upserts on key alone.
-- Rollback: supabase/rollbacks/00072_tenant_constraints_down.sql

-- Parents need a (tenant_id, id) key for composite references.
alter table public.acquisitions add constraint acquisitions_tenant_id_id_unique unique (tenant_id, id);
alter table public.branch_locations add constraint branch_locations_tenant_id_id_unique unique (tenant_id, id);
alter table public.branches add constraint branches_tenant_id_id_unique unique (tenant_id, id);
alter table public.customers add constraint customers_tenant_id_id_unique unique (tenant_id, id);
alter table public.documents add constraint documents_tenant_id_id_unique unique (tenant_id, id);
alter table public.profiles add constraint profiles_tenant_id_id_unique unique (tenant_id, id);
alter table public.reservations add constraint reservations_tenant_id_id_unique unique (tenant_id, id);
alter table public.suppliers add constraint suppliers_tenant_id_id_unique unique (tenant_id, id);
alter table public.vehicle_pricing add constraint vehicle_pricing_tenant_id_id_unique unique (tenant_id, id);
alter table public.vehicles add constraint vehicles_tenant_id_id_unique unique (tenant_id, id);

-- Unique values are per dealership.
alter table public.profiles drop constraint profiles_employee_code_unique;
create unique index profiles_employee_code_unique on public.profiles (tenant_id, employee_code);
alter table public.branches drop constraint branches_code_unique;
create unique index branches_code_unique on public.branches (tenant_id, code);
drop index public.vehicles_stock_number_active_unique;
create unique index vehicles_stock_number_active_unique on public.vehicles (tenant_id, stock_number) WHERE (deleted_at IS NULL);
drop index public.vehicles_vin_active_unique;
create unique index vehicles_vin_active_unique on public.vehicles (tenant_id, vin) WHERE ((deleted_at IS NULL) AND (vin IS NOT NULL));
drop index public.customers_code_active_unique;
create unique index customers_code_active_unique on public.customers (tenant_id, customer_code) WHERE (deleted_at IS NULL);
drop index public.customers_phone_active_unique;
create unique index customers_phone_active_unique on public.customers (tenant_id, phone) WHERE (deleted_at IS NULL);
alter table public.reservations drop constraint reservations_number_unique;
create unique index reservations_number_unique on public.reservations (tenant_id, reservation_number);
alter table public.sales drop constraint sales_number_unique;
create unique index sales_number_unique on public.sales (tenant_id, sale_number);
drop index public.vehicles_chassis_active_unique;
create unique index vehicles_chassis_active_unique on public.vehicles (tenant_id, chassis_number) WHERE ((deleted_at IS NULL) AND (chassis_number IS NOT NULL));
drop index public.acquisitions_acquisition_number_unique;
create unique index acquisitions_acquisition_number_unique on public.acquisitions (tenant_id, acquisition_number);

-- Foreign keys.
alter table public.acquisition_status_history drop constraint acquisition_status_history_acquisition_id_fkey;
alter table public.acquisition_status_history add constraint acquisition_status_history_acquisition_id_fkey foreign key (tenant_id, acquisition_id) references public.acquisitions (tenant_id, id) on delete cascade not valid;
alter table public.acquisition_status_history validate constraint acquisition_status_history_acquisition_id_fkey;
alter table public.acquisitions drop constraint acquisitions_branch_id_fkey;
alter table public.acquisitions add constraint acquisitions_branch_id_fkey foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) not valid;
alter table public.acquisitions validate constraint acquisitions_branch_id_fkey;
alter table public.acquisitions drop constraint acquisitions_customer_id_fkey;
alter table public.acquisitions add constraint acquisitions_customer_id_fkey foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete set null (customer_id) not valid;
alter table public.acquisitions validate constraint acquisitions_customer_id_fkey;
alter table public.acquisitions drop constraint acquisitions_supplier_id_fkey;
alter table public.acquisitions add constraint acquisitions_supplier_id_fkey foreign key (tenant_id, supplier_id) references public.suppliers (tenant_id, id) on delete set null (supplier_id) not valid;
alter table public.acquisitions validate constraint acquisitions_supplier_id_fkey;
alter table public.acquisitions drop constraint acquisitions_vehicle_id_fkey;
alter table public.acquisitions add constraint acquisitions_vehicle_id_fkey foreign key (tenant_id, vehicle_id) references public.vehicles (tenant_id, id) on delete restrict not valid;
alter table public.acquisitions validate constraint acquisitions_vehicle_id_fkey;
alter table public.branch_locations drop constraint branch_locations_branch_id_fkey;
alter table public.branch_locations add constraint branch_locations_branch_id_fkey foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete cascade not valid;
alter table public.branch_locations validate constraint branch_locations_branch_id_fkey;
alter table public.branches drop constraint branches_manager_user_id_fkey;
alter table public.branches add constraint branches_manager_user_id_fkey foreign key (tenant_id, manager_user_id) references public.profiles (tenant_id, id) on delete set null (manager_user_id) not valid;
alter table public.branches validate constraint branches_manager_user_id_fkey;
alter table public.customers drop constraint customers_branch_id_fkey;
alter table public.customers add constraint customers_branch_id_fkey foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete set null (branch_id) not valid;
alter table public.customers validate constraint customers_branch_id_fkey;
alter table public.documents drop constraint documents_branch_id_fkey;
alter table public.documents add constraint documents_branch_id_fkey foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete set null (branch_id) not valid;
alter table public.documents validate constraint documents_branch_id_fkey;
alter table public.notifications drop constraint notifications_user_id_fkey;
alter table public.notifications add constraint notifications_user_id_fkey foreign key (tenant_id, user_id) references public.profiles (tenant_id, id) on delete cascade not valid;
alter table public.notifications validate constraint notifications_user_id_fkey;
alter table public.profiles drop constraint profiles_branch_id_fkey;
alter table public.profiles add constraint profiles_branch_id_fkey foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete set null (branch_id) not valid;
alter table public.profiles validate constraint profiles_branch_id_fkey;
alter table public.push_subscriptions drop constraint push_subscriptions_user_id_fkey;
alter table public.push_subscriptions add constraint push_subscriptions_user_id_fkey foreign key (tenant_id, user_id) references public.profiles (tenant_id, id) on delete cascade not valid;
alter table public.push_subscriptions validate constraint push_subscriptions_user_id_fkey;
alter table public.reservations drop constraint reservations_branch_id_fkey;
alter table public.reservations add constraint reservations_branch_id_fkey foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) not valid;
alter table public.reservations validate constraint reservations_branch_id_fkey;
alter table public.reservations drop constraint reservations_customer_id_fkey;
alter table public.reservations add constraint reservations_customer_id_fkey foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete restrict not valid;
alter table public.reservations validate constraint reservations_customer_id_fkey;
alter table public.reservations drop constraint reservations_salesperson_id_fkey;
alter table public.reservations add constraint reservations_salesperson_id_fkey foreign key (tenant_id, salesperson_id) references public.profiles (tenant_id, id) on delete set null (salesperson_id) not valid;
alter table public.reservations validate constraint reservations_salesperson_id_fkey;
alter table public.reservations drop constraint reservations_vehicle_id_fkey;
alter table public.reservations add constraint reservations_vehicle_id_fkey foreign key (tenant_id, vehicle_id) references public.vehicles (tenant_id, id) on delete restrict not valid;
alter table public.reservations validate constraint reservations_vehicle_id_fkey;
alter table public.sales drop constraint sales_branch_id_fkey;
alter table public.sales add constraint sales_branch_id_fkey foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) not valid;
alter table public.sales validate constraint sales_branch_id_fkey;
alter table public.sales drop constraint sales_customer_id_fkey;
alter table public.sales add constraint sales_customer_id_fkey foreign key (tenant_id, customer_id) references public.customers (tenant_id, id) on delete restrict not valid;
alter table public.sales validate constraint sales_customer_id_fkey;
alter table public.sales drop constraint sales_reservation_id_fkey;
alter table public.sales add constraint sales_reservation_id_fkey foreign key (tenant_id, reservation_id) references public.reservations (tenant_id, id) on delete set null (reservation_id) not valid;
alter table public.sales validate constraint sales_reservation_id_fkey;
alter table public.sales drop constraint sales_salesperson_id_fkey;
alter table public.sales add constraint sales_salesperson_id_fkey foreign key (tenant_id, salesperson_id) references public.profiles (tenant_id, id) on delete set null (salesperson_id) not valid;
alter table public.sales validate constraint sales_salesperson_id_fkey;
alter table public.sales drop constraint sales_vehicle_id_fkey;
alter table public.sales add constraint sales_vehicle_id_fkey foreign key (tenant_id, vehicle_id) references public.vehicles (tenant_id, id) on delete restrict not valid;
alter table public.sales validate constraint sales_vehicle_id_fkey;
alter table public.staff_documents drop constraint staff_documents_user_id_fkey;
alter table public.staff_documents add constraint staff_documents_user_id_fkey foreign key (tenant_id, user_id) references public.profiles (tenant_id, id) on delete cascade not valid;
alter table public.staff_documents validate constraint staff_documents_user_id_fkey;
alter table public.user_roles drop constraint user_roles_branch_id_fkey;
alter table public.user_roles add constraint user_roles_branch_id_fkey foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) on delete cascade not valid;
alter table public.user_roles validate constraint user_roles_branch_id_fkey;
alter table public.user_roles drop constraint user_roles_user_id_fkey;
alter table public.user_roles add constraint user_roles_user_id_fkey foreign key (tenant_id, user_id) references public.profiles (tenant_id, id) on delete cascade not valid;
alter table public.user_roles validate constraint user_roles_user_id_fkey;
alter table public.vehicle_expenses drop constraint vehicle_expenses_acquisition_id_fkey;
alter table public.vehicle_expenses add constraint vehicle_expenses_acquisition_id_fkey foreign key (tenant_id, acquisition_id) references public.acquisitions (tenant_id, id) on delete set null (acquisition_id) not valid;
alter table public.vehicle_expenses validate constraint vehicle_expenses_acquisition_id_fkey;
alter table public.vehicle_expenses drop constraint vehicle_expenses_document_id_fkey;
alter table public.vehicle_expenses add constraint vehicle_expenses_document_id_fkey foreign key (tenant_id, document_id) references public.documents (tenant_id, id) on delete set null (document_id) not valid;
alter table public.vehicle_expenses validate constraint vehicle_expenses_document_id_fkey;
alter table public.vehicle_expenses drop constraint vehicle_expenses_vehicle_id_fkey;
alter table public.vehicle_expenses add constraint vehicle_expenses_vehicle_id_fkey foreign key (tenant_id, vehicle_id) references public.vehicles (tenant_id, id) on delete cascade not valid;
alter table public.vehicle_expenses validate constraint vehicle_expenses_vehicle_id_fkey;
alter table public.vehicle_photos drop constraint vehicle_photos_vehicle_id_fkey;
alter table public.vehicle_photos add constraint vehicle_photos_vehicle_id_fkey foreign key (tenant_id, vehicle_id) references public.vehicles (tenant_id, id) on delete cascade not valid;
alter table public.vehicle_photos validate constraint vehicle_photos_vehicle_id_fkey;
alter table public.vehicle_pricing drop constraint vehicle_pricing_vehicle_id_fkey;
alter table public.vehicle_pricing add constraint vehicle_pricing_vehicle_id_fkey foreign key (tenant_id, vehicle_id) references public.vehicles (tenant_id, id) on delete cascade not valid;
alter table public.vehicle_pricing validate constraint vehicle_pricing_vehicle_id_fkey;
alter table public.vehicle_pricing_history drop constraint vehicle_pricing_history_pricing_id_fkey;
alter table public.vehicle_pricing_history add constraint vehicle_pricing_history_pricing_id_fkey foreign key (tenant_id, pricing_id) references public.vehicle_pricing (tenant_id, id) on delete set null (pricing_id) not valid;
alter table public.vehicle_pricing_history validate constraint vehicle_pricing_history_pricing_id_fkey;
alter table public.vehicle_pricing_history drop constraint vehicle_pricing_history_vehicle_id_fkey;
alter table public.vehicle_pricing_history add constraint vehicle_pricing_history_vehicle_id_fkey foreign key (tenant_id, vehicle_id) references public.vehicles (tenant_id, id) on delete cascade not valid;
alter table public.vehicle_pricing_history validate constraint vehicle_pricing_history_vehicle_id_fkey;
alter table public.vehicle_share_links drop constraint vehicle_share_links_vehicle_id_fkey;
alter table public.vehicle_share_links add constraint vehicle_share_links_vehicle_id_fkey foreign key (tenant_id, vehicle_id) references public.vehicles (tenant_id, id) on delete cascade not valid;
alter table public.vehicle_share_links validate constraint vehicle_share_links_vehicle_id_fkey;
alter table public.vehicle_status_history drop constraint vehicle_status_history_vehicle_id_fkey;
alter table public.vehicle_status_history add constraint vehicle_status_history_vehicle_id_fkey foreign key (tenant_id, vehicle_id) references public.vehicles (tenant_id, id) on delete cascade not valid;
alter table public.vehicle_status_history validate constraint vehicle_status_history_vehicle_id_fkey;
alter table public.vehicles drop constraint vehicles_branch_id_fkey;
alter table public.vehicles add constraint vehicles_branch_id_fkey foreign key (tenant_id, branch_id) references public.branches (tenant_id, id) not valid;
alter table public.vehicles validate constraint vehicles_branch_id_fkey;
alter table public.vehicles drop constraint vehicles_location_id_fkey;
alter table public.vehicles add constraint vehicles_location_id_fkey foreign key (tenant_id, location_id) references public.branch_locations (tenant_id, id) on delete set null (location_id) not valid;
alter table public.vehicles validate constraint vehicles_location_id_fkey;
alter table public.vehicles drop constraint vehicles_split_from_id_fkey;
alter table public.vehicles add constraint vehicles_split_from_id_fkey foreign key (tenant_id, split_from_id) references public.vehicles (tenant_id, id) on delete set null (split_from_id) not valid;
alter table public.vehicles validate constraint vehicles_split_from_id_fkey;
