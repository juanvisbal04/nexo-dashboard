# NEXO — Organizational Structure & RBAC

## Operating model

NEXO is structured as a company, not as a flat list of users. Every internal collaborator belongs to a department, holds a position inside that department, has a hierarchy level, a role scope, explicit permissions and a reporting line.

Authorization is always enforced by Supabase RLS and internal role permissions. UI visibility is secondary.

## Hierarchy model

- **100 — Founder / CEO**: company scope. Platform Admin. Not assignable as a normal team role.
- **40 — Lead / Head**: department scope. Coordinates team workload, department clients/projects and department metrics when permitted.
- **30 — Senior**: reserved for future senior individual contributors/managers.
- **20–25 — Specialist / Manager**: individual scope with functional ownership.
- **10 — Specialist / Coordinator**: focused execution scope.

## Departments

### Executive & Leadership

**Founder / CEO**
- Company-wide strategy and governance.
- Platform Admin outside the regular collaborator assignment flow.
- Full system authority.
- Sensitive finance and governance remain Founder-controlled unless explicitly delegated later.

### Sales

Reports to Founder / CEO.

**Sales Lead**
- Leads commercial department.
- Team/global pipeline visibility according to permissions.
- Coordinates Sales team tasks.
- Department analytics and management.

**Account Executive**
- Own opportunities and commercial follow-up.
- Own pipeline read/write.
- Own tasks.

**Sales Development Representative**
- Prospecting and qualification.
- Own pipeline read/write.
- Own tasks.

### Marketing

Reports to Founder / CEO.

**Marketing Lead**
- Department lead and primary operator for NEXO Marketing.
- Can create new Marketing clients and their first project.
- Can create additional projects for department clients.
- Can see clients assigned to people in the Marketing department.
- Can coordinate Marketing team tasks.
- Can manage department projects and project status.
- Can view department execution metrics.
- Cannot access NEXO internal finance, audit log or company-wide administration.

**Marketing Specialist**
- Executes assigned Marketing work and projects.
- Assigned clients only.
- Own tasks.
- No client creation or department management.

**Web & Catalog Designer**
- Websites, landing pages, catalogs, brochures and visual deliverables.
- Assigned Marketing projects/clients.
- Own tasks.
- No department-management permissions.

### Implementation & Customer Success

Reports to Founder / CEO.

**Implementation & CS Lead**
- Leads onboarding, implementation, adoption and success.
- Coordinates department tasks.
- Can create/assign department projects where authorized.
- Department analytics and management.

**Customer Success Manager**
- Client relationship, adoption, follow-up and success.
- Assigned client scope.

**Implementation Specialist**
- Configuration, onboarding and solution delivery.
- Assigned client scope.

**Support Specialist**
- Client support and operational follow-up.
- Assigned client scope.

### Operations

Reports to Founder / CEO.

**Operations Lead**
- Leads operations, monitoring and operational quality.
- Coordinates team tasks.
- Department analytics and management.

**Operations Specialist**
- Executes and monitors assigned operations.
- Assigned client scope.

**QA & Monitoring Specialist**
- Quality, monitoring, alerts and operational stability.
- Read-heavy operational scope with own tasks.

## Planned departments

Planned departments exist in the organizational model but are **inactive and non-assignable** until the Founder explicitly enables them.

### Product & Technology
- Product & Technology Lead
- Software Engineer
- Product Designer

### Finance & Administration
- Finance & Administration Lead
- Finance Specialist

Finance roles are intentionally inactive. Mapping future finance permissions does not grant access while the roles remain inactive.

### People & Culture
- People & Culture Lead

## Role rules for future growth

Every new internal role must define:

1. department_id
2. hierarchy_level
3. role_scope: individual, team, department or company
4. reports_to_role_id
5. assignable
6. planned
7. explicit permissions in nexo_role_permissions

No role should gain access only because its title sounds senior. Permissions are explicit.

## Client scope

- Individual contributors see clients assigned to them.
- Department Leads may see clients assigned to teammates in the same department only when the role has the matching department permission.
- Leads do not automatically see clients owned by other departments.
- Creating a Marketing client does **not** automatically create portal users, invoices or an assistant.
- New department clients/projects are visible to the Founder immediately.

## Project model

nexo_projects is department-aware and reusable across NEXO.

Each project has:
- client / organization
- department
- title
- project type
- status
- owner
- due date
- description / brief
- metadata
- audit trail

Supported project lifecycle:
- Brief
- Planning
- In progress
- Review
- Changes
- Delivered
- On hold
- Cancelled

## Task governance

- Individual roles manage their own tasks.
- Leads with tasks.team.read/write can see and coordinate tasks only for people in their own department.
- A Lead can assign work to a teammate only when that teammate is authorized for that client, or when the task belongs to NEXO Internal.
- Cross-department task management is blocked by RLS.

## Security

- Least privilege by default.
- Department structure never overrides RLS.
- Planned roles are inactive and non-assignable.
- Finance remains Founder-only until explicit delegation.
- Team access, project updates and critical access changes remain auditable.
