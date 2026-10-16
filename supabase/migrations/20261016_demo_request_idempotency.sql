-- Public demo form idempotency: optional UUID scoped to one form submission.
-- Existing prospect records remain unchanged (NULL is allowed, so manual/old flows work).
alter table public.demo_requests
  add column if not exists client_request_id uuid;

create unique index if not exists demo_requests_client_request_id_unique
  on public.demo_requests (client_request_id)
  where client_request_id is not null;

comment on column public.demo_requests.client_request_id is
  'Opaque client-generated v4 UUID for retry-safe demo submissions. No personal data; optional for historical and internal records.';
