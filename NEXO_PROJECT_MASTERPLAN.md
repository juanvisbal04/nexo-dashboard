# NEXO — Product & Team Master Plan

_Last updated: 2026-10-07_

## Business direction

NEXO is evolving from a virtual-assistant product into a broader business enablement platform with three commercial lines:

1. **NEXO Assistants** — personalized virtual assistants, customer conversations, lead capture, appointment support, CRM workflows, follow-up and integrations.
2. **NEXO Marketing** — websites and landing pages, catalogs and brochures, visual identity and sales materials, promotional creatives, digital presence, content/campaign support and conversion improvements.
3. **NEXO Solutions** — custom projects that combine assistants, automation, integrations, software and marketing for a client's operation.

### NEXO Marketing positioning

NEXO Marketing is not intended to be just a social-media posting service. Its goal is to improve the client's commercial and digital infrastructure and connect marketing assets to measurable business flows.

Core areas:
- **Digital Presence:** websites, landing pages, mobile optimization, forms, basic SEO and conversion.
- **Brand & Sales Materials:** catalogs, brochures, menus, presentations, flyers, branding and promotional assets.
- **Content & Campaigns:** social content, promotional campaigns, copy and content calendars.
- **NEXO Integration:** connect marketing touchpoints to WhatsApp, NEXO assistants, leads, appointments, CRM and follow-up.

Target flow:
**Ad / content → website → WhatsApp → NEXO assistant → lead → appointment/opportunity → CRM → follow-up.**

## Internal platform principle

The NEXO Dashboard is designed as a multi-user operating system for the company, not as a personal dashboard.

### Founder / Super Admin

Juan Visbal is the Founder / CEO / Owner and Super Admin.

Super Admin:
- Full platform access.
- Global pipeline and team visibility.
- Full client visibility.
- Full operations visibility.
- Full configuration and audit access.
- Exclusive access to internal NEXO financial information unless explicitly delegated in the future.

### Finance privacy rule

Internal NEXO finances are founder-only by default.

Founder-only information includes:
- Revenue and MRR.
- Internal expenses.
- Costs and margins.
- Profitability by client.
- Vendor/platform costs.
- Accounts receivable.
- Internal financial analytics.
- Future payroll / commissions data.

Client billing data remains governed by the client's own organization access rules; this does **not** grant collaborators access to NEXO's internal financial model.

## Initial internal roles

### Sales
Workspace focus:
- Own prospects and opportunities.
- Own pipeline.
- Own CRM activities.
- Own tasks.
- Future personal performance metrics.

No NEXO internal finance access.

### Marketing
Workspace focus:
- Assigned marketing projects and deliverables.
- Own tasks.
- Assigned client/brand context as required.

No NEXO internal finance access.

### Implementation & Customer Success
Workspace focus:
- Assigned clients.
- Onboarding and implementation.
- Assistant configuration/health.
- Operational client data required for service delivery.
- Own tasks.

No NEXO internal finance access.

### Operations
Workspace focus:
- Assigned client operations.
- Operational monitoring.
- Assistant/client status required for delivery.
- Own tasks.

No NEXO internal finance access.

## Ownership model

Business records should use explicit ownership and assignment rather than giving every collaborator global access.

Key concepts:
- owner_user_id for owned opportunities/prospects.
- Client assignment records for collaborators working on specific client organizations.
- User-level role assignment.
- Permission-level authorization.
- Row Level Security (RLS) as the source of truth for data access.

UI hiding is never considered sufficient security.

## Technical access model

RBAC foundation:
- Team roles.
- Granular permissions.
- User-to-role assignments.
- Client-to-user assignments.
- Per-record opportunity ownership.
- RLS enforcement in Supabase.
- Founder/Super Admin override for legitimate administration.

Finance permissions exist in the permission catalog but are **not assigned to default collaborator roles**.

## Execution roadmap

### Phase 1 — RBAC + pipeline ownership
**Status: COMPLETED — 2026-10-07**

Implemented:
- nexo_team_roles
- nexo_permissions
- nexo_role_permissions
- nexo_user_roles
- nexo_client_assignments
- demo_requests.owner_user_id
- Permission helper functions.
- Client-assignment helper functions.
- RLS policies for role/permission data.
- RLS ownership policies for NEXO pipeline records.
- RLS personal-task policies.
- Founder vs. client-user access tests.
- Performance indexes for the new RBAC relations.

Default roles created:
- Sales
- Marketing
- Implementation & Customer Success
- Operations

Finance remains founder-only.

### Phase 2 — Team Management UI
**Status: COMPLETED — 2026-10-07**

Implemented:
- Super Admin `Equipo & accesos` module inside NEXO Internal.
- Create/invite collaborator flow with 48-hour activation link.
- Internal role assignment.
- Client/account assignments.
- Edit collaborator role, job title and client portfolio.
- Activate/deactivate internal NEXO access without deleting the user.
- Remove user from the NEXO team without deleting historical account data.
- Effective role/permission map visible in the UI.
- Last sign-in and invited/active/inactive status.
- Audit entries for internal team mutations.
- Mobile navigation entry for Team.
- Separate backend from client organization user management.
- Render production deployment verified live.
- Default collaborator roles verified with no `finance.read` or `finance.write`.
- Automatic collaborator invitation email through Supabase Auth.
- Invitation lifecycle tracking: pending, accepted and cancelled.
- Resend invitation control from Team Management.
- Cancel invitation control that prevents internal activation.
- Dedicated collaborator registration flow that creates a password before enabling RBAC access.
- Branded NEXO collaborator invitation email published in Resend as `nexo-team-invite`.
- Dedicated `nexo-mailer` Render service with domain-restricted Resend sending credentials.
- Supabase now generates secure invite links without sending its generic invite email; NEXO sends the branded template instead.
- Branded email variables: collaborator name, assigned NEXO role and secure invite URL.
- Mailer validates the requesting Super Admin session before sending.

### Phase 3 — Personal collaborator workspace
**Status: IN PROGRESS — MARKETING WORKSPACE LIVE**

Implemented foundation:
- Role and permission detection at login via `get_my_nexo_roles()` and `get_my_nexo_permissions()`.
- Role-specific internal navigation separated from client and Super Admin navigation.
- Marketing: My Home, My Projects, My Tasks, Assigned Clients, My Performance and My Profile.
- Marketing can create, edit, prioritize and complete only self-assigned tasks within NEXO Internal or explicitly assigned clients.
- Marketing projects are currently derived from explicitly assigned client accounts and their self-assigned work tasks.
- Personal performance is task-based and intentionally has no employee ranking.
- Restricted modules remain hidden and protected by RLS; no internal finance, team administration, audit log or global CRM access.
- Permission RPC hardened to ignore inactive roles.

Remaining Phase 3:
- Sales-specific My Pipeline workspace.
- Implementation & Customer Success workspace.
- Operations workspace.
- Additional role-specific project/deliverable models as Phase 5 productization expands.

### Phase 4 — Founder Command Center
**Status: PENDING**

Founder view:
- Global sales pipeline.
- Team activity and performance.
- Clients and onboarding.
- NEXO Assistants.
- NEXO Marketing projects.
- Operations/alerts.
- Founder-only finance and profitability.
- Audit / governance.

### Phase 5 — NEXO Marketing productization
**Status: PENDING**

Add:
- Service catalog and service lines.
- Marketing projects.
- Project owner/team.
- Deliverables.
- Status/deadlines.
- Pricing/setup/recurring model where applicable.
- Cross-sell from Assistants to Marketing and vice versa.
- Marketing dashboard/workspace.

### Phase 6 — Continued platform refinement
**Status: PENDING / PARTIALLY EXISTING**

Continue strengthening:
- Customer 360.
- Contact 360.
- Task Center.
- Notifications.
- Data Quality.
- Client onboarding.
- Assistant profiles/health.
- Mobile-first UX.
- Backups and platform status.

## Security rules

1. Least privilege by default.
2. Finance is restricted to Founder/Super Admin unless explicitly delegated.
3. Client users never inherit NEXO Internal access.
4. Collaborators do not receive global client access merely because they are NEXO staff.
5. Client access must be assigned explicitly.
6. Opportunity access is ownership-based unless elevated permissions are deliberately added.
7. Sensitive permissions are enforced by database policies, not only by frontend visibility.
8. Auditability is required for access changes and critical operations.

## Current implementation note

The backend RBAC foundation is live in Supabase. The existing dashboard frontend still needs Phase 2/3 work to expose team management and role-specific workspaces cleanly. Until those screens are implemented, the new authorization layer should be treated as backend infrastructure rather than a finished collaborator UX.
