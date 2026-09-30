import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { renderCrm } from "./crm.js?v=20260930-crm25";

const SUPABASE_URL = "https://ixewnbjndguchunwcuhf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vFnLRe9cmnOcyz2Fivprhw_8UjBaRGL";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

const $ = (id) => document.getElementById(id);
const state = {
  page: "overview",
  organizations: [],
  orgRoles: {},
  commercialStages: {},
  profile: null,
  isAdmin: false,
  session: null,
  currentRows: [],
  pendingRealtimeRefresh: false,
  notifications: [],
  searchIndex: [],
  settingsOrgId: null,
  assistantProfiles: {},
  alertAckKeys: new Set(),
};
let realtimeChannel = null;
let realtimeTimer = null;

const UI_STATE_KEY = "nexo.dashboard.ui.v2";

function readStoredUiState() {
  try {
    return JSON.parse(localStorage.getItem(UI_STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistUiState() {
  const orgId = $("orgSelect")?.value || null;
  const period = $("periodSelect")?.value || "30";
  const value = { page: state.page, orgId, period, settingsOrgId: state.settingsOrgId || null };
  try { localStorage.setItem(UI_STATE_KEY, JSON.stringify(value)); } catch {}
  const nextHash = state.page && state.page !== "overview" ? "#" + state.page : "";
  if (window.location.hash !== nextHash) {
    history.replaceState(null, "", window.location.pathname + window.location.search + nextHash);
  }
}

function restoreUiState() {
  const saved = readStoredUiState();
  const hashPage = window.location.hash.replace(/^#/, "");
  const savedOrg = saved.orgId && state.organizations.some((org) => org.id === saved.orgId) ? saved.orgId : null;
  state.settingsOrgId = saved.settingsOrgId && state.organizations.some((org) => org.id === saved.settingsOrgId) ? saved.settingsOrgId : null;
  if (savedOrg) $("orgSelect").value = savedOrg;

  const allowedPeriods = new Set(["1","7","30","90"]);
  if (allowedPeriods.has(String(saved.period || ""))) $("periodSelect").value = String(saved.period);

  let page = pageMeta[hashPage] ? hashPage : (pageMeta[saved.page] ? saved.page : "overview");
  const adminOnly = new Set(["crm","clients","operations","audit","admin"]);
  if (adminOnly.has(page) && !state.isAdmin) page = "overview";
  if (state.isAdmin && isInternalOrg() && !["overview","crm","clients","operations","settings","audit","profile"].includes(page)) page = "overview";
  if ((!state.isAdmin || !isInternalOrg()) && ["clients","operations","audit","admin","crm"].includes(page)) page = "overview";
  if (page === "team" && !canManageCurrentOrgUsers()) page = "overview";
  state.page = page;
  updateNavigationAccess();
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === state.page));
  persistUiState();
}

const pageMeta = {
  overview: ["Inicio", "NEXO DASHBOARD", "Tu negocio, en perspectiva.", "Lo importante de tu operación en una sola vista."],
  conversations: ["Conversaciones", "ATENCIÓN AL CLIENTE", "Cada conversación cuenta.", "Consulta la actividad registrada por tus asistentes."],
  leads: ["Oportunidades", "NEXO SALES", "Oportunidades en movimiento.", "Leads identificados y su etapa actual."],
  appointments: ["Agenda", "NEXO BOOKING", "Tu agenda, bajo control.", "Solicitudes, citas y reservas."],
  followups: ["Seguimientos", "NEXO RECOVERY", "El siguiente paso importa.", "Oportunidades que necesitan una nueva acción."],
  metrics: ["Métricas", "NEXO ANALYTICS", "Entiende tus resultados.", "Vista analítica avanzada de la operación."],
  billing: ["Facturación", "NEXO BILLING", "Tus cobros y pagos, claros.", "Cuentas de cobro, vencimientos, pagos y documentos."],
  team: ["Usuarios", "CONTROL DE ACCESO", "Tu equipo, con el acceso correcto.", "Invita y administra usuarios de este dashboard."],
  crm: ["Ventas & Finanzas", "NEXO CRM", "Pipeline, ingresos y rentabilidad.", "Del prospecto al cliente activo y su economía en un solo módulo."],
  clients: ["Clientes", "NEXO CRM", "Tu cartera de clientes, organizada.", "Empresas, planes, accesos e implementación sin métricas repetidas."],
  operations: ["Operaciones", "NEXO OPERATIONS", "Lo que está pasando ahora.", "Conversaciones, oportunidades y agenda que requieren seguimiento."],
  settings: ["Configuración", "NEXO SETTINGS", "Cada negocio, bien configurado.", "Identidad, contacto, asistente, notificaciones y preferencias."],
  audit: ["Audit Log", "NEXO GOVERNANCE", "Cada cambio deja rastro.", "Historial administrativo de configuración, accesos, cobros e integraciones."],
  profile: ["Mi perfil", "CUENTA NEXO", "Tu perfil, bajo tu control.", "Foto, datos de contacto e información personal de tu acceso."],
  admin: ["Clientes", "NEXO CRM", "Tu cartera de clientes, organizada.", "Empresas, planes, accesos e implementación."],
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

function currentOrg() {
  return state.organizations.find((row) => row.id === currentOrgId()) || null;
}

function isInternalOrg(orgId = currentOrgId()) {
  const org = state.organizations.find((row) => row.id === orgId);
  return Boolean(org && org.name === "NEXO Internal");
}

function clientOrganizations({ activeOnly = true } = {}) {
  return state.organizations.filter((org) => {
    if (org.name === "NEXO Internal") return false;
    if (!activeOnly) return true;
    if (state.isAdmin && Object.keys(state.commercialStages).length) {
      return state.commercialStages[org.id] === "activo";
    }
    return org.status === "active";
  });
}

function metricOrgIds(orgId = currentOrgId()) {
  if (state.isAdmin && isInternalOrg(orgId)) return clientOrganizations().map((org) => org.id);
  return orgId ? [orgId] : [];
}

function currentOrgRole() {
  if (state.isAdmin) return "platform_admin";
  return state.orgRoles[currentOrgId()] || null;
}

function canManageCurrentOrgUsers() {
  if (state.isAdmin) return !isInternalOrg();
  return ["owner", "admin"].includes(currentOrgRole());
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

function trendChip(delta) {
  if (!delta) return "";
  const cls = delta.direction === "up" ? "positive" : delta.direction === "down" ? "negative" : "neutral";
  const arrow = delta.direction === "up" ? "↗" : delta.direction === "down" ? "↘" : "→";
  return `<span class="trend-chip ${cls}">${arrow} ${esc(delta.label)}</span>`;
}

function metricCard(label, value, detail, delta = null, accent = false) {
  return `
    <section class="card stat-card metric-card ${accent ? "accent" : ""}">
      <div class="stat-label"><span>${esc(label)}</span>${trendChip(delta)}</div>
      <div class="stat-value">${esc(value)}</div>
      <small>${esc(detail)}</small>
    </section>
  `;
}

function activityChart(series) {
  if (!series?.length) return emptyState("Aún no hay actividad suficiente.", "La tendencia aparecerá cuando existan registros en el período.");
  const max = Math.max(1, ...series.map((row) => Math.max(row.conversations, row.leads, row.appointments)));
  return `
    <div class="activity-chart">
      ${series.map((row) => `
        <div class="activity-day" title="${esc(row.date)} · ${row.conversations} conversaciones · ${row.leads} leads · ${row.appointments} citas">
          <div class="activity-bars">
            <i class="bar conversations" style="height:${Math.max(4, (row.conversations / max) * 100)}%"></i>
            <i class="bar leads" style="height:${Math.max(4, (row.leads / max) * 100)}%"></i>
            <i class="bar appointments" style="height:${Math.max(4, (row.appointments / max) * 100)}%"></i>
          </div>
          <span>${esc(row.date.slice(5))}</span>
        </div>
      `).join("")}
    </div>
    <div class="chart-legend"><span><i class="dot conversations"></i>Conversaciones</span><span><i class="dot leads"></i>Leads</span><span><i class="dot appointments"></i>Citas</span></div>
  `;
}

function healthBadge(health, compact = false) {
  if (!health || health.score === null) {
    return `<span class="health-badge neutral">${compact ? "Sin datos" : "Sin actividad"}</span>`;
  }
  return `<span class="health-badge ${health.tone}">${compact ? health.score : `${health.score}/100 · ${esc(health.level)}`}</span>`;
}

function alertCenterHtml(alerts, title = "Centro de alertas") {
  if (!alerts.length) {
    return `
      <section class="card alert-center">
        <div class="card-head"><div><h2>${esc(title)}</h2><p>Señales operativas del período</p></div><span class="health-badge good">Todo estable</span></div>
        <div class="alert-empty"><span>✓</span><div><b>Sin alertas activas</b><p>No detectamos situaciones que requieran revisión inmediata.</p></div></div>
      </section>
    `;
  }
  return `
    <section class="card alert-center">
      <div class="card-head"><div><h2>${esc(title)}</h2><p>Priorizadas por impacto operativo · puedes completar una alerta cuando ya fue revisada</p></div><span class="count">${alerts.length} alerta${alerts.length === 1 ? "" : "s"}</span></div>
      <div class="alert-list">
        ${alerts.slice(0, 8).map((alert) => `
          <div class="alert-item ${alert.tone}">
            <i></i>
            <div class="alert-item-copy"><b>${esc(alert.title)}</b><span>${esc(alert.detail)}</span></div>
            <div class="alert-item-actions">
              <button class="alert-open btn small" type="button" data-alert-page="${esc(alert.page || "overview")}" data-alert-org="${esc(alert.organization_id||"")}">Ver</button>
              <button class="alert-complete btn small" type="button"
                data-alert-org="${esc(alert.organization_id||"")}"
                data-alert-key="${esc(alert.alert_key||"")}"
                data-alert-type="${esc(alert.alert_type||"operational")}">Completar</button>
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function demandHeatmap(hourly) {
  const blocks = [
    { label: "Madrugada", start: 0, end: 6 },
    { label: "Mañana", start: 6, end: 12 },
    { label: "Tarde", start: 12, end: 18 },
    { label: "Noche", start: 18, end: 24 },
  ];
  const values = blocks.map((block) => ({
    ...block,
    count: hourly.filter((row) => row.hour >= block.start && row.hour < block.end).reduce((sum, row) => sum + row.count, 0),
  }));
  const max = Math.max(1, ...values.map((row) => row.count));
  return `
    <div class="demand-grid">
      ${values.map((row) => {
        const strength = row.count / max;
        const level = strength >= .75 ? 4 : strength >= .5 ? 3 : strength >= .25 ? 2 : row.count ? 1 : 0;
        return `<div class="demand-cell level-${level}"><span>${esc(row.label)}</span><b>${row.count}</b><small>conversaciones</small></div>`;
      }).join("")}
    </div>
  `;
}

function weekdayBars(days) {
  const max = Math.max(1, ...days.map((row) => row.count));
  return `
    <div class="weekday-bars">
      ${days.map((row) => `
        <div><span>${esc(row.day)}</span><i><b style="height:${Math.max(3, (row.count / max) * 100)}%"></b></i><strong>${row.count}</strong></div>
      `).join("")}
    </div>
  `;
}

function bindAlertNavigation() {
  document.querySelectorAll(".alert-open[data-alert-page]").forEach((button) => {
    button.addEventListener("click", async () => {
      const orgId=button.dataset.alertOrg;
      if(orgId && state.isAdmin && state.organizations.some((org)=>org.id===orgId) && !isInternalOrg(orgId)) {
        $("orgSelect").value=orgId;
        updateNavigationAccess();
      }
      const page = button.dataset.alertPage || "overview";
      state.page = page;
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
      persistUiState();
      await render();
    });
  });

  document.querySelectorAll(".alert-complete").forEach((button)=>{
    button.addEventListener("click",async()=>{
      const orgId=button.dataset.alertOrg||currentOrgId();
      const alertKey=button.dataset.alertKey;
      if(!orgId||!alertKey)return;
      button.disabled=true;button.textContent="Guardando…";
      try{
        const {error}=await supabase.from("alert_acknowledgements").upsert({
          organization_id:orgId,
          alert_key:alertKey,
          alert_type:button.dataset.alertType||"operational",
          status:"completed",
          resolved_by:state.session.user.id,
          resolved_at:new Date().toISOString(),
        },{onConflict:"organization_id,alert_key"});
        if(error)throw error;
        showToast("Alerta completada.");
        await render();
      }catch(error){showError(error.message||"No pudimos completar la alerta.");button.disabled=false;button.textContent="Completar";}
    });
  });
}

function rankingHtml(items, total) {
  return items.length ? items.map(([label, value]) => `
    <div>
      <div class="metric-line"><span>${esc(label)}</span><b>${value}</b></div>
      <div class="metric-track"><i style="width:${total ? Math.min(100, (value / total) * 100) : 0}%"></i></div>
    </div>
  `).join("") : emptyState();
}

function periodWindow(days, previous = false) {
  const currentStart = new Date(sinceIso(days));
  const now = new Date();
  const duration = Math.max(1, now.getTime() - currentStart.getTime());
  if (previous) {
    return {
      start: new Date(currentStart.getTime() - duration).toISOString(),
      end: currentStart.toISOString(),
    };
  }
  return { start: currentStart.toISOString(), end: now.toISOString() };
}

async function fetchMetricRows(table, orgIds, { start, end, order = "created_at", ascending = false, timeField = "created_at" } = {}) {
  if (!orgIds.length) return [];
  let request = supabase.from(table).select("*");
  request = orgIds.length === 1
    ? request.eq("organization_id", orgIds[0])
    : request.in("organization_id", orgIds);
  if (start) request = request.gte(timeField, start);
  if (end) request = request.lt(timeField, end);
  request = request.order(order, { ascending }).limit(5000);
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}

function percent(value, total) {
  return total ? Math.round((Number(value || 0) / Number(total)) * 100) : 0;
}

function median(values) {
  const nums = values.map(Number).filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!nums.length) return 0;
  const middle = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[middle] : (nums[middle - 1] + nums[middle]) / 2;
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || "Sin clasificar";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function localDateKey(value) {
  if (!value) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function buildActivitySeries(conversations, leads, appointments) {
  const map = new Map();
  const add = (date, field) => {
    const key = localDateKey(date);
    if (!key) return;
    if (!map.has(key)) map.set(key, { date: key, conversations: 0, leads: 0, appointments: 0 });
    map.get(key)[field] += 1;
  };
  conversations.forEach((row) => add(row.last_message_at || row.created_at, "conversations"));
  leads.forEach((row) => add(row.created_at, "leads"));
  appointments.forEach((row) => add(row.created_at, "appointments"));
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
}

function localHour(value) {
  if (!value) return null;
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota", hour: "2-digit", hour12: false,
  }).format(new Date(value));
  const numeric = Number(hour);
  return numeric === 24 ? 0 : numeric;
}

function localWeekday(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", weekday: "short",
  }).format(new Date(value)).replace(".", "");
}

function distributionByHour(rows) {
  const counts = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  rows.forEach((row) => {
    const hour = localHour(row.last_message_at || row.created_at);
    if (hour !== null && hour >= 0 && hour < 24) counts[hour].count += 1;
  });
  return counts;
}

function distributionByWeekday(rows) {
  const order = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
  const map = Object.fromEntries(order.map((day) => [day, 0]));
  rows.forEach((row) => {
    const day = localWeekday(row.last_message_at || row.created_at);
    if (day in map) map[day] += 1;
  });
  return order.map((day) => ({ day, count: map[day] || 0 }));
}

function operationalHealth(metrics) {
  if (!metrics.chats) {
    return { score: null, level: "Sin actividad", tone: "neutral", reasons: ["No hay conversaciones en el período seleccionado."] };
  }

  let score = 100;
  const reasons = [];

  if (metrics.escalationRate > 0) {
    const penalty = Math.min(24, metrics.escalationRate * 0.7);
    score -= penalty;
    if (metrics.attention > 0) reasons.push(`${metrics.attention} conversación${metrics.attention === 1 ? "" : "es"} requiere${metrics.attention === 1 ? "" : "n"} atención.`);
  }
  if (metrics.cancellationRate > 0) {
    score -= Math.min(18, metrics.cancellationRate * 0.45);
    if (metrics.cancelled > 0) reasons.push(`${metrics.cancelled} cita${metrics.cancelled === 1 ? "" : "s"} cancelada${metrics.cancelled === 1 ? "" : "s"}.`);
  }
  if (metrics.noShowRate > 0) {
    score -= Math.min(14, metrics.noShowRate * 0.45);
    if (metrics.noShow > 0) reasons.push(`${metrics.noShow} no-show registrado${metrics.noShow === 1 ? "" : "s"}.`);
  }
  if (metrics.response > 60) {
    score -= Math.min(20, (metrics.response - 60) / 6);
    reasons.push(`Respuesta media de ${metrics.response.toFixed(1)} s.`);
  }
  if (metrics.requested > 0) {
    score -= Math.min(10, metrics.requested * 2);
    reasons.push(`${metrics.requested} solicitud${metrics.requested === 1 ? "" : "es"} de cita pendiente${metrics.requested === 1 ? "" : "s"}.`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score >= 85 ? "Estable" : score >= 70 ? "Monitorear" : "Requiere atención";
  const tone = score >= 85 ? "good" : score >= 70 ? "watch" : "risk";
  if (!reasons.length) reasons.push("Sin alertas operativas relevantes en el período.");
  return { score, level, tone, reasons };
}

function buildOperationalAlerts(metrics, organizationName = "", organizationId = currentOrgId()) {
  const alerts = [];
  const prefix = organizationName ? organizationName + " · " : "";
  const period = currentDays();
  const pushAlert = (type, payload) => alerts.push({
    organization_id: organizationId,
    alert_type: type,
    alert_key: payload.alert_key,
    ...payload,
  });

  if (metrics.attention > 0) pushAlert("attention", {
    alert_key: `${period}:attention:${metrics.attention}`,
    priority: 3, tone: "risk", title: prefix + "Atención humana pendiente",
    detail: `${metrics.attention} conversación${metrics.attention === 1 ? "" : "es"} requiere${metrics.attention === 1 ? "" : "n"} intervención.`,
    page: "conversations",
  });
  if (metrics.requested > 0) pushAlert("appointments_pending", {
    alert_key: `${period}:appointments-pending:${metrics.requested}`,
    priority: 2, tone: "watch", title: prefix + "Citas por confirmar",
    detail: `${metrics.requested} solicitud${metrics.requested === 1 ? "" : "es"} todavía pendiente${metrics.requested === 1 ? "" : "s"}.`,
    page: "appointments",
  });
  if (metrics.noShow > 0) pushAlert("no_show", {
    alert_key: `${period}:no-show:${metrics.noShow}`,
    priority: 2, tone: "watch", title: prefix + "No-show detectado",
    detail: `${metrics.noShow} ausencia${metrics.noShow === 1 ? "" : "s"} registrada${metrics.noShow === 1 ? "" : "s"} en el período.`,
    page: "appointments",
  });
  if (metrics.cancellationRate >= 20 && metrics.appointmentCount >= 3) pushAlert("cancellation_rate", {
    alert_key: `${period}:cancel:${metrics.cancelled}:${metrics.appointmentCount}`,
    priority: 2, tone: "watch", title: prefix + "Cancelación elevada",
    detail: `${metrics.cancellationRate}% de las citas registradas están canceladas.`,
    page: "appointments",
  });
  if (metrics.response > 120 && metrics.chats >= 3) pushAlert("response_time", {
    alert_key: `${period}:response:${Math.round(metrics.response)}:${metrics.chats}`,
    priority: 1, tone: "info", title: prefix + "Respuesta más lenta",
    detail: `La respuesta media está en ${metrics.response.toFixed(1)} segundos.`,
    page: "conversations",
  });
  if (!metrics.chats) pushAlert("inactivity", {
    alert_key: `${period}:inactive:0`,
    priority: 1, tone: "neutral", title: prefix + "Sin actividad",
    detail: "No hay conversaciones registradas en el período seleccionado.",
    page: "overview",
  });

  return alerts.sort((a, b) => b.priority - a.priority);
}

async function loadAlertAcknowledgements(orgIds) {
  state.alertAckKeys = new Set();
  const ids=(orgIds||[]).filter(Boolean);
  if(!ids.length)return;
  let request=supabase.from("alert_acknowledgements").select("organization_id,alert_key,status");
  request=ids.length===1?request.eq("organization_id",ids[0]):request.in("organization_id",ids);
  const {data,error}=await request;
  if(error)throw error;
  state.alertAckKeys=new Set((data||[]).filter((row)=>row.status==="completed"||row.status==="dismissed").map((row)=>`${row.organization_id}:${row.alert_key}`));
}

function visibleOperationalAlerts(alerts) {
  return (alerts||[]).filter((alert)=>!state.alertAckKeys.has(`${alert.organization_id}:${alert.alert_key}`));
}

function busiestLabel(hourly) {
  const best = [...hourly].sort((a, b) => b.count - a.count)[0];
  if (!best || !best.count) return "Sin datos";
  const end = (best.hour + 1) % 24;
  return `${String(best.hour).padStart(2, "0")}:00–${String(end).padStart(2, "0")}:00`;
}

function busiestDayLabel(days) {
  const best = [...days].sort((a, b) => b.count - a.count)[0];
  if (!best || !best.count) return "Sin datos";
  return best.day.charAt(0).toUpperCase() + best.day.slice(1);
}

function summarizeMetricRows({ conversations, leads, appointments, followups, messages, orgIds }) {
  const confirmedRows = appointments.filter((row) => ["Confirmada", "Completada"].includes(row.status));
  const requestedRows = appointments.filter((row) => row.status === "Solicitada");
  const cancelledRows = appointments.filter((row) => row.status === "Cancelada");
  const noShowRows = appointments.filter((row) => row.status === "No asistió");
  const recoveredRows = followups.filter((row) => row.status === "Recuperado");
  const responseValues = conversations.map((row) => Number(row.response_seconds || 0)).filter((value) => value > 0);
  const chats = conversations.length;
  const leadCount = leads.length;
  const appointmentCount = appointments.length;
  const contactCount = new Set(conversations.map((row) => row.contact_id).filter(Boolean)).size;
  const activeOrgIds = new Set(
    [...conversations, ...leads, ...appointments, ...followups]
      .map((row) => row.organization_id).filter(Boolean)
  );
  const messageCount = messages.length;
  const inboundMessages = messages.filter((row) => row.sender === "contact").length;
  const humanMessages = messages.filter((row) => row.sender === "human").length;
  const assistantMessages = messages.filter((row) => !["contact", "human", "system"].includes(row.sender)).length;
  const estimatedValue = confirmedRows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const pipelineValue = leads.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const avgResponse = responseValues.length ? responseValues.reduce((a, b) => a + b, 0) / responseValues.length : 0;

  return {
    orgIds,
    conversations, leads, appointments, followups, messages,
    chats,
    messageCount,
    inboundMessages,
    humanMessages,
    assistantMessages,
    contactCount,
    leadCount,
    confirmed: confirmedRows.length,
    requested: requestedRows.length,
    appointmentCount,
    attention: conversations.filter((row) => row.status === "Requiere atención").length,
    conversion: percent(confirmedRows.length, leadCount),
    leadRate: percent(leadCount, chats),
    bookingRate: percent(confirmedRows.length, chats),
    confirmationRate: percent(confirmedRows.length, appointmentCount),
    automated: percent(conversations.filter((row) => row.automated).length, chats),
    escalationRate: percent(conversations.filter((row) => row.status === "Requiere atención").length, chats),
    response: avgResponse,
    medianResponse: median(responseValues),
    value: estimatedValue,
    pipelineValue,
    avgTicket: confirmedRows.length ? estimatedValue / confirmedRows.length : 0,
    recovered: recoveredRows.length,
    recoveryRate: percent(recoveredRows.length, followups.length),
    cancelled: cancelledRows.length,
    cancellationRate: percent(cancelledRows.length, appointmentCount),
    noShow: noShowRows.length,
    noShowRate: percent(noShowRows.length, appointmentCount),
    messagesPerConversation: chats ? messageCount / chats : 0,
    activeClientCount: activeOrgIds.size,
    totalClientCount: orgIds.length,
    services: countBy(conversations, "service"),
    sources: countBy(conversations, "source"),
    appointmentStatuses: countBy(appointments, "status"),
    leadStages: countBy(leads, "stage"),
    activitySeries: buildActivitySeries(conversations, leads, appointments),
    hourlyDistribution: distributionByHour(conversations),
    weekdayDistribution: distributionByWeekday(conversations),
  };
}

function metricDelta(current, previous, inverse = false) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (!prev) return cur ? { value: null, direction: "up", label: "Nuevo" } : { value: 0, direction: "flat", label: "0%" };
  const raw = ((cur - prev) / Math.abs(prev)) * 100;
  const rounded = Math.round(raw);
  const good = inverse ? rounded < 0 : rounded > 0;
  const bad = inverse ? rounded > 0 : rounded < 0;
  return {
    value: rounded,
    direction: good ? "up" : bad ? "down" : "flat",
    label: `${rounded > 0 ? "+" : ""}${rounded}%`,
  };
}

async function getMetrics(orgId = currentOrgId(), days = currentDays(), { comparison = true } = {}) {
  const orgIds = metricOrgIds(orgId);
  const current = periodWindow(days, false);
  const [conversations, leads, appointments, followups, messages] = await Promise.all([
    fetchMetricRows("conversations", orgIds, { ...current, order: "last_message_at", timeField: "last_message_at" }),
    fetchMetricRows("leads", orgIds, current),
    fetchMetricRows("appointments", orgIds, current),
    fetchMetricRows("followups", orgIds, current),
    fetchMetricRows("messages", orgIds, current),
  ]);
  const result = summarizeMetricRows({ conversations, leads, appointments, followups, messages, orgIds });

  if (!comparison) return result;

  const previousWindow = periodWindow(days, true);
  const [prevConversations, prevLeads, prevAppointments, prevFollowups, prevMessages] = await Promise.all([
    fetchMetricRows("conversations", orgIds, { ...previousWindow, order: "last_message_at", timeField: "last_message_at" }),
    fetchMetricRows("leads", orgIds, previousWindow),
    fetchMetricRows("appointments", orgIds, previousWindow),
    fetchMetricRows("followups", orgIds, previousWindow),
    fetchMetricRows("messages", orgIds, previousWindow),
  ]);
  const previous = summarizeMetricRows({
    conversations: prevConversations, leads: prevLeads, appointments: prevAppointments,
    followups: prevFollowups, messages: prevMessages, orgIds,
  });

  result.previous = previous;
  result.delta = {
    chats: metricDelta(result.chats, previous.chats),
    leads: metricDelta(result.leadCount, previous.leadCount),
    confirmed: metricDelta(result.confirmed, previous.confirmed),
    conversion: metricDelta(result.conversion, previous.conversion),
    value: metricDelta(result.value, previous.value),
    response: metricDelta(result.response, previous.response, true),
    attention: metricDelta(result.attention, previous.attention, true),
    cancellation: metricDelta(result.cancellationRate, previous.cancellationRate, true),
  };
  return result;
}

async function loadOrganizations() {
  const previous = $("orgSelect").value || null;
  const { data, error } = await supabase.from("organizations").select("*").order("created_at");
  if (error) throw error;
  state.organizations = (data || []).sort((a, b) => {
    if (a.name === "NEXO Internal") return -1;
    if (b.name === "NEXO Internal") return 1;
    return String(a.name).localeCompare(String(b.name), "es");
  });

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", state.session.user.id);
  if (membershipError) throw membershipError;
  state.orgRoles = Object.fromEntries((memberships || []).map((row) => [row.organization_id, row.role]));

  const { data: assistantRows, error: assistantError } = await supabase
    .from("assistants")
    .select("*");
  if (assistantError) throw assistantError;
  state.assistantProfiles = Object.fromEntries((assistantRows || []).map((row) => [row.organization_id, row]));

  state.commercialStages = {};
  if (state.isAdmin) {
    const { data: commercialRows, error: commercialError } = await supabase
      .from("organization_commercials")
      .select("organization_id,lifecycle_stage");
    if (commercialError) throw commercialError;
    state.commercialStages = Object.fromEntries((commercialRows || []).map((row) => [row.organization_id, row.lifecycle_stage]));
  }

  $("orgSelect").innerHTML = state.organizations.length
    ? state.organizations.map((org) => `<option value="${org.id}">${esc(org.name)}</option>`).join("")
    : '<option value="">Sin negocios asignados</option>';

  const validPrevious = previous && state.organizations.some((org) => org.id === previous);
  if (validPrevious) {
    $("orgSelect").value = previous;
  } else if (state.isAdmin) {
    const internal = state.organizations.find((org) => org.name === "NEXO Internal");
    if (internal) $("orgSelect").value = internal.id;
  }

  updateOrgBadge();
  updateNavigationAccess();
}

function updateNavigationAccess() {
  const internalAdmin = state.isAdmin && isInternalOrg();
  $("adminNav")?.classList.toggle("hidden", !internalAdmin);
  $("clientNavWrap")?.classList.toggle("hidden", internalAdmin);

  const teamNav = $("teamNav");
  if (teamNav) teamNav.classList.add("hidden");

  document.querySelectorAll(".client-mobile-nav-item").forEach((item) => item.classList.toggle("hidden", internalAdmin));
  document.querySelectorAll(".admin-mobile-nav-item").forEach((item) => item.classList.toggle("hidden", !internalAdmin));

  if ($("profileRole")) {
    if (state.isAdmin && internalAdmin) {
      $("profileRole").textContent = "NEXO Platform Admin";
    } else if (state.isAdmin) {
      $("profileRole").textContent = "Platform Admin · Vista cliente";
    } else {
      const role = currentOrgRole();
      const labels = { owner: "Propietario", admin: "Administrador", operator: "Operador", viewer: "Solo lectura" };
      $("profileRole").textContent = labels[role] ? `${labels[role]} · Cliente NEXO` : "Cliente NEXO";
    }
  }
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
    .select("full_name, platform_role, contact_email, phone, job_title, avatar_url, bio")
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
  if ($("profileAvatar")) {
    $("profileAvatar").innerHTML = state.profile?.avatar_url
      ? `<img src="${esc(state.profile.avatar_url)}" alt="${esc(displayName)}">`
      : esc(initials);
  }
  updateNavigationAccess();
}


function assistantForOrg(orgId = currentOrgId()) {
  return state.assistantProfiles[orgId] || null;
}

function initialsFor(value = "NX") {
  const parts=String(value||"NX").trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0,2).map((part)=>part[0]?.toUpperCase()||"").join("")||"NX");
}

function assistantAvatarHtml(assistant, org, className = "assistant-avatar") {
  const label=assistant?.name || org?.assistant || "Asistente NEXO";
  if (assistant?.avatar_url) {
    return `<span class="${className} has-image"><img src="${esc(assistant.avatar_url)}" alt="${esc(label)}"></span>`;
  }
  return `<span class="${className}" style="--assistant-color:${esc(org?.color||"#316bff")}">${esc(initialsFor(label))}</span>`;
}

function assistantProfileCardHtml(orgId = currentOrgId(), { compact = false } = {}) {
  const org=state.organizations.find((item)=>item.id===orgId);
  const assistant=assistantForOrg(orgId);
  if (!org || !assistant) return "";
  const capabilities=Array.isArray(assistant.capabilities)?assistant.capabilities:[];
  return `
    <section class="card assistant-profile-card ${compact?"compact":""}">
      <div class="assistant-profile-main">
        ${assistantAvatarHtml(assistant,org,"assistant-profile-avatar")}
        <div class="assistant-profile-copy">
          <div class="assistant-profile-label"><span>ASISTENTE VIRTUAL NEXO</span><i class="${assistant.status==="active"?"online":""}"></i>${assistant.status==="active"?"Activo":esc(assistant.status||"—")}</div>
          <h2>${esc(assistant.name||org.assistant||"Asistente NEXO")}</h2>
          <b>${esc(assistant.role_label||("Asistente virtual de "+org.name))}</b>
          <p>${esc(assistant.description||"Asistente configurado para apoyar la atención y operación de este negocio.")}</p>
        </div>
      </div>
      ${compact?"":`
        <div class="assistant-profile-meta">
          <div><span>Canal</span><b>${esc(assistant.channel||"WhatsApp")}</b></div>
          <div><span>Tono</span><b>${esc(assistant.tone||"Configurado por NEXO")}</b></div>
          <div class="wide"><span>Contexto</span><p>${esc(assistant.context_summary||"Contexto del negocio administrado desde NEXO.")}</p></div>
        </div>
        <div class="assistant-capabilities">${capabilities.map((item)=>`<span>${esc(item)}</span>`).join("")}</div>
        <button class="assistant-settings-link btn small" type="button" data-assistant-settings-org="${orgId}">Ver configuración del asistente</button>
      `}
    </section>
  `;
}

async function uploadMediaImage(file, folder, ownerId) {
  if (!file) return null;
  if (!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("Usa una imagen JPG, PNG o WEBP.");
  if (file.size > 5 * 1024 * 1024) throw new Error("La imagen debe pesar máximo 5 MB.");
  const extension=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
  const path=`${folder}/${ownerId}/avatar-${Date.now()}.${extension}`;
  const {error}=await supabase.storage.from("nexo-media").upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});
  if(error) throw error;
  const {data}=supabase.storage.from("nexo-media").getPublicUrl(path);
  return data.publicUrl;
}

async function renderProfile() {
  const profile=state.profile||{};
  const displayName=profile.full_name||"Usuario NEXO";
  const loginEmail=state.session?.user?.email||"";
  $("content").innerHTML=`
    <div class="profile-page-grid">
      <section class="card profile-photo-card">
        <div class="profile-photo-large" id="profilePhotoPreview">
          ${profile.avatar_url?`<img src="${esc(profile.avatar_url)}" alt="${esc(displayName)}">`:esc(initialsFor(displayName))}
        </div>
        <h2>${esc(displayName)}</h2>
        <p>${esc(profile.job_title || (state.isAdmin?"NEXO Platform Admin":"Cliente NEXO"))}</p>
        <label class="btn profile-upload-button">
          Cambiar foto
          <input id="profilePhotoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        </label>
        <small>JPG, PNG o WEBP · máximo 5 MB</small>
      </section>

      <form id="profileForm" class="card profile-edit-card">
        <div class="card-head"><div><h2>Información de tu perfil</h2><p>Estos datos pertenecen a tu usuario, no al negocio.</p></div></div>
        <div class="profile-form-grid">
          <label>Nombre completo<input id="profileFullName" value="${esc(profile.full_name||"")}" required></label>
          <label>Correo de acceso<input value="${esc(loginEmail)}" disabled><small>El correo de inicio de sesión se administra desde Auth.</small></label>
          <label>Correo de contacto<input id="profileContactEmail" type="email" value="${esc(profile.contact_email||loginEmail)}"></label>
          <label>Teléfono<input id="profilePhone" value="${esc(profile.phone||"")}"></label>
          <label>Cargo / rol<input id="profileJobTitle" value="${esc(profile.job_title||"")}"></label>
          <label class="wide">Acerca de ti<textarea id="profileBio" rows="4" placeholder="Una breve descripción de tu rol o responsabilidades.">${esc(profile.bio||"")}</textarea></label>
        </div>
        <div class="profile-form-actions"><button class="btn primary" type="submit">Guardar perfil</button></div>
      </form>
    </div>
  `;

  let pendingAvatar=null;
  $("profilePhotoInput")?.addEventListener("change",(event)=>{
    const file=event.target.files?.[0];
    if(!file)return;
    pendingAvatar=file;
    const url=URL.createObjectURL(file);
    $("profilePhotoPreview").innerHTML=`<img src="${url}" alt="Vista previa">`;
  });

  $("profileForm")?.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;button.textContent="Guardando…";
    try{
      let avatarUrl=profile.avatar_url||null;
      if(pendingAvatar) avatarUrl=await uploadMediaImage(pendingAvatar,"profiles",state.session.user.id);
      const payload={
        full_name:$("profileFullName").value.trim(),
        contact_email:$("profileContactEmail").value.trim()||null,
        phone:$("profilePhone").value.trim()||null,
        job_title:$("profileJobTitle").value.trim()||null,
        bio:$("profileBio").value.trim()||null,
        avatar_url:avatarUrl,
        updated_at:new Date().toISOString(),
      };
      const {error}=await supabase.from("profiles").update(payload).eq("id",state.session.user.id);
      if(error)throw error;
      showToast("Perfil actualizado.");
      await loadIdentity();
      await renderProfile();
    }catch(error){showError(error.message||"No pudimos actualizar tu perfil.");button.disabled=false;button.textContent="Guardar perfil";}
  });
}

