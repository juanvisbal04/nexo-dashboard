import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { renderCrm } from "./crm.js?v=20260930-crm6";

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
};

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
  const value = { page: state.page, orgId, period };
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
  if (savedOrg) $("orgSelect").value = savedOrg;

  const allowedPeriods = new Set(["1","7","30","90"]);
  if (allowedPeriods.has(String(saved.period || ""))) $("periodSelect").value = String(saved.period);

  let page = pageMeta[hashPage] ? hashPage : (pageMeta[saved.page] ? saved.page : "overview");
  if (["crm","admin"].includes(page) && !state.isAdmin) page = "overview";
  if (page === "team" && !canManageCurrentOrgUsers()) page = "overview";
  state.page = page;
  updateNavigationAccess();
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === state.page));
  persistUiState();
}

const pageMeta = {
  overview: ["Vista general", "NEXO DASHBOARD", "Tu negocio, en perspectiva.", "Métricas y actividad de tu operación."],
  conversations: ["Conversaciones", "ATENCIÓN AL CLIENTE", "Cada conversación cuenta.", "Consulta la actividad registrada por tus asistentes."],
  leads: ["Leads", "NEXO SALES", "Oportunidades en movimiento.", "Prospectos identificados y su etapa actual."],
  appointments: ["Citas y reservas", "NEXO BOOKING", "Tu agenda, bajo control.", "Solicitudes, citas y valor estimado."],
  followups: ["Seguimientos", "NEXO RECOVERY", "El siguiente paso importa.", "Oportunidades que necesitan una nueva acción."],
  metrics: ["Métricas", "NEXO ANALYTICS", "Entiende tus resultados.", "Conversión, automatización, respuesta, demanda y valor en una sola vista."],
  team: ["Usuarios", "CONTROL DE ACCESO", "Tu equipo, con el acceso correcto.", "Invita y administra usuarios de este dashboard."],
  crm: ["CRM & Finanzas", "NEXO INTERNAL CRM", "Tu negocio, de prospecto a cliente activo.", "Pipeline, MRR, costos, implementación e integraciones en un solo lugar."],
  admin: ["Platform Admin", "NEXO COMMAND CENTER", "Control total de la plataforma.", "Clientes activos, accesos y configuración de NEXO."],
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
      <div class="card-head"><div><h2>${esc(title)}</h2><p>Priorizadas por impacto operativo</p></div><span class="count">${alerts.length} alerta${alerts.length === 1 ? "" : "s"}</span></div>
      <div class="alert-list">
        ${alerts.slice(0, 8).map((alert) => `
          <button class="alert-item ${alert.tone}" type="button" data-alert-page="${esc(alert.page || "overview")}">
            <i></i>
            <div><b>${esc(alert.title)}</b><span>${esc(alert.detail)}</span></div>
            <em>→</em>
          </button>
        `).join("")}
      </div>
    </section>
  `;
  bindAlertNavigation();
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
  document.querySelectorAll("[data-alert-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.dataset.alertPage || "overview";
      state.page = page;
      document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
      persistUiState();
      render();
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

function buildOperationalAlerts(metrics, organizationName = "") {
  const alerts = [];
  const prefix = organizationName ? organizationName + " · " : "";

  if (metrics.attention > 0) alerts.push({
    priority: 3, tone: "risk", title: prefix + "Atención humana pendiente",
    detail: `${metrics.attention} conversación${metrics.attention === 1 ? "" : "es"} requiere${metrics.attention === 1 ? "" : "n"} intervención.`,
    page: "conversations",
  });
  if (metrics.requested > 0) alerts.push({
    priority: 2, tone: "watch", title: prefix + "Citas por confirmar",
    detail: `${metrics.requested} solicitud${metrics.requested === 1 ? "" : "es"} todavía pendiente${metrics.requested === 1 ? "" : "s"}.`,
    page: "appointments",
  });
  if (metrics.noShow > 0) alerts.push({
    priority: 2, tone: "watch", title: prefix + "No-show detectado",
    detail: `${metrics.noShow} ausencia${metrics.noShow === 1 ? "" : "s"} registrada${metrics.noShow === 1 ? "" : "s"} en el período.`,
    page: "appointments",
  });
  if (metrics.cancellationRate >= 20 && metrics.appointmentCount >= 3) alerts.push({
    priority: 2, tone: "watch", title: prefix + "Cancelación elevada",
    detail: `${metrics.cancellationRate}% de las citas registradas están canceladas.`,
    page: "metrics",
  });
  if (metrics.response > 120 && metrics.chats >= 3) alerts.push({
    priority: 1, tone: "info", title: prefix + "Respuesta más lenta",
    detail: `La respuesta media está en ${metrics.response.toFixed(1)} segundos.`,
    page: "metrics",
  });
  if (!metrics.chats) alerts.push({
    priority: 1, tone: "neutral", title: prefix + "Sin actividad",
    detail: "No hay conversaciones registradas en el período seleccionado.",
    page: "overview",
  });

  return alerts.sort((a, b) => b.priority - a.priority);
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
  const teamNav = $("teamNav");
  if (teamNav) teamNav.classList.toggle("hidden", !canManageCurrentOrgUsers());

  if ($("profileRole")) {
    if (state.isAdmin) {
      $("profileRole").textContent = "NEXO Platform Admin";
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

  if (state.isAdmin && isInternalOrg()) {
    const clients = clientOrganizations();
    const clientRows = await Promise.all(clients.map(async (org) => {
      const metrics = await getMetrics(org.id, currentDays(), { comparison: false });
      return {
        org,
        metrics,
        health: operationalHealth(metrics),
        alerts: buildOperationalAlerts(metrics, org.name),
      };
    }));

    const clientName = (id) => clients.find((org) => org.id === id)?.name || "Cliente NEXO";
    const attentionRows = m.conversations
      .filter((row) => row.status === "Requiere atención")
      .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)))
      .slice(0, 8);
    const networkAlerts = clientRows.flatMap((row) => row.alerts).sort((a, b) => b.priority - a.priority);
    const stableClients = clientRows.filter((row) => row.health.tone === "good").length;
    const watchClients = clientRows.filter((row) => row.health.tone === "watch").length;
    const riskClients = clientRows.filter((row) => row.health.tone === "risk").length;

    $("pageTitle").textContent = "NEXO, en una sola vista.";
    $("pageSubtitle").textContent = "Rendimiento consolidado de todos los clientes activos. Visible solo para Platform Admin.";

    $("content").innerHTML = `
      <div class="stats-grid">
        ${metricCard("Clientes activos", clients.length, `${m.activeClientCount} con actividad en el período`, null, true)}
        ${metricCard("Conversaciones", m.chats, "Todas las organizaciones activas", m.delta?.chats)}
        ${metricCard("Leads generados", m.leadCount, `${m.leadRate}% de conversaciones`, m.delta?.leads)}
        ${metricCard("Citas confirmadas", m.confirmed, money(m.value) + " estimados", m.delta?.confirmed)}
      </div>

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
              <div class="portfolio-account-top"><span class="org-mini" style="--org-color:${esc(org.color || "#316bff")}">${esc(org.initials || "NX")}</span>${healthBadge(health)}</div>
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
    bindAlertNavigation();
    return;
  }

  const attentionRows = m.conversations
    .filter((row) => row.status === "Requiere atención")
    .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)))
    .slice(0, 6);
  const health = operationalHealth(m);
  const alerts = buildOperationalAlerts(m);

  const funnel = [
    ["Conversaciones", m.chats, 100],
    ["Leads identificados", m.leadCount, m.chats ? (m.leadCount / m.chats) * 100 : 0],
    ["Citas confirmadas", m.confirmed, m.chats ? (m.confirmed / m.chats) * 100 : 0],
  ];

  $("content").innerHTML = `
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
          <div class="item-row">
            <div><strong>${esc(row.name)}</strong><small>${esc(row.service)}</small></div>
            <div class="muted">${esc(row.source)}</div>
            <div>${pill(row.status)}</div>
            <div class="muted">${dateTime(row.last_message_at)}</div>
          </div>
        `).join("") : emptyState("No hay conversaciones pendientes.", "Cuando el asistente necesite intervención humana aparecerá aquí.")}
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
        pill(row.status),
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
  const alerts = buildOperationalAlerts(m);

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

