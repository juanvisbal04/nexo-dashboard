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
    conversion: 0, automated: 0, response: 0, value: 0, recovered: 0, cancelled: 0, noShow: 0,
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
    cancelled: appointments.filter((row) => row.status === "Cancelada").length,
    noShow: appointments.filter((row) => row.status === "No asistió").length,
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

  const displayName = state.profile?.full_name || "Usuario NEXO";
  $("profileName").textContent = displayName;
  $("profileRole").textContent = state.isAdmin ? "Super Admin" : "Cliente NEXO";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "NX";
  if ($("profileAvatar")) $("profileAvatar").textContent = initials;
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
    [row.name, row.service, row.source, row.status, row.stage, row.phone, row.contacts?.phone]
      .filter(Boolean).join(" ").toLowerCase().includes(needle)
  );
}

async function fetchDetailedRows(type) {
  const orgId = currentOrgId();
  const days = currentDays();
  if (!orgId) return [];

  const since = sinceIso(days);
  const table = type === "appointments" ? "appointments" : type === "followups" ? "followups" : type;
  const order = type === "appointments" ? "starts_at" : type === "followups" ? "due_at" : type === "conversations" ? "last_message_at" : "created_at";
  const ascending = type === "appointments" || type === "followups";

  let select = "*";
  if (["conversations", "leads", "appointments", "followups"].includes(type)) {
    select = "*, contacts(id,name,phone,email)";
  }

  let request = supabase
    .from(table)
    .select(select)
    .eq("organization_id", orgId)
    .gte("created_at", since)
    .order(order, { ascending })
    .limit(1000);

  const { data, error } = await request;
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    phone: row.contacts?.phone || "",
    contact_name: row.contacts?.name || row.name || "",
  }));
}

function phoneCell(row) {
  const phone = row.phone || row.contacts?.phone || "";
  if (!phone) return '<span class="muted">Sin número</span>';
  const digits = String(phone).replace(/\D/g, "");
  return `<div class="phone-cell"><b>${esc(phone)}</b><a href="https://wa.me/${digits}" target="_blank" rel="noopener">WhatsApp</a></div>`;
}

function chatAction(row) {
  if (!row.contact_id) return '<span class="muted">—</span>';
  return `<button class="chat-button" data-contact-id="${row.contact_id}" data-conversation-id="${row.id || ""}">Ver chat</button>`;
}

async function openContactChat(contactId) {
  try {
    let modal = document.getElementById("chatModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "chatModal";
      modal.className = "chat-modal hidden";
      modal.innerHTML = `
        <div class="chat-backdrop" data-close-chat></div>
        <section class="chat-panel">
          <div class="chat-header">
            <div>
              <span class="eyebrow">HISTORIAL DEL CONTACTO</span>
              <h2 id="chatTitle">Conversación</h2>
              <div id="chatPhone" class="chat-phone"></div>
            </div>
            <button class="chat-close" data-close-chat aria-label="Cerrar">×</button>
          </div>
          <div id="chatBody" class="chat-body"><div class="empty">Cargando conversación…</div></div>
        </section>
      `;
      document.body.appendChild(modal);
      modal.querySelectorAll("[data-close-chat]").forEach((el) => el.addEventListener("click", () => modal.classList.add("hidden")));
    }

    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");

    const [{ data: contact, error: contactError }, { data: conversations, error: convError }] = await Promise.all([
      supabase.from("contacts").select("id,name,phone,email").eq("id", contactId).single(),
      supabase.from("conversations").select("id,created_at,last_message_at").eq("organization_id", currentOrgId()).eq("contact_id", contactId).order("created_at", { ascending: true }),
    ]);
    if (contactError) throw contactError;
    if (convError) throw convError;

    const ids = (conversations || []).map((row) => row.id);
    let messages = [];
    if (ids.length) {
      const result = await supabase.from("messages").select("id,conversation_id,sender,content,created_at").in("conversation_id", ids).order("created_at", { ascending: true }).limit(5000);
      if (result.error) throw result.error;
      messages = result.data || [];
    }

    $("chatTitle").textContent = contact?.name || "Contacto";
    const phone = contact?.phone || "";
    const digits = String(phone).replace(/\D/g, "");
    $("chatPhone").innerHTML = phone
      ? `<span>${esc(phone)}</span><a href="https://wa.me/${digits}" target="_blank" rel="noopener">Abrir WhatsApp</a>`
      : '<span>Sin número registrado</span>';

    $("chatBody").innerHTML = messages.length
      ? messages.map((msg) => {
          const side = msg.sender === "contact" ? "in" : msg.sender === "human" ? "human" : "out";
          const assistantName = (state.organizations.find((o) => o.id === currentOrgId()) || {}).assistant || "Asistente";\n          const label = msg.sender === "contact" ? "Cliente" : msg.sender === "human" ? "Humano" : msg.sender === "system" ? "Sistema" : assistantName;
          return `
            <div class="chat-message ${side}">
              <div class="bubble">
                <small>${esc(label)}</small>
                <p>${esc(msg.content)}</p>
                <time>${dateTime(msg.created_at)}</time>
              </div>
            </div>
          `;
        }).join("")
      : emptyState("No hay mensajes guardados.", "Este contacto aún no tiene historial disponible.");

    $("chatBody").scrollTop = $("chatBody").scrollHeight;
  } catch (error) {
    showError(error.message || "No pudimos abrir el historial del contacto.");
  }
}