function emptyState(title = "Todavía no hay datos reales en esta sección.", detail = "Los registros aparecerán aquí cuando conectemos el negocio.") {
  return `<div class="empty"><strong>${esc(title)}</strong>${esc(detail)}</div>`;
}

async function renderOverview() {
  const m = await getMetrics();
  state.currentRows = m.conversations;

  if (state.isAdmin && isInternalOrg()) {
    const clients = clientOrganizations();
    const clientRows = await Promise.all(clients.map(async (org) => {
      const metrics = await getMetrics(org.id, currentDays(), { comparison: false });
      return {
        org,
        metrics,
        health: operationalHealth(metrics),
        alerts: buildOperationalAlerts(metrics, org.name, org.id),
      };
    }));

    const clientName = (id) => clients.find((org) => org.id === id)?.name || "Cliente NEXO";
    const attentionRows = m.conversations
      .filter((row) => row.status === "Requiere atención")
      .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)))
      .slice(0, 8);
    await loadAlertAcknowledgements(clients.map((org)=>org.id));
    const networkAlerts = visibleOperationalAlerts(clientRows.flatMap((row) => row.alerts)).sort((a, b) => b.priority - a.priority);
    const stableClients = clientRows.filter((row) => row.health.tone === "good").length;
    const watchClients = clientRows.filter((row) => row.health.tone === "watch").length;
    const riskClients = clientRows.filter((row) => row.health.tone === "risk").length;

    const [{data:commandProspects},{data:commandInvoices},{data:commandCommercials}] = await Promise.all([
      supabase.from("demo_requests").select("*").in("stage",["prospecto","demo","propuesta"]).order("created_at",{ascending:false}).limit(50),
      supabase.from("client_invoices").select("*").in("status",["pending","overdue"]).order("due_date",{ascending:true}).limit(50),
      supabase.from("organization_commercials").select("*"),
    ]);

    const commandTasks=[];
    const nowMs=Date.now();
    const sevenDays=7*86400000;
    const thirtyDays=30*86400000;

    attentionRows.forEach((row)=>commandTasks.push({
      priority:100,tone:"risk",page:"operations",orgId:row.organization_id,
      title:"Atender conversación",detail:`${clientName(row.organization_id)} · ${row.name||"Contacto WhatsApp"}`,
      meta:dateTime(row.last_message_at)
    }));

    (commandProspects||[]).forEach((row)=>{
      const next=row.next_action_at?new Date(row.next_action_at).getTime():null;
      const created=new Date(row.created_at).getTime();
      if(next && next<nowMs){
        commandTasks.push({priority:95,tone:"risk",page:"crm",title:"Seguimiento comercial vencido",detail:`${row.business_name||row.full_name} · ${row.stage}`,meta:dateTime(row.next_action_at)});
      } else if(created>nowMs-86400000){
        commandTasks.push({priority:78,tone:"info",page:"crm",title:"Prospecto nuevo",detail:`${row.business_name||row.full_name} · revisar y definir próxima acción`,meta:shortDate(row.created_at)});
      }
    });

    (commandInvoices||[]).forEach((row)=>{
      const due=new Date(String(row.due_date)+"T23:59:59-05:00").getTime();
      const overdue=row.status==="overdue"||due<nowMs;
      if(overdue || due<=nowMs+sevenDays){
        commandTasks.push({
          priority:overdue?92:70,tone:overdue?"risk":"watch",page:"crm",orgId:row.organization_id,
          title:overdue?"Cobro vencido":"Cobro próximo",
          detail:`${clientName(row.organization_id)} · ${row.invoice_number||"Cuenta de cobro"} · ${money(row.amount_cop)}`,
          meta:shortDate(row.due_date)
        });
      }
    });

    (commandCommercials||[]).forEach((row)=>{
      if(["attention","pending","partial"].includes(row.integration_status) && state.commercialStages[row.organization_id]==="activo"){
        commandTasks.push({
          priority:72,tone:row.integration_status==="attention"?"risk":"watch",page:"settings",orgId:row.organization_id,
          title:"Integración por revisar",detail:`${clientName(row.organization_id)} · ${row.integration_status}`,meta:"Configuración"
        });
      }
      if(row.renewal_date){
        const renewal=new Date(String(row.renewal_date)+"T23:59:59-05:00").getTime();
        if(renewal>=nowMs && renewal<=nowMs+thirtyDays){
          commandTasks.push({
            priority:60,tone:"watch",page:"crm",orgId:row.organization_id,
            title:"Renovación próxima",detail:clientName(row.organization_id),meta:shortDate(row.renewal_date)
          });
        }
      }
    });
    commandTasks.sort((a,b)=>b.priority-a.priority);

    $("pageTitle").textContent = "NEXO, en una sola vista.";
    $("pageSubtitle").textContent = "Rendimiento consolidado de todos los clientes activos. Visible solo para Platform Admin.";

    $("content").innerHTML = `
      <div class="stats-grid">
        ${metricCard("Clientes activos", clients.length, `${m.activeClientCount} con actividad en el período`, null, true)}
        ${metricCard("Conversaciones", m.chats, "Todas las organizaciones activas", m.delta?.chats)}
        ${metricCard("Leads generados", m.leadCount, `${m.leadRate}% de conversaciones`, m.delta?.leads)}
        ${metricCard("Citas confirmadas", m.confirmed, money(m.value) + " estimados", m.delta?.confirmed)}
      </div>

      <section class="card command-today-card">
        <div class="card-head">
          <div><span class="eyebrow">PRIORIDAD EJECUTIVA</span><h2>Qué necesita Juan hoy</h2><p>Acciones ordenadas por urgencia. Menos monitoreo manual, más ejecución.</p></div>
          <span class="count">${commandTasks.length} pendiente${commandTasks.length===1?"":"s"}</span>
        </div>
        <div class="command-task-list">
          ${commandTasks.length?commandTasks.slice(0,10).map((task,index)=>`
            <button class="command-task ${task.tone}" type="button" data-command-index="${index}">
              <i></i>
              <div><b>${esc(task.title)}</b><span>${esc(task.detail)}</span></div>
              <small>${esc(task.meta||"")}</small>
              <em>→</em>
            </button>
          `).join(""):`<div class="command-empty"><span>✓</span><div><b>Todo bajo control</b><p>No hay acciones prioritarias detectadas en este momento.</p></div></div>`}
        </div>
      </section>

      <div class="executive-strip">
        <div><span>Automatización</span><b>${m.automated}%</b><small>sin intervención humana</small></div>
        <div><span>Conversión lead → cita</span><b>${m.conversion}%</b><small>${m.leadCount} leads · ${m.confirmed} citas</small></div>
        <div><span>Respuesta media</span><b>${m.response.toFixed(1)} s</b><small>mediana ${m.medianResponse.toFixed(1)} s</small></div>
        <div><span>Requieren atención</span><b>${m.attention}</b><small>${m.escalationRate}% de conversaciones</small></div>
        <div><span>Valor confirmado</span><b>${money(m.value)}</b><small>ticket medio ${money(m.avgTicket)}</small></div>
      </div>

      <div class="portfolio-health">
        <div class="portfolio-health-summary">
          <span>Salud operativa de clientes</span>
          <div><b class="health-dot good"></b>${stableClients} estables</div>
          <div><b class="health-dot watch"></b>${watchClients} por monitorear</div>
          <div><b class="health-dot risk"></b>${riskClients} requieren atención</div>
        </div>
        <div class="portfolio-health-cards">
          ${clientRows.map(({ org, metrics, health }) => `
            <article class="portfolio-account">
              <div class="portfolio-account-top">${assistantAvatarHtml(assistantForOrg(org.id),org,"org-mini assistant-mini")}${healthBadge(health)}</div>
              <b>${esc(org.name)}</b>
              <small>${esc(org.assistant || "Asistente")} · ${metrics.chats} conversaciones</small>
              <p>${esc(health.reasons[0])}</p>
            </article>
          `).join("")}
        </div>
      </div>

      <div class="grid-two executive-grid">
        <section class="card">
          <div class="card-head"><div><h2>Actividad de la red NEXO</h2><p>Conversaciones, leads y citas por día</p></div></div>
          <div class="chart-wrap">${activityChart(m.activitySeries)}</div>
        </section>
        ${alertCenterHtml(networkAlerts, "Alertas de clientes")}
      </div>

      <section class="card">
        <div class="card-head"><div><h2>Rendimiento por cliente</h2><p>Comparativa operativa de organizaciones activas</p></div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Estado</th><th>Asistente</th><th>Conversaciones</th><th>Leads</th><th>Conversión</th><th>Automatización</th><th>Respuesta</th><th>Valor</th><th>Atención</th></tr></thead>
            <tbody>
              ${clientRows.map(({ org, metrics, health }) => `
                <tr>
                  <td><b>${esc(org.name)}</b><br><span class="muted">${esc(org.sector)}</span></td>
                  <td>${healthBadge(health, true)}</td>
                  <td>${esc(org.assistant || "—")}</td>
                  <td>${metrics.chats}</td>
                  <td>${metrics.leadCount}</td>
                  <td><b>${metrics.conversion}%</b></td>
                  <td>${metrics.automated}%</td>
                  <td>${metrics.response.toFixed(1)} s</td>
                  <td>${money(metrics.value)}</td>
                  <td>${metrics.attention ? `<span class="count">${metrics.attention}</span>` : '<span class="pill green">0</span>'}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
    document.querySelectorAll("[data-command-index]").forEach((button)=>{
      button.addEventListener("click",async()=>{
        const task=commandTasks[Number(button.dataset.commandIndex)];
        if(!task)return;
        if(task.page==="settings" && task.orgId) state.settingsOrgId=task.orgId;
        state.page=task.page||"overview";
        persistUiState();
        await render();
      });
    });
    bindAlertNavigation();
    document.querySelectorAll("[data-assistant-settings-org]").forEach((button)=>button.addEventListener("click",async()=>{
      state.settingsOrgId=button.dataset.assistantSettingsOrg;
      state.page="settings";
      persistUiState();
      await render();
    }));
    return;
  }

  const attentionRows = m.conversations
    .filter((row) => row.status === "Requiere atención")
    .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)))
    .slice(0, 6);
  const health = operationalHealth(m);
  await loadAlertAcknowledgements([currentOrgId()]);
  const alerts = visibleOperationalAlerts(buildOperationalAlerts(m, "", currentOrgId()));

  const funnel = [
    ["Conversaciones", m.chats, 100],
    ["Leads identificados", m.leadCount, m.chats ? (m.leadCount / m.chats) * 100 : 0],
    ["Citas confirmadas", m.confirmed, m.chats ? (m.confirmed / m.chats) * 100 : 0],
  ];

  $("content").innerHTML = `
    ${assistantProfileCardHtml(currentOrgId())}
    <div class="stats-grid">
      ${metricCard("Conversaciones", m.chats, `${m.messageCount} mensajes registrados`, m.delta?.chats)}
      ${metricCard("Nuevos leads", m.leadCount, `${m.leadRate}% de captura desde conversación`, m.delta?.leads)}
      ${metricCard("Citas confirmadas", m.confirmed, `${m.requested} solicitudes pendientes`, m.delta?.confirmed)}
      ${metricCard("Conversión", m.conversion + "%", "Citas confirmadas / leads", m.delta?.conversion, true)}
    </div>

    <div class="executive-strip client-strip">
      <div><span>Automatización</span><b>${m.automated}%</b><small>${m.escalationRate}% escalado</small></div>
      <div><span>Respuesta media</span><b>${m.response.toFixed(1)} s</b><small>mediana ${m.medianResponse.toFixed(1)} s</small></div>
      <div><span>Contactos activos</span><b>${m.contactCount}</b><small>${m.messagesPerConversation.toFixed(1)} mensajes / conversación</small></div>
      <div><span>Valor confirmado</span><b>${money(m.value)}</b><small>ticket medio ${money(m.avgTicket)}</small></div>
      <div><span>Estado operativo</span><b>${health.score === null ? "—" : health.score + "/100"}</b><small>${esc(health.level)}</small></div>
    </div>

    <div class="grid-two">
      <section class="card">
        <div class="card-head"><div><h2>Actividad del período</h2><p>Conversaciones, leads y citas registradas</p></div></div>
        <div class="chart-wrap">${activityChart(m.activitySeries)}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>De conversación a cita</h2><p>Embudo operativo</p></div></div>
        <div class="funnel">
          ${funnel.map(([label, value, width]) => `
            <div class="funnel-step">
              <div class="funnel-line"><span>${label}</span><b>${value}</b></div>
              <div class="track"><i style="width:${Math.max(0, Math.min(100, width))}%"></i></div>
            </div>
          `).join("")}
        </div>
        <div class="value-box"><span>Valor estimado confirmado</span><strong>${money(m.value)}</strong></div>
      </section>
    </div>

    ${alertCenterHtml(alerts)}

    <div class="grid-two demand-overview">
      <section class="card">
        <div class="card-head"><div><h2>Cuándo escriben tus clientes</h2><p>Distribución de conversaciones por franja</p></div><span class="pill">${esc(busiestLabel(m.hourlyDistribution))}</span></div>
        <div class="demand-wrap">${demandHeatmap(m.hourlyDistribution)}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Días con mayor actividad</h2><p>Conversaciones según día de la semana</p></div><span class="pill">${esc(busiestDayLabel(m.weekdayDistribution))}</span></div>
        <div class="weekday-wrap">${weekdayBars(m.weekdayDistribution)}</div>
      </section>
    </div>

    <section class="card">
      <div class="card-head"><div><h2>Necesitan tu atención</h2><p>Conversaciones transferidas al equipo</p></div><span class="count">${m.attention} pendientes</span></div>
      <div class="rows">
        ${attentionRows.length ? attentionRows.map((row) => `
          <div class="item-row attention-item-row">
            <div><strong>${esc(row.name||"Contacto WhatsApp")}</strong><small>${esc(row.service||row.source||"WhatsApp")}</small></div>
            <div class="muted">${dateTime(row.last_message_at)}</div>
            <div class="attention-row-controls">${attentionActionHtml(row)}</div>
          </div>
        `).join("") : emptyState("No hay conversaciones pendientes.", "Cuando el asistente necesite intervención humana aparecerá aquí.")}
      </div>
    </section>
  `;
  bindAlertNavigation();
  bindAttentionActions();
  document.querySelectorAll("[data-assistant-settings-org]").forEach((button)=>button.addEventListener("click",async()=>{
    state.settingsOrgId=button.dataset.assistantSettingsOrg;
    state.page="settings";
    persistUiState();
    await render();
  }));
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
  const orgIds = metricOrgIds(orgId);
  const days = currentDays();
  if (!orgIds.length) return [];

  const since = sinceIso(days);
  const table = type === "appointments" ? "appointments" : type === "followups" ? "followups" : type;
  const order = type === "appointments" ? "starts_at" : type === "followups" ? "due_at" : type === "conversations" ? "last_message_at" : "created_at";
  const ascending = type === "appointments" || type === "followups";

  let select = "*";
  if (["conversations", "leads", "appointments", "followups"].includes(type)) {
    select = "*, contacts(id,name,phone,email)";
  }

  let request = supabase.from(table).select(select);
  request = orgIds.length === 1
    ? request.eq("organization_id", orgIds[0])
    : request.in("organization_id", orgIds);
  const timeField = type === "conversations" ? "last_message_at" : "created_at";
  request = request.gte(timeField, since).order(order, { ascending }).limit(5000);

  const { data, error } = await request;
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    phone: row.contacts?.phone || "",
    contact_name: row.contacts?.name || row.name || "",
    organization_name: state.organizations.find((org) => org.id === row.organization_id)?.name || "",
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
  return `<button class="chat-button" data-contact-id="${row.contact_id}" data-org-id="${row.organization_id || ""}" data-conversation-id="${row.id || ""}">Ver chat</button>`;
}