async function render() {
  closeContactChat();
  document.getElementById("crmModal")?.remove();
  document.body.classList.remove("modal-open");
  document.body.classList.remove("sidebar-open");
  clearError();
  const meta = pageMeta[state.page];

  if (state.page === "crm" && state.isAdmin) {
    const internal = state.organizations.find((org) => org.name === "NEXO Internal");
    if (internal && $("orgSelect").value !== internal.id) $("orgSelect").value = internal.id;
  }

  persistUiState();
  $("periodSelect").classList.toggle("hidden", state.page === "crm");
  $("exportButton").textContent = state.page === "crm" ? "Exportar CRM" : "Exportar CSV";

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
    else if (state.page === "team") await renderTeam();
    else if (state.page === "crm") await renderCrm({ supabase, state, $, esc, money, dateTime, shortDate, metricCard, emptyState, showError, showToast, clientOrganizations, loadOrganizations });
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
  restoreUiState();
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
  $("logoutButton").disabled = true;
  $("logoutButton").querySelector("span").textContent = "Cerrando…";
  try {
    localStorage.removeItem(UI_STATE_KEY);
    await supabase.auth.signOut();
    window.location.replace(window.location.origin);
  } catch (error) {
    $("logoutButton").disabled = false;
    $("logoutButton").querySelector("span").textContent = "Cerrar sesión";
    showError(error.message || "No pudimos cerrar la sesión.");
  }
});

$("refreshButton").addEventListener("click", async () => {
  await loadOrganizations();
  await render();
  showToast("Datos actualizados.");
});

$("orgSelect").addEventListener("change", async () => {
  updateNavigationAccess();
  if (state.page === "team" && !canManageCurrentOrgUsers()) {
    state.page = "overview";
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === "overview"));
  }
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
    if (["admin","crm"].includes(button.dataset.page) && !state.isAdmin) return;
    if (button.dataset.page === "team" && !canManageCurrentOrgUsers()) return;
    state.page = button.dataset.page;
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === state.page));
    document.body.classList.remove("sidebar-open");
    persistUiState();
    render();
  });
});

$("menuButton").addEventListener("click", () => document.body.classList.toggle("sidebar-open"));

function repairUiLocks() {
  const chat = document.getElementById("chatModal");
  const chatOpen = chat && !chat.classList.contains("hidden");
  const crmOpen = !!document.getElementById("crmModal");
  if (!chatOpen && !crmOpen) document.body.classList.remove("modal-open");
}

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
  if (["admin","crm"].includes(page) && !state.isAdmin) return;
  state.page = page;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === state.page));
  render();
});

window.addEventListener("focus", repairUiLocks);
window.addEventListener("touchend", repairUiLocks, { passive: true });
setInterval(repairUiLocks, 1500);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeContactChat();
    document.getElementById("crmModal")?.remove();
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
