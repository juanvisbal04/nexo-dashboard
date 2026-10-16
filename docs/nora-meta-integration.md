# Nora — Instagram + Facebook Messenger

Status 2026-10-16: integration backend deployed in NEXO Supabase, but NOT connected to live Meta accounts. Existing Nora web flow and Lía are untouched.

## Architecture
Instagram DM / Facebook Messenger -> signed webhook (nora-meta-webhook) -> HMAC-SHA256 validation -> dedupe -> tenant-isolated nora_social_threads / nora_social_messages -> NORA model -> Meta Send API. After explicit consent and contact collection, creates demo_requests lead for NEXO. No cross-tenant reads or Lía credentials.

Callback URL:
https://ixewnbjndguchunwcuhf.supabase.co/functions/v1/nora-meta-webhook

## Configure Supabase encrypted secrets
Use NEXO Platform > Edge Functions > Secrets, NEVER paste these into chat or into the public repository.

- NORA_META_VERIFY_TOKEN: random verify token matching Meta Webhooks
- NORA_META_APP_SECRET: Meta App Secret, required for signed inbound webhooks
- NORA_META_GRAPH_VERSION: supported Meta Graph API version (choose based on app)
- NORA_FB_PAGE_ID: numeric NEXO Page ID
- NORA_FB_PAGE_TOKEN: Facebook Page token with pages_messaging and required Page permissions
- NORA_IG_ACCOUNT_ID: numeric Instagram Professional Account ID
- NORA_IG_ACCESS_TOKEN: Instagram Login token with instagram_business_manage_messages
- NORA_OPENAI_API_KEY: dedicated Nora OpenAI project key, separate from Lía
- NORA_OPENAI_MODEL (optional): defaults to gpt-6-luna; verify model access and price

Use the official Meta developer app and authorized business portfolio. Configure and subscribe to messages webhooks. Depending on Meta access level, App Review / Advanced Access may be required to serve people who are not app testers. Webhook verification alone does not grant messaging access.

## Current capabilities
Spanish conversational NEXO Assistants, Marketing and Solutions guidance; short-term conversational history (last 14 messages); product interest retained; handoff flags for human takeover; privacy opt-in gating before creating CRM leads; dedupe by message ID; signature verification; brand isolation; delivery tracking. Does not use Lía data.

## Not yet supported
Image/audio handling, full long-term cross-channel identity linking, operator inbox UI and handoff reopening, automatic booking, comments, content publishing, automated follow-ups outside Meta messaging window, Meta access tokens renewal, costs alerts, or retries of failed sends. Social tables are locked to the backend service account until NEXO-specific dashboard access rules are built.

## Required acceptance tests before public launch
1. Check Facebook Page and Instagram Professional account ownership, Meta developer app, required permissions, and token validity.
2. Install secrets, Meta callback/verify token and correct messaging subscriptions.
3. Send an inbound DM from approved tester in each channel and verify actual reply and DB log.
4. Replay the same event and verify duplicate handling.
5. Consent declined -> no lead; consent accepted then contact -> single lead in NEXO sales CRM.
6. Request human takeover and verify Nora stops responding.
7. Verify rejected invalid signatures, foreign account IDs, stale messages, and OpenAI or Meta API failures.
8. Before production implement admin inbox, budget limits, token monitoring, deletion request flow, and long-term memory validation.

## Budget and isolation
The webhook does not require an additional Render service. Supabase and OpenAI usage are metered and may incur costs even if Meta messaging is available. Do not connect or reuse Isabel/Lía tokens or change their production automation.