function closeContactChat() {
  const modal = document.getElementById("chatModal");
  if (modal) modal.classList.add("hidden");
  document.body.classList.remove("modal-open");
}

async function openContactChat(contactId, organizationId = currentOrgId()) {
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
      modal.querySelectorAll("[data-close-chat]").forEach((el) => el.addEventListener("click", closeContactChat));
    }

    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");

    const [{ data: contact, error: contactError }, { data: conversations, error: convError }] = await Promise.all([
      supabase.from("contacts").select("id,name,phone,email").eq("id", contactId).single(),
      supabase.from("conversations").select("id,created_at,last_message_at").eq("organization_id", organizationId).eq("contact_id", contactId).order("created_at", { ascending: true }),
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
          const assistantName = (state.organizations.find((o) => o.id === organizationId) || {}).assistant || "Asistente";
          const label = msg.sender === "contact" ? "Cliente" : msg.sender === "human" ? "Humano" : msg.sender === "system" ? "Sistema" : assistantName;
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
    closeContactChat();
    showError(error.message || "No pudimos abrir el historial del contacto.");
  }
}

function bindChatButtons() {
  document.querySelectorAll(".chat-button").forEach((button) => {
    button.addEventListener("click", () => openContactChat(
      button.dataset.contactId,
      button.dataset.orgId || currentOrgId()
    ));
  });
}