function bindChatButtons() {
  document.querySelectorAll(".chat-button").forEach((button) => {
    button.addEventListener("click", () => openContactChat(button.dataset.contactId));
  });
}

async function renderTablePage(type) {
  const rows = await fetchDetailedRows(type);
  state.currentRows = rows.map((row) => ({
    ...row,
    phone: row.phone || row.contacts?.phone || "",
  }));

  const config = {
    conversations: {
      title: "Conversaciones",
      cols: ["Contacto", "Teléfono", "Consulta", "Origen", "Estado", "Actividad", "Chat"],
      cells: (row) => [
        `<b>${esc(row.contact_name || row.name)}</b>`,
        phoneCell(row),
        esc(row.service),
        esc(row.source),
        pill(row.status),
        dateTime(row.last_message_at),
        chatAction(row),
      ],
    },
    leads: {
      title: "Leads",
      cols: ["Contacto", "Teléfono", "Servicio", "Origen", "Etapa", "Valor", "Chat"],
      cells: (row) => [
        `<b>${esc(row.contact_name || row.name)}</b>`,
        phoneCell(row),
        esc(row.service),
        esc(row.source),
        leadStageSelect(row),
        money(row.value),
        chatAction(row),
      ],
    },
    appointments: {
      title: "Citas y reservas",
      cols: ["Contacto", "Teléfono", "Servicio", "Fecha", "Estado", "Valor", "Chat"],
      cells: (row) => [
        `<b>${esc(row.contact_name || row.name)}</b>`,
        phoneCell(row),
        esc(row.service),
        dateTime(row.starts_at),
        appointmentStatusSelect(row),
        money(row.value),
        chatAction(row),
      ],
    },
    followups: {
      title: "Seguimientos",
      cols: ["Contacto", "Teléfono", "Servicio", "Fecha objetivo", "Estado", "Creado", "Chat"],
      cells: (row) => [
        `<b>${esc(row.contact_name || row.name)}</b>`,
        phoneCell(row),
        esc(row.service),
        dateTime(row.due_at),
        followupStatusSelect(row),
        shortDate(row.created_at),
        chatAction(row),
      ],
    },
  }[type];

  $("content").innerHTML = `
    <div class="table-toolbar">
      <label class="search"><input id="tableSearch" type="search" placeholder="Buscar nombre, teléfono o servicio" /></label>
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
    bindChatButtons();
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
  const appointmentStatuses = Object.entries(countBy(m.appointments, "status")).sort((a, b) => b[1] - a[1]);

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
    <div class="stats-grid">
      ${statCard("Citas confirmadas", m.confirmed, money(m.value) + " estimados")}
      ${statCard("Canceladas", m.cancelled, "Citas canceladas")}
      ${statCard("No asistió", m.noShow, "Ausencias registradas")}
      ${statCard("Recuperados", m.recovered, "Seguimientos recuperados", true)}
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
    <div class="grid-two">
      <section class="card">
        <div class="card-head"><div><h2>Estado de citas</h2><p>Distribución de reservas del período</p></div></div>
        <div class="metric-list">${ranking(appointmentStatuses, m.appointments.length)}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Rendimiento de ${esc((state.organizations.find((o) => o.id === currentOrgId()) || {}).assistant || "tu asistente")}</h2><p>Indicadores operativos</p></div></div>
        <div class="rows">
          <div class="item-row"><div><strong>Automatización</strong><small>Conversaciones sin intervención humana</small></div><div class="muted">${m.automated}%</div><div></div><div></div></div>
          <div class="item-row"><div><strong>Respuesta media</strong><small>Promedio registrado</small></div><div class="muted">${m.response.toFixed(1)} s</div><div></div><div></div></div>
          <div class="item-row"><div><strong>Escalaciones humanas</strong><small>Conversaciones que requirieron atención</small></div><div class="muted">${m.attention}</div><div></div><div></div></div>
        </div>
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

    <div class="grid-two admin-grid">
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

      <section class="card access-card">
        <div class="card-head"><div><h2>Crear acceso de cliente</h2><p>Genera un enlace privado sin depender de correos de Supabase</p></div></div>
        <form id="clientAccessForm" class="admin-form">
          <label>Nombre</label>
          <input id="clientName" type="text" placeholder="Ej. Isabel Gómez" required />
          <label>Correo</label>
          <input id="clientEmail" type="email" placeholder="cliente@correo.com" required />
          <label>Empresa</label>
          <select id="clientOrg" required>
            ${state.organizations.filter(o => o.name !== "NEXO Internal").map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join("")}
          </select>
          <label>Rol</label>
          <select id="clientRole">
            <option value="owner">Propietario</option>
            <option value="admin">Administrador</option>
            <option value="viewer">Solo lectura</option>
          </select>
          <button id="createClientAccess" class="btn primary" type="submit">Generar acceso</button>
        </form>
        <div id="clientAccessResult" class="access-result hidden"></div>
      </section>
    </div>
  `;

  $("clientAccessForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("createClientAccess");
    const resultBox = $("clientAccessResult");
    resultBox.className = "access-result hidden";
    button.disabled = true;
    button.textContent = "Creando…";
    try {
      const { data, error } = await supabase.functions.invoke("admin-client-access", {
        body: {
          full_name: $("clientName").value.trim(),
          email: $("clientEmail").value.trim(),
          organization_id: $("clientOrg").value,
          role: $("clientRole").value,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "No pudimos crear el acceso.");

      if (data.existing_user) {
        resultBox.innerHTML = `
          <strong>Acceso agregado</strong>
          <p>${esc(data.email)} ya tenía una cuenta NEXO. Se le agregó acceso a <b>${esc(data.organization_name)}</b> sin cambiar su contraseña.</p>
        `;
      } else {
        resultBox.innerHTML = `
          <strong>Enlace de activación listo</strong>
          <p>Envíaselo a <b>${esc(data.email)}</b>. Vence en 48 horas.</p>
          <div class="setup-link-row">
            <input id="generatedSetupLink" value="${esc(data.setup_url)}" readonly />
            <button id="copySetupLink" class="btn small" type="button">Copiar</button>
          </div>
        `;
        $("copySetupLink").addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(data.setup_url);
            showToast("Enlace copiado.");
          } catch {
            $("generatedSetupLink").select();
            document.execCommand("copy");
            showToast("Enlace copiado.");
          }
        });
      }
      resultBox.className = "access-result ok";
    } catch (error) {
      resultBox.innerHTML = `<strong>No pudimos crear el acceso</strong><p>${esc(error.message || "Inténtalo de nuevo.")}</p>`;
      resultBox.className = "access-result error";
    } finally {
      button.disabled = false;
      button.textContent = "Generar acceso";
    }
  });
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

