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

  const { modal, close } = crmModal(prospect.business_name || "Prospecto", body);

  modal.querySelector("#crmProspectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      full_name: modal.querySelector("#crmProspectName").value.trim(),
      business_name: modal.querySelector("#crmProspectBusiness").value.trim(),
      phone: modal.querySelector("#crmProspectPhone").value.trim() || null,
      email: modal.querySelector("#crmProspectEmail").value.trim() || null,
      industry: modal.querySelector("#crmProspectIndustry").value.trim() || null,
      stage: modal.querySelector("#crmProspectStage").value,
      expected_mrr: nullableNumber(modal.querySelector("#crmProspectMrr").value),
      expected_setup_fee: nullableNumber(modal.querySelector("#crmProspectSetup").value),
      next_action_at: modal.querySelector("#crmProspectNext").value ? new Date(modal.querySelector("#crmProspectNext").value).toISOString() : null,
      demo_at: modal.querySelector("#crmProspectDemo").value ? new Date(modal.querySelector("#crmProspectDemo").value).toISOString() : null,
      proposal_sent_at: modal.querySelector("#crmProspectProposal").value ? new Date(modal.querySelector("#crmProspectProposal").value).toISOString() : null,
      lost_reason: modal.querySelector("#crmProspectLostReason").value.trim() || null,
      crm_notes: modal.querySelector("#crmProspectNotes").value.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const oldStage = prospect.stage;
    const { error } = await C.supabase.from("demo_requests").update(payload).eq("id", prospect.id);
    if (error) return C.showError(error.message);

    if (oldStage !== payload.stage) {
      await C.supabase.from("crm_activities").insert({
        demo_request_id: prospect.id,
        organization_id: prospect.organization_id || null,
        activity_type: "status_change",
        title: `Etapa: ${crmStageLabel(oldStage)} → ${crmStageLabel(payload.stage)}`,
        created_by: C.state.session.user.id,
      });
    }
    C.showToast("Prospecto actualizado.");
    close();
    await renderCrm();
  });

  modal.querySelector("#crmActivityForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = modal.querySelector("#crmActivityTitle").value.trim();
    if (!title) return;
    const { error } = await C.supabase.from("crm_activities").insert({
      demo_request_id: prospect.id,
      organization_id: prospect.organization_id || null,
      activity_type: modal.querySelector("#crmActivityType").value,
      title,
      details: modal.querySelector("#crmActivityDetails").value.trim() || null,
      due_at: modal.querySelector("#crmActivityDue").value ? new Date(modal.querySelector("#crmActivityDue").value).toISOString() : null,
      created_by: C.state.session.user.id,
    });
    if (error) return C.showError(error.message);
    C.showToast("Actividad registrada.");
    modal.querySelector("#crmActivityForm").reset();
  });

  const convert = modal.querySelector("#crmConvertButton");
  convert?.addEventListener("click", async () => {
    const assistant = modal.querySelector("#crmConvertAssistant").value.trim();
    if (!assistant) return C.showError("Define el nombre del asistente antes de convertir el prospecto.");

    convert.disabled = true;
    convert.textContent = "Creando cliente…";
    try {
      const { data: orgResult, error: orgError } = await C.supabase.functions.invoke("admin-create-organization", {
        body: {
          name: modal.querySelector("#crmProspectBusiness").value.trim(),
          sector: modal.querySelector("#crmProspectIndustry").value.trim(),
          assistant,
          initials: "",
          color: "#316bff",
        },
      });
      if (orgError) throw orgError;
      if (!orgResult?.ok) throw new Error(orgResult?.error || "No se pudo crear la empresa.");

      const org = orgResult.organization;
      const expectedMrr = nullableNumber(modal.querySelector("#crmProspectMrr").value);
      const expectedSetup = nullableNumber(modal.querySelector("#crmProspectSetup").value);

      const { error: commercialError } = await C.supabase.from("organization_commercials").upsert({
        organization_id: org.id,
        lifecycle_stage: "implementacion",
        plan_name: modal.querySelector("#crmConvertPlan").value.trim() || null,
        mrr: expectedMrr,
        monthly_cost: nullableNumber(modal.querySelector("#crmConvertCost").value),
        setup_fee: expectedSetup,
        billing_status: "pending",
        implementation_status: "discovery",
        integration_status: "pending",
        contract_start_date: new Date().toISOString().slice(0, 10),
        commercial_notes: "Creado desde NEXO CRM.",
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id" });
      if (commercialError) throw commercialError;

      const { error: prospectError } = await C.supabase.from("demo_requests").update({
        stage: "implementacion",
        status: "Cliente",
        organization_id: org.id,
        updated_at: new Date().toISOString(),
      }).eq("id", prospect.id);
      if (prospectError) throw prospectError;

      await C.supabase.from("crm_activities").insert({
        demo_request_id: prospect.id,
        organization_id: org.id,
        activity_type: "status_change",
        title: "Prospecto convertido a cliente",
        details: `Organización creada con asistente ${assistant}.`,
        created_by: C.state.session.user.id,
      });

      C.showToast("Cliente creado y vinculado al CRM.");
      close();
      await C.loadOrganizations();
      await renderCrm();
    } catch (error) {
      C.showError(error.message || "No pudimos convertir el prospecto.");
      convert.disabled = false;
      convert.textContent = "Convertir a cliente";
    }
  });
}

async function openCommercialEditor(org, commercial, integrations) {
  if (!org) return;
  const body = `
    <form id="crmCommercialForm" class="crm-form">
      <div class="crm-form-grid">
        <label>Etapa
          <select id="crmLifecycle">
            ${["cliente","implementacion","activo","pausado","cancelado"].map((value) => `<option value="${value}" ${commercial?.lifecycle_stage === value ? "selected" : ""}>${crmStageLabel(value)}</option>`).join("")}
          </select>
        </label>
        <label>Plan<input id="crmPlan" value="${esc(commercial?.plan_name || "")}" placeholder="Ej. NEXO Growth"></label>
        <label>MRR / cuota mensual<input id="crmMrr" type="number" min="0" step="1000" value="${commercial?.mrr ?? ""}"></label>
        <label>Costo mensual base<input id="crmMonthlyCost" type="number" min="0" step="1000" value="${commercial?.monthly_cost ?? ""}"></label>
        <label>Setup cobrado<input id="crmSetupFee" type="number" min="0" step="1000" value="${commercial?.setup_fee ?? ""}"></label>
        <label>Costo implementación<input id="crmImplementationCost" type="number" min="0" step="1000" value="${commercial?.implementation_cost ?? ""}"></label>
        <label>Inicio contrato<input id="crmStartDate" type="date" value="${inputDate(commercial?.contract_start_date)}"></label>
        <label>Go live<input id="crmGoLiveDate" type="date" value="${inputDate(commercial?.go_live_date)}"></label>
        <label>Renovación<input id="crmRenewalDate" type="date" value="${inputDate(commercial?.renewal_date)}"></label>
        <label>Facturación
          <select id="crmBillingStatus">${["pending","active","past_due","paused","cancelled"].map((value) => `<option value="${value}" ${commercial?.billing_status === value ? "selected" : ""}>${value}</option>`).join("")}</select>
        </label>
        <label>Implementación
          <select id="crmImplementationStatus">${["pending","discovery","design","configuration","testing","go_live","active","paused"].map((value) => `<option value="${value}" ${commercial?.implementation_status === value ? "selected" : ""}>${value}</option>`).join("")}</select>
        </label>
        <label>Integraciones
          <select id="crmIntegrationStatus">${["pending","partial","connected","attention","paused"].map((value) => `<option value="${value}" ${commercial?.integration_status === value ? "selected" : ""}>${value}</option>`).join("")}</select>
        </label>
        <label class="wide">Notas comerciales<textarea id="crmCommercialNotes" rows="3">${esc(commercial?.commercial_notes || "")}</textarea></label>
        <label class="wide">Notas de integración<textarea id="crmIntegrationNotes" rows="3">${esc(commercial?.integration_notes || "")}</textarea></label>
      </div>
      <div class="crm-form-actions"><button class="btn primary" type="submit">Guardar ficha financiera</button></div>
    </form>

    <div class="crm-integrations-box">
      <div class="crm-section-head">
        <div><span class="eyebrow">INTEGRACIONES</span><h3>Costos y estado por conexión</h3></div>
      </div>
      <div class="crm-integration-list">
        ${integrations.length ? integrations.map((item) => `
          <div class="crm-integration-row">
            <div><b>${esc(item.integration_name)}</b><small>${esc(item.provider || "Sin proveedor")}</small></div>
            <select class="crm-integration-status" data-id="${item.id}">
              ${["pending","configuration","connected","attention","paused","disabled"].map((value) => `<option value="${value}" ${item.status === value ? "selected" : ""}>${value}</option>`).join("")}
            </select>
            <span>${money(item.monthly_cost || 0)}/mes</span>
          </div>
        `).join("") : `<div class="muted crm-empty-line">Sin integraciones registradas.</div>`}
      </div>
      <form id="crmIntegrationForm" class="crm-mini-form">
        <input id="crmIntegrationName" placeholder="Integración (ej. WhatsApp)" required>
        <input id="crmIntegrationProvider" placeholder="Proveedor">
        <input id="crmIntegrationCost" type="number" min="0" step="1000" placeholder="Costo mensual">
        <button class="btn" type="submit">Agregar</button>
      </form>
    </div>
  `;

  const { modal, close } = crmModal(org.name, body);

  modal.querySelector("#crmCommercialForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      organization_id: org.id,
      lifecycle_stage: modal.querySelector("#crmLifecycle").value,
      plan_name: modal.querySelector("#crmPlan").value.trim() || null,
      mrr: nullableNumber(modal.querySelector("#crmMrr").value),
      monthly_cost: nullableNumber(modal.querySelector("#crmMonthlyCost").value),
      setup_fee: nullableNumber(modal.querySelector("#crmSetupFee").value),
      implementation_cost: nullableNumber(modal.querySelector("#crmImplementationCost").value),
      contract_start_date: modal.querySelector("#crmStartDate").value || null,
      go_live_date: modal.querySelector("#crmGoLiveDate").value || null,
      renewal_date: modal.querySelector("#crmRenewalDate").value || null,
      billing_status: modal.querySelector("#crmBillingStatus").value,
      implementation_status: modal.querySelector("#crmImplementationStatus").value,
      integration_status: modal.querySelector("#crmIntegrationStatus").value,
      commercial_notes: modal.querySelector("#crmCommercialNotes").value.trim() || null,
      integration_notes: modal.querySelector("#crmIntegrationNotes").value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await C.supabase.from("organization_commercials").upsert(payload, { onConflict: "organization_id" });
    if (error) return C.showError(error.message);
    C.showToast("Ficha comercial actualizada.");
    close();
    await renderCrm();
  });

  modal.querySelectorAll(".crm-integration-status").forEach((select) => {
    select.addEventListener("change", async () => {
      select.disabled = true;
      const { error } = await C.supabase.from("crm_integrations").update({
        status: select.value,
        updated_at: new Date().toISOString(),
      }).eq("id", select.dataset.id);
      select.disabled = false;
      if (error) C.showError(error.message); else C.showToast("Integración actualizada.");
    });
  });

  modal.querySelector("#crmIntegrationForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const { error } = await C.supabase.from("crm_integrations").insert({
      organization_id: org.id,
      integration_name: modal.querySelector("#crmIntegrationName").value.trim(),
      provider: modal.querySelector("#crmIntegrationProvider").value.trim() || null,
      monthly_cost: nullableNumber(modal.querySelector("#crmIntegrationCost").value),
      status: "pending",
    });
    if (error) return C.showError(error.message);
    C.showToast("Integración agregada.");
    close();
    await renderCrm();
  });
}

export async function renderCrm(context) {
  C = context;
  if (!C.state.isAdmin) {
    $("content").innerHTML = C.emptyState("Tu cuenta no tiene acceso al CRM interno.", "Esta vista está reservada para NEXO Platform Admin.");
    return;
  }

  const clients = C.clientOrganizations({ activeOnly: false });
  const [
    { data: prospects, error: prospectError },
    { data: commercials, error: commercialError },
    { data: integrations, error: integrationError },
    { data: activities, error: activityError },
  ] = await Promise.all([
    C.supabase.from("demo_requests").select("*").order("created_at", { ascending: false }).limit(500),
    C.supabase.from("organization_commercials").select("*"),
    C.supabase.from("crm_integrations").select("*"),
    C.supabase.from("crm_activities").select("*").order("created_at", { ascending: false }).limit(500),
  ]);

  if (prospectError) throw prospectError;
  if (commercialError) throw commercialError;
  if (integrationError) throw integrationError;
  if (activityError) throw activityError;

  const opportunityRows = prospects || [];
  const commercialRows = com