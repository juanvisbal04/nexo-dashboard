create table public.notification_reads (
 user_id uuid not null references auth.users(id) on delete cascade,
 notification_key text not null check(length(notification_key) between 1 and 256),
 fingerprint text not null check(length(fingerprint)<=2048),
 read_at timestamptz not null default now(),
 primary key(user_id,notification_key)
);
alter table public.notification_reads enable row level security;
grant select,insert,update on public.notification_reads to authenticated;
create policy "Users read their own notification receipts" on public.notification_reads for select to authenticated using(user_id=(select auth.uid()));
create policy "Users insert their own notification receipts" on public.notification_reads for insert to authenticated with check(user_id=(select auth.uid()));
create policy "Users update their own notification receipts" on public.notification_reads for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