function renderSetupActivation(token) {
  const card = document.querySelector(".login-card");
  card.innerHTML = `
    <div class="logo-wrap">
      <div class="logo-word">NE<span>X</span>O</div>
      <div class="logo-by">by Juan Visbal</div>
    </div>
    <div class="login-copy">
      <span class="eyebrow">ACTIVAR ACCESO</span>
      <h1>Crea tu contraseña.</h1>
      <p>Este enlace es privado y de un solo uso. Tu contraseña no será visible para NEXO ni para ChatGPT.</p>
    </div>
    <form id="setupForm">
      <label>Nueva contraseña</label>
      <input id="setupPassword" type="password" minlength="10" autocomplete="new-password" required placeholder="Mínimo 10 caracteres" />
      <label>Confirmar contraseña</label>
      <input id="setupConfirm" type="password" minlength="10" autocomplete="new-password" required placeholder="Repite la contraseña" />
      <button id="setupSubmit" class="btn primary" type="submit">Activar mi acceso</button>
    </form>
    <div id="setupMessage" class="message hidden"></div>
    <p class="security-note">Enlace válido por 48 horas y utilizable una sola vez.</p>
  `;

  $("setupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = $("setupPassword").value;
    const confirm = $("setupConfirm").value;
    const msg = $("setupMessage");
    msg.className = "message hidden";
    if (password !== confirm) {
      msg.textContent = "Las contraseñas no coinciden.";
      msg.className = "message error";
      return;
    }
    const button = $("setupSubmit");
    button.disabled = true;
    button.textContent = "Activando…";
    try {
      const response = await fetch(SUPABASE_URL + "/functions/v1/activate-client-access", {
        method: "POST",
        headers: { "content-type": "application/json", "apikey": SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos activar el acceso.");
      msg.textContent = "Acceso activado. Ya puedes iniciar sesión con tu correo y esta contraseña.";
      msg.className = "message ok";
      button.textContent = "Ir al login";
      button.disabled = false;
      button.type = "button";
      button.onclick = () => { window.location.href = window.location.origin; };
      $("setupPassword").disabled = true;
      $("setupConfirm").disabled = true;
    } catch (error) {
      msg.textContent = error.message || "No pudimos activar el acceso.";
      msg.className = "message error";
      button.disabled = false;
      button.textContent = "Activar mi acceso";
    }
  });
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
  const setupToken = new URLSearchParams(window.location.search).get("setup");
  if (setupToken) {
    $("loginView").classList.remove("hidden");
    $("appView").classList.add("hidden");
    renderSetupActivation(setupToken);
    return;
  }

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
