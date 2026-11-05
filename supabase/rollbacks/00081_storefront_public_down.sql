-- Reverses 00081. Discards enquiries and analytics. Customers those enquiries created stay in the
-- CRM, because they may have bookings by now. Export enquiries first if they matter.

drop function public.platform_storefront_overview();
drop function public.storefront_analytics(integer);
drop function public.storefront_analytics_for(uuid, integer);
drop function public.storefront_submit_enquiry(uuid, uuid, text, text, text, text, text, text, text, text, text);
drop function public.storefront_booking_eligibility(uuid, uuid);
drop function public.vehicle_public_price(uuid);
drop function public.storefront_rate_limit(text, integer, integer);
drop table public.storefront_rate_limits;
drop table public.storefront_events;
drop table public.storefront_enquiries;
