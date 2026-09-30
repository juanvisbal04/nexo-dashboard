let C = null;
const $ = (id) => C.$(id);
const esc = (value) => C.esc(value);
const money = (value) => C.money(value);
const dateTime = (value) => C.dateTime(value);
const shortDate = (value) => C.shortDate(value);


const CRM_STAGES = [
  ["prospecto", "Prospecto"],
  ["demo", "Demo"],
  ["propuesta", "Propuesta"],
  ["cliente", "Cliente"],
  ["implementacion", "Implementación"],
  ["activo", "Activo"],
  ["perdido", "Perdido"],
];

function crmStageLabel(stage) {
  return Object.fromEntries(CRM_STAGES)[stage] || stage || "Prospecto";
}

function crmTone(stage) {
  if (["activo"].includes(stage)) return "green";
  if (["demo", "propuesta", "cliente", "implementacion"].includes(stage)) return "amber";
  if (stage === "perdido" || stage === "cancelado") return "orange";
  return "";
}

function nullableNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function inputDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function inputDate(value) {
  return value ? String(value).slice(0, 10) : "";
}

function crmMoneyOrDash(value) {
  return value === null || value === undefined || value === "" ? "—" : money(value);
}

function crmModal(title, body) {
  document.getElementById("crmModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "crmModal";
  modal.className = "crm-modal";
  modal.innerHTML = `
    <div class="crm-modal-backdrop" data-crm-close></div>
    <section class="crm-modal-panel" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="crm-modal-head">
        <div><span class="eyebrow">NEXO INTERNAL</span><h2>${esc(title)}</h2></div>
        <button class="crm-modal-close" type="button" data-crm-close aria-label="Cerrar">×</button>
      </header>
      <div class="crm-modal-body">${body}</div>
    </section>
  `;
  document.body.appendChild(modal);
  document.body.classList.add("modal-open");
  const close = () => {
    modal.remove();
    document.body.classList.remove("modal-open");
  };
  modal.querySelectorAll("[data-crm-close]").forEach((el) => el.addEventListener("click", close));
  return { modal, close };
}

function commercialProfit(commercial, integrationCost = 0) {
  const mrr = Number(commercial?.mrr || 0);
  const baseCost = Number(commercial?.monthly_cost || 0);
  const cost = baseCost + Number(integrationCost || 0);
  const profit = mrr - cost;
  const margin = mrr ? Math.round((profit / mrr) * 100) : 0;
  return { mrr, baseCost, integrationCost: Number(integrationCost || 0), cost, profit, margin };
}

function crmNextActionLabel(value) {
  if (!value) return "Sin próxima acción";
  const overdue = new Date(value).getTime() < Date.now();
  return `${overdue ? "Vencido · " : ""}${dateTime(value)}`;
}

async function openProspectEditor(prospect) {
  if (!prospect) return;
  const body = `
    <form id="crmProspectForm" class="crm-form">
      <div class="crm-form-grid">
        <label>Contacto<input id="crmProspectName" value="${esc(prospect.full_name || "")}" required></label>
        <label>Negocio<input id="crmProspectBusiness" value="${esc(prospect.business_name || "")}" required></label>
        <label>WhatsApp<input id="crmProspectPhone" value="${esc(prospect.phone || "")}"></label>
        <label>Correo<input id="crmProspectEmail" type="email" value="${esc(prospect.email || "")}"></label>
        <label>Sector<input id="crmProspectIndustry" value="${esc(prospect.industry || "")}"></label>
        <label>Etapa
          <select id="crmProspectStage">
            ${CRM_STAGES.map(([value, label]) => `<option value="${value}" ${prospect.stage === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label>MRR esperado<input id="crmProspectMrr" type="number" min="0" step="1000" value="${prospect.expected_mrr ?? ""}"></label>
        <label>Setup esperado<input id="crmProspectSetup" type="number" min="0" step="1000" value="${prospect.expected_setup_fee ?? ""}"></label>
        <label>Próxima acción<input id="crmProspectNext" type="datetime-local" value="${inputDateTime(prospect.next_action_at)}"></label>
        <label>Demo<input id="crmProspectDemo" type="datetime-local" value="${inputDateTime(prospect.demo_at)}"></label>
        <label>Propuesta enviada<input id="crmProspectProposal" type="datetime-local" value="${inputDateTime(prospect.proposal_sent_at)}"></label>
        <label>Motivo perdido<input id="crmProspectLostReason" value="${esc(prospect.lost_reason || "")}" placeholder="Solo si se pierde"></label>
        <label class="wide">Notas CRM<textarea id="crmProspectNotes" rows="4">${esc(prospect.crm_notes || "")}</textarea></label>
      </div>
      <div class="crm-form-actions">
        <button class="btn primary" type="submit">Guardar prospecto</button>
      </div>
    </form>

    ${!prospect.organization_id ? `
      <div class="crm-convert-box">
        <div>
          <span class="eyebrow">CONVERTIR A CLIENTE</span>
          <h3>Crear empresa desde este prospecto</h3>
          <p>La oportunidad pasa a Implementación y queda vinculada a una organización real de NEXO.</p>
        </div>
        <div class="crm-convert-grid">
          <label>Nombre del asistente<input id="crmConvertAssistant" placeholder="Ej. Luna"></label>
          <label>Plan inicial<input id="crmConvertPlan" placeholder="Ej. Assistant + Booking"></label>
          <label>Costo mensual base<input id="crmConvertCost" type="number" min="0" step="1000" placeholder="0"></label>
          <button id="crmConvertButton" class="btn primary" type="button">Convertir a cliente</button>
        </div>
      </div>
    ` : `
      <div class="crm-linked">
        <span>✓</span>
        <div><b>Vinculado a un cliente NEXO</b><p>Organization ID: ${esc(prospect.organization_id)}</p></div>
      </div>
    `}

    <div class="crm-activity-box">
      <div class="crm-section-head">
        <div><span class="eyebrow">ACTIVIDAD</span><h3>Registrar nota o seguimiento</h3></div>
      </div>
      <form id="crmActivityForm" class="crm-activity-form">
        <select id="crmActivityType">
          <option value="note">Nota</option>
          <option value="call">Llamada</option>
          <option value="demo">Demo</option>
          <option value="proposal">Propuesta</option>
          <option value="followup">Seguimiento</option>
        </select>
        <input id="crmActivityTitle" placeholder="Título" required>
        <input id="crmActivityDue" type="datetime-local">
        <textarea id="crmActivityDetails" rows="3" placeholder="Detalle"></textarea>
        <button class="btn" type="submit">Registrar actividad</button>
      </form>
    </div>
  `;

  const { modal, close } = crmMo