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

async function refreshCrmView({ preserveScroll = true } = {}) {
  const x = window.scrollX;
  const y = window.scrollY;
  document.getElementById("crmModal")?.remove();
  document.body.classList.remove("modal-open");
  document.body.classList.remove("sidebar-open");
  C.persistUiState?.();
  try {
    if (typeof C.renderApp === "function") await C.renderApp();
    else await renderCrm(C);
  } finally {
    document.getElementById("crmModal")?.remove();
    document.body.classList.remove("modal-open");
    document.body.classList.remove("sidebar-open");
  }
  if (preserveScroll) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo({ left: x, top: Math.min(y, maxY), behavior: "auto" });
      });
    });
  }
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

async function openProspectEditor(prospect, plans = []) {
  if (!prospect) return;
  const body = `
    <form id="crmProspectForm" class="crm-form">
      <div class="crm-form-grid">
        <label>Contacto<input id="crmProspectName" value="${esc(prospect.full_name || "")}" required></label>
        <label>Negocio<input id="crmProspectBusiness" value="${esc(prospect.business_name || "")}" required></label>
        <label>WhatsApp<input id="crmProspectPhone" value="${esc(prospect.phone || "")}"></label>
        <label>Correo<input id="crmProspectEmail" type="email" value="${esc(prospect.email || "")}"></label>
        <label>Sector<input id="crmProspectIndustry" value="${esc(prospect.industry || "")}"></label>
        <label>Plan de interés
          <select id="crmProspectPlanInterest">
            <option value="">Sin definir</option>
            ${plans.filter((plan)=>plan.active).sort((a,b)=>a.sort_order-b.sort_order).map((plan)=>`<option value="${plan.code}" ${prospect.plan_interest === plan.code ? "selected" : ""}>${esc(plan.name)}</option>`).join("")}
          </select>
        </label>
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
          <label>Plan inicial
            <select id="crmConvertPlan">
              <option value="">Seleccionar plan</option>
              ${plans.filter((plan) => plan.active).sort((a,b) => a.sort_order-b.sort_order).map((plan) => `<option value="${plan.id}" ${prospect.plan_interest === plan.code ? "selected" : ""}>${esc(plan.name)} · ${plan.monthly_fee ? money(plan.monthly_fee) + "/mes" : "Cotización"}</option>`).join("")}
            </select>
          </label>
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
      plan_interest: modal.querySelector("#crmProspectPlanInterest").value || null,
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
    await refreshCrmView();
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
      const selectedPlanId = modal.querySelector("#crmConvertPlan").value || null;
      const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || null;

      const { error: commercialError } = await C.supabase.from("organization_commercials").upsert({
        organization_id: org.id,
        lifecycle_stage: "implementacion",
        plan_id: selectedPlanId,
        plan_name: selectedPlan?.name || null,
        pricing_type: "standard",
        mrr: expectedMrr ?? selectedPlan?.monthly_fee ?? null,
        monthly_cost: nullableNumber(modal.querySelector("#crmConvertCost").value),
        setup_fee: expectedSetup ?? selectedPlan?.setup_fee_min ?? null,
        billing_status: "pending",
        implementation_status: "discovery",
        integration_status: "pending",
        contract_start_date: new Date().toISOString().slice(0, 10),
        commercial_notes: "Creado desde NEXO CRM.",
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id" });
      if (commercialError) throw commercialError;

      const setupToCharge = expectedSetup ?? selectedPlan?.setup_fee_min ?? null;
      if (setupToCharge && setupToCharge > 0) {
        const { error: setupInvoiceError } = await C.supabase.from("client_invoices").insert({
          organization_id: org.id,
          invoice_type: "setup",
          due_date: new Date().toISOString().slice(0,10),
          amount_cop: setupToCharge,
          status: "pending",
          reference: "Setup inicial NEXO",
        });
        if (setupInvoiceError) throw setupInvoiceError;
      }

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
      await refreshCrmView();
    } catch (error) {
      C.showError(error.message || "No pudimos convertir el prospecto.");
      convert.disabled = false;
      convert.textContent = "Convertir a cliente";
    }
  });
}

async function openCommercialEditor(org, commercial, integrations, plans = []) {
  if (!org) return;
  const body = `
    <form id="crmCommercialForm" class="crm-form">
      <div class="crm-form-grid">
        <label>Etapa
          <select id="crmLifecycle">
            ${["cliente","implementacion","activo","pausado","cancelado"].map((value) => `<option value="${value}" ${commercial?.lifecycle_stage === value ? "selected" : ""}>${crmStageLabel(value)}</option>`).join("")}
          </select>
        </label>
        <label>Plan
          <select id="crmPlan">
            <option value="">Por definir</option>
            ${plans.filter((plan) => plan.active).sort((a,b) => a.sort_order-b.sort_order).map((plan) => `<option value="${plan.id}" ${commercial?.plan_id === plan.id ? "selected" : ""}>${esc(plan.name)}</option>`).join("")}
          </select>
        </label>
        <label>Tipo de tarifa
          <select id="crmPricingType">
            ${[["standard","Estándar"],["founder","Founder"],["early_partner","Early Partner"],["custom","Personalizada"]].map(([value,label]) => `<option value="${value}" ${commercial?.pricing_type === value ? "selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
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
        <label>Contacto de facturación
          <input id="crmBillingContactName" value="${esc(commercial?.billing_contact_name || "")}" placeholder="Nombre del contacto">
        </label>
        <label>Correo de facturación
          <input id="crmBillingEmail" type="email" value="${esc(commercial?.billing_email || "")}" placeholder="facturacion@cliente.com">
        </label>
        <label>Día de cobro mensual
          <input id="crmBillingDay" type="number" min="1" max="28" value="${commercial?.billing_day ?? ""}" placeholder="Ej. 5">
        </label>
        <label class="crm-check-label">
          <input id="crmAutoInvoice" type="checkbox" ${commercial?.auto_invoice !== false ? "checked" : ""}>
          <span>Generar mensualidad automáticamente</span>
        </label>
        <label>Implementación
          <select id="crmImplementationStatus">${["pending","discovery","design","configuration","testing","go_live","active","paused"].map((value) => `<option value="${value}" ${commercial?.implementation_status === value ? "selected" : ""}>${value}</option>`).join("")}</select>
        </label>
        <label>Integraciones
          <select id="crmIntegrationStatus">${["pending","partial","connected","attention","paused"].map((value) => `<option value="${value}" ${commercial?.integration_status === value ? "selected" : ""}>${value}</option>`).join("")}</select>
        </label>
        <label class="wide">Condición comercial<textarea id="crmPricingNotes" rows="2">${esc(commercial?.pricing_notes || "")}</textarea></label>
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
    const selectedPlanId = modal.querySelector("#crmPlan").value || null;
    const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || null;
    const pricingType = modal.querySelector("#crmPricingType").value;
    const planLabel = selectedPlan ? selectedPlan.name + (pricingType === "founder" ? " · Founder" : pricingType === "early_partner" ? " · Early Partner" : "") : null;
    const payload = {
      organization_id: org.id,
      lifecycle_stage: modal.querySelector("#crmLifecycle").value,
      plan_id: selectedPlanId,
      plan_name: planLabel,
      pricing_type: pricingType,
      pricing_notes: modal.querySelector("#crmPricingNotes").value.trim() || null,
      mrr: nullableNumber(modal.querySelector("#crmMrr").value),
      monthly_cost: nullableNumber(modal.querySelector("#crmMonthlyCost").value),
      setup_fee: nullableNumber(modal.querySelector("#crmSetupFee").value),
      implementation_cost: nullableNumber(modal.querySelector("#crmImplementationCost").value),
      contract_start_date: modal.querySelector("#crmStartDate").value || null,
      go_live_date: modal.querySelector("#crmGoLiveDate").value || null,
      renewal_date: modal.querySelector("#crmRenewalDate").value || null,
      billing_status: modal.querySelector("#crmBillingStatus").value,
      billing_contact_name: modal.querySelector("#crmBillingContactName").value.trim() || null,
      billing_email: modal.querySelector("#crmBillingEmail").value.trim().toLowerCase() || null,
      billing_day: nullableNumber(modal.querySelector("#crmBillingDay").value),
      auto_invoice: modal.querySelector("#crmAutoInvoice").checked,
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
    await refreshCrmView();
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
    await refreshCrmView();
  });
}

export async function openProspectEditorFromGrowth(context, prospect, plans = []) {
  C = context;
  return openProspectEditor(prospect, plans);
}

export async function renderCrm(context) {
  C = context;
  if (!C.state.isAdmin) {
    $("content").innerHTML = C.emptyState("Tu cuenta no tiene acceso al CRM interno.", "Esta vista está reservada para NEXO Platform Admin.");
    return;
  }

  const clients = C.clientOrganizations({ activeOnly: false });
  try {
    await C.supabase.rpc("generate_due_monthly_invoices");
  } catch (error) {
    console.warn("NEXO_BILLING_REFRESH", error);
  }
  const [
    { data: prospects, error: prospectError },
    { data: commercials, error: commercialError },
    { data: integrations, error: integrationError },
    { data: activities, error: activityError },
    { data: plans, error: planError },
    { data: expenses, error: expenseError },
    { data: invoices, error: invoiceError },
  ] = await Promise.all([
    C.supabase.from("demo_requests").select("*").order("created_at", { ascending: false }).limit(500),
    C.supabase.from("organization_commercials").select("*"),
    C.supabase.from("crm_integrations").select("*"),
    C.supabase.from("crm_activities").select("*").order("created_at", { ascending: false }).limit(500),
    C.supabase.from("nexo_plans").select("*").order("sort_order"),
    C.supabase.from("nexo_expenses").select("*").order("created_at", { ascending: false }),
    C.supabase.from("client_invoices").select("*").order("due_date", { ascending: false }).limit(1000),
  ]);

  if (prospectError) throw prospectError;
  if (commercialError) throw commercialError;
  if (integrationError) throw integrationError;
  if (activityError) throw activityError;
  if (planError) throw planError;
  if (expenseError) throw expenseError;
  if (invoiceError) throw invoiceError;

  const opportunityRows = prospects || [];
  const commercialRows = commercials || [];
  const integrationRows = integrations || [];
  const activityRows = activities || [];
  const planRows = plans || [];
  const expenseRows = expenses || [];
  const invoiceRows = invoices || [];

  const commercialMap = new Map(commercialRows.map((row) => [row.organization_id, row]));
  const integrationsByOrg = new Map();
  integrationRows.forEach((row) => {
    if (!integrationsByOrg.has(row.organization_id)) integrationsByOrg.set(row.organization_id, []);
    integrationsByOrg.get(row.organization_id).push(row);
  });

  const clientFinancials = clients.map((org) => {
    const commercial = commercialMap.get(org.id) || null;
    const orgIntegrations = integrationsByOrg.get(org.id) || [];
    const integrationCost = orgIntegrations.reduce((sum, row) => sum + Number(row.monthly_cost || 0), 0);
    const economics = commercialProfit(commercial, integrationCost);
    return { org, commercial, orgIntegrations, integrationCost, economics };
  });

  const active = clientFinancials.filter((row) => row.commercial?.lifecycle_stage === "activo");
  const activeMrr = active.reduce((sum, row) => sum + row.economics.mrr, 0);
  const monthlyCost = active.reduce((sum, row) => sum + row.economics.cost, 0);
  const grossProfit = activeMrr - monthlyCost;
  const grossMargin = activeMrr ? Math.round((grossProfit / activeMrr) * 100) : 0;
  const sharedMonthlyExpenses = expenseRows
    .filter((row) => row.active && row.shared_cost)
    .reduce((sum, row) => {
      if (row.frequency === "annual") return sum + Number(row.amount_cop || 0) / 12;
      if (row.frequency === "one_time") return sum;
      return sum + Number(row.amount_cop || 0);
    }, 0);
  const netOperatingProfit = grossProfit - sharedMonthlyExpenses;
  const netOperatingMargin = activeMrr ? Math.round((netOperatingProfit / activeMrr) * 100) : 0;
  const arr = activeMrr * 12;
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const paidThisMonth = invoiceRows
    .filter((row) => row.status === "paid" && row.paid_at && new Date(row.paid_at) >= monthStart && new Date(row.paid_at) < monthEnd)
    .reduce((sum, row) => sum + Number(row.amount_cop || 0), 0);
  const receivable = invoiceRows
    .filter((row) => ["pending","overdue"].includes(row.status))
    .reduce((sum, row) => sum + Number(row.amount_cop || 0), 0);
  const overdueInvoices = invoiceRows.filter((row) => row.status === "overdue" || (row.status === "pending" && new Date(row.due_date + "T23:59:59").getTime() < Date.now()));
  const dueSoonInvoices = invoiceRows
    .filter((row) => row.status === "pending")
    .filter((row) => {
      const due = new Date(row.due_date + "T23:59:59").getTime();
      return due >= Date.now() && due <= Date.now() + 30 * 86400000;
    });
  const renewalsSoon = commercialRows
    .filter((row) => row.renewal_date)
    .filter((row) => {
      const renewal = new Date(row.renewal_date + "T23:59:59").getTime();
      return renewal >= Date.now() && renewal <= Date.now() + 30 * 86400000;
    });
  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
    const key = d.toISOString().slice(0, 7);
    const label = new Intl.DateTimeFormat("es-CO", { month: "short", year: "2-digit" }).format(d);
    return { key, label, billed: 0, paid: 0, pending: 0 };
  });
  const bucketMap = new Map(monthBuckets.map((row) => [row.key, row]));
  invoiceRows.filter((row) => row.invoice_type === "monthly").forEach((row) => {
    const period = String(row.billing_period_start || row.due_date || "").slice(0, 7);
    const bucket = bucketMap.get(period);
    if (!bucket) return;
    const amount = Number(row.amount_cop || 0);
    bucket.billed += amount;
    if (row.status === "paid") bucket.paid += amount;
    else if (row.status === "pending" || row.status === "overdue") bucket.pending += amount;
  });
  const currentMonthBucket = monthBuckets[monthBuckets.length - 1] || { billed: 0, paid: 0, pending: 0 };
  const collectionRate = currentMonthBucket.billed ? Math.round((currentMonthBucket.paid / currentMonthBucket.billed) * 100) : 0;
  const pipelineStages = new Set(["prospecto", "demo", "propuesta"]);
  const pipelineMrr = opportunityRows
    .filter((row) => pipelineStages.has(row.stage))
    .reduce((sum, row) => sum + Number(row.expected_mrr || 0), 0);
  const implementationCount = clientFinancials.filter((row) => row.commercial?.lifecycle_stage === "implementacion").length;
  const integrationAttention = integrationRows.filter((row) => ["pending", "configuration", "attention"].includes(row.status)).length;

  const now = Date.now();
  const nextActions = opportunityRows
    .filter((row) => row.next_action_at && !["activo", "perdido"].includes(row.stage))
    .sort((a, b) => new Date(a.next_action_at) - new Date(b.next_action_at));
  const overdue = nextActions.filter((row) => new Date(row.next_action_at).getTime() < now).length;

  C.state.currentRows = [
    ...opportunityRows.map((row) => ({
      type: "prospect",
      business: row.business_name,
      stage: row.stage,
      expected_mrr: row.expected_mrr,
      next_action_at: row.next_action_at,
    })),
    ...clientFinancials.map((row) => ({
      type: "client",
      business: row.org.name,
      stage: row.commercial?.lifecycle_stage,
      mrr: row.economics.mrr,
      monthly_cost: row.economics.cost,
      profit: row.economics.profit,
      margin: row.economics.margin,
    })),
  ];

  const pipelineStagesUi = CRM_STAGES.filter(([value]) => value !== "perdido");

  $("content").innerHTML = `
    <div class="crm-kpi-grid">
      ${C.metricCard("MRR activo", money(activeMrr), `ARR ${money(arr)}`, null, true)}
      ${C.metricCard("Utilidad bruta clientes", money(grossProfit), `Margen bruto ${grossMargin}%`)}
      ${C.metricCard("Gastos fijos NEXO", money(sharedMonthlyExpenses), "Software + APIs compartidas")}
      ${C.metricCard("Resultado operativo", money(netOperatingProfit), activeMrr ? `Margen neto ${netOperatingMargin}%` : "Etapa de inversión")}
      ${C.metricCard("Pipeline MRR", money(pipelineMrr), "Prospecto + Demo + Propuesta")}
      ${C.metricCard("Seguimientos vencidos", overdue, `${nextActions.length} próximas acciones`)}
    </div>

    <div class="crm-finance-strip">
      <div><span>MRR activo</span><b>${money(activeMrr)}</b></div>
      <div><span>Cobrado este mes</span><b>${money(paidThisMonth)}</b></div>
      <div><span>Cuentas por cobrar</span><b>${money(receivable)}</b></div>
      <div><span>Gastos compartidos</span><b>${money(sharedMonthlyExpenses)}</b></div>
      <div><span>Resultado operativo</span><b>${money(netOperatingProfit)}</b></div>
      <div><span>Vencidas</span><b>${overdueInvoices.length}</b></div>
    </div>

    <nav class="crm-section-nav" aria-label="Secciones de Ventas y Finanzas">
      <span class="crm-section-nav-label">Ir a</span>
      <button type="button" data-crm-section="crmPlans"><b>01</b> Planes & costos</button>
      <button type="button" data-crm-section="crmBilling"><b>02</b> Cartera</button>
      <button type="button" data-crm-section="crmRevenue"><b>03</b> Ingresos</button>
      <button type="button" data-crm-section="crmPipeline"><b>04</b> Pipeline</button>
      <button type="button" data-crm-section="crmActions"><b>05</b> Actividad</button>
      <button type="button" data-crm-section="crmClients"><b>06</b> Clientes</button>
    </nav>

    <div id="crmPlans" class="crm-two-col crm-foundation-grid">
      <section class="card crm-plans-card">
        <div class="card-head"><div><h2>Planes oficiales NEXO</h2><p>Tarifa estándar de referencia para nuevas propuestas</p></div><span class="count">${planRows.filter((p)=>p.active).length} planes</span></div>
        <div class="crm-plan-list">
          ${planRows.filter((plan)=>plan.active).sort((a,b)=>a.sort_order-b.sort_order).map((plan)=>`
            <article class="crm-plan-row">
              <div><b>${esc(plan.name)}</b><small>${esc(plan.description || "")}</small></div>
              <div><span>Setup</span><strong>${plan.setup_fee_min == null ? "Cotización" : "Desde " + money(plan.setup_fee_min)}</strong></div>
              <div><span>Mantenimiento</span><strong>${plan.monthly_fee == null ? "Cotización" : "Desde " + money(plan.monthly_fee) + "/mes"}</strong></div>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="card crm-expenses-card">
        <div class="card-head"><div><h2>Gastos fijos y compartidos</h2><p>Costos de NEXO que no se cargan completos a un solo cliente</p></div><span class="count">${money(sharedMonthlyExpenses)}/mes</span></div>
        <div class="crm-expense-list">
          ${expenseRows.filter((row)=>row.active).map((row)=>`
            <div class="crm-expense-row">
              <div><b>${esc(row.expense_name)}</b><small>${esc(row.category)} · ${esc(row.frequency)}</small></div>
              <span>${money(row.amount_cop)}</span>
              <button class="crm-expense-disable" data-id="${row.id}" type="button">Desactivar</button>
            </div>
          `).join("") || '<div class="muted crm-empty-line">Sin gastos registrados.</div>'}
        </div>
        <form id="crmExpenseForm" class="crm-mini-form crm-expense-form">
          <input id="crmExpenseName" placeholder="Nuevo gasto" required>
          <select id="crmExpenseCategory"><option value="software">Software</option><option value="api">API</option><option value="hosting">Hosting</option><option value="marketing">Marketing</option><option value="other">Otro</option></select>
          <input id="crmExpenseAmount" type="number" min="0" step="1000" placeholder="COP/mes" required>
          <button class="btn" type="submit">Agregar</button>
        </form>
      </section>
    </div>

    <section id="crmBilling" class="card crm-billing-card">
      <div class="card-head">
        <div><h2>Facturación y cartera</h2><p>Mensualidades, setup, vencimientos y pagos de clientes</p></div>
        <span class="count">${invoiceRows.length} movimientos</span>
      </div>
      <div class="crm-billing-kpis">
        <div><span>Cobrado este mes</span><b>${money(paidThisMonth)}</b></div>
        <div><span>Por cobrar</span><b>${money(receivable)}</b></div>
        <div><span>Vencidas</span><b>${overdueInvoices.length}</b></div>
        <div><span>Próximos 30 días</span><b>${dueSoonInvoices.length}</b></div>
        <div><span>Renovaciones 30 días</span><b>${renewalsSoon.length}</b></div>
      </div>
      <form id="crmInvoiceForm" class="crm-invoice-form">
        <select id="crmInvoiceOrg" required>
          <option value="">Cliente</option>
          ${clients.map((org)=>`<option value="${org.id}">${esc(org.name)}</option>`).join("")}
        </select>
        <select id="crmInvoiceType"><option value="monthly">Mensualidad</option><option value="setup">Setup</option><option value="other">Otro</option></select>
        <input id="crmInvoiceAmount" type="number" min="0" step="1000" placeholder="Valor COP" required>
        <input id="crmInvoiceDue" type="date" required>
        <input id="crmInvoiceReference" placeholder="Referencia / concepto">
        <label class="crm-invoice-email-toggle"><input id="crmInvoiceSendEmail" type="checkbox" checked><span>Enviar por correo</span></label>
        <button class="btn primary" type="submit">Crear cobro</button>
      </form>
      <div class="table-wrap crm-billing-table">
        <table>
          <thead><tr><th>Número</th><th>Cliente</th><th>Tipo</th><th>Valor</th><th>Vence</th><th>Estado</th><th>Correo</th><th>Pago</th><th>Online</th><th>Referencia</th><th></th></tr></thead>
          <tbody>
            ${invoiceRows.length ? invoiceRows.slice(0,30).map((row)=>{
              const org=clients.find((item)=>item.id===row.organization_id);
              const derived = row.status === "pending" && new Date(row.due_date + "T23:59:59").getTime() < Date.now() ? "overdue" : row.status;
              const commercial = commercialMap.get(row.organization_id);
              const billingEmail = commercial?.billing_email || "";
              const emailLabel = row.email_status === "sent"
                ? "Enviado"
                : row.email_status === "failed"
                  ? "Error"
                  : row.email_status === "disabled"
                    ? "No enviado"
                    : billingEmail ? "Pendiente" : "Sin correo";
              return `<tr>
                <td><b>${esc(row.invoice_number || "—")}</b></td>
                <td><b>${esc(org?.name || "Cliente")}</b><br><span class="muted">${esc(billingEmail || "Sin correo de facturación")}</span></td>
                <td>${esc(row.invoice_type)}</td>
                <td><b>${money(row.amount_cop)}</b></td>
                <td>${shortDate(row.due_date)}</td>
                <td><span class="pill ${derived==="paid"?"green":derived==="overdue"?"orange":""}">${esc(derived)}</span></td>
                <td><span class="pill ${row.email_status==="sent"?"green":row.email_status==="failed"?"orange":""}">${esc(emailLabel)}</span>${row.email_sent_at ? `<br><span class="muted">${dateTime(row.email_sent_at)}</span>` : ""}</td>
                <td>${row.paid_at ? dateTime(row.paid_at) : "—"}</td>
                <td>${row.payment_status === "approved" ? '<span class="pill green">Aprobado</span>' : row.payment_status === "pending" ? '<span class="pill amber">Link activo</span>' : row.payment_status === "declined" ? '<span class="pill orange">Rechazado</span>' : "—"}</td>
                <td>${esc(row.reference || "—")}</td>
                <td class="crm-invoice-actions">
                  ${derived==="pending"||derived==="overdue" ? `<button class="crm-invoice-paid btn small" data-id="${row.id}" type="button">Marcar pagado</button>` : ""}
                  ${C.downloadInvoicePdf ? `<button class="crm-invoice-pdf btn small" data-id="${row.id}" type="button">PDF</button>` : ""}
                  ${billingEmail ? `<button class="crm-invoice-email btn small" data-id="${row.id}" type="button">${row.email_status==="sent"?"Reenviar":"Enviar correo"}</button>` : ""}
                </td>
              </tr>`;
            }).join("") : `<tr><td colspan="11">${C.emptyState("Sin cobros todavía.", "Crea el primer cobro cuando corresponda.")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

    <section id="crmRevenue" class="card crm-revenue-card">
      <div class="card-head">
        <div><h2>Ingresos mensuales</h2><p>MRR facturado, cobrado y pendiente durante los últimos 6 meses</p></div>
        <span class="count">${collectionRate}% cobrado este mes</span>
      </div>
      <div class="crm-revenue-summary">
        <div><span>MRR facturado</span><b>${money(currentMonthBucket.billed)}</b></div>
        <div><span>MRR cobrado</span><b>${money(currentMonthBucket.paid)}</b></div>
        <div><span>MRR pendiente</span><b>${money(currentMonthBucket.pending)}</b></div>
        <div><span>Tasa de recaudo</span><b>${collectionRate}%</b></div>
      </div>
      <div class="crm-revenue-months">
        ${monthBuckets.map((row)=>{
          const max=Math.max(1,row.billed,row.paid,row.pending);
          const paidPct=Math.round((row.paid/max)*100);
          const pendingPct=Math.round((row.pending/max)*100);
          return `<article class="crm-revenue-month">
            <span>${esc(row.label)}</span>
            <div class="crm-revenue-bars">
              <i class="paid" style="height:${Math.max(row.paid?5:0,paidPct)}%" title="Cobrado ${money(row.paid)}"></i>
              <i class="pending" style="height:${Math.max(row.pending?5:0,pendingPct)}%" title="Pendiente ${money(row.pending)}"></i>
            </div>
            <b>${money(row.billed)}</b>
            <small>${money(row.paid)} cobrado</small>
          </article>`;
        }).join("")}
      </div>
      <div class="crm-revenue-legend"><span><i class="paid"></i>Cobrado</span><span><i class="pending"></i>Pendiente</span></div>
    </section>

    <section id="crmPipeline" class="card crm-pipeline-card">
      <div class="card-head">
        <div><h2>Pipeline comercial</h2><p>Prospecto → Demo → Propuesta → Cliente → Implementación → Activo</p></div>
        <button id="crmNewProspectButton" class="btn primary small" type="button">+ Nuevo prospecto</button>
      </div>
      <div class="crm-pipeline">
        ${pipelineStagesUi.map(([stage, label]) => {
          const rows = opportunityRows.filter((row) => row.stage === stage);
          const stageMrr = rows.reduce((sum, row) => sum + Number(row.expected_mrr || 0), 0);
          return `
            <div class="crm-stage">
              <div class="crm-stage-head">
                <div><b>${esc(label)}</b><small>${rows.length} negocio${rows.length === 1 ? "" : "s"}</small></div>
                <span>${money(stageMrr)}</span>
              </div>
              <div class="crm-stage-list">
                ${rows.length ? rows.map((row) => `
                  <button class="crm-opportunity-card" type="button" data-prospect-id="${row.id}">
                    <div class="crm-opportunity-top">
                      <b>${esc(row.business_name)}</b>
                      ${row.next_action_at && new Date(row.next_action_at).getTime() < now ? '<span class="crm-overdue">Vencido</span>' : ""}
                    </div>
                    <span>${esc(row.full_name)}</span>
                    <div class="crm-opportunity-value">
                      <strong>${row.expected_mrr ? money(row.expected_mrr) + "/mes" : "MRR por definir"}</strong>
                      <small>${row.next_action_at ? shortDate(row.next_action_at) : "Sin próxima acción"}</small>
                    </div>
                  </button>
                `).join("") : `<div class="crm-stage-empty">Sin oportunidades</div>`}
              </div>
            </div>
          `;
        }).join("")}
      </div>
      ${opportunityRows.some((row) => row.stage === "perdido") ? `
        <div class="crm-lost-row"><span>Oportunidades perdidas</span><b>${opportunityRows.filter((row) => row.stage === "perdido").length}</b></div>
      ` : ""}
    </section>

    <div id="crmActions" class="crm-two-col">
      <section class="card">
        <div class="card-head">
          <div><h2>Próximas acciones</h2><p>Seguimientos comerciales ordenados por fecha</p></div>
          <span class="count">${overdue} vencidos</span>
        </div>
        <div class="crm-action-list">
          ${nextActions.slice(0, 8).map((row) => `
            <button class="crm-action-row" type="button" data-prospect-id="${row.id}">
              <span class="${new Date(row.next_action_at).getTime() < now ? "late" : ""}">${dateTime(row.next_action_at)}</span>
              <div><b>${esc(row.business_name)}</b><small>${esc(crmStageLabel(row.stage))} · ${esc(row.full_name)}</small></div>
              <em>→</em>
            </button>
          `).join("") || `<div class="empty"><strong>Agenda comercial limpia.</strong>No hay próximas acciones registradas.</div>`}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Actividad reciente</h2><p>Notas, demos, propuestas y seguimientos</p></div></div>
        <div class="crm-activity-timeline">
          ${activityRows.slice(0, 8).map((row) => `
            <div class="crm-activity-entry">
              <i></i>
              <div>
                <b>${esc(row.title)}</b>
                <small>${esc(row.activity_type)} · ${dateTime(row.created_at)}</small>
                <p>${esc(row.details || "")}</p>
              </div>
            </div>
          `).join("") || `<div class="empty"><strong>Sin actividad registrada.</strong>Las acciones del CRM aparecerán aquí.</div>`}
        </div>
      </section>
    </div>

    <section id="crmClients" class="card crm-clients-card">
      <div class="card-head">
        <div><h2>Clientes, implementación y rentabilidad</h2><p>Economía real de cada cuenta NEXO</p></div>
        <span class="count">${clients.length} clientes</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>Etapa</th><th>Plan</th><th>MRR</th><th>Costo mensual</th><th>Utilidad</th><th>Margen</th><th>Implementación</th><th>Integraciones</th><th>Inicio</th><th>Renovación</th><th></th></tr></thead>
          <tbody>
            ${clientFinancials.map(({ org, commercial, orgIntegrations, economics }) => `
              <tr>
                <td><b>${esc(org.name)}</b><br><span class="muted">${esc(org.assistant || "—")}</span></td>
                <td><span class="pill ${crmTone(commercial?.lifecycle_stage)}">${esc(crmStageLabel(commercial?.lifecycle_stage || "cliente"))}</span></td>
                <td>${esc(commercial?.plan_name || "Por definir")}</td>
                <td><b>${commercial?.mrr == null ? "—" : money(economics.mrr)}</b></td>
                <td>${commercial?.monthly_cost == null && !orgIntegrations.length ? "—" : money(economics.cost)}</td>
                <td>${commercial?.mrr == null ? "—" : money(economics.profit)}</td>
                <td>${commercial?.mrr == null ? "—" : `<b class="${economics.margin >= 60 ? "crm-good" : economics.margin >= 30 ? "crm-watch" : "crm-risk"}">${economics.margin}%</b>`}</td>
                <td>${esc(commercial?.implementation_status || "pending")}</td>
                <td>${esc(commercial?.integration_status || "pending")} · ${orgIntegrations.length}</td>
                <td>${commercial?.contract_start_date ? shortDate(commercial.contract_start_date) : "—"}</td>
                <td>${commercial?.renewal_date ? `<span class="${new Date(commercial.renewal_date+"T23:59:59").getTime() <= Date.now()+30*86400000 ? "crm-watch" : ""}">${shortDate(commercial.renewal_date)}</span>` : "—"}</td>
                <td><button class="crm-edit-client btn small" data-org-id="${org.id}" type="button">Editar</button></td>
              </tr>
            `).join("") || `<tr><td colspan="12">${C.emptyState("Sin clientes todavía.", "Convierte un prospecto cuando cierre.")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

    <section id="crmNewProspectPanel" class="card crm-new-prospect hidden">
      <div class="card-head">
        <div><h2>Nuevo prospecto manual</h2><p>Para oportunidades que no llegaron desde la web</p></div>
        <button id="crmCancelNewProspect" class="btn small" type="button">Cerrar</button>
      </div>
      <form id="crmNewProspectForm" class="crm-form crm-inline-form">
        <div class="crm-form-grid">
          <label>Contacto<input id="crmNewName" required></label>
          <label>Negocio<input id="crmNewBusiness" required></label>
          <label>WhatsApp<input id="crmNewPhone"></label>
          <label>Correo<input id="crmNewEmail" type="email"></label>
          <label>Sector<input id="crmNewIndustry"></label>
          <label>MRR esperado<input id="crmNewMrr" type="number" min="0" step="1000"></label>
          <label>Próxima acción<input id="crmNewNext" type="datetime-local"></label>
          <label class="wide">Contexto<textarea id="crmNewMessage" rows="3"></textarea></label>
        </div>
        <div class="crm-form-actions"><button class="btn primary" type="submit">Crear prospecto</button></div>
      </form>
    </section>
  `;

  document.querySelectorAll("[data-crm-section]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.crmSection);
      if (!target) return;
      document.querySelectorAll("[data-crm-section]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      const top = target.getBoundingClientRect().top + window.scrollY - 96;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
  });

  const byId = new Map(opportunityRows.map((row) => [row.id, row]));
  document.querySelectorAll("[data-prospect-id]").forEach((button) => {
    button.addEventListener("click", () => openProspectEditor(byId.get(button.dataset.prospectId), planRows));
  });

  document.querySelectorAll(".crm-edit-client").forEach((button) => {
    button.addEventListener("click", () => {
      const org = clients.find((row) => row.id === button.dataset.orgId);
      openCommercialEditor(org, commercialMap.get(org.id) || null, integrationsByOrg.get(org.id) || [], planRows);
    });
  });

  $("crmInvoiceForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Creando…";
    try {
      const { error } = await C.supabase.from("client_invoices").insert({
        organization_id: $("crmInvoiceOrg").value,
        invoice_type: $("crmInvoiceType").value,
        amount_cop: nullableNumber($("crmInvoiceAmount").value) || 0,
        due_date: $("crmInvoiceDue").value,
        reference: $("crmInvoiceReference").value.trim() || null,
        status: "pending",
        email_status: $("crmInvoiceSendEmail").checked ? "pending" : "disabled",
      });
      if (error) throw error;
      C.showToast("Cobro creado y puesto en cola de correo.");
      form.reset();
      await refreshCrmView();
    } catch (error) {
      C.showError(error.message || "No pudimos crear el cobro.");
      button.disabled = false;
      button.textContent = "Crear cobro";
    }
  });

  document.querySelectorAll(".crm-invoice-pdf").forEach((button) => {
    button.addEventListener("click", () => {
      const invoice = invoiceRows.find((row) => row.id === button.dataset.id);
      const org = clients.find((item) => item.id === invoice?.organization_id);
      if (invoice && C.downloadInvoicePdf) C.downloadInvoicePdf(invoice, org?.name || "Cliente NEXO");
    });
  });

  document.querySelectorAll(".crm-invoice-email").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "En cola…";
      try {
        const { error } = await C.supabase.from("client_invoices").update({
          email_status: "pending",
          email_sent_at: null,
          email_error: null,
          updated_at: new Date().toISOString(),
        }).eq("id", button.dataset.id);
        if (error) throw error;
        C.showToast("Cuenta de cobro puesta en cola de envío.");
        await refreshCrmView();
      } catch (error) {
        button.disabled = false;
        button.textContent = "Enviar correo";
        C.showError(error.message || "No pudimos poner el correo en cola.");
      }
    });
  });

  document.querySelectorAll(".crm-invoice-paid").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const { error } = await C.supabase.from("client_invoices").update({
        status: "paid",
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", button.dataset.id);
      if (error) {
        button.disabled = false;
        return C.showError(error.message);
      }
      C.showToast("Pago registrado.");
      await refreshCrmView();
    });
  });

  document.querySelectorAll(".crm-expense-disable").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      const { error } = await C.supabase.from("nexo_expenses").update({ active: false, updated_at: new Date().toISOString() }).eq("id", button.dataset.id);
      if (error) {
        button.disabled = false;
        return C.showError(error.message);
      }
      C.showToast("Gasto desactivado.");
      await refreshCrmView();
    });
  });

  $("crmExpenseForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { error } = await C.supabase.from("nexo_expenses").insert({
      expense_name: $("crmExpenseName").value.trim(),
      category: $("crmExpenseCategory").value,
      amount_cop: nullableNumber($("crmExpenseAmount").value) || 0,
      frequency: "monthly",
      shared_cost: true,
      active: true,
      effective_from: new Date().toISOString().slice(0,10),
    });
    if (error) return C.showError(error.message);
    C.showToast("Gasto agregado.");
    await refreshCrmView();
  });

  $("crmNewProspectButton")?.addEventListener("click", () => {
    $("crmNewProspectPanel").classList.remove("hidden");
    $("crmNewProspectPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("crmCancelNewProspect")?.addEventListener("click", () => $("crmNewProspectPanel").classList.add("hidden"));

  $("crmNewProspectForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      full_name: $("crmNewName").value.trim(),
      business_name: $("crmNewBusiness").value.trim(),
      phone: $("crmNewPhone").value.trim() || null,
      email: $("crmNewEmail").value.trim() || null,
      industry: $("crmNewIndustry").value.trim() || null,
      message: $("crmNewMessage").value.trim() || null,
      source: "manual",
      status: "Nuevo",
      stage: "prospecto",
      expected_mrr: nullableNumber($("crmNewMrr").value),
      next_action_at: $("crmNewNext").value ? new Date($("crmNewNext").value).toISOString() : null,
    };
    const { error } = await C.supabase.from("demo_requests").insert(payload);
    if (error) return C.showError(error.message);
    C.showToast("Prospecto creado.");
    await refreshCrmView();
  });
}
