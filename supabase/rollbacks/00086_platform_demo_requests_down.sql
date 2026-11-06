-- Reverses 00086. Discards every stored demo request; the notification emails already sent remain.

drop function public.platform_update_demo_request(uuid, text, text, uuid, boolean);
drop function public.platform_demo_requests();
drop table public.demo_requests;
delete from public.platform_role_permissions where permission in ('demo_requests.view', 'demo_requests.manage');
