import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const SUPABASE_URL = "https://ixewnbjndguchunwcuhf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vFnLRe9cmnOcyz2Fivprhw_8UjBaRGL";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $ = (id) => document.getElementById(id);
const state = {
  page: "overview",
  organizations: [],
  profile: null,
  isAdmin: false,
  session: null,
  currentRows: [],
};

const pageMeta = {
  overview: ["Vista general", "NEXO DASHBOARD", "Tu negocio, en perspectiva.", "Métricas y actividad de tu operación."],
  conversations: ["Conversaciones", "ATENCIÓN AL CLIENTE", "Cada conversación cuenta.", "Consulta la actividad registrada por tus asistentes."],
  leads: ["Leads", "NEXO SALES", "Oportunidades en movimiento.", "Prospectos identificados y su etapa actual."],
  appointments: ["Citas y reservas", "NEXO BOOKING", "Tu agenda, bajo control.", "Solicitudes, citas y valor estimado."],
  followups: ["Seguimientos", "NEXO RECOVERY", "El siguiente paso importa.", "Oportunidades que necesitan una nueva acción."],
  metrics: ["Métricas", "NEXO ANALYTICS", "Entiende tus resultados.", "Origen, servicios y conversión de tus conversaciones."],
  admin: ["NEXO Admin", "NEXO COMMAND CENTER", "Una vista de todo NEXO.", "Operación agregada de los negocios autorizados."],
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function money(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function dateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota",
  }).format(new Date(value));
}

function shortDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric", month: "short", timeZone: "America/Bogota",
  }).format(new Date(value));
}

function sinceIso(days) {
  const now = new Date();
  const start = new Date(now);
  if (Number(days) === 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return new Date(`${values.year}-${values.month}-${values.day}T00:00:00-05:00`).toISOString();
  }
  start.setDate(start.getDate() - (Number(days) - 1));
  return start.toISOString();
}

function pill(status) {
  const green = ["Confirmada", "Reservado", "Recuperado", "Completada"].includes(status);
  const amber = ["Solicitada", "Pendiente", "En seguimiento", "Calificado"].includes(status);
  const orange = ["Requiere atención", "Cancelada", "Perdido", "No asistió"].includes(status);
  const cls = green ? "green" : amber ? "amber" : orange ? "orange" : "";
  return `<span class="pill ${cls}">${esc(status)}</span>`;
}

function showToast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  setTimeout(() => $("toast").classList.add("hidden"), 3200);
}

function showError(message) {
  $("errorBox").textContent = message;
  $("errorBox").classList.remove("hidden");
}

function clearError() {
  $("errorBox").classList.add("hidden");
  $("errorBox").textContent = "";
}

function currentOrgId() {
  return $("orgSelect").value || null;
}

function currentDays() {
  return Number($("periodSelect").value || 30);
}

function statCard(label, value, detail, accent = false) {
  return `
    <section class="card stat-card ${accent ? "accent" : ""}">
      <div class="stat-label"><span>${esc(label)}</span></div>
      <div class="stat-value">${esc(value)}</div>
      <small>${esc(detail)}</small>
    </section>
  `;
}