async function renderTablePage(type) {
  const rows = await fetchDetailedRows(type);
  state.currentRows = rows.map((row) => ({
    ...row,
    phone: row.phone || row.contacts?.phone || "",
  }));

  const showOrganization = state.isAdmin && isInternalOrg();
  const config = {
    conversations: {
      title: "Conversaciones",
      cols: [...(showOrganization ? ["Empresa"] : []), "Contacto", "Teléfono", "Consulta", "Origen", "Estado", "Actividad", "Chat"],
      cells: (row) => [
        ...(showOrganization ? [`<b>${esc(row.organization_name)}</b>`] : []),
        `<b>${esc(row.contact_name || row.name)}</b>`,
        phoneCell(row),
        esc(row.service),
        esc(row.source),
        conversationStatusSelect(row),
        dateTime(row.last_message_at),
        chatAction(row),
      ],
    },
    leads: {
      title: "Leads",
      cols: [...(showOrganization ? ["Empresa"] : []), "Contacto", "Teléfono", "Servicio", "Origen", "Etapa", "Valor", "Chat"],
      cells: (row) => [
        ...(showOrganization ? [`<b>${esc(row.organization_name)}</b>`] : []),
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
      cols: [...(showOrganization ? ["Empresa"] : []), "Contacto", "Teléfono", "Servicio", "Fecha", "Estado", "Valor", "Chat"],
      cells: (row) => [
        ...(showOrganization ? [`<b>${esc(row.organization_name)}</b>`] : []),
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
      cols: [...(showOrganization ? ["Empresa"] : []), "Contacto", "Teléfono", "Servicio", "Fecha objetivo", "Estado", "Creado", "Chat"],
      cells: (row) => [
        ...(showOrganization ? [`<b>${esc(row.organization_name)}</b>`] : []),
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

function conversationStatusSelect(row) {
  const statuses=["Activa","Requiere atención","Resuelta","Cerrada"];
  return `<select class="status-select status-control" data-type="conversations" data-id="${row.id}">${statuses.map((status)=>`<option ${status===row.status?"selected":""}>${status}</option>`).join("")}</select>`;
}

function attentionActionHtml(row) {
  return `<div class="attention-actions">
    ${conversationStatusSelect(row)}
    <button class="btn small complete-conversation" data-conversation-id="${row.id}" type="button">Resolver</button>
    ${chatAction(row)}
  </div>`;
}

function bindAttentionActions() {
  bindStatusControls("conversations");
  bindChatButtons();
  document.querySelectorAll(".complete-conversation").forEach((button)=>{
    button.addEventListener("click",async()=>{
      button.disabled=true;button.textContent="Resolviendo…";
      try{
        const {error}=await supabase.from("conversations").update({status:"Resuelta"}).eq("id",button.dataset.conversationId);
        if(error)throw error;
        showToast("Conversación marcada como resuelta.");
        await render();
      }catch(error){showError(error.message||"No pudimos resolver la conversación.");button.disabled=false;button.textContent="Resolver";}
    });
  });
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

  const services = Object.entries(m.services).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const sources = Object.entries(m.sources).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const appointmentStatuses = Object.entries(m.appointmentStatuses).sort((a, b) => b[1] - a[1]);
  const leadStages = Object.entries(m.leadStages).sort((a, b) => b[1] - a[1]);
  const assistantLabel = state.isAdmin && isInternalOrg()
    ? "red de asistentes"
    : (currentOrg()?.assistant || "tu asistente");
  const health = operationalHealth(m);
  await loadAlertAcknowledgements(metricOrgIds());
  const alerts = visibleOperationalAlerts(buildOperationalAlerts(m, "", currentOrgId()));

  $("content").innerHTML = `
    <div class="metrics-hero card">
      <div>
        <span class="eyebrow">NEXO ANALYTICS · ${currentDays()} DÍAS</span>
        <h2>Rendimiento de ${esc(assistantLabel)}</h2>
        <p>Una lectura completa de demanda, conversión, automatización, velocidad y valor.</p>
      </div>
      <div class="metric-score">
        <small>Conversión lead → cita</small>
        <strong>${m.conversion}%</strong>
        <div class="metric-score-foot">${trendChip(m.delta?.conversion)} ${healthBadge(health)}</div>
      </div>
    </div>

    <div class="stats-grid">
      ${metricCard("Conversaciones", m.chats, `${m.messageCount} mensajes`, m.delta?.chats)}
      ${metricCard("Leads", m.leadCount, `${m.leadRate}% de captura`, m.delta?.leads)}
      ${metricCard("Citas confirmadas", m.confirmed, `${m.confirmationRate}% de confirmación`, m.delta?.confirmed)}
      ${metricCard("Valor confirmado", money(m.value), `Ticket medio ${money(m.avgTicket)}`, m.delta?.value, true)}
    </div>

    <div class="kpi-grid">
      <section class="card kpi-detail"><span>Automatización</span><b>${m.automated}%</b><small>Conversaciones sin intervención humana</small></section>
      <section class="card kpi-detail"><span>Escalamiento</span><b>${m.escalationRate}%</b><small>${m.attention} conversaciones requieren atención</small></section>
      <section class="card kpi-detail"><span>Respuesta media</span><b>${m.response.toFixed(1)} s</b><small>Mediana ${m.medianResponse.toFixed(1)} s</small></section>
      <section class="card kpi-detail"><span>Mensajes / conversación</span><b>${m.messagesPerConversation.toFixed(1)}</b><small>${m.inboundMessages} mensajes de clientes</small></section>
      <section class="card kpi-detail"><span>Cancelación</span><b>${m.cancellationRate}%</b><small>${m.cancelled} citas canceladas</small></section>
      <section class="card kpi-detail"><span>No-show</span><b>${m.noShowRate}%</b><small>${m.noShow} ausencias registradas</small></section>
      <section class="card kpi-detail"><span>Recuperación</span><b>${m.recoveryRate}%</b><small>${m.recovered} seguimientos recuperados</small></section>
      <section class="card kpi-detail"><span>Pipeline potencial</span><b>${money(m.pipelineValue)}</b><small>Valor registrado en leads</small></section>
    </div>

    <section class="card analytics-chart-card">
      <div class="card-head"><div><h2>Tendencia de actividad</h2><p>Hasta 30 puntos diarios del período seleccionado</p></div></div>
      <div class="chart-wrap">${activityChart(m.activitySeries)}</div>
    </section>

    <div class="analytics-insight-grid">
      <section class="card">
        <div class="card-head"><div><h2>Demanda por franja</h2><p>Cuándo empiezan más conversaciones</p></div><span class="pill">${esc(busiestLabel(m.hourlyDistribution))}</span></div>
        <div class="demand-wrap">${demandHeatmap(m.hourlyDistribution)}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Demanda por día</h2><p>Días con mayor volumen conversacional</p></div><span class="pill">${esc(busiestDayLabel(m.weekdayDistribution))}</span></div>
        <div class="weekday-wrap">${weekdayBars(m.weekdayDistribution)}</div>
      </section>
      <section class="card health-detail-card">
        <div class="card-head"><div><h2>Estado operativo</h2><p>Señal basada en atención, respuesta y citas</p></div>${healthBadge(health)}</div>
        <div class="health-reasons">${health.reasons.map((reason) => `<div><i></i><span>${esc(reason)}</span></div>`).join("")}</div>
      </section>
    </div>

    ${alertCenterHtml(alerts, "Alertas del período")}

    <div class="analytics-grid">
      <section class="card">
        <div class="card-head"><div><h2>Servicios consultados</h2><p>Qué genera más conversación</p></div></div>
        <div class="metric-list">${rankingHtml(services, m.chats)}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Origen de conversaciones</h2><p>Canales que generan actividad</p></div></div>
        <div class="metric-list">${rankingHtml(sources, m.chats)}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Etapas de leads</h2><p>Distribución del pipeline</p></div></div>
        <div class="metric-list">${rankingHtml(leadStages, m.leadCount)}</div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Estado de citas</h2><p>Distribución de reservas</p></div></div>
        <div class="metric-list">${rankingHtml(appointmentStatuses, m.appointmentCount)}</div>
      </section>
    </div>
  `;
  bindAlertNavigation();
}


function adminInternalView() {
  return state.isAdmin && isInternalOrg();
}

function settingsTargetOrgId() {
  if (adminInternalView()) {
    const clients = clientOrganizations({ activeOnly: false });
    if (state.settingsOrgId && clients.some((org) => org.id === state.settingsOrgId)) return state.settingsOrgId;
    return clients[0]?.id || null;
  }
  return currentOrgId();
}

function auditAreaLabel(table) {
  return ({
    organizations: "Empresa",
    organization_settings: "Configuración",
    organization_commercials: "Comercial",
    organization_members: "Usuarios",
    client_invoices: "Facturación",
    crm_integrations: "Integraciones",
  }[table] || table);
}

function auditActionLabel(action) {
  return ({ INSERT: "Creó", UPDATE: "Actualizó", DELETE: "Eliminó" }[action] || action);
}

function auditChangedSummary(row) {
  const ignored = new Set(["updated_at","created_at"]);
  const fields = Object.keys(row.changed_fields || {}).filter((key) => !ignored.has(key));
  if (!fields.length) return "Sin campos relevantes";
  const labels = {
    name:"nombre", sector:"sector", assistant:"asistente", initials:"iniciales", color:"color",
    public_email:"correo público", notification_email:"correo de notificaciones", phone:"teléfono",
    whatsapp:"WhatsApp", website:"sitio web", address:"dirección", city:"ciudad",
    handoff_phone:"teléfono de handoff", assistant_tone:"tono del asistente",
    portal_welcome_message:"mensaje del portal", allow_email_notifications:"notificaciones",
    allow_billing_emails:"correos de facturación", mrr:"MRR", billing_status:"estado de facturación",
    billing_email:"correo de facturación", billing_contact_name:"contacto de facturación",
    billing_day:"día de cobro", auto_invoice:"facturación automática", lifecycle_stage:"etapa",
    plan_name:"plan", implementation_status:"implementación", integration_status:"integraciones",
    role:"rol", status:"estado", amount_cop:"valor", due_date:"vencimiento", email_status:"correo",
  };
  return fields.slice(0,5).map((field)=>labels[field]||field.replaceAll("_"," ")).join(", ") + (fields.length>5 ? ` +${fields.length-5}` : "");
}

async function renderClients() {
  if (!adminInternalView()) {
    $("content").innerHTML = emptyState("Selecciona NEXO Internal.", "El directorio completo de clientes es exclusivo del Command Center.");
    return;
  }

  const clients = clientOrganizations({ activeOnly: false });
  const [{data:commercials},{data:members},{data:settings}] = await Promise.all([
    supabase.from("organization_commercials").select("*"),
    supabase.from("organization_members").select("organization_id,user_id,role"),
    supabase.from("organization_settings").select("organization_id,notification_email,whatsapp"),
  ]);
  const commercialMap=new Map((commercials||[]).map((row)=>[row.organization_id,row]));
  const settingsMap=new Map((settings||[]).map((row)=>[row.organization_id,row]));
  const userCounts=(members||[]).reduce((acc,row)=>{acc[row.organization_id]=(acc[row.organization_id]||0)+1;return acc;},{});
  const activeCount=clients.filter((org)=>commercialMap.get(org.id)?.lifecycle_stage==="activo").length;
  const implementationCount=clients.filter((org)=>commercialMap.get(org.id)?.lifecycle_stage==="implementacion").length;
  const billingAttention=clients.filter((org)=>["past_due","paused"].includes(commercialMap.get(org.id)?.billing_status)).length;

  state.currentRows=clients.map((org)=>{
    const commercial=commercialMap.get(org.id)||{};
    return {organization:org.name,sector:org.sector,assistant:org.assistant,stage:commercial.lifecycle_stage,plan:commercial.plan_name,billing:commercial.billing_status,integrations:commercial.integration_status,users:userCounts[org.id]||0};
  });

  $("content").innerHTML=`
    <div class="directory-summary">
      <div><span>Clientes</span><b>${clients.length}</b><small>organizaciones creadas</small></div>
      <div><span>Activos</span><b>${activeCount}</b><small>en operación</small></div>
      <div><span>Implementación</span><b>${implementationCount}</b><small>en proceso</small></div>
      <div><span>Facturación</span><b>${billingAttention}</b><small>requieren revisión</small></div>
    </div>

    <section class="card client-directory-card">
      <div class="card-head">
        <div><h2>Directorio de clientes</h2><p>Configuración, plan, accesos y estado operativo. Sin repetir Analytics.</p></div>
        <span class="count">${clients.length} clientes</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>Asistente</th><th>Plan</th><th>Etapa</th><th>Implementación</th><th>Integraciones</th><th>Facturación</th><th>Usuarios</th><th>Contacto</th><th></th></tr></thead>
          <tbody>
          ${clients.length ? clients.map((org)=>{
            const commercial=commercialMap.get(org.id)||{};
            const setting=settingsMap.get(org.id)||{};
            return `<tr>
              <td><b>${esc(org.name)}</b><br><span class="muted">${esc(org.sector||"Sin sector")}</span></td>
              <td><div class="client-assistant-cell">${assistantAvatarHtml(assistantForOrg(org.id),org,"assistant-mini")}<span><b>${esc(org.assistant||"—")}</b><small>${esc(assistantForOrg(org.id)?.status==="active"?"Activo":assistantForOrg(org.id)?.status||"—")}</small></span></div></td>
              <td>${esc(commercial.plan_name||"Por definir")}</td>
              <td>${pill(commercial.lifecycle_stage||org.status||"—")}</td>
              <td>${esc(commercial.implementation_status||"—")}</td>
              <td>${esc(commercial.integration_status||"—")}</td>
              <td>${esc(commercial.billing_status||"—")}</td>
              <td><b>${userCounts[org.id]||0}</b></td>
              <td>${esc(setting.notification_email||setting.whatsapp||"—")}</td>
              <td><div class="row-actions">
                <button class="btn small client-view-button" data-id="${org.id}" type="button">Ver portal</button>
                <button class="btn small primary client-configure-button" data-id="${org.id}" type="button">Configurar</button>
              </div></td>
            </tr>`;
          }).join("") : `<tr><td colspan="10">${emptyState("Todavía no hay clientes.","Crea tu primer negocio NEXO.")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

    <div class="admin-action-accordion">
      <details class="card admin-action-drawer">
        <summary><div><b>+ Crear nuevo negocio</b><span>Alta de organización y asistente NEXO</span></div><em>+</em></summary>
        <form id="newBusinessForm" class="admin-form compact-admin-form">
          <label>Nombre del negocio<input id="businessName" type="text" required /></label>
          <label>Sector<input id="businessSector" type="text" /></label>
          <label>Nombre del asistente<input id="assistantName" type="text" required /></label>
          <label>Iniciales<input id="businessInitials" type="text" maxlength="3" /></label>
          <label>Color de marca<input id="businessColor" type="color" value="#316bff" /></label>
          <button id="createBusiness" class="btn primary" type="submit">Crear negocio</button>
        </form>
        <div id="businessResult" class="access-result hidden"></div>
      </details>

      <details class="card admin-action-drawer">
        <summary><div><b>+ Crear acceso de cliente</b><span>Propietario, administrador u observador</span></div><em>+</em></summary>
        <form id="clientAccessForm" class="admin-form compact-admin-form">
          <label>Nombre<input id="clientName" type="text" required /></label>
          <label>Correo<input id="clientEmail" type="email" required /></label>
          <label>Empresa<select id="clientOrg" required>${clients.map((org)=>`<option value="${org.id}">${esc(org.name)}</option>`).join("")}</select></label>
          <label>Rol<select id="clientRole"><option value="owner">Propietario</option><option value="admin">Administrador</option><option value="viewer">Solo lectura</option></select></label>
          <button id="createClientAccess" class="btn primary" type="submit">Generar acceso</button>
        </form>
        <div id="clientAccessResult" class="access-result hidden"></div>
      </details>
    </div>
  `;

  document.querySelectorAll(".client-view-button").forEach((button)=>{
    button.addEventListener("click",async()=>{
      $("orgSelect").value=button.dataset.id;
      state.page="overview";
      updateNavigationAccess();
      persistUiState();
      await render();
    });
  });
  document.querySelectorAll(".client-configure-button").forEach((button)=>{
    button.addEventListener("click",async()=>{
      state.settingsOrgId=button.dataset.id;
      state.page="settings";
      persistUiState();
      await render();
    });
  });

  $("newBusinessForm")?.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const button=$("createBusiness");
    button.disabled=true; button.textContent="Creando…";
    try{
      const {data,error}=await supabase.functions.invoke("admin-create-organization",{body:{
        name:$("businessName").value.trim(),sector:$("businessSector").value.trim(),
        assistant:$("assistantName").value.trim(),initials:$("businessInitials").value.trim(),color:$("businessColor").value
      }});
      if(error)throw error;if(!data?.ok)throw new Error(data?.error||"No pudimos crear el negocio.");
      showToast("Negocio creado.");
      await loadOrganizations(); await renderClients();
    }catch(error){showError(error.message||"No pudimos crear el negocio.");}
    finally{button.disabled=false;button.textContent="Crear negocio";}
  });

  $("clientAccessForm")?.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const button=$("createClientAccess");const box=$("clientAccessResult");
    button.disabled=true;button.textContent="Creando…";box.className="access-result hidden";
    try{
      const {data,error}=await supabase.functions.invoke("admin-client-access",{body:{
        full_name:$("clientName").value.trim(),email:$("clientEmail").value.trim(),
        organization_id:$("clientOrg").value,role:$("clientRole").value
      }});
      if(error)throw error;if(!data?.ok)throw new Error(data?.error||"No pudimos crear el acceso.");
      box.innerHTML=data.existing_user
        ? `<strong>Acceso agregado</strong><p>${esc(data.email)} ya puede entrar a ${esc(data.organization_name)}.</p>`
        : `<strong>Activación lista</strong><p>Enlace para <b>${esc(data.email)}</b>:</p><div class="setup-link-row"><input id="generatedSetupLink" value="${esc(data.setup_url)}" readonly><button id="copySetupLink" class="btn small" type="button">Copiar</button></div>`;
      box.className="access-result ok";
      $("copySetupLink")?.addEventListener("click",async()=>{await navigator.clipboard.writeText(data.setup_url);showToast("Enlace copiado.");});
    }catch(error){box.innerHTML=`<strong>Error</strong><p>${esc(error.message||"Inténtalo de nuevo.")}</p>`;box.className="access-result error";}
    finally{button.disabled=false;button.textContent="Generar acceso";}
  });
}

async function renderOperations() {
  if (!adminInternalView()) {
    $("content").innerHTML=emptyState("Selecciona NEXO Internal.","Operaciones consolida la actividad de todos los clientes.");
    return;
  }
  const orgIds=clientOrganizations().map((org)=>org.id);
  const window=periodWindow(currentDays());
  const [conversations,leads,appointments]=await Promise.all([
    fetchMetricRows("conversations",orgIds,{...window,order:"last_message_at",timeField:"last_message_at"}),
    fetchMetricRows("leads",orgIds,window),
    fetchMetricRows("appointments",orgIds,window),
  ]);
  const attention=conversations.filter((row)=>row.status==="Requiere atención").sort((a,b)=>String(b.last_message_at).localeCompare(String(a.last_message_at)));
  const pendingAppointments=appointments.filter((row)=>["Solicitada","Pendiente"].includes(row.status));
  const recentConversations=[...conversations].sort((a,b)=>String(b.last_message_at).localeCompare(String(a.last_message_at))).slice(0,10);
  const recentLeads=[...leads].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,10);
  const recentAppointments=[...appointments].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,10);
  const orgName=(id)=>state.organizations.find((org)=>org.id===id)?.name||"Cliente NEXO";

  state.currentRows=[...conversations.map((r)=>({...r,type:"conversation"})),...leads.map((r)=>({...r,type:"lead"})),...appointments.map((r)=>({...r,type:"appointment"}))];

  $("content").innerHTML=`
    <div class="operations-summary">
      <div><span>Conversaciones</span><b>${conversations.length}</b><small>en el período</small></div>
      <div class="${attention.length?"attention":""}"><span>Atención humana</span><b>${attention.length}</b><small>requieren intervención</small></div>
      <div><span>Leads</span><b>${leads.length}</b><small>oportunidades detectadas</small></div>
      <div><span>Citas pendientes</span><b>${pendingAppointments.length}</b><small>por confirmar</small></div>
    </div>

    <section class="card operations-priority">
      <div class="card-head"><div><h2>Prioridad operativa</h2><p>Conversaciones que necesitan intervención humana</p></div><span class="count">${attention.length}</span></div>
      <div class="operations-list">
        ${attention.slice(0,12).map((row)=>`<div class="operations-row">
          <div><b>${esc(row.name||"Conversación")}</b><small>${esc(orgName(row.organization_id))} · ${esc(row.service||row.channel||"WhatsApp")}</small></div>
          <span>${dateTime(row.last_message_at)}</span>
          <div class="operations-row-actions">${attentionActionHtml(row)}</div>
        </div>`).join("") || emptyState("Sin handoffs pendientes.","La red de asistentes no tiene conversaciones escaladas ahora mismo.")}
      </div>
    </section>

    <div class="operations-columns">
      <section class="card"><div class="card-head"><div><h2>Chats recientes</h2><p>Última actividad de la red</p></div></div>
        <div class="mini-feed">${recentConversations.map((row)=>`<div><b>${esc(row.name||"Conversación")}</b><span>${esc(orgName(row.organization_id))}</span><small>${dateTime(row.last_message_at)}</small></div>`).join("")||emptyState()}</div>
      </section>
      <section class="card"><div class="card-head"><div><h2>Leads recientes</h2><p>Oportunidades detectadas</p></div></div>
        <div class="mini-feed">${recentLeads.map((row)=>`<div><b>${esc(row.name||"Lead")}</b><span>${esc(orgName(row.organization_id))} · ${esc(row.stage||row.status||"Nuevo")}</span><small>${dateTime(row.created_at)}</small></div>`).join("")||emptyState()}</div>
      </section>
      <section class="card"><div class="card-head"><div><h2>Agenda reciente</h2><p>Solicitudes y reservas</p></div></div>
        <div class="mini-feed">${recentAppointments.map((row)=>`<div><b>${esc(row.name||"Cita")}</b><span>${esc(orgName(row.organization_id))} · ${esc(row.status||"—")}</span><small>${row.starts_at?dateTime(row.starts_at):dateTime(row.created_at)}</small></div>`).join("")||emptyState()}</div>
      </section>
    </div>
  `;
  bindAttentionActions();
}

async function renderSettings() {
  const targetId=settingsTargetOrgId();
  if (!targetId) {
    $("content").innerHTML=emptyState("No hay clientes para configurar.","Crea un negocio NEXO primero.");
    return;
  }
  state.settingsOrgId=targetId;
  const targetOrg=state.organizations.find((org)=>org.id===targetId);
  const canEdit=state.isAdmin || ["owner","admin"].includes(state.orgRoles[targetId]);
  const adminMode=state.isAdmin;

  const jobs=[
    supabase.from("organization_settings").select("*").eq("organization_id",targetId).maybeSingle(),
    supabase.from("assistants").select("*").eq("organization_id",targetId).order("created_at").limit(10),
  ];
  if(adminMode){
    jobs.push(supabase.from("organization_commercials").select("*").eq("organization_id",targetId).maybeSingle());
    jobs.push(supabase.from("crm_integrations").select("*").eq("organization_id",targetId).order("created_at"));
  }
  const results=await Promise.all(jobs);
  const setting=results[0].data||{};
  const assistants=results[1].data||[];
  const commercial=adminMode?(results[2].data||{}):{};
  const integrations=adminMode?(results[3].data||[]):[];
  const assistant=assistants[0]||null;

  $("content").innerHTML=`
    ${adminInternalView()? `<section class="settings-context card">
      <div><span class="eyebrow">CONFIGURACIÓN POR CLIENTE</span><h2>Selecciona la empresa que quieres administrar</h2></div>
      <select id="settingsOrgSelect" class="control">${clientOrganizations({activeOnly:false}).map((org)=>`<option value="${org.id}" ${org.id===targetId?"selected":""}>${esc(org.name)}</option>`).join("")}</select>
    </section>`:""}

    <div class="settings-layout">
      <section class="card settings-profile-card">
        <div class="settings-brand-preview">
          <span class="settings-brand-avatar" style="--brand:${esc(targetOrg?.color||"#316bff")}">${esc(targetOrg?.initials||"NX")}</span>
          <div><span>EMPRESA</span><h2>${esc(targetOrg?.name||"Cliente NEXO")}</h2><p>${esc(targetOrg?.sector||"Sin sector")} · Asistente ${esc(targetOrg?.assistant||"NEXO")}</p></div>
        </div>
        <div class="settings-status-grid">
          <div><span>Asistente</span><b>${esc(assistants[0]?.status||targetOrg?.status||"active")}</b></div>
          <div><span>Zona horaria</span><b>${esc(targetOrg?.timezone||"America/Bogota")}</b></div>
          ${adminMode?`<div><span>Plan</span><b>${esc(commercial.plan_name||"Por definir")}</b></div><div><span>Facturación</span><b>${esc(commercial.billing_status||"—")}</b></div>`:""}
        </div>
      </section>

      <form id="organizationSettingsForm" class="settings-form">
        <section class="card settings-section">
          <div class="card-head"><div><h2>Identidad del negocio</h2><p>Cómo aparece la empresa dentro de NEXO</p></div>${adminMode?'<span class="pill">Platform Admin</span>':""}</div>
          <div class="settings-grid">
            <label>Nombre del negocio<input id="settingName" value="${esc(targetOrg?.name||"")}" ${adminMode?"":"disabled"}></label>
            <label>Sector<input id="settingSector" value="${esc(targetOrg?.sector||"")}" ${adminMode?"":"disabled"}></label>
            <label>Asistente asignado<input value="${esc(targetOrg?.assistant||"")}" disabled></label>
            <label>Iniciales<input id="settingInitials" maxlength="3" value="${esc(targetOrg?.initials||"NX")}" ${adminMode?"":"disabled"}></label>
            <label>Color de marca<input id="settingColor" type="color" value="${esc(targetOrg?.color||"#316bff")}" ${adminMode?"":"disabled"}></label>
            <label>Zona horaria<input id="settingTimezone" value="${esc(targetOrg?.timezone||"America/Bogota")}" ${adminMode?"":"disabled"}></label>
          </div>
        </section>

        <section class="card settings-section assistant-settings-section">
          <div class="card-head"><div><h2>Asistente virtual</h2><p>Identidad, contexto y capacidades visibles de ${esc(assistant?.name||targetOrg?.assistant||"tu asistente")}</p></div><span class="pill ${assistant?.status==="active"?"green":""}">${assistant?.status==="active"?"Activo":esc(assistant?.status||"—")}</span></div>
          <div class="assistant-editor">
            <div class="assistant-editor-photo">
              <div id="assistantPhotoPreview" class="assistant-editor-avatar">
                ${assistant?.avatar_url?`<img src="${esc(assistant.avatar_url)}" alt="${esc(assistant.name||"Asistente")}">`:esc(initialsFor(assistant?.name||targetOrg?.assistant||"NX"))}
              </div>
              ${canEdit?`<label class="btn small assistant-photo-button">Subir foto<input id="assistantPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" hidden></label>`:""}
              <small>La misma imagen se mostrará en Inicio y en la vista de NEXO.</small>
            </div>
            <div class="settings-grid assistant-editor-fields">
              <label>Nombre visible<input id="assistantNameProfile" value="${esc(assistant?.name||targetOrg?.assistant||"")}" ${adminMode?"":"disabled"}></label>
              <label>Rol<input id="assistantRoleLabel" value="${esc(assistant?.role_label||"")}" placeholder="Ej. Asistente virtual de reservas" ${canEdit?"":"disabled"}></label>
              <label>Canal<input id="assistantChannel" value="${esc(assistant?.channel||"WhatsApp")}" ${canEdit?"":"disabled"}></label>
              <label>Estado en NEXO<input value="${assistant?.status==="active"?"Activo":esc(assistant?.status||"—")}" disabled></label>
              <label class="wide">Descripción<textarea id="assistantDescription" rows="3" ${canEdit?"":"disabled"}>${esc(assistant?.description||"")}</textarea></label>
              <label class="wide">Contexto del asistente<textarea id="assistantContext" rows="4" ${canEdit?"":"disabled"}>${esc(assistant?.context_summary||"")}</textarea></label>
              <label class="wide">Tono<textarea id="assistantTone" rows="2" ${canEdit?"":"disabled"}>${esc(assistant?.tone||setting.assistant_tone||"")}</textarea></label>
              <label class="wide">Capacidades <small>Sepáralas por coma o una por línea.</small><textarea id="assistantCapabilities" rows="3" ${canEdit?"":"disabled"}>${esc((Array.isArray(assistant?.capabilities)?assistant.capabilities:[]).join("\n"))}</textarea></label>
            </div>
          </div>
        </section>

        <section class="card settings-section">
          <div class="card-head"><div><h2>Contacto y notificaciones</h2><p>Información operativa del negocio</p></div></div>
          <div class="settings-grid">
            <label>Correo público<input id="settingPublicEmail" type="email" value="${esc(setting.public_email||"")}" ${canEdit?"":"disabled"}></label>
            <label>Correo de notificaciones<input id="settingNotificationEmail" type="email" value="${esc(setting.notification_email||"")}" ${canEdit?"":"disabled"}></label>
            <label>Teléfono<input id="settingPhone" value="${esc(setting.phone||"")}" ${canEdit?"":"disabled"}></label>
            <label>WhatsApp<input id="settingWhatsapp" value="${esc(setting.whatsapp||"")}" ${canEdit?"":"disabled"}></label>
            <label>Sitio web<input id="settingWebsite" value="${esc(setting.website||"")}" ${canEdit?"":"disabled"}></label>
            <label>Ciudad<input id="settingCity" value="${esc(setting.city||"")}" ${canEdit?"":"disabled"}></label>
            <label class="wide">Dirección<input id="settingAddress" value="${esc(setting.address||"")}" ${canEdit?"":"disabled"}></label>
          </div>
        </section>

        <section class="card settings-section">
          <div class="card-head"><div><h2>Handoff y portal</h2><p>Reglas operativas del negocio cuando interviene una persona</p></div></div>
          <div class="settings-grid">
            <label>Teléfono para handoff<input id="settingHandoff" value="${esc(setting.handoff_phone||"")}" ${canEdit?"":"disabled"}></label>
            <label class="wide">Mensaje de bienvenida del portal<textarea id="settingWelcome" rows="3" ${canEdit?"":"disabled"}>${esc(setting.portal_welcome_message||"")}</textarea></label>
            <label class="settings-toggle"><input id="settingNotifications" type="checkbox" ${setting.allow_email_notifications!==false?"checked":""} ${canEdit?"":"disabled"}><span>Recibir notificaciones operativas por correo</span></label>
            <label class="settings-toggle"><input id="settingBillingEmails" type="checkbox" ${setting.allow_billing_emails!==false?"checked":""} ${canEdit?"":"disabled"}><span>Recibir correos de facturación</span></label>
          </div>
        </section>

        ${adminMode?`<section class="card settings-section">
          <div class="card-head"><div><h2>Facturación del cliente</h2><p>Parámetros comerciales administrados por NEXO</p></div><span class="pill amber">Solo NEXO</span></div>
          <div class="settings-grid">
            <label>Contacto de facturación<input id="settingBillingContact" value="${esc(commercial.billing_contact_name||"")}"></label>
            <label>Correo de facturación<input id="settingBillingEmail" type="email" value="${esc(commercial.billing_email||"")}"></label>
            <label>Día de cobro<input id="settingBillingDay" type="number" min="1" max="28" value="${commercial.billing_day??""}"></label>
            <label class="settings-toggle"><input id="settingAutoInvoice" type="checkbox" ${commercial.auto_invoice!==false?"checked":""}><span>Generar mensualidad automáticamente</span></label>
          </div>
          <div class="settings-integrations">
            <span>Integraciones</span>
            ${integrations.length?integrations.map((row)=>`<div><b>${esc(row.integration_name)}</b><small>${esc(row.provider||"")} · ${esc(row.status)}</small></div>`).join(""):'<p class="muted">Sin integraciones registradas.</p>'}
          </div>
        </section>`:""}

        <div class="settings-actions">
          ${canManageCurrentOrgUsers() && !adminInternalView()?'<button id="settingsUsersButton" class="btn" type="button">Usuarios y accesos</button>':""}
          ${canEdit?'<button class="btn primary" type="submit">Guardar configuración</button>':'<span class="muted">Tu rol tiene acceso de solo lectura.</span>'}
        </div>
      </form>
    </div>
  `;

  let pendingAssistantAvatar=null;
  $("assistantPhotoInput")?.addEventListener("change",(event)=>{
    const file=event.target.files?.[0];
    if(!file)return;
    pendingAssistantAvatar=file;
    const url=URL.createObjectURL(file);
    $("assistantPhotoPreview").innerHTML=`<img src="${url}" alt="Vista previa del asistente">`;
  });

  $("settingsOrgSelect")?.addEventListener("change",async(event)=>{state.settingsOrgId=event.target.value;persistUiState();await renderSettings();});
  $("settingsUsersButton")?.addEventListener("click",async()=>{state.page="team";persistUiState();await render();});

  $("organizationSettingsForm")?.addEventListener("submit",async(event)=>{
    event.preventDefault();
    if(!canEdit)return;
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;button.textContent="Guardando…";
    try{
      const settingsPayload={
        organization_id:targetId,
        public_email:$("settingPublicEmail").value.trim()||null,
        notification_email:$("settingNotificationEmail").value.trim()||null,
        phone:$("settingPhone").value.trim()||null,
        whatsapp:$("settingWhatsapp").value.trim()||null,
        website:$("settingWebsite").value.trim()||null,
        address:$("settingAddress").value.trim()||null,
        city:$("settingCity").value.trim()||null,
        country:setting.country||"Colombia",
        handoff_phone:$("settingHandoff").value.trim()||null,
        assistant_tone:$("assistantTone").value.trim()||null,
        portal_welcome_message:$("settingWelcome").value.trim()||null,
        allow_email_notifications:$("settingNotifications").checked,
        allow_billing_emails:$("settingBillingEmails").checked,
        updated_by:state.session.user.id,
        updated_at:new Date().toISOString(),
      };
      const {error:settingsError}=await supabase.from("organization_settings").upsert(settingsPayload,{onConflict:"organization_id"});
      if(settingsError)throw settingsError;

      if(assistant){
        let assistantAvatarUrl=assistant.avatar_url||null;
        if(pendingAssistantAvatar) assistantAvatarUrl=await uploadMediaImage(pendingAssistantAvatar,"assistants",targetId);
        const capabilities=$("assistantCapabilities").value
          .split(/[,\n]/).map((item)=>item.trim()).filter(Boolean);
        const assistantPayload={
          name:$("assistantNameProfile").value.trim()||assistant.name,
          role_label:$("assistantRoleLabel").value.trim()||null,
          channel:$("assistantChannel").value.trim()||"WhatsApp",
          status:assistant.status,
          description:$("assistantDescription").value.trim()||null,
          context_summary:$("assistantContext").value.trim()||null,
          tone:$("assistantTone").value.trim()||null,
          capabilities,
          avatar_url:assistantAvatarUrl,
          updated_at:new Date().toISOString(),
        };
        const {error:assistantError}=await supabase.from("assistants").update(assistantPayload).eq("id",assistant.id);
        if(assistantError)throw assistantError;
      }

      if(adminMode){
        const {error:orgError}=await supabase.from("organizations").update({
          name:$("settingName").value.trim(),sector:$("settingSector").value.trim(),
          assistant:$("assistantNameProfile").value.trim(),initials:$("settingInitials").value.trim().toUpperCase()||"NX",
          color:$("settingColor").value,timezone:$("settingTimezone").value.trim()||"America/Bogota",updated_at:new Date().toISOString()
        }).eq("id",targetId);
        if(orgError)throw orgError;
        const {error:billingError}=await supabase.from("organization_commercials").update({
          billing_contact_name:$("settingBillingContact").value.trim()||null,
          billing_email:$("settingBillingEmail").value.trim()||null,
          billing_day:Number($("settingBillingDay").value)||null,
          auto_invoice:$("settingAutoInvoice").checked,updated_at:new Date().toISOString()
        }).eq("organization_id",targetId);
        if(billingError)throw billingError;
      }

      showToast("Configuración guardada.");
      await loadOrganizations();
      state.settingsOrgId=targetId;
      await renderSettings();
    }catch(error){showError(error.message||"No pudimos guardar la configuración.");button.disabled=false;button.textContent="Guardar configuración";}
  });
}

async function renderAudit() {
  if (!adminInternalView()) {
    $("content").innerHTML=emptyState("Audit Log es privado de NEXO.","Selecciona NEXO Internal para revisar el historial administrativo.");
    return;
  }
  const {data,error}=await supabase.from("audit_log").select("*").order("created_at",{ascending:false}).limit(500);
  if(error)throw error;
  const rows=data||[];
  state.currentRows=rows;
  const orgName=(id)=>state.organizations.find((org)=>org.id===id)?.name||"NEXO / Sistema";
  const tables=[...new Set(rows.map((row)=>row.table_name))].sort();

  $("content").innerHTML=`
    <section class="audit-toolbar card">
      <div><span class="eyebrow">HISTORIAL ADMINISTRATIVO</span><h2>Quién cambió qué y cuándo</h2><p>Configuración, usuarios, facturación, comerciales e integraciones.</p></div>
      <div class="audit-filters">
        <select id="auditOrgFilter" class="control"><option value="">Todos los clientes</option>${clientOrganizations({activeOnly:false}).map((org)=>`<option value="${org.id}">${esc(org.name)}</option>`).join("")}</select>
        <select id="auditTableFilter" class="control"><option value="">Todas las áreas</option>${tables.map((table)=>`<option value="${table}">${esc(auditAreaLabel(table))}</option>`).join("")}</select>
        <input id="auditSearch" class="control" placeholder="Buscar actor o cambio">
      </div>
    </section>
    <section class="card audit-card">
      <div class="card-head"><div><h2>Actividad reciente</h2><p>Se conserva el antes y después para revisión interna</p></div><span id="auditCount" class="count">${rows.length}</span></div>
      <div id="auditRows" class="audit-list"></div>
    </section>
  `;

  const draw=()=>{
    const orgFilter=$("auditOrgFilter").value;
    const tableFilter=$("auditTableFilter").value;
    const q=$("auditSearch").value.trim().toLowerCase();
    const filtered=rows.filter((row)=>{
      if(orgFilter&&row.organization_id!==orgFilter)return false;
      if(tableFilter&&row.table_name!==tableFilter)return false;
      const hay=[row.actor_email,auditAreaLabel(row.table_name),auditActionLabel(row.action),auditChangedSummary(row),orgName(row.organization_id)].filter(Boolean).join(" ").toLowerCase();
      return !q||hay.includes(q);
    });
    $("auditCount").textContent=String(filtered.length);
    $("auditRows").innerHTML=filtered.length?filtered.map((row)=>`<details class="audit-entry">
      <summary>
        <span class="audit-action ${row.action.toLowerCase()}">${esc(auditActionLabel(row.action))}</span>
        <div><b>${esc(auditAreaLabel(row.table_name))}</b><small>${esc(orgName(row.organization_id))} · ${esc(row.actor_email||"Sistema")}</small></div>
        <span class="audit-summary">${esc(auditChangedSummary(row))}</span>
        <time>${dateTime(row.created_at)}</time>
      </summary>
      <div class="audit-detail">
        ${Object.keys(row.changed_fields||{}).filter((key)=>!["updated_at","created_at"].includes(key)).map((key)=>`<div><span>${esc(key.replaceAll("_"," "))}</span><code>${esc(typeof row.changed_fields[key]==="object"?JSON.stringify(row.changed_fields[key]):row.changed_fields[key])}</code></div>`).join("")||'<p>Sin detalle adicional.</p>'}
      </div>
    </details>`).join(""):emptyState("No hay cambios con esos filtros.","Ajusta la búsqueda o espera nuevas acciones administrativas.");
  };
  draw();
  ["auditOrgFilter","auditTableFilter","auditSearch"].forEach((id)=>$(id)?.addEventListener(id==="auditSearch"?"input":"change",draw));
}

async function renderAdmin() {
  if (!state.isAdmin) {
    $("content").innerHTML = emptyState("Tu cuenta no tiene permisos de plataforma.", "Esta vista está reservada para NEXO.");
    return;
  }

  const clients = clientOrganizations({ activeOnly: false });
  const activeClients = clientOrganizations();
  const internal = state.organizations.find((org) => org.name === "NEXO Internal");
  const totals = internal ? await getMetrics(internal.id, currentDays(), { comparison: false }) : null;

  const rows = await Promise.all(clients.map(async (org) => {
    const metrics = await getMetrics(org.id, currentDays(), { comparison: false });
    return { org, metrics, health: operationalHealth(metrics) };
  }));

  state.currentRows = rows.map(({ org, metrics, health }) => ({
    organization: org.name,
    status: org.status,
    health: health.score,
    health_label: health.level,
    assistant: org.assistant,
    conversations: metrics.chats,
    leads: metrics.leadCount,
    conversion: metrics.conversion,
    appointments: metrics.confirmed,
    value: metrics.value,
    attention: metrics.attention,
  }));

  $("content").innerHTML = `
    <div class="stats-grid">
      ${statCard("Clientes activos", activeClients.length, `${clients.length} organizaciones creadas`, true)}
      ${statCard("Conversaciones", totals?.chats || 0, "Actividad de clientes activos")}
      ${statCard("Leads", totals?.leadCount || 0, `${totals?.leadRate || 0}% de captura`)}
      ${statCard("Valor confirmado", money(totals?.value || 0), `${totals?.confirmed || 0} citas confirmadas`)}
    </div>

    <section class="card admin-table-card">
      <div class="card-head">
        <div><h2>Clientes de NEXO</h2><p>Estado y rendimiento del período seleccionado</p></div>
        <span class="count">${activeClients.length} activos</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>Estado</th><th>Salud</th><th>Asistente</th><th>Conversaciones</th><th>Leads</th><th>Conversión</th><th>Citas</th><th>Valor</th><th>Atención</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map(({ org, metrics, health }) => `
              <tr>
                <td><b>${esc(org.name)}</b><br><span class="muted">${esc(org.sector || "Sin sector")}</span></td>
                <td>${org.status === "active" ? '<span class="pill green">Activo</span>' : `<span class="pill">${esc(org.status || "—")}</span>`}</td>
                <td>${healthBadge(health, true)}</td>
                <td>${esc(org.assistant || "—")}</td>
                <td>${metrics.chats}</td>
                <td>${metrics.leadCount}</td>
                <td><b>${metrics.conversion}%</b></td>
                <td>${metrics.confirmed}</td>
                <td>${money(metrics.value)}</td>
                <td>${metrics.attention ? `<span class="count">${metrics.attention}</span>` : '<span class="pill green">0</span>'}</td>
              </tr>
            `).join("") : `<tr><td colspan="10">${emptyState("Todavía no hay clientes.", "Crea el primer negocio desde este panel.")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

    <div class="grid-two admin-grid admin-actions-grid">
      <section class="card access-card">
        <div class="card-head"><div><h2>Crear acceso inicial</h2><p>Asigna al propietario o administrador de un cliente</p></div></div>
        <form id="clientAccessForm" class="admin-form">
          <label>Nombre</label>
          <input id="clientName" type="text" placeholder="Ej. Isabel Gómez" required />
          <label>Correo</label>
          <input id="clientEmail" type="email" placeholder="cliente@correo.com" required />
          <label>Empresa</label>
          <select id="clientOrg" required>
            ${clients.map((org) => `<option value="${org.id}">${esc(org.name)}</option>`).join("")}
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

      <section class="card new-business-card">
        <div class="card-head"><div><h2>Nuevo negocio</h2><p>Solo Platform Admin puede crear compañías</p></div></div>
        <form id="newBusinessForm" class="admin-form business-form">
          <label>Nombre del negocio</label>
          <input id="businessName" type="text" placeholder="Ej. Hotel Central Medellín" required />
          <label>Sector</label>
          <input id="businessSector" type="text" placeholder="Ej. Hotel, restaurante, estética" />
          <label>Nombre del asistente</label>
          <input id="assistantName" type="text" placeholder="Ej. Luna" required />
          <label>Iniciales</label>
          <input id="businessInitials" type="text" maxlength="3" placeholder="Ej. HC" />
          <label>Color de marca</label>
          <input id="businessColor" type="color" value="#316bff" />
          <button id="createBusiness" class="btn primary" type="submit">Crear negocio</button>
        </form>
        <div id="businessResult" class="access-result hidden"></div>
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
        resultBox.innerHTML = `<strong>Acceso agregado</strong><p>${esc(data.email)} ya tenía una cuenta NEXO y ahora tiene acceso a <b>${esc(data.organization_name)}</b>.</p>`;
      } else {
        resultBox.innerHTML = `
          <strong>Enlace de activación listo</strong>
          <p>Envíaselo a <b>${esc(data.email)}</b>. Vence en 48 horas.</p>
          <div class="setup-link-row">
            <input id="generatedSetupLink" value="${esc(data.setup_url)}" readonly />
            <button id="copySetupLink" class="btn small" type="button">Copiar</button>
          </div>
        `;
        $("copySetupLink")?.addEventListener("click", async () => {
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

  $("newBusinessForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("createBusiness");
    const resultBox = $("businessResult");
    resultBox.className = "access-result hidden";
    button.disabled = true;
    button.textContent = "Creando…";
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-organization", {
        body: {
          name: $("businessName").value.trim(),
          sector: $("businessSector").value.trim(),
          assistant: $("assistantName").value.trim(),
          initials: $("businessInitials").value.trim(),
          color: $("businessColor").value,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "No pudimos crear el negocio.");
      resultBox.innerHTML = `<strong>Negocio creado</strong><p><b>${esc(data.organization.name)}</b> ya está disponible con el asistente <b>${esc(data.organization.assistant)}</b>.</p>`;
      resultBox.className = "access-result ok";
      showToast("Negocio creado.");
      await loadOrganizations();
      await renderAdmin();
    } catch (error) {
      resultBox.innerHTML = `<strong>No pudimos crear el negocio</strong><p>${esc(error.message || "Inténtalo de nuevo.")}</p>`;
      resultBox.className = "access-result error";
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Crear negocio";
      }
    }
  });
}


function invoiceTypeLabel(value) {
  return ({ monthly: "Mensualidad", setup: "Setup", other: "Otro" }[value] || value || "Cobro");
}

function invoiceStatusLabel(value) {
  return ({ pending: "Pendiente", paid: "Pagado", overdue: "Vencido", waived: "Exonerado", cancelled: "Cancelado" }[value] || value || "Pendiente");
}

function derivedInvoiceStatus(invoice) {
  if (invoice.status !== "pending") return invoice.status;
  const due = new Date(String(invoice.due_date) + "T23:59:59-05:00").getTime();
  return due < Date.now() ? "overdue" : "pending";
}

function downloadInvoicePdf(invoice, organizationName = "Cliente NEXO") {
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    showError("El generador de PDF no terminó de cargar. Actualiza la página e inténtalo de nuevo.");
    return;
  }
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const number = invoice.invoice_number || "NEXO";
  const status = derivedInvoiceStatus(invoice);
  const amount = money(invoice.amount_cop);
  const concept = invoice.reference || invoiceTypeLabel(invoice.invoice_type);

  doc.setFillColor(11,31,59);
  doc.rect(0,0,210,42,"F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold");
  doc.setFontSize(22);
  doc.text("NEXO",18,20);
  doc.setFontSize(9);
  doc.setFont("helvetica","normal");
  doc.text("by Juan Visbal",18,27);
  doc.text("CUENTA DE COBRO",150,20);
  doc.setFontSize(8);
  doc.text(number,150,27);

  doc.setTextColor(31,41,55);
  doc.setFont("helvetica","bold");
  doc.setFontSize(12);
  doc.text("Cliente",18,58);
  doc.setFont("helvetica","normal");
  doc.setFontSize(10);
  doc.text(String(organizationName),18,66);

  doc.setFont("helvetica","bold");
  doc.text("Estado",145,58);
  doc.setFont("helvetica","normal");
  doc.text(invoiceStatusLabel(status),145,66);

  doc.setDrawColor(226,232,240);
  doc.line(18,76,192,76);

  const rows = [
    ["Número", number],
    ["Concepto", concept],
    ["Tipo", invoiceTypeLabel(invoice.invoice_type)],
    ["Valor", amount],
    ["Vencimiento", invoice.due_date || "—"],
    ["Periodo", invoice.billing_period_start && invoice.billing_period_end ? invoice.billing_period_start + " a " + invoice.billing_period_end : "—"],
    ["Fecha de pago", invoice.paid_at ? dateTime(invoice.paid_at) : "—"],
  ];

  let y=88;
  rows.forEach(([label,value])=>{
    doc.setFont("helvetica","bold");
    doc.setFontSize(8);
    doc.setTextColor(107,122,140);
    doc.text(label.toUpperCase(),18,y);
    doc.setFont("helvetica","normal");
    doc.setFontSize(10);
    doc.setTextColor(39,57,78);
    const lines=doc.splitTextToSize(String(value),110);
    doc.text(lines,62,y);
    y += Math.max(10, lines.length*5+3);
  });

  doc.setFillColor(246,249,252);
  doc.roundedRect(18,y+4,174,30,3,3,"F");
  doc.setTextColor(42,66,93);
  doc.setFont("helvetica","bold");
  doc.setFontSize(9);
  doc.text("TOTAL A PAGAR",26,y+16);
  doc.setFontSize(18);
  doc.text(amount,26,y+27);

  if (invoice.payment_url && ["pending","overdue"].includes(status)) {
    doc.setFont("helvetica","bold");
    doc.setFontSize(9);
    doc.setTextColor(45,156,255);
    if (doc.textWithLink) doc.textWithLink("Pagar en línea con Wompi",18,y+44,{url:invoice.payment_url});
    else doc.text("Pagar en línea: " + invoice.payment_url,18,y+44);
  }

  const noteY=y+55;
  doc.setFont("helvetica","normal");
  doc.setFontSize(8);
  doc.setTextColor(110,124,143);
  const note="Documento de cobro emitido por NEXO by Juan Visbal. No constituye factura electrónica DIAN. Para inquietudes sobre este cobro escribe a nexobyjuanvisbal@gmail.com.";
  doc.text(doc.splitTextToSize(note,174),18,noteY);
  doc.text("nexobyjv.online  |  Medellín, Colombia",18,284);

  doc.save("NEXO_Cuenta_de_Cobro_" + number.replace(/[^A-Za-z0-9_-]/g,"_") + ".pdf");
}

async function startInvoicePayment(invoiceId, button = null) {
  const original = button?.textContent || "Pagar ahora";
  if (button) {
    button.disabled = true;
    button.textContent = "Preparando pago…";
  }
  try {
    const { data, error } = await supabase.functions.invoke("create-invoice-payment", {
      body: { invoice_id: invoiceId },
    });
    if (error) throw error;
    if (!data?.ok) {
      if (data?.code === "WOMPI_NOT_CONFIGURED" || data?.setup_required) {
        throw new Error("El pago en línea está preparado, pero Wompi aún no está activado por NEXO.");
      }
      throw new Error(data?.error || "No pudimos iniciar el pago.");
    }
    if (!data.url) throw new Error("No recibimos un enlace de pago.");
    window.open(data.url, "_blank", "noopener,noreferrer");
    showToast("Pago abierto en Wompi.");
    setTimeout(() => render(), 1200);
  } catch (error) {
    showError(error.message || "No pudimos iniciar el pago.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

async function renderBillingPortal() {
  const internalAggregate = state.isAdmin && isInternalOrg();
  const orgIds = internalAggregate
    ? clientOrganizations({ activeOnly: false }).map((org) => org.id)
    : (currentOrgId() ? [currentOrgId()] : []);

  if (!orgIds.length) {
    $("content").innerHTML = emptyState("No hay una empresa seleccionada.", "Selecciona una empresa para consultar su facturación.");
    return;
  }

  let request = supabase.from("client_invoices").select("*").order("due_date", { ascending: false }).limit(1000);
  request = orgIds.length === 1 ? request.eq("organization_id", orgIds[0]) : request.in("organization_id", orgIds);
  const { data: invoices, error } = await request;
  if (error) throw error;

  const rows = invoices || [];
  const orgName = (id) => state.organizations.find((org) => org.id === id)?.name || "Cliente NEXO";
  const pending = rows.filter((row) => ["pending","overdue"].includes(derivedInvoiceStatus(row)));
  const overdue = rows.filter((row) => derivedInvoiceStatus(row) === "overdue");
  const paid = rows.filter((row) => row.status === "paid");
  const paidTotal = paid.reduce((sum,row)=>sum+Number(row.amount_cop||0),0);
  const receivable = pending.reduce((sum,row)=>sum+Number(row.amount_cop||0),0);
  const currentYear = new Date().getFullYear();
  const paidThisYear = paid.filter((row)=>row.paid_at && new Date(row.paid_at).getFullYear()===currentYear)
    .reduce((sum,row)=>sum+Number(row.amount_cop||0),0);

  state.currentRows = rows;

  $("content").innerHTML = `
    <div class="billing-portal-kpis">
      ${metricCard("Por pagar", money(receivable), `${pending.length} documento${pending.length===1?"":"s"} pendiente${pending.length===1?"":"s"}`, null, true)}
      ${metricCard("Vencidos", overdue.length, overdue.length ? "Requieren atención" : "Sin vencimientos")}
      ${metricCard("Pagado histórico", money(paidTotal), `${paid.length} pago${paid.length===1?"":"s"} registrado${paid.length===1?"":"s"}`)}
      ${metricCard("Pagado " + currentYear, money(paidThisYear), "Acumulado del año")}
    </div>

    <section class="card billing-portal-card">
      <div class="card-head">
        <div><h2>${internalAggregate ? "Facturación de clientes" : "Mis cuentas de cobro"}</h2><p>Historial de cobros, vencimientos y pagos registrados en NEXO</p></div>
        <span class="count">${rows.length} documento${rows.length===1?"":"s"}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${internalAggregate?"<th>Cliente</th>":""}<th>Número</th><th>Concepto</th><th>Valor</th><th>Vence</th><th>Estado</th><th>Pago</th><th>Pago online</th><th>Documento</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((row)=>{
              const status=derivedInvoiceStatus(row);
              return `<tr>
                ${internalAggregate?`<td><b>${esc(orgName(row.organization_id))}</b></td>`:""}
                <td><b>${esc(row.invoice_number || "—")}</b></td>
                <td>${esc(row.reference || invoiceTypeLabel(row.invoice_type))}<br><span class="muted">${esc(invoiceTypeLabel(row.invoice_type))}</span></td>
                <td><b>${money(row.amount_cop)}</b></td>
                <td>${shortDate(row.due_date)}</td>
                <td><span class="pill ${status==="paid"?"green":status==="overdue"?"orange":status==="pending"?"amber":""}">${esc(invoiceStatusLabel(status))}</span></td>
                <td>${row.paid_at ? dateTime(row.paid_at) : "—"}</td>
                <td>
                  ${["pending","overdue"].includes(status)
                    ? `<button class="btn primary small billing-pay-button" data-invoice-id="${row.id}" type="button">Pagar ahora</button>
                       <span class="billing-payment-state">${row.payment_status === "pending" ? "Link generado" : row.payment_status === "declined" ? "Pago rechazado" : row.payment_status === "error" ? "Error de pago" : ""}</span>`
                    : row.payment_status === "approved" ? '<span class="pill green">Pago confirmado</span>' : "—"}
                </td>
                <td><button class="btn small billing-pdf-button" data-invoice-id="${row.id}" type="button">Descargar PDF</button></td>
              </tr>`;
            }).join("") : `<tr><td colspan="${internalAggregate?9:8}">${emptyState("Todavía no hay cuentas de cobro.", "Cuando exista un cobro aparecerá aquí automáticamente.")}</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="billing-portal-note">
        <b>Sobre estos documentos</b>
        <p>Las cuentas de cobro muestran el estado registrado por NEXO. No corresponden a una factura electrónica DIAN.</p>
      </div>
    </section>
  `;

  const byId=new Map(rows.map((row)=>[row.id,row]));
  document.querySelectorAll(".billing-pay-button").forEach((button)=>{
    button.addEventListener("click",()=>startInvoicePayment(button.dataset.invoiceId,button));
  });

  document.querySelectorAll(".billing-pdf-button").forEach((button)=>{
    button.addEventListener("click",()=>{
      const invoice=byId.get(button.dataset.invoiceId);
      downloadInvoicePdf(invoice,orgName(invoice.organization_id));
    });
  });
}

async function renderTeam() {
  if (!canManageCurrentOrgUsers() || isInternalOrg()) {
    $("content").innerHTML = emptyState("No puedes administrar usuarios aquí.", "Selecciona una organización de cliente donde tengas rol Owner o Admin.");
    return;
  }

  const org = currentOrg();
  const { data, error } = await supabase.functions.invoke("org-user-access", {
    body: { action: "list", organization_id: org.id },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || "No pudimos cargar los usuarios.");

  const requesterRole = data.requester_role;
  const roleOptions = requesterRole === "platform_admin"
    ? ["owner", "admin", "operator", "viewer"]
    : requesterRole === "owner"
      ? ["admin", "operator", "viewer"]
      : ["operator", "viewer"];

  const roleLabel = (role) => ({
    owner: "Propietario", admin: "Administrador", operator: "Operador", viewer: "Solo lectura", platform_admin: "Platform Admin",
  }[role] || role);

  $("content").innerHTML = `
    <div class="team-summary">
      <div>
        <span class="eyebrow">ACCESOS · ${esc(org.name)}</span>
        <h2>${data.users.length} usuario${data.users.length === 1 ? "" : "s"} con acceso</h2>
        <p>Los usuarios de esta empresa solo pueden consultar la información autorizada de este negocio.</p>
      </div>
      <div class="role-badge">Tu rol: <b>${esc(roleLabel(requesterRole))}</b></div>
    </div>

    <div class="grid-two team-grid">
      <section class="card">
        <div class="card-head"><div><h2>Usuarios del dashboard</h2><p>Acceso actual a ${esc(org.name)}</p></div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Desde</th><th></th></tr></thead>
            <tbody id="teamRows">
              ${data.users.map((user) => `
                <tr>
                  <td><b>${esc(user.full_name || "Usuario NEXO")}</b>${user.current_user ? '<br><span class="muted">Tu cuenta</span>' : ""}</td>
                  <td>${esc(user.email || "—")}</td>
                  <td>
                    ${user.current_user ? `<span class="pill">${esc(roleLabel(user.role))}</span>` : `
                      <select class="status-select member-role" data-user-id="${user.user_id}" data-current-role="${esc(user.role)}">
                        ${[...new Set([user.role, ...roleOptions])].map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${esc(roleLabel(role))}</option>`).join("")}
                      </select>
                    `}
                  </td>
                  <td>${shortDate(user.created_at)}</td>
                  <td>${user.current_user ? "" : `<button class="member-remove" data-user-id="${user.user_id}" type="button">Quitar</button>`}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card access-card">
        <div class="card-head"><div><h2>Agregar usuario</h2><p>Invita a alguien al dashboard de esta empresa</p></div></div>
        <form id="orgUserForm" class="admin-form">
          <label>Nombre</label>
          <input id="orgUserName" type="text" placeholder="Nombre completo" required />
          <label>Correo</label>
          <input id="orgUserEmail" type="email" placeholder="usuario@correo.com" required />
          <label>Rol</label>
          <select id="orgUserRole">${roleOptions.map((role) => `<option value="${role}">${esc(roleLabel(role))}</option>`).join("")}</select>
          <button id="orgUserSubmit" class="btn primary" type="submit">Agregar usuario</button>
        </form>
        <div id="orgUserResult" class="access-result hidden"></div>
      </section>
    </div>
  `;

  $("orgUserForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("orgUserSubmit");
    const box = $("orgUserResult");
    button.disabled = true;
    button.textContent = "Agregando…";
    box.className = "access-result hidden";
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke("org-user-access", {
        body: {
          action: "create",
          organization_id: org.id,
          full_name: $("orgUserName").value.trim(),
          email: $("orgUserEmail").value.trim(),
          role: $("orgUserRole").value,
        },
      });
      if (invokeError) throw invokeError;
      if (!result?.ok) throw new Error(result?.error || "No pudimos agregar el usuario.");

      if (result.setup_url) {
        box.innerHTML = `
          <strong>Usuario creado</strong>
          <p>Comparte este enlace privado para que cree su contraseña. Vence en 48 horas.</p>
          <div class="setup-link-row"><input id="orgGeneratedLink" value="${esc(result.setup_url)}" readonly /><button id="copyOrgLink" class="btn small" type="button">Copiar</button></div>
        `;
        $("copyOrgLink")?.addEventListener("click", async () => {
          await navigator.clipboard.writeText(result.setup_url);
          showToast("Enlace copiado.");
        });
      } else {
        box.innerHTML = `<strong>Acceso agregado</strong><p>El usuario ya tenía una cuenta NEXO. Puede ingresar con su contraseña actual.</p>`;
      }
      box.className = "access-result ok";
      showToast("Usuario agregado.");
      setTimeout(() => renderTeam(), 1200);
    } catch (err) {
      box.innerHTML = `<strong>No pudimos agregarlo</strong><p>${esc(err.message || "Inténtalo de nuevo.")}</p>`;
      box.className = "access-result error";
    } finally {
      button.disabled = false;
      button.textContent = "Agregar usuario";
    }
  });

  document.querySelectorAll(".member-role").forEach((select) => {
    select.addEventListener("change", async () => {
      const oldRole = select.dataset.currentRole;
      select.disabled = true;
      try {
        const { data: result, error: invokeError } = await supabase.functions.invoke("org-user-access", {
          body: { action: "update_role", organization_id: org.id, user_id: select.dataset.userId, role: select.value },
        });
        if (invokeError) throw invokeError;
        if (!result?.ok) throw new Error(result?.error || "No pudimos actualizar el rol.");
        select.dataset.currentRole = select.value;
        showToast("Rol actualizado.");
      } catch (err) {
        select.value = oldRole;
        showError(err.message || "No pudimos actualizar el rol.");
      } finally {
        select.disabled = false;
      }
    });
  });

  document.querySelectorAll(".member-remove").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("¿Quitar el acceso de este usuario a la empresa?")) return;
      button.disabled = true;
      try {
        const { data: result, error: invokeError } = await supabase.functions.invoke("org-user-access", {
          body: { action: "remove", organization_id: org.id, user_id: button.dataset.userId },
        });
        if (invokeError) throw invokeError;
        if (!result?.ok) throw new Error(result?.error || "No pudimos quitar el acceso.");
        showToast("Acceso eliminado.");
        await renderTeam();
      } catch (err) {
        showError(err.message || "No pudimos quitar el acceso.");
        button.disabled = false;
      }
    });
  });
}

