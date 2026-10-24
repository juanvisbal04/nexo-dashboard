import { openUserPermissions } from "./teamPermissions.js?v=20261013-access1";
import { serviceLinesLabel } from "./serviceLines.js?v=20261013-lines1";
export async function renderInternalTeam(ctx) {
  const { supabase, $, esc, shortDate, dateTime, showToast, showError } = ctx;

  const permissionLabels = {
    "internal.dashboard": "Dashboard interno",
    "crm.assigned.read": "Ver pipeline propio",
    "crm.assigned.write": "Editar pipeline propio",
    "crm.all.read": "Ver pipeline global",
    "crm.all.write": "Editar pipeline global",
    "tasks.self.read": "Ver tareas propias",
    "tasks.self.write": "Gestionar tareas propias",
    "clients.assigned.read": "Ver clientes asignados",
    "clients.assigned.write": "Gestionar clientes asignados",
    "client_data.assigned.read": "Ver operación asignada",
    "client_data.assigned.write": "Editar operación asignada",
    "marketing.assigned.read": "Ver proyectos de marketing",
    "marketing.assigned.write": "Gestionar marketing",
    "assistants.assigned.read": "Ver asistentes asignados",
    "assistants.assigned.write": "Gestionar asistentes",
    "operations.assigned.write": "Gestionar operación",
    "team.analytics.read": "Ver métricas del equipo",
    "team.manage": "Administrar equipo",
    "audit.read": "Ver auditoría",
    "settings.manage": "Administrar configuración",
    "finance.read": "Ver finanzas internas",
    "finance.write": "Editar finanzas internas",
    "clients.create": "Crear clientes",
    "clients.department.assign": "Coordinar clientes del departamento",
    "tasks.team.read": "Ver tareas del equipo",
    "tasks.team.write": "Gestionar tareas del equipo",
    "department.analytics.read": "Ver métricas del departamento",
    "department.manage": "Gestionar el departamento",
    "projects.department.read": "Ver proyectos del departamento",
    "projects.department.write": "Editar proyectos del departamento",
    "projects.department.create": "Crear proyectos",
    "projects.department.assign": "Asignar proyectos",
    "crm.team.read": "Ver pipeline del equipo",
    "crm.team.write": "Gestionar pipeline del equipo",
    "people.directory.read": "Ver directorio interno",
    "people.recruiting.read": "Ver candidatos",
    "people.recruiting.write": "Gestionar reclutamiento",
    "people.onboarding.read": "Ver onboarding interno",
    "people.onboarding.write": "Gestionar onboarding interno",
    "people.analytics.read": "Ver métricas de Talento Humano",
  };

  const invoke = async (body) => {
    const { data, error } = await supabase.functions.invoke("nexo-team-access", { body });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "No pudimos completar la operación.");
    return data;
  };

  const data = await invoke({ action: "list" });
  const departments = data.departments || [];
  const roles = data.roles || [];
  const organizations = data.organizations || [];
  const users = data.users || [];
  const assignableRoles = roles.filter((role) => role.active === true && role.assignable === true && role.planned !== true);
  const roleMap = new Map(roles.map((role) => [role.role_key, role]));
  const roleIdMap = new Map(roles.map((role) => [role.id, role]));
  const departmentMap = new Map(departments.map((department) => [department.id, department]));
  const orgMap = new Map(organizations.map((org) => [org.id, org]));

  const activeCount = users.filter((user) => user.status === "active").length;
  const invitedCount = users.filter((user) => user.status === "invited").length;
  const inactiveCount = users.filter((user) => user.status === "inactive").length;

  const statusBadge = (user) => {
    if (user.status === "active") return '<span class="team-status active">Activo</span>';
    if (user.status === "invited") return '<span class="team-status invited">Invitado</span>';
    return '<span class="team-status inactive">Inactivo</span>';
  };

  const clientChips = (user) => {
    const ids = user.organization_ids || [];
    if (!ids.length) return '<span class="muted">Sin clientes asignados</span>';
    return `<div class="team-client-chips">${ids.map((id) => {
      const org = orgMap.get(id);
      return org ? `<span>${esc(org.name)}</span>` : "";
    }).filter(Boolean).join("")}</div>`;
  };

  const levelLabel = (level, scope) => {
    if (Number(level) >= 100) return "Founder";
    if (scope === "department" || Number(level) >= 40) return "Lead / Head";
    if (Number(level) >= 30) return "Senior";
    if (Number(level) >= 20) return "Specialist / Manager";
    return "Specialist / Coordinator";
  };

  const roleOptionsHtml = departments.map((department) => {
    const options = assignableRoles
      .filter((role) => role.department_id === department.id)
      .sort((a,b) => Number(b.hierarchy_level||0)-Number(a.hierarchy_level||0))
      .map((role) => `<option value="${esc(role.role_key)}">${esc(role.name)}</option>`)
      .join("");
    return options ? `<optgroup label="${esc(department.name)}">${options}</optgroup>` : "";
  }).join("");

  const departmentCards = departments.map((department) => {
    const departmentRoles = roles
      .filter((role) => role.department_id === department.id)
      .sort((a,b) => Number(b.hierarchy_level||0)-Number(a.hierarchy_level||0));
    if (!departmentRoles.length) return "";
    return `
      <article class="team-department-card ${department.planned ? "planned" : ""}">
        <div class="team-department-head">
          <div>
            <span class="eyebrow">${esc(department.department_key.replaceAll("_"," "))}</span>
            <h3>${esc(department.name)}</h3>
            <p>${esc(department.description || "")}</p>
          </div>
          <span class="team-department-state ${department.planned ? "planned" : "active"}">${department.planned ? "Planificado" : "Activo"}</span>
        </div>
        <div class="team-role-ladder">
          ${departmentRoles.map((role) => {
            const parent = role.reports_to_role_id ? roleIdMap.get(role.reports_to_role_id) : null;
            return `
              <div class="team-role-ladder-row ${role.planned ? "planned" : ""}">
                <div class="team-role-level"><b>${esc(levelLabel(role.hierarchy_level,role.role_scope))}</b><small>Nivel ${esc(role.hierarchy_level || 0)}</small></div>
                <div class="team-role-copy">
                  <strong>${esc(role.name)}</strong>
                  <span>${esc(role.description || "")}</span>
                  <small>${parent ? `Reporta a ${esc(parent.name)}` : "Máxima autoridad"}</small>
                </div>
                <div class="team-role-flags">
                  ${role.planned ? '<span class="team-role-flag planned">Futuro</span>' : ""}
                  ${!role.assignable ? '<span class="team-role-flag locked">No asignable</span>' : ""}
                  <span class="team-role-count">${(role.permissions || []).length} permisos</span>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </article>
    `;
  }).join("");

  document.body.classList.remove("modal-open");
  $("content").innerHTML = `
    <div class="team-summary nexo-team-hero">
      <div>
        <span class="eyebrow">NEXO INTERNAL · EQUIPO</span>
        <h2>${users.length} colaborador${users.length === 1 ? "" : "es"} configurado${users.length === 1 ? "" : "s"}</h2>
        <p>Personas, cargos y clientes asignados en una sola vista.</p>
      </div>
      <div class="team-hero-stats">
        <span><b>${activeCount}</b> activos</span>
        <span><b>${invitedCount}</b> invitados</span>
        <span><b>${inactiveCount}</b> inactivos</span>
      </div>
    </div>

    <details class="team-security-note team-governance-details"><summary>Accesos y estructura de permisos</summary>
      <div>
        <span class="team-security-icon">◎</span>
        <div>
          <strong>Gobierno por departamentos</strong>
          <p>Los cargos activos reciben únicamente los permisos de su función. Product & Technology y Finance & Administration están habilitados para asignación por el Super Admin. El acceso efectivo a cada dato sigue protegido por las reglas de seguridad.</p>
        </div>
      </div>
      <span class="pill green">Solo CEO</span>
    </details>

    <div class="grid-two team-grid nexo-team-grid">
      <section class="card nexo-team-list-card">
        <div class="card-head">
          <div><h2>Equipo NEXO</h2><p>Usuarios internos, rol y cartera asignada</p></div>
          <button id="teamNewCollaborator" class="btn primary" type="button">+ Nuevo colaborador</button>
        </div>
        <div class="team-directory-toolbar"><input id="teamDirectorySearch" type="search" placeholder="Buscar persona, correo o cargo" aria-label="Buscar colaborador"><select id="teamDirectoryStatus" aria-label="Estado del colaborador"><option value="">Todos los estados</option><option value="active">Activos</option><option value="invited">Invitados</option><option value="inactive">Inactivos</option></select></div>
        <div class="table-wrap team-directory-wrap">
          <table class="team-table">
            <thead><tr><th>Colaborador</th><th>Rol</th><th>Clientes</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead>
            <tbody>
              ${users.length ? users.map((user) => `
                <tr data-team-row="${esc(user.user_id)}" data-team-status="${esc(user.status)}">
                  <td data-label="Colaborador">
                    <div class="team-person">
                      <span class="team-person-avatar">${esc((user.full_name || user.email || "NX").split(/\s+/).filter(Boolean).slice(0,2).map((x)=>x[0]?.toUpperCase()||"").join("") || "NX")}</span>
                      <div>
                        <b>${esc(user.full_name || "Usuario NEXO")}</b>
                        <span>${esc(user.job_title || user.email || "—")}</span>
                        ${user.job_title && user.email ? `<small>${esc(user.email)}</small>` : ""}
                      </div>
                    </div>
                  </td>
                  <td data-label="Cargo"><span class="team-role-pill">${esc(user.role_name || user.role_key || "—")}</span>${user.department_name ? `<small class="team-role-department">${esc(user.department_name)}</small>` : ""}</td>
                  <td data-label="Clientes">${clientChips(user)}</td>
                  <td data-label="Estado">${statusBadge(user)}</td>
                  <td data-label="Último acceso">
                    ${user.last_sign_in_at
                      ? esc(dateTime(user.last_sign_in_at))
                      : user.invite?.last_sent_at
                        ? `<span class="team-invite-meta">Invite enviado<br><small>${esc(dateTime(user.invite.last_sent_at))}${user.invite.resend_count ? ` · ${user.invite.resend_count} reenvío${user.invite.resend_count === 1 ? "" : "s"}` : ""}</small></span>`
                        : '<span class="muted">Aún no ingresa</span>'}
                  </td>
                  <td data-label="Acciones">
                    <div class="team-row-actions">
                      <button class="btn small team-extra-permissions" type="button" data-user-id="${esc(user.user_id)}" title="Permisos adicionales" aria-label="Permisos de ${esc(user.full_name||user.email)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="9" r="4"/><path d="m11 12 8 8 3-3-3-3-2 2"/></svg></button>
                      <button class="btn small team-edit" type="button" data-user-id="${esc(user.user_id)}" title="Editar colaborador" aria-label="Editar ${esc(user.full_name||user.email)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a3 3 0 0 0-4-4L4 15z"/></svg></button>
                      <details class="team-actions-menu"><summary title="Más acciones" aria-label="Más acciones para ${esc(user.full_name||user.email)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></summary><div class="team-actions-popover">
                      ${user.status === "invited" ? `
                        <button class="btn small team-resend" type="button" data-user-id="${esc(user.user_id)}">Reenviar invite</button>
                        <button class="btn small warn team-cancel-invite" type="button" data-user-id="${esc(user.user_id)}">Cancelar invite</button>
                      ` : `
                        <button class="btn small team-toggle ${user.active ? "warn" : ""}" type="button" data-user-id="${esc(user.user_id)}" data-active="${user.active ? "true" : "false"}">${user.active ? "Desactivar" : "Activar"}</button>
                      `}
                      <button class="member-remove team-remove" type="button" data-user-id="${esc(user.user_id)}">Quitar acceso</button></div></details>
                    </div>
                  </td>
                </tr>
              `).join("") : `
                <tr><td colspan="6"><div class="team-empty"><b>Aún no hay colaboradores internos.</b><span>Usa Nuevo colaborador para agregar una persona.</span></div></td></tr>
              `}
            </tbody>
          </table>
        </div>
      </section>

      <dialog id="teamEditorDialog" class="team-editor-dialog" aria-labelledby="internalTeamFormTitle"><section class="card access-card nexo-team-editor-card">
        <div class="card-head">
          <div><h2 id="internalTeamFormTitle">Nuevo colaborador</h2><p id="internalTeamFormSubtitle">Crea su acceso y define lo que necesita para trabajar.</p></div>
          <button id="teamEditorClose" class="team-editor-close" type="button" aria-label="Cerrar editor">×</button><button id="internalTeamCancel" class="btn small hidden" type="button">Cancelar</button>
        </div>
        <form id="internalTeamForm" class="admin-form nexo-team-form">
          <input id="internalTeamUserId" type="hidden" />
          <label>Nombre<input id="internalTeamName" type="text" placeholder="Nombre completo" required /></label>
          <label>Correo<input id="internalTeamEmail" type="email" placeholder="persona@correo.com" required /></label>
          <label>Cargo / título<input id="internalTeamJobTitle" type="text" placeholder="Ej. Sales Executive" /></label>
          <label>Cargo NEXO<select id="internalTeamRole" required>
            ${roleOptionsHtml}
          </select></label>
          <div id="internalRolePreview" class="internal-role-preview"></div>

          <div class="team-client-selector">
            <div class="team-client-selector-head">
              <div><strong>Clientes asignados</strong><span>Opcional · puedes modificarlos después</span></div>
              <small>${organizations.length} disponibles</small>
            </div>
            <div class="team-client-options">
              ${organizations.length ? organizations.map((org) => `
                <label class="team-client-option">
                  <input type="checkbox" name="internalTeamClient" value="${esc(org.id)}" />
                  <span class="team-client-dot" style="--client-color:${esc(org.color || "#316bff")}">${esc(org.initials || "NX")}</span>
                  <span><b>${esc(org.name)}</b><small>${esc(serviceLinesLabel(org.service_lines))} · ${esc(org.sector || "Cliente NEXO")}</small></span>
                </label>
              `).join("") : '<div class="team-empty compact"><span>No hay clientes para asignar todavía.</span></div>'}
            </div>
          </div>

          <button id="internalTeamSubmit" class="btn primary" type="submit">Crear colaborador</button>
        </form>
        <div id="internalTeamResult" class="access-result hidden"></div>
      </section></dialog>
    </div>

    <details class="card team-roles-section team-structure-details"><summary>Estructura de NEXO · departamentos y cargos</summary>
      <div class="card-head"><div><h2>Estructura de NEXO</h2><p>Departamentos, jerarquía y líneas de reporte. Puedes asignar colaboradores a los cargos activos; los cargos planificados permanecen bloqueados.</p></div></div>
      <div class="team-department-grid">${departmentCards}</div>
    </details>
  `;

  const rolePreview = () => {
    const role = roleMap.get($("internalTeamRole")?.value);
    const preview = $("internalRolePreview");
    if (!preview || !role) return;
    const permissions = role.permissions || [];
    const department = departmentMap.get(role.department_id);
    preview.innerHTML = `
      <div><strong>${esc(role.name)}</strong><span>${esc(department?.name || "NEXO")} · ${esc(levelLabel(role.hierarchy_level,role.role_scope))}</span><span>${esc(role.description || "")}</span></div>
      <details class="team-base-permissions"><summary>Ver ${permissions.length} permisos del cargo</summary><div class="team-permission-chips">
        ${permissions.map((permission) => `<span>${esc(permissionLabels[permission] || permission)}</span>`).join("")}
      </div></details>
    `;
  };

  const resetForm = () => {
    $("internalTeamUserId").value = "";
    $("internalTeamName").value = "";
    $("internalTeamEmail").value = "";
    $("internalTeamEmail").disabled = false;
    $("internalTeamJobTitle").value = "";
    if (assignableRoles[0]) $("internalTeamRole").value = assignableRoles[0].role_key;
    document.querySelectorAll('input[name="internalTeamClient"]').forEach((input) => { input.checked = false; });
    $("internalTeamFormTitle").textContent = "Nuevo colaborador";
    $("internalTeamFormSubtitle").textContent = "Crea su acceso y define lo que necesita para trabajar.";
    $("internalTeamSubmit").textContent = "Crear colaborador";
    $("internalTeamCancel").classList.add("hidden");
    $("internalTeamResult").className = "access-result hidden";
    rolePreview();
  };

  document.querySelectorAll(".team-extra-permissions").forEach(button=>button.addEventListener("click",()=>{const user=users.find(u=>u.user_id===button.dataset.userId);if(user)openUserPermissions(ctx,user,data.permissions||[]);}));
  $("internalTeamRole")?.addEventListener("change", rolePreview);
  rolePreview();

  const editor=$("teamEditorDialog");
  const openEditor=()=>{editor.showModal();document.body.classList.add("modal-open");$("internalTeamName").focus();};
  const closeEditor=()=>editor.close();
  editor.addEventListener("close",()=>document.body.classList.remove("modal-open"));
  $("teamEditorClose").addEventListener("click",closeEditor);
  $("teamNewCollaborator").addEventListener("click",()=>{resetForm();openEditor();});
  $("internalTeamCancel")?.addEventListener("click",()=>{resetForm();closeEditor();});
  const filterUsers=()=>{const query=$("teamDirectorySearch").value.toLowerCase().trim(),status=$("teamDirectoryStatus").value;document.querySelectorAll("[data-team-row]").forEach(row=>{const user=users.find(u=>u.user_id===row.dataset.teamRow);row.hidden=Boolean((status&&user.status!==status)||![user.full_name,user.email,user.role_name,user.job_title,user.department_name].join(" ").toLowerCase().includes(query));});};
  $("teamDirectorySearch").addEventListener("input",filterUsers);$("teamDirectoryStatus").addEventListener("change",filterUsers);
  document.querySelectorAll(".team-actions-menu").forEach(menu=>menu.addEventListener("toggle",()=>{if(menu.open)document.querySelectorAll(".team-actions-menu").forEach(other=>{if(other!==menu)other.open=false;});}));

  document.querySelectorAll(".team-edit").forEach((button) => {
    button.addEventListener("click", () => {
      const user = users.find((row) => row.user_id === button.dataset.userId);
      if (!user) return;
      $("internalTeamUserId").value = user.user_id;
      $("internalTeamName").value = user.full_name || "";
      $("internalTeamEmail").value = user.email || "";
      $("internalTeamEmail").disabled = true;
      $("internalTeamJobTitle").value = user.job_title || "";
      $("internalTeamRole").value = user.role_key;
      const assigned = new Set(user.organization_ids || []);
      document.querySelectorAll('input[name="internalTeamClient"]').forEach((input) => { input.checked = assigned.has(input.value); });
      $("internalTeamFormTitle").textContent = "Editar colaborador";
      $("internalTeamFormSubtitle").textContent = "Actualiza rol, cargo o clientes asignados.";
      $("internalTeamSubmit").textContent = "Guardar cambios";
      $("internalTeamCancel").classList.remove("hidden");
      $("internalTeamResult").className = "access-result hidden";
      rolePreview();
      openEditor();
    });
  });

  const refreshTeamStable = async () => {
    const x = window.scrollX;
    const y = window.scrollY;
    await renderInternalTeam(ctx);
    window.scrollTo({ left: x, top: y, behavior: "auto" });
    requestAnimationFrame(() => window.scrollTo({ left: x, top: y, behavior: "auto" }));
  };

  $("internalTeamForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userId = $("internalTeamUserId").value;
    const isEdit = Boolean(userId);
    const button = $("internalTeamSubmit");
    const resultBox = $("internalTeamResult");
    const organizationIds = Array.from(document.querySelectorAll('input[name="internalTeamClient"]:checked')).map((input) => input.value);

    button.disabled = true;
    button.textContent = isEdit ? "Guardando…" : "Creando…";
    resultBox.className = "access-result hidden";

    try {
      const result = await invoke({
        action: isEdit ? "update" : "create",
        user_id: userId || undefined,
        full_name: $("internalTeamName").value.trim(),
        email: $("internalTeamEmail").value.trim(),
        job_title: $("internalTeamJobTitle").value.trim(),
        role_key: $("internalTeamRole").value,
        organization_ids: organizationIds,
      });

      if (result.invite_sent) {
        showToast(`Invitación enviada automáticamente a ${result.email || "su correo"}.`);
        await refreshTeamStable();
      } else if (!isEdit && result.existing_user) {
        showToast("La cuenta ya existía. El acceso interno fue agregado sin cambiar su contraseña.");
        await refreshTeamStable();
      } else {
        showToast(isEdit ? "Colaborador actualizado." : "Acceso interno agregado.");
        await refreshTeamStable();
      }
    } catch (error) {
      resultBox.innerHTML = `<strong>No pudimos guardar los cambios</strong><p>${esc(error.message || "Inténtalo de nuevo.")}</p>`;
      resultBox.className = "access-result error";
    } finally {
      button.disabled = false;
      button.textContent = isEdit ? "Guardar cambios" : "Crear colaborador";
    }
  });

  document.querySelectorAll(".team-resend").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("¿Reenviar la invitación de registro a este colaborador?")) return;
      button.disabled = true;
      button.textContent = "Enviando…";
      try {
        await invoke({ action: "resend_invite", user_id: button.dataset.userId });
        showToast("Invitación reenviada por correo.");
        await refreshTeamStable();
      } catch (error) {
        showError(error.message || "No pudimos reenviar la invitación.");
        button.disabled = false;
        button.textContent = "Reenviar invite";
      }
    });
  });

  document.querySelectorAll(".team-cancel-invite").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("¿Cancelar esta invitación? El enlace dejará de permitir la activación del acceso interno.")) return;
      button.disabled = true;
      try {
        await invoke({ action: "cancel_invite", user_id: button.dataset.userId });
        showToast("Invitación cancelada.");
        await refreshTeamStable();
      } catch (error) {
        showError(error.message || "No pudimos cancelar la invitación.");
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll(".team-toggle").forEach((button) => {
    button.addEventListener("click", async () => {
      const currentlyActive = button.dataset.active === "true";
      const nextActive = !currentlyActive;
      if (!confirm(nextActive ? "¿Reactivar el acceso interno de este colaborador?" : "¿Desactivar su acceso interno a NEXO?")) return;
      button.disabled = true;
      try {
        await invoke({ action: "set_active", user_id: button.dataset.userId, active: nextActive });
        showToast(nextActive ? "Acceso reactivado." : "Acceso interno desactivado.");
        await refreshTeamStable();
      } catch (error) {
        showError(error.message || "No pudimos cambiar el estado.");
        button.disabled = false;
      }
    });
  });

  document.querySelectorAll(".team-remove").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("¿Quitar a este usuario del equipo NEXO? Esto elimina su rol interno y sus asignaciones, pero no borra su cuenta ni sus datos históricos.")) return;
      button.disabled = true;
      try {
        await invoke({ action: "remove", user_id: button.dataset.userId });
        showToast("Usuario retirado del equipo NEXO.");
        await refreshTeamStable();
      } catch (error) {
        showError(error.message || "No pudimos retirar al usuario.");
        button.disabled = false;
      }
    });
  });
}