async function fetchRows(table, { orgId = currentOrgId(), days = currentDays(), order = "created_at", ascending = false, allTime = false } = {}) {
  let request = supabase.from(table).select("*");
  if (orgId) request = request.eq("organization_id", orgId);
  if (!allTime) request = request.gte("created_at", sinceIso(days));
  request = request.order(order, { ascending }).limit(1000);
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

async function getMetrics(orgId = currentOrgId(), days = currentDays()) {
  if (!orgId) return {
    conversations: [], leads: [], appointments: [], followups: [],
    chats: 0, leadCount: 0, confirmed: 0, requested: 0, attention: 0,
    conversion: 0, automated: 0, response: 0, value: 0, recovered: 0,
  };

  const [conversations, leads, appointments, followups] = await Promise.all([
    fetchRows("conversations", { orgId, days }),
    fetchRows("leads", { orgId, days }),
    fetchRows("appointments", { orgId, days }),
    fetchRows("followups", { orgId, days }),
  ]);

  const confirmedRows = appointments.filter((row) => row.status === "Confirmada");
  const chats = conversations.length;
  const leadCount = leads.length;
  return {
    conversations, leads, appointments, followups,
    chats,
    leadCount,
    confirmed: confirmedRows.length,
    requested: appointments.filter((row) => row.status === "Solicitada").length,
    attention: conversations.filter((row) => row.status === "Requiere atención").length,
    conversion: leadCount ? Math.round((confirmedRows.length / leadCount) * 100) : 0,
    automated: chats ? Math.round((conversations.filter((row) => row.automated).length / chats) * 100) : 0,
    response: chats ? conversations.reduce((sum, row) => sum + Number(row.response_seconds || 0), 0) / chats : 0,
    value: confirmedRows.reduce((sum, row) => sum + Number(row.value || 0), 0),
    recovered: followups.filter((row) => row.status === "Recuperado").length,
  };
}

async function loadOrganizations() {
  const { data, error } = await supabase.from("organizations").select("*").order("created_at");
  if (error) throw error;
  state.organizations = data || [];
  $("orgSelect").innerHTML = state.organizations.length
    ? state.organizations.map((org) => `<option value="${org.id}">${esc(org.name)}</option>`).join("")
    : '<option value="">Sin negocios asignados</option>';
  updateOrgBadge();
}

function updateOrgBadge() {
  const org = state.organizations.find((row) => row.id === currentOrgId());
  $("orgBadge").textContent = org?.initials || "NX";
  if (org?.color) {
    $("orgBadge").style.color = org.color;
    $("orgBadge").style.background = org.color + "18";
  }
}

async function loadIdentity() {
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, platform_role")
    .single();

  if (profileError && profileError.code !== "PGRST116") throw profileError;
  state.profile = profileData || null;

  const { data: adminResult, error: adminError } = await supabase.rpc("is_platform_admin");
  if (adminError) throw adminError;
  state.isAdmin = adminResult === true;

  $("profileName").textContent = state.profile?.full_name || "Usuario NEXO";
  $("profileRole").textContent = state.isAdmin ? "Super Admin" : "Cliente NEXO";
  $("adminNav").classList.toggle("hidden", !state.isAdmin);
}

function emptyState(title = "Todavía no hay datos reales en esta sección.", detail = "Los registros aparecerán aquí cuando conectemos el negocio.") {
  return `<div class="empty"><strong>${esc(title)}</strong>${esc(detail)}</div>`;
}

async function renderOverview() {
  const m = await getMetrics();
  state.currentRows = m.conversations;

  const attentionRows = m.conversations
    .filter((row) => row.status === "Requiere atención")
    .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)))
    .slice(0, 6);

  const funnel = [
    ["Conversaciones", m.chats, 100],
    ["Leads identificados", m.leadCount, m.chats ? (m.leadCount / m.chats) * 100 : 0],
    ["Citas confirmadas", m.confirmed, m.chats ? (m.confirmed / m.chats) * 100 : 0],
  ];

  $("content").innerHTML = `
    <div class="stats-grid">
      ${statCard("Conversaciones", m.chats, `${m.automated}% con atención automática`)}
      ${statCard("Nuevos leads", m.leadCount, "Oportunidades identificadas")}
      ${statCard("Citas confirmadas", m.confirmed, `${m.requested} solicitudes por confirmar`)}
      ${statCard("Conversión a cita", m.conversion + "%", "Citas confirmadas / leads", true)}
    </div>

    <div class="grid-two">
      <section class="card">
        <div class="card-head">
          <div><h2>Necesitan tu atención</h2><p>Conversaciones transferidas a una persona</p></div>
          <span class="count">${m.attention} pendientes</span>
        </div>
        <div class="rows">
          ${attentionRows.length ? attentionRows.map((row) => `
            <div class="item-row">
              <div><strong>${esc(row.name)}</strong><small>${esc(row.service)}</small></div>
              <div class="muted">${esc(row.source)}</div>
              <div>${pill(row.status)}</div>
              <div class="muted">${dateTime(row.last_message_at)}</div>
            </div>
          `).join("") : emptyState("No hay conversaciones pendientes.", "Cuando un asistente necesite intervención humana aparecerá aquí.")}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>De conversación a cita</h2><p>Así avanzan tus oportunidades</p></div></div>
        <div class="funnel">
          ${funnel.map(([label, value, width]) => `
            <div class="funnel-step">
              <div class="funnel-line"><span>${label}</span><b>${value}</b></div>
              <div class="track"><i style="width:${Math.max(0, Math.min(100, width))}%"></i></div>
            </div>
          `).join("")}
        </div>
        <div class="value-box"><span>Valor estimado de citas confirmadas</span><strong>${money(m.value)}</strong></div>
      </section>
    </div>

    <section class="card">
      <div class="card-head"><div><h2>Resumen operativo</h2><p>Indicadores del período seleccionado</p></div></div>
      <div class="rows">
        <div class="item-row">
          <div><strong>Respuesta media</strong><small>Primera respuesta registrada</small></div>
          <div class="muted">${m.response.toFixed(1)} segundos</div>
          <div>${pill(m.automated + "% automático")}</div>
          <div class="muted">${m.recovered} recuperados</div>
        </div>
      </div>
    </section>
  `;
}