function isUserEditing() {
  const active = document.activeElement;
  const formFocused = active && ["INPUT","TEXTAREA","SELECT"].includes(active.tagName);
  const chat = document.getElementById("chatModal");
  const chatOpen = chat && !chat.classList.contains("hidden");
  const crmOpen = !!document.getElementById("crmModal");
  return Boolean(formFocused || chatOpen || crmOpen);
}

function pageUsesRealtimeTable(table) {
  const map = {
    conversations: ["overview","conversations","metrics"],
    messages: ["overview","conversations","metrics"],
    leads: ["overview","leads","metrics"],
    appointments: ["overview","appointments","metrics"],
    followups: ["overview","followups","metrics"],
    client_invoices: ["crm","billing"],
    demo_requests: ["crm","admin"],
    crm_activities: ["crm"],
  };
  return (map[table] || []).includes(state.page);
}

function scheduleRealtimeRefresh(table) {
  if (!state.session || !pageUsesRealtimeTable(table)) return;
  state.pendingRealtimeRefresh = true;
  clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(async () => {
    if (isUserEditing()) return;
    state.pendingRealtimeRefresh = false;
    await render();
  }, 650);
}

function startRealtime() {
  if (!state.session) return;
  if (realtimeChannel) supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel("nexo-dashboard-live");
  [
    "conversations","messages","leads","appointments","followups",
    "client_invoices","demo_requests","crm_activities"
  ].forEach((table) => {
    realtimeChannel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
      scheduleRealtimeRefresh(table);
      refreshNotifications().catch(()=>{});
    });
  });
  realtimeChannel.subscribe();
}



