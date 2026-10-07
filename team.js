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
  };

  const invoke = async (body) => {
    const { data, error } = await supabase.functions.invoke("nexo-team-access", { body });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || "No pudimos completar la operación.");
    return data;
  };

  const data = await invoke({ action: "list" });
  const roles = data.roles || [];
  const organizations = data.organizations || [];
  const users = data.users || [];
  const roleMap = new Map(roles.map((role) => [role.role_key, role]));
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

  const roleCards = roles.map((role) => `
    <article class="team-role-card">
      <div class="team-role-card-head">
        <div>
          <span class="eyebrow">${esc(role.role_key.replaceAll("_", " "))}</span>
          <h3>${esc(role.name)}</h3>
        </div>
        <span class="team-role-count">${(role.permissions || []).length} permisos</span>
      </div>
      <p>${esc(role.description || "")}</p>
      <div class="team-permission-chips">
        ${(role.permissions || []).map((permission) => `<span>${esc(permissionLabels[permission] || permission)}</span>`).join("")}
      </div>
    </article>
  `).join("");

  $("content").innerHTML = `
    <div class="team-summary nexo-team-hero">
      <div>
        <span class="eyebrow">NEXO INTERNAL · EQUIPO</span>
        <h2>${users.length} colaborador${users.length === 1 ? "" : "es"} configurado${users.length === 1 ? "" : "s"}</h2>
        <p>Administra roles, clientes asignados y acceso al dashboard interno. Las finanzas internas siguen reservadas al Founder / Super Admin.</p>
      </div>
      <div class="team-hero-stats">
        <span><b>${activeCount}</b> activos</span>
        <span><b>${invitedCount}</b> invitados</span>
        <span><b>${inactiveCount}</b> inactivos</span>
      </div>
    </div>

    <div class="team-security-note">
      <div>
        <span class="team-security-icon">◎</span>
        <div>
          <strong>Finanzas protegidas</strong>
          <p>Los roles de Sales, Marketing, Implementation & Customer Success y Operations no reciben <code>finance.read</code> ni <code>finance.write</code>.</p>
        </div>
      </div>
      <span class="pill green">Founder only</span>
    </div>

    <div class="grid-two team-grid nexo-team-grid">
      <section class="card nexo-team-list-card">
        <div class="card-head">
          <div><h2>Equipo NEXO</h2><p>Usuarios internos, rol y cartera asignada</p></div>
          <span class="count">${users.length}</span>
        </div>
        <div class="table-wrap">
          <table class="team-table">
            <thead><tr><th>Colaborador</th><th>Rol</th><th>Clientes</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead>
            <tbody>
              ${users.length ? users.map((user) => `
                <tr>
                  <td>
                    <div class="team-person">
                      <span class="team-person-avatar">${esc((user.full_name || user.email || "NX").split(/\s+/).filter(Boolean).slice(0,2).map((x)=>x[0]?.toUpperCase()||"").join("") || "NX")}</span>
                      <div>
                        <b>${esc(user.full_name || "Usuario NEXO")}</b>
                        <span>${esc(user.job_title || user.email || "—")}</span>
                        ${user.job_title && user.email ? `<small>${esc(user.email)}</small>` : ""}
                      </div>
                    </div>
                  </td>
                  <td><span class="team-role-pill">${esc(user.role_name || user.role_key || "—")}</span></td>
                  <td>${clientChips(user)}</td>
                  <td>${statusBadge(user)}</td>
                  <td>${user.last_sign_in_at ? esc(dateTime(user.last_sign_in_at)) : '<span class="muted">Aún no ingresa</span>'}</td>
                  <td>
                    <div class="team-row-actions">
                      <button class="btn small team-edit" type="button" data-user-id="${esc(user.user_id)}">Editar</button>
                      <button class="btn small team-toggle ${user.active ? "warn" : ""}" type="button" data-user-id="${esc(user.user_id)}" data-active="${user.active ? "true" : "false"}">${user.active ? "Desactivar" : "Activar"}</button>
                      <button class="member-remove team-remove" type="button" data-user-id="${esc(user.user_id)}">Quitar</button>
                    </div>
                  </td>
                </tr>
              `).join("") : `
                <tr><td colspan="6"><div class="team-empty"><b>Aún no hay colaboradores internos.</b><span>Crea el primero desde el panel de la derecha.</span></div></td></tr>
              `}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card access-card nexo-team-editor-card">
        <div class="card-head">
          <div><h2 id="internalTeamFormTitle">Nuevo colaborador</h2><p id="internalTeamFormSubtitle">Crea su acceso y define lo que necesita para trabajar.</p></div>
          <button id="internalTeamCancel" class="btn small hidden" type="button">Cancelar</button>
        </div>
        <form id="internalTeamForm" class="admin-form nexo-team-form">
          <input id="internalTeamUserId" type="hidden" />
          <label>Nombre</label>
          <input id="internalTeamName" type="text" placeholder="Nombre completo" required />
          <label>Correo</label>
          <input id="internalTeamEmail" type="email" placeholder="persona@correo.com" required />
          <label>Cargo / título</label>
          <input id="internalTeamJobTitle" type="text" placeholder="Ej. Sales Executive" />
          <label>Rol interno</label>
          <select id="internalTeamRole" required>
            ${roles.map((role) => `<option value="${esc(role.role_key)}">${esc(role.name)}</option>`).join("")}
          </select>
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
                  <span><b>${esc(org.name)}</b><small>${esc(org.sector || "Cliente NEXO")}</small></span>
                </label>
              `).join("") : '<div class="team-empty compact"><span>No hay clientes para asignar todavía.</span></div>'}
            </div>
          </div>

          <button id="internalTeamSubmit" class="btn primary" type="submit">Crear colaborador</button>
        </form>
        <div id="internalTeamResult" class="access-result hidden"></div>
      </section>
    </div>

    <section class="card team-roles-section">
      <div class="card-head"><div><h2>Mapa de roles y permisos</h2><p>Permisos efectivos definidos en Supabase RLS.</p></div></div>
      <div class="team-role-grid">${roleCards}</div>
    </section>
  `;

  const rolePreview = () => {
    const role = roleMap.get($("internalTeamRole")?.value);
    const preview = $("internalRolePreview");
    if (!preview || !role) return;
    const permissions = role.permissions || [];
    preview.innerHTML = `
      <div><strong>${esc(role.name)}</strong><span>${esc(role.description || "")}</span></div>
      <div class="team-permission-chips">
        ${permissions.map((permission) => `<span>${esc(permissionLabels[permission] || permission)}</span>`).join("")}
      </div>
    `;
  };

  const resetForm = () => {
    $("internalTeamUserId").value = "";
    $("internalTeamName").value = "";
    $("internalTeamEmail").value = "";
    $("internalTeamEmail").disabled = false;
    $("internalTeamJobTitle").value = "";
    if (roles[0]) $("internalTeamRole").value = roles[0].role_key;
    document.querySelectorAll('input[name="internalTeamClient"]').forEach((input) => { input.checked = false; });
    $("internalTeamFormTitle").textContent = "Nuevo colaborador";
    $("internalTeamFormSubtitle").textContent = "Crea su acceso y define lo que necesita para trabajar.";
    $("internalTeamSubmit").textContent = "Crear colaborador";
    $("internalTeamCancel").classList.add("hidden");
    $("internalTeamResult").className = "access-result hidden";
    rolePreview();
  };

  $("internalTeamRole")?.addEventListener("change", rolePreview);
  rolePreview();

  $("internalTeamCancel")?.addEventListener("click", resetForm);

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
      $("internalTeamName").scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

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

      if (result.setup_url) {
        resultBox.innerHTML = `
          <strong>Colaborador creado</strong>
          <p>Comparte este enlace privado para que configure su contraseña. Vence en 48 horas.</p>
          <div class="setup-link-row">
            <input id="internalGeneratedLink" value="${esc(result.setup_url)}" readonly />
            <button id="copyInternalLink" class="btn small" type="button">Copiar</button>
          </div>
        `;
        resultBox.className = "access-result ok";
        $("copyInternalLink")?.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(result.setup_url);
            showToast("Enlace de acceso copiado.");
          } catch {
            showError("No pudimos copiar el enlace automáticamente.");
          }
        });
        showToast("Colaborador creado.");
      } else {
        showToast(isEdit ? "Colaborador actualizado." : "Acceso interno agregado.");
        await renderInternalTeam(ctx);
      }
    } catch (error) {
      resultBox.innerHTML = `<strong>No pudimos guardar los cambios</strong><p>${esc(error.message || "Inténtalo de nuevo.")}</p>`;
      resultBox.className = "access-result error";
    } finally {
      button.disabled = false;
      button.textContent = isEdit ? "Guardar cambios" : "Crear colaborador";
    }
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
        await renderInternalTeam(ctx);
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
        await renderInternalTeam(ctx);
      } catch (error) {
        showError(error.message || "No pudimos retirar al usuario.");
        button.disabled = false;
      }
    });
  });
}