function filterRows(rows, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) =>
    [row.name, row.service, row.source, row.status, row.stage]
      .filter(Boolean).join(" ").toLowerCase().includes(needle)
  );
}

async function renderTablePage(type) {
  const table = type === "appointments" ? "appointments" : type === "followups" ? "followups" : type;
  const order = type === "appointments" ? "starts_at" : type === "followups" ? "due_at" : type === "conversations" ? "last_message_at" : "created_at";
  const rows = await fetchRows(table, { order, ascending: type === "appointments" || type === "followups" });
  state.currentRows = rows;

  const config = {
    conversations: {
      title: "Conversaciones",
      cols: ["Contacto", "Consulta", "Origen", "Estado", "Actividad"],
      cells: (row) => [`<b>${esc(row.name)}</b>`, esc(row.service), esc(row.source), pill(row.status), dateTime(row.last_message_at)],
    },
    leads: {
      title: "Leads",
      cols: ["Contacto", "Servicio", "Origen", "Etapa", "Valor estimado"],
      cells: (row) => [`<b>${esc(row.name)}</b>`, esc(row.service), esc(row.source), leadStageSelect(row), money(row.value)],
    },
    appointments: {
      title: "Citas y reservas",
      cols: ["Contacto", "Servicio", "Fecha", "Estado", "Valor estimado"],
      cells: (row) => [`<b>${esc(row.name)}</b>`, esc(row.service), dateTime(row.starts_at), appointmentStatusSelect(row), money(row.value)],
    },
    followups: {
      title: "Seguimientos",
      cols: ["Contacto", "Servicio", "Fecha objetivo", "Estado", "Creado"],
      cells: (row) => [`<b>${esc(row.name)}</b>`, esc(row.service), dateTime(row.due_at), followupStatusSelect(row), shortDate(row.created_at)],
    },
  }[type];

  $("content").innerHTML = `
    <div class="table-toolbar">
      <label class="search"><input id="tableSearch" type="search" placeholder="Buscar contacto o servicio" /></label>
      <span class="muted" id="rowCount">${rows.length} registros</span>
    </div>
    <section class="card">
      <div class="card-head"><div><h2>${config.title}</h2><p>Información real del período seleccionado</p></div></div>
      <div id="tableContainer"></div>
    </section>
  `;

  const draw = (visibleRows) => {
    $("rowCount").textContent = `${visibleRows.length} registros`;
    $("tableContainer").innerHTML = visibleRows.length ? `
      <div class="table-wrap">
        <table>
          <thead><tr>${config.cols.map((col) => `<th>${col}</th>`).join("")}</tr></thead>
          <tbody>
            ${visibleRows.map((row) => `<tr>${config.cells(row).map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
    ` : emptyState();
    bindStatusControls(type);
  };

  draw(rows);
  $("tableSearch").addEventListener("input", (event) => draw(filterRows(rows, event.target.value)));
}

function leadStageSelect(row) {
  const stages = ["Nuevo", "Calificado", "En seguimiento", "Reservado", "Perdido"];
  return `<select class="status-select status-control" data-type="leads" data-id="${row.id}">${stages.map((stage) => `<option ${stage === row.stage ? "selected" : ""}>${stage}</option>`).join("")}</select>`;
}

function appointmentStatusSelect(row) {
  const statuses = ["Solicitada", "Confirmada", "Cancelada", "Completada", "No asistió"];
  return `<select class="status-select status-control" data-type="appointments" data-id="${row.id}">${statuses.map((status) => `<option ${status === row.status ? "selected" : ""}>${status}</option>`).join("")}</select>`;
}

function followupStatusSelect(row) {
  const statuses = ["Pendiente", "Recuperado", "Cerrado"];
  return `<select class="status-select status-control" data-type="followups" data-id="${row.id}">${statuses.map((status) => `<option ${status === row.status ? "selected" : ""}>${status}</option>`).join("")}</select>`;
}

function bindStatusControls(type) {
  document.querySelectorAll(".status-control").forEach((select) => {
    select.addEventListener("change", async () => {
      const table = select.dataset.type;
      const id = select.dataset.id;
      const field = table === "leads" ? "stage" : "status";
      select.disabled = true;
      try {
        const { error } = await supabase.from(table).update({ [field]: select.value }).eq("id", id);
        if (error) throw error;
        showToast("Cambio guardado.");
      } catch (error) {
        showError(error.message || "No pudimos guardar el cambio.");
        await renderTablePage(type);
      } finally {
        select.disabled = false;
      }
    });
  });
}

async function renderMetrics() {
  const m = await getMetrics();
  state.currentRows = m.conversations;

  const countBy = (rows, field) => rows.reduce((acc, row) => {
    const key = row[field] || "Sin clasificar";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const services = Object.entries(countBy(m.conversations, "service")).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const sources = Object.entries(countBy(m.conversations, "source")).sort((a, b) => b[1] - a[1]);

  const ranking = (items, total) => items.length ? items.map(([label, value]) => `
    <div>
      <div class="metric-line"><span>${esc(label)}</span><b>${value}</b></div>
      <div class="metric-track"><i style="width:${total ? Math.min(100, (value / total) * 100) : 0}%"></i></div>
    </div>
  `).join("") : emptyState();

  $("content").innerHTML = `
    <div class="stats-grid">
      ${statCard("Conversaciones", m.chats, "Iniciadas en el período")}
      ${statCard("Leads", m.leadCount, "Registrados en el período")}
      ${statCard("Automatización", m.automated + "%", "Conversaciones atendidas automáticamente")}
      ${statCard("Conversión", m.conversion + "%", "Citas confirmadas / leads", true)}
    </div>
    <div class="grid-two">
      <section class="card">
        <div class="card-head"><div><h2>Consultas más frecuentes</h2><p>Servicios preguntados por tus contactos</p></div></div>
        <div class="metric-list">${ranking(services, m.chats)}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Origen de conversaciones</h2><p>Canales que generan actividad</p></div></div>
        <div class="metric-list">${ranking(sources, m.chats)}</div>
      </section>
    </div>
  `;
}

async function renderAdmin() {
  if (!state.isAdmin) {
    $("content").innerHTML = emptyState("Tu cuenta no tiene permisos de plataforma.", "Esta vista está reservada para administradores NEXO.");
    return;
  }

  const rows = [];
  for (const org of state.organizations) {
    rows.push({ org, metrics: await getMetrics(org.id, currentDays()) });
  }
  state.currentRows = rows.map(({ org, metrics }) => ({
    organization: org.name, conversations: metrics.chats, leads: metrics.leadCount, appointments: metrics.confirmed,
  }));

  const totalChats = rows.reduce((sum, row) => sum + row.metrics.chats, 0);
  const totalLeads = rows.reduce((sum, row) => sum + row.metrics.leadCount, 0);
  const totalAppointments = rows.reduce((sum, row) => sum + row.metrics.confirmed, 0);

  $("content").innerHTML = `
    <div class="stats-grid">
      ${statCard("Negocios", state.organizations.length, "Organizaciones visibles")}
      ${statCard("Conversaciones", totalChats, "Actividad total")}
      ${statCard("Leads", totalLeads, "Oportunidades")}
      ${statCard("Citas confirmadas", totalAppointments, "Total del período", true)}
    </div>
    <section class="card">
      <div class="card-head"><div><h2>Negocios en NEXO</h2><p>Vista del administrador de plataforma</p></div></div>
      ${rows.length ? `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Negocio</th><th>Asistente</th><th>Conversaciones</th><th>Leads</th><th>Citas</th><th>Pendientes</th></tr></thead>
            <tbody>
              ${rows.map(({ org, metrics }) => `
                <tr>
                  <td><b>${esc(org.name)}</b><br><span class="muted">${esc(org.sector)}</span></td>
                  <td>${esc(org.assistant)}</td>
                  <td>${metrics.chats}</td>
                  <td>${metrics.leadCount}</td>
                  <td>${metrics.confirmed}</td>
                  <td>${metrics.attention}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : emptyState("No hay negocios creados.", "Cuando agreguemos clientes aparecerán aquí.")}
    </section>
  `;
}

async function render() {
  clearError();
  const meta = pageMeta[state.page];
  $("breadcrumb").textContent = meta[0];
  $("pageEyebrow").textContent = meta[1];
  $("pageTitle").textContent = meta[2];
  $("pageSubtitle").textContent = meta[3];
  updateOrgBadge();

  $("content").innerHTML = '<div class="empty"><strong>Cargando…</strong>Consultando NEXO Platform.</div>';

  try {
    if (state.page === "overview") await renderOverview();
    else if (["conversations", "leads", "appointments", "followups"].includes(state.page)) await renderTablePage(state.page);
    else if (state.page === "metrics") await renderMetrics();
    else if (state.page === "admin") await renderAdmin();
  } catch (error) {
    showError(error.message || "No pudimos cargar la información.");
    $("content").innerHTML = emptyState("No pudimos cargar esta vista.", "Revisa la conexión e inténtalo de nuevo.");
  }
}

function exportCsv() {
  const rows = state.currentRows || [];
  if (!rows.length) {
    showToast("No hay registros para exportar.");
    return;
  }
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const cell = (value) => {
    let str = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
    if (/^[=+@\-\t\r]/.test(str)) str = "'" + str;
    return '"' + str.replaceAll('"', '""') + '"';
  };
  const csv = "\uFEFF" + [headers.map(cell).join(","), ...rows.map((row) => headers.map((key) => cell(row[key])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `NEXO_${state.page}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function enterApp(session) {
  state.session = session;
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("topEmail").textContent = session.user.email || "";
  await loadIdentity();
  await loadOrganizations();
  await render();
}

async function boot() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await enterApp(session);
  } else {
    $("loginView").classList.remove("hidden");
    $("appView").classList.add("hidden");
  }
}

$("magicButton").addEventListener("click", async () => {
  const email = $("emailInput").value.trim();
  const box = $("loginMessage");
  box.className = "message hidden";

  if (!email) {
    box.textContent = "Escribe tu correo.";
    box.className = "message error";
    return;
  }

  $("magicButton").disabled = true;
  $("magicButton").textContent = "Enviando…";
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
    box.textContent = "Te enviamos un enlace de acceso. Revisa tu correo.";
    box.className = "message ok";
  } catch (error) {
    box.textContent = error.message || "No pudimos enviar el enlace.";
    box.className = "message error";
  } finally {
    $("magicButton").disabled = false;
    $("magicButton").textContent = "Enviarme un enlace de acceso";
  }
});

$("passwordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const box = $("loginMessage");
  box.className = "message hidden";
  const { data, error } = await supabase.auth.signInWithPassword({
    email: $("emailInput").value.trim(),
    password: $("passwordInput").value,
  });
  if (error) {
    box.textContent = error.message;
    box.className = "message error";
    return;
  }
  if (data.session) await enterApp(data.session);
});

$("logoutButton").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.reload();
});

$("refreshButton").addEventListener("click", async () => {
  await loadOrganizations();
  await render();
  showToast("Datos actualizados.");
});

$("orgSelect").addEventListener("change", render);
$("periodSelect").addEventListener("change", render);
$("exportButton").addEventListener("click", exportCsv);

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.page === "admin" && !state.isAdmin) return;
    state.page = button.dataset.page;
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
    document.body.classList.remove("sidebar-open");
    render();
  });
});

$("menuButton").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session && !state.session) enterApp(session);
  if (event === "SIGNED_OUT") window.location.reload();
});

boot();