function searchOrgIds() {
  if (state.isAdmin && isInternalOrg()) return clientOrganizations({ activeOnly: false }).map((org)=>org.id);
  return currentOrgId() ? [currentOrgId()] : [];
}

function searchLabelFor(type,row) {
  if (type==="conversation") return row.name || row.service || "Conversación";
  if (type==="lead") return row.name || row.company || row.business_name || "Lead";
  if (type==="appointment") return row.name || row.service || "Cita";
  if (type==="invoice") return row.invoice_number || row.reference || "Cuenta de cobro";
  if (type==="prospect") return row.business_name || row.full_name || "Prospecto";
  return "Registro";
}

function searchDetailFor(type,row) {
  const org=state.organizations.find((item)=>item.id===row.organization_id)?.name;
  const bits=[];
  if (org) bits.push(org);
  if (type==="conversation" && row.status) bits.push(row.status);
  if (type==="lead") bits.push(row.stage || row.status || "");
  if (type==="appointment") bits.push(row.status || row.service || "");
  if (type==="invoice") bits.push(money(row.amount_cop), row.status || "");
  if (type==="prospect") bits.push(row.stage || row.status || "");
  return bits.filter(Boolean).join(" · ");
}

async function buildSearchIndex() {
  const orgIds=searchOrgIds();
  const scope=(request)=>{
    if (!orgIds.length) return request.eq("organization_id","00000000-0000-0000-0000-000000000000");
    return orgIds.length===1 ? request.eq("organization_id",orgIds[0]) : request.in("organization_id",orgIds);
  };

  const jobs=[
    scope(supabase.from("conversations").select("*").order("last_message_at",{ascending:false}).limit(250)),
    scope(supabase.from("leads").select("*").order("created_at",{ascending:false}).limit(250)),
    scope(supabase.from("appointments").select("*").order("created_at",{ascending:false}).limit(250)),
    scope(supabase.from("client_invoices").select("*").order("created_at",{ascending:false}).limit(250)),
  ];
  if (state.isAdmin && isInternalOrg()) jobs.push(supabase.from("demo_requests").select("*").order("created_at",{ascending:false}).limit(250));

  const results=await Promise.all(jobs);
  const types=["conversation","lead","appointment","invoice","prospect"];
  const pages={conversation:"conversations",lead:"leads",appointment:"appointments",invoice:"billing",prospect:"crm"};
  const index=[];

  results.forEach((result,i)=>{
    (result.data||[]).forEach((row)=>{
      const type=types[i];
      const title=searchLabelFor(type,row);
      const detail=searchDetailFor(type,row);
      const raw=Object.values(row).filter((value)=>value!==null && typeof value!=="object").join(" ");
      index.push({
        type,page:pages[type],orgId:row.organization_id||null,row,title,detail,
        haystack:(title+" "+detail+" "+raw).toLowerCase()
      });
    });
  });
  state.searchIndex=index;
  return index;
}

function searchTypeLabel(type) {
  return ({conversation:"Chat",lead:"Lead",appointment:"Cita",invoice:"Cobro",prospect:"Prospecto"}[type]||type);
}

function renderSearchResults(query="") {
  const box=$("globalSearchResults");
  if (!box) return;
  const q=query.trim().toLowerCase();
  if (!q) {
    box.innerHTML='<div class="global-search-empty"><b>Busca en toda tu operación.</b><p>Escribe un nombre, número de cuenta, estado, servicio o negocio.</p></div>';
    return;
  }
  const terms=q.split(/\s+/).filter(Boolean);
  const matches=state.searchIndex
    .filter((item)=>terms.every((term)=>item.haystack.includes(term)))
    .slice(0,30);

  box.innerHTML=matches.length ? matches.map((item,index)=>`
    <button class="global-search-result ${index===0?"selected":""}" type="button" data-search-index="${state.searchIndex.indexOf(item)}">
      <span class="global-search-type">${esc(searchTypeLabel(item.type))}</span>
      <div><b>${esc(item.title)}</b><small>${esc(item.detail || "NEXO")}</small></div>
      <em>→</em>
    </button>
  `).join("") : '<div class="global-search-empty"><b>Sin coincidencias.</b><p>Prueba con otro nombre, estado o referencia.</p></div>';

  box.querySelectorAll("[data-search-index]").forEach((button)=>{
    button.addEventListener("click",()=>openSearchResult(Number(button.dataset.searchIndex)));
  });
}

async function openSearchResult(index) {
  const item=state.searchIndex[index];
  if (!item) return;
  if (item.orgId && state.organizations.some((org)=>org.id===item.orgId)) $("orgSelect").value=item.orgId;
  state.page=item.page;
  document.querySelectorAll(".nav-item").forEach((el)=>el.classList.toggle("active",el.dataset.page===state.page));
  persistUiState();
  closeGlobalSearch();
  await render();
}

async function openGlobalSearch() {
  const panel=$("globalSearchPanel");
  if (!panel) return;
  panel.classList.remove("hidden");
  const input=$("globalSearchInput");
  input.value="";
  $("globalSearchResults").innerHTML='<div class="global-search-empty"><b>Cargando búsqueda…</b><p>Preparando los registros autorizados de tu empresa.</p></div>';
  try {
    await buildSearchIndex();
    renderSearchResults("");
  } catch (error) {
    $("globalSearchResults").innerHTML='<div class="global-search-empty"><b>No pudimos cargar la búsqueda.</b><p>Inténtalo nuevamente.</p></div>';
  }
  setTimeout(()=>input?.focus(),20);
}

function closeGlobalSearch() {
  $("globalSearchPanel")?.classList.add("hidden");
}

function notificationOrgIds() {
  if (state.isAdmin && isInternalOrg()) return clientOrganizations({ activeOnly: false }).map((org) => org.id);
  return currentOrgId() ? [currentOrgId()] : [];
}

function notificationOrgName(orgId) {
  return state.organizations.find((org) => org.id === orgId)?.name || "NEXO";
}

async function refreshNotifications() {
  if (!state.session) return;
  const orgIds = notificationOrgIds();
  const items = [];
  const scoped = (query) => {
    if (!orgIds.length) return query.eq("organization_id", "00000000-0000-0000-0000-000000000000");
    return orgIds.length === 1 ? query.eq("organization_id", orgIds[0]) : query.in("organization_id", orgIds);
  };

  const tasks = [
    scoped(supabase.from("conversations").select("id,organization_id,name,status,last_message_at").eq("status","Requiere atención").order("last_message_at",{ascending:false}).limit(12)),
    scoped(supabase.from("appointments").select("id,organization_id,name,status,starts_at,created_at").in("status",["Solicitada","Pendiente"]).order("created_at",{ascending:false}).limit(12)),
    scoped(supabase.from("client_invoices").select("id,organization_id,invoice_number,status,due_date,amount_cop,reference").in("status",["pending","overdue"]).order("due_date",{ascending:true}).limit(20)),
  ];

  const [conversationResult, appointmentResult, invoiceResult] = await Promise.all(tasks);

  (conversationResult.data || []).forEach((row) => items.push({
    tone:"risk", priority:100, page:"conversations", orgId:row.organization_id,
    title:"Chat requiere atención",
    detail:(row.name || "Conversación") + " · " + notificationOrgName(row.organization_id),
    date:row.last_message_at,
  }));

  (appointmentResult.data || []).forEach((row) => items.push({
    tone:"watch", priority:80, page:"appointments", orgId:row.organization_id,
    title:"Cita pendiente de confirmar",
    detail:(row.name || "Solicitud") + " · " + notificationOrgName(row.organization_id),
    date:row.starts_at || row.created_at,
  }));

  (invoiceResult.data || []).forEach((row) => {
    const overdue = row.status === "overdue" || new Date(String(row.due_date)+"T23:59:59-05:00").getTime() < Date.now();
    items.push({
      tone:overdue?"risk":"watch", priority:overdue?95:65, page:"billing", orgId:row.organization_id,
      title:overdue?"Cobro vencido":"Cobro pendiente",
      detail:(row.invoice_number || "Cuenta de cobro") + " · " + money(row.amount_cop) + " · " + notificationOrgName(row.organization_id),
      date:row.due_date,
    });
  });

  if (state.isAdmin && isInternalOrg()) {
    const [{data:prospects},{data:commercials}] = await Promise.all([
      supabase.from("demo_requests").select("id,business_name,full_name,stage,status,next_action_at,created_at").in("stage",["prospecto","demo","propuesta"]).order("created_at",{ascending:false}).limit(20),
      supabase.from("organization_commercials").select("organization_id,integration_status,renewal_date,lifecycle_stage").neq("lifecycle_stage","cancelado"),
    ]);

    (prospects || []).forEach((row) => {
      const stale = row.next_action_at && new Date(row.next_action_at).getTime() < Date.now();
      items.push({
        tone:stale?"risk":"info", priority:stale?90:70, page:"crm", orgId:null,
        title:stale?"Seguimiento comercial vencido":"Nuevo prospecto en pipeline",
        detail:(row.business_name || row.full_name || "Prospecto") + " · " + (row.stage || "prospecto"),
        date:row.next_action_at || row.created_at,
      });
    });

    (commercials || []).forEach((row) => {
      if (["attention","pending","partial"].includes(row.integration_status)) {
        items.push({
          tone:row.integration_status==="attention"?"risk":"watch", priority:75, page:"crm", orgId:row.organization_id,
          title:"Integración por revisar",
          detail:notificationOrgName(row.organization_id) + " · " + row.integration_status,
          date:null,
        });
      }
      if (row.renewal_date) {
        const renewal = new Date(String(row.renewal_date)+"T23:59:59-05:00").getTime();
        if (renewal >= Date.now() && renewal <= Date.now()+30*86400000) {
          items.push({
            tone:"watch", priority:60, page:"crm", orgId:row.organization_id,
            title:"Renovación próxima",
            detail:notificationOrgName(row.organization_id) + " · " + shortDate(row.renewal_date),
            date:row.renewal_date,
          });
        }
      }
    });
  }

  items.sort((a,b)=>b.priority-a.priority || String(b.date||"").localeCompare(String(a.date||"")));
  state.notifications = items;

  const badge=$("notificationBadge");
  if (badge) {
    badge.textContent=String(Math.min(items.length,99));
    badge.classList.toggle("hidden",!items.length);
  }

  const list=$("notificationList");
  if (!list) return;
  list.innerHTML=items.length ? items.slice(0,20).map((item,index)=>`
    <button class="notification-item ${item.tone}" type="button" data-notification-index="${index}">
      <i></i>
      <div><b>${esc(item.title)}</b><span>${esc(item.detail)}</span>${item.date?`<small>${esc(shortDate(item.date))}</small>`:""}</div>
      <em>→</em>
    </button>
  `).join("") : `
    <div class="notification-empty"><span>✓</span><b>Todo al día</b><p>No hay alertas activas en este momento.</p></div>
  `;

  list.querySelectorAll("[data-notification-index]").forEach((button)=>{
    button.addEventListener("click",async()=>{
      const item=items[Number(button.dataset.notificationIndex)];
      if (!item) return;
      if (item.orgId && state.organizations.some((org)=>org.id===item.orgId)) $("orgSelect").value=item.orgId;
      state.page=item.page||"overview";
      document.querySelectorAll(".nav-item").forEach((el)=>el.classList.toggle("active",el.dataset.page===state.page));
      persistUiState();
      $("notificationPanel")?.classList.add("hidden");
      $("notificationButton")?.setAttribute("aria-expanded","false");
      await render();
    });
  });
}

function toggleNotificationPanel(force) {
  const panel=$("notificationPanel");
  const button=$("notificationButton");
  if (!panel || !button) return;
  const open=typeof force==="boolean" ? force : panel.classList.contains("hidden");
  panel.classList.toggle("hidden",!open);
  button.setAttribute("aria-expanded",String(open));
  if (open) refreshNotifications().catch((error)=>console.warn("NEXO_NOTIFICATIONS",error));
}

async function render() {
  closeContactChat();
  document.getElementById("crmModal")?.remove();
  document.body.classList.remove("modal-open");
  document.body.classList.remove("sidebar-open");
  clearError();
  const meta = pageMeta[state.page];

  if (["crm","clients","operations","audit"].includes(state.page) && state.isAdmin) {
    const internal = state.organizations.find((org) => org.name === "NEXO Internal");
    if (internal && $("orgSelect").value !== internal.id) {
      $("orgSelect").value = internal.id;
      updateNavigationAccess();
    }
  }

  persistUiState();
  const noPeriod = ["crm","billing","clients","settings","audit","profile"].includes(state.page);
  $("periodSelect").classList.toggle("hidden", noPeriod);
  $("exportButton").classList.toggle("hidden", ["settings","profile"].includes(state.page));
  $("exportButton").textContent = state.page === "crm" ? "Exportar CRM" : state.page === "billing" ? "Exportar cobros" : state.page === "audit" ? "Exportar audit" : state.page === "clients" ? "Exportar clientes" : "Exportar CSV";

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
    else if (state.page === "billing") await renderBillingPortal();
    else if (state.page === "team") await renderTeam();
    else if (state.page === "crm") await renderCrm({ supabase, state, $, esc, money, dateTime, shortDate, metricCard, emptyState, showError, showToast, clientOrganizations, loadOrganizations, renderApp: render, persistUiState, downloadInvoicePdf });
    else if (state.page === "clients" || state.page === "admin") await renderClients();
    else if (state.page === "operations") await renderOperations();
    else if (state.page === "settings") await renderSettings();
    else if (state.page === "audit") await renderAudit();
    else if (state.page === "profile") await renderProfile();
  } catch (error) {
    showError(error.message || "No pudimos cargar la información.");
    $("content").innerHTML = emptyState("No pudimos cargar esta vista.", "Revisa la conexión e inténtalo de nuevo.");
  } finally {
    refreshNotifications().catch((error)=>console.warn("NEXO_NOTIFICATIONS",error));
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
  restoreUiState();
  startRealtime();
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

async function performLogout(sourceButton = null) {
  const buttons = [$("logoutButton"), $("logoutTopButton")].filter(Boolean);
  buttons.forEach((button) => {
    button.disabled = true;
    button.dataset.originalLabel = button.textContent;
  });
  if ($("logoutButton")?.querySelector("span")) $("logoutButton").querySelector("span").textContent = "Cerrando…";
  if ($("logoutTopButton")) $("logoutTopButton").textContent = "Cerrando…";
  try {
    localStorage.removeItem(UI_STATE_KEY);
    sessionStorage.clear();
    if (realtimeChannel) {
      await supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    await supabase.auth.signOut();
    window.location.replace(window.location.origin);
  } catch (error) {
    buttons.forEach((button) => {
      button.disabled = false;
      if (button.dataset.originalLabel) button.textContent = button.dataset.originalLabel;
    });
    if ($("logoutButton")?.querySelector("span")) $("logoutButton").querySelector("span").textContent = "Cerrar sesión";
    showError(error.message || "No pudimos cerrar la sesión.");
  }
}

$("profileButton")?.addEventListener("click",()=>{state.page="profile";document.body.classList.remove("sidebar-open");persistUiState();render();});

$("logoutButton")?.addEventListener("click", () => performLogout($("logoutButton")));
$("logoutTopButton")?.addEventListener("click", () => performLogout($("logoutTopButton")));

$("refreshButton").addEventListener("click", async () => {
  await loadOrganizations();
  await render();
  showToast("Datos actualizados.");
});

$("orgSelect").addEventListener("change", async () => {
  updateNavigationAccess();
  const internal=adminInternalView();
  if (internal && !["overview","crm","clients","operations","settings","audit","profile"].includes(state.page)) state.page="overview";
  if (!internal && ["crm","clients","operations","audit","admin"].includes(state.page)) state.page="overview";
  if (state.page === "team" && !canManageCurrentOrgUsers()) state.page = "overview";
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === state.page));
  persistUiState();
  await render();
});
$("periodSelect").addEventListener("change", async () => {
  persistUiState();
  await render();
});
$("exportButton").addEventListener("click", exportCsv);

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    if (["admin","crm","clients","operations","audit"].includes(button.dataset.page) && !state.isAdmin) return;
    if (["crm","clients","operations","audit"].includes(button.dataset.page) && !adminInternalView()) return;
    if (button.dataset.page === "team" && !canManageCurrentOrgUsers()) return;
    state.page = button.dataset.page;
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === state.page));
    document.body.classList.remove("sidebar-open");
    persistUiState();
    render();
  });
});

$("globalSearchButton")?.addEventListener("click",openGlobalSearch);
$("globalSearchClose")?.addEventListener("click",closeGlobalSearch);
$("globalSearchPanel")?.addEventListener("click",(event)=>{
  if (event.target === $("globalSearchPanel")) closeGlobalSearch();
});
$("globalSearchInput")?.addEventListener("input",(event)=>renderSearchResults(event.target.value));
$("globalSearchInput")?.addEventListener("keydown",(event)=>{
  if (event.key==="Enter") {
    event.preventDefault();
    const first=$("globalSearchResults")?.querySelector("[data-search-index]");
    if (first) openSearchResult(Number(first.dataset.searchIndex));
  }
});

$("notificationButton")?.addEventListener("click",(event)=>{
  event.stopPropagation();
  toggleNotificationPanel();
});
$("notificationClose")?.addEventListener("click",()=>toggleNotificationPanel(false));
$("notificationPanel")?.addEventListener("click",(event)=>event.stopPropagation());
document.addEventListener("click",()=>toggleNotificationPanel(false));

$("menuButton").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));

function repairUiLocks() {
  const chat = document.getElementById("chatModal");
  const chatOpen = chat && !chat.classList.contains("hidden");
  const crmOpen = !!document.getElementById("crmModal");
  if (!chatOpen && !crmOpen) document.body.classList.remove("modal-open");
}

document.addEventListener("focusout", () => {
  if (!state.pendingRealtimeRefresh) return;
  setTimeout(async () => {
    if (!state.pendingRealtimeRefresh || isUserEditing()) return;
    state.pendingRealtimeRefresh = false;
    await render();
  }, 200);
});

document.addEventListener("pointerdown", (event) => {
  if (document.body.classList.contains("sidebar-open")) {
    const insideSidebar = event.target.closest("aside");
    const menuButton = event.target.closest("#menuButton");
    if (!insideSidebar && !menuButton) document.body.classList.remove("sidebar-open");
  }
  repairUiLocks();
}, { passive: true });

window.addEventListener("hashchange", () => {
  if (!state.session) return;
  const page = window.location.hash.replace(/^#/, "") || "overview";
  if (!pageMeta[page]) return;
  if (["admin","crm","clients","operations","audit"].includes(page) && !state.isAdmin) return;
  if (["crm","clients","operations","audit"].includes(page) && !adminInternalView()) return;
  state.page = page;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === state.page));
  render();
});

window.addEventListener("focus", repairUiLocks);
window.addEventListener("touchend", repairUiLocks, { passive: true });
setInterval(repairUiLocks, 1500);

document.addEventListener("keydown", (event) => {
  const activeTag=document.activeElement?.tagName;
  if (event.key === "/" && !["INPUT","TEXTAREA","SELECT"].includes(activeTag)) {
    event.preventDefault();
    openGlobalSearch();
    return;
  }
  if (event.key === "Escape") {
    closeGlobalSearch();
    closeContactChat();
    document.getElementById("crmModal")?.remove();
    $("notificationPanel")?.classList.add("hidden");
    $("notificationButton")?.setAttribute("aria-expanded","false");
    document.body.classList.remove("modal-open");
    document.body.classList.remove("sidebar-open");
  }
});

window.addEventListener("pageshow", () => {
  closeContactChat();
  document.getElementById("crmModal")?.remove();
  document.body.classList.remove("modal-open");
  document.body.classList.remove("sidebar-open");
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) repairUiLocks();
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_IN" && session && !state.session) enterApp(session);
  if (event === "SIGNED_OUT") window.location.reload();
});

boot();
