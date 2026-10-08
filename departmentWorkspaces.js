let C=null;

const salesStages=[
  ["prospecto","Prospecto"],
  ["demo","Demo"],
  ["propuesta","Propuesta"],
  ["cliente","Cliente"],
  ["implementacion","Implementación"],
  ["activo","Activo"],
  ["perdido","Perdido"],
];

function stageLabel(value){return Object.fromEntries(salesStages)[value]||value||"Prospecto";}
function assignedClients(){return (C.state.organizations||[]).filter((org)=>org.name!=="NEXO Internal");}
function orgMap(){return new Map(assignedClients().map((org)=>[org.id,org]));}
function can(permission){return Boolean(C.hasPermission?.(permission));}
function money(value){return new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(value||0));}
function safeDate(value){return value?C.dateTime(value):"—";}

export async function renderSalesWorkspace(context){
  C=context;
  const [{data:prospects,error:prospectError},{data:activities,error:activityError}]=await Promise.all([
    C.supabase.from("demo_requests").select("*").is("archived_at",null).order("created_at",{ascending:false}).limit(500),
    C.supabase.from("crm_activities").select("*").order("created_at",{ascending:false}).limit(500),
  ]);
  if(prospectError)throw prospectError;
  if(activityError)throw activityError;

  const rows=prospects||[];
  const now=Date.now();
  const open=rows.filter((r)=>!["activo","perdido"].includes(r.stage));
  const overdue=open.filter((r)=>r.next_action_at&&new Date(r.next_action_at).getTime()<now);
  const pipelineMrr=open.reduce((sum,r)=>sum+Number(r.expected_mrr||0),0);
  const demos=open.filter((r)=>r.demo_at&&new Date(r.demo_at).getTime()>=now).length;
  const canWrite=can("crm.assigned.write")||can("crm.all.write");
  const teamScope=can("crm.all.read");

  C.$("content").innerHTML=`
    <section class="staff-page-intro staff-page-intro-actions">
      <div>
        <span class="eyebrow">NEXO · SALES</span>
        <h2>${teamScope?"Pipeline del equipo":"Mi pipeline"}</h2>
        <p>${teamScope?"Vista comercial del equipo Sales sin finanzas internas, costos ni márgenes.":"Tus oportunidades, seguimientos y próximas acciones."}</p>
      </div>
      ${canWrite?'<button id="staffNewProspect" class="btn primary" type="button">+ Nuevo prospecto</button>':""}
    </section>

    <div class="staff-kpi-grid">
      <article><span>Oportunidades abiertas</span><b>${open.length}</b><small>Pipeline activo</small></article>
      <article><span>Pipeline MRR</span><b class="compact-money">${money(pipelineMrr)}</b><small>Valor esperado, no ingreso real</small></article>
      <article class="${overdue.length?"risk":""}"><span>Seguimientos vencidos</span><b>${overdue.length}</b><small>Próxima acción vencida</small></article>
      <article><span>Demos próximas</span><b>${demos}</b><small>Programadas a futuro</small></article>
    </div>

    <section class="card">
      <div class="card-head"><div><h2>${teamScope?"Pipeline Sales":"Mis oportunidades"}</h2><p>${rows.length} oportunidad${rows.length===1?"":"es"} visibles según tu cargo</p></div></div>
      <div class="staff-sales-pipeline">
        ${salesStages.filter(([key])=>key!=="perdido").map(([stage,label])=>{
          const stageRows=rows.filter((r)=>r.stage===stage);
          return `
            <div class="staff-sales-column">
              <header><b>${C.esc(label)}</b><span>${stageRows.length}</span></header>
              <div>
                ${stageRows.length?stageRows.map((row)=>`
                  <article class="staff-sales-card" data-prospect-id="${row.id}">
                    <span>${C.esc(row.business_name||"Negocio")}</span>
                    <b>${C.esc(row.full_name||"Contacto")}</b>
                    <small>${C.esc(row.industry||"Sin sector")} · ${row.expected_mrr?money(row.expected_mrr):"MRR sin definir"}</small>
                    <div class="${row.next_action_at&&new Date(row.next_action_at).getTime()<now?"risk":""}">Próxima acción: ${safeDate(row.next_action_at)}</div>
                    ${canWrite?`<select class="staff-sales-stage" data-prospect-id="${row.id}">
                      ${salesStages.map(([value,name])=>`<option value="${value}" ${row.stage===value?"selected":""}>${C.esc(name)}</option>`).join("")}
                    </select>`:""}
                  </article>
                `).join(""):'<div class="staff-sales-empty">Sin oportunidades</div>'}
              </div>
            </div>`;
        }).join("")}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Actividad reciente</h2><p>Notas, llamadas, demos y seguimientos visibles en tu scope</p></div></div>
      <div class="staff-activity-list">
        ${(activities||[]).slice(0,12).map((row)=>`
          <div><span>${C.esc(row.activity_type||"note")}</span><div><b>${C.esc(row.title||"Actividad")}</b><small>${C.esc(row.details||"")} ${row.due_at?"· "+safeDate(row.due_at):""}</small></div></div>
        `).join("")||C.emptyState("Sin actividad todavía.","Registra actividad desde tus oportunidades.")}
      </div>
    </section>
  `;

  document.querySelectorAll(".staff-sales-stage").forEach((select)=>{
    select.addEventListener("change",async()=>{
      const id=select.dataset.prospectId;
      const row=rows.find((r)=>r.id===id);
      if(!row)return;
      const previous=row.stage;
      select.disabled=true;
      const {error}=await C.supabase.from("demo_requests").update({stage:select.value,updated_at:new Date().toISOString()}).eq("id",id);
      if(error){C.showError(error.message);select.value=previous;select.disabled=false;return;}
      await C.supabase.from("crm_activities").insert({
        demo_request_id:id,
        organization_id:row.organization_id||null,
        activity_type:"status_change",
        title:`Etapa: ${stageLabel(previous)} → ${stageLabel(select.value)}`,
        created_by:C.state.session.user.id,
      });
      C.showToast("Etapa actualizada.");
      await C.renderApp();
    });
  });

  C.$("staffNewProspect")?.addEventListener("click",()=>openNewProspect(rows));
}

function openNewProspect(){
  document.getElementById("staffSalesModal")?.remove();
  const root=document.createElement("div");
  root.id="staffSalesModal";
  root.className="staff-work-modal";
  root.innerHTML=`
    <div class="staff-work-backdrop" data-close-sales></div>
    <section class="staff-work-dialog">
      <header><div><span class="eyebrow">NEXO · SALES</span><h2>Nuevo prospecto</h2><p>Se crea dentro de tu scope comercial. No crea un cliente NEXO todavía.</p></div><button data-close-sales type="button">×</button></header>
      <div class="staff-work-body">
        <form id="staffSalesForm" class="staff-work-form">
          <label>Contacto<input id="salesName" required></label>
          <label>Negocio<input id="salesBusiness" required></label>
          <label>Correo<input id="salesEmail" type="email"></label>
          <label>WhatsApp<input id="salesPhone"></label>
          <label>Sector<input id="salesIndustry"></label>
          <label>MRR esperado<input id="salesMrr" type="number" min="0" step="1000"></label>
          <label>Setup esperado<input id="salesSetup" type="number" min="0" step="1000"></label>
          <label>Próxima acción<input id="salesNext" type="datetime-local"></label>
          <label class="wide">Notas<textarea id="salesNotes" rows="4"></textarea></label>
          <div id="staffSalesResult" class="access-result hidden wide"></div>
          <div class="staff-work-actions wide"><button class="btn primary" type="submit">Crear prospecto</button></div>
        </form>
      </div>
    </section>`;
  document.body.appendChild(root);
  document.body.classList.add("modal-open");
  const close=()=>{root.remove();document.body.classList.remove("modal-open");};
  root.querySelectorAll("[data-close-sales]").forEach((el)=>el.addEventListener("click",close));
  root.querySelector("#staffSalesForm")?.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;button.textContent="Creando…";
    const next=root.querySelector("#salesNext").value;
    const {error}=await C.supabase.from("demo_requests").insert({
      full_name:root.querySelector("#salesName").value.trim(),
      business_name:root.querySelector("#salesBusiness").value.trim(),
      email:root.querySelector("#salesEmail").value.trim()||null,
      phone:root.querySelector("#salesPhone").value.trim()||null,
      industry:root.querySelector("#salesIndustry").value.trim()||null,
      expected_mrr:root.querySelector("#salesMrr").value?Number(root.querySelector("#salesMrr").value):null,
      expected_setup_fee:root.querySelector("#salesSetup").value?Number(root.querySelector("#salesSetup").value):null,
      next_action_at:next?new Date(next).toISOString():null,
      crm_notes:root.querySelector("#salesNotes").value.trim()||null,
      source:"internal_sales",
      status:"Nuevo",
      stage:"prospecto",
      owner_user_id:C.state.session.user.id,
    });
    if(error){C.showError(error.message);button.disabled=false;button.textContent="Crear prospecto";return;}
    close();C.showToast("Prospecto creado.");await C.renderApp();
  });
}

export async function renderImplementationWorkspace(context){
  C=context;
  const clients=assignedClients();
  const ids=clients.map((o)=>o.id);
  if(!ids.length){
    C.$("content").innerHTML=C.emptyState("No tienes clientes en tu scope.","El Founder o tu Lead puede asignarlos desde Equipo & accesos.");
    return;
  }

  const [{data:onboarding,error:onboardingError},{data:assistants,error:assistantError}]=await Promise.all([
    C.supabase.from("organization_onboarding").select("*").in("organization_id",ids),
    C.supabase.from("assistants").select("*").in("organization_id",ids),
  ]);
  if(onboardingError)throw onboardingError;
  if(assistantError)throw assistantError;

  const onboardMap=new Map((onboarding||[]).map((r)=>[r.organization_id,r]));
  const assistantMap=new Map((assistants||[]).map((r)=>[r.organization_id,r]));
  const canWrite=can("client_data.assigned.write");
  const liveCount=(onboarding||[]).filter((r)=>r.overall_status==="live").length;
  const pendingSteps=(onboarding||[]).reduce((sum,r)=>sum+["company_status","assistant_status","catalog_status","integrations_status","users_status","testing_status","go_live_status"].filter((key)=>r[key]!=="done").length,0);

  C.$("content").innerHTML=`
    <section class="staff-page-intro">
      <div><span class="eyebrow">NEXO · IMPLEMENTATION & CUSTOMER SUCCESS</span><h2>Implementación & clientes</h2><p>Onboarding, configuración, asistentes y readiness de los clientes dentro de tu scope.</p></div>
    </section>
    <div class="staff-kpi-grid">
      <article><span>Clientes en scope</span><b>${clients.length}</b><small>Asignados a ti o a tu equipo</small></article>
      <article><span>Live</span><b>${liveCount}</b><small>Onboarding completado</small></article>
      <article class="${pendingSteps?"risk":""}"><span>Pasos pendientes</span><b>${pendingSteps}</b><small>Across onboarding</small></article>
      <article><span>Asistentes visibles</span><b>${(assistants||[]).length}</b><small>Configuración autorizada</small></article>
    </div>
    <div class="staff-delivery-grid">
      ${clients.map((org)=>{
        const row=onboardMap.get(org.id);
        const assistant=assistantMap.get(org.id);
        return `
          <article class="card staff-delivery-card">
            <div class="staff-account-top">
              <span class="staff-client-avatar large" style="--staff-color:${C.esc(org.color||"#316bff")}">${C.esc(org.initials||"NX")}</span>
              <div><h3>${C.esc(org.name)}</h3><p>${C.esc(org.sector||"Cliente NEXO")}</p></div>
              <span class="staff-project-status ${row?.overall_status==="live"?"done":"active"}">${C.esc(row?.overall_status||"Sin onboarding")}</span>
            </div>
            ${row?`
              <div class="staff-onboarding-steps">
                ${[
                  ["company_status","Empresa"],["assistant_status","Asistente"],["catalog_status","Catálogo"],
                  ["integrations_status","Integraciones"],["users_status","Usuarios"],["testing_status","Testing"],["go_live_status","Go Live"]
                ].map(([key,label])=>`
                  <div><span>${C.esc(label)}</span>
                    ${canWrite?`<select class="staff-onboarding-select" data-org-id="${org.id}" data-field="${key}">
                      <option value="pending" ${row[key]==="pending"?"selected":""}>Pendiente</option>
                      <option value="done" ${row[key]==="done"?"selected":""}>Listo</option>
                    </select>`:`<b>${row[key]==="done"?"Listo":"Pendiente"}</b>`}
                  </div>
                `).join("")}
              </div>
              <div class="staff-assistant-summary"><span>Asistente</span><b>${C.esc(assistant?.name||"Sin asistente configurado")}</b><small>${C.esc(assistant?.status||"—")} · ${C.esc(assistant?.channel||"—")}</small></div>
            `:`
              <div class="staff-empty-onboarding"><p>Este cliente aún no tiene checklist de onboarding.</p>${canWrite?`<button class="btn small staff-start-onboarding" data-org-id="${org.id}" type="button">Iniciar onboarding</button>`:""}</div>
            `}
          </article>`;
      }).join("")}
    </div>
  `;

  document.querySelectorAll(".staff-onboarding-select").forEach((select)=>{
    select.addEventListener("change",async()=>{
      const orgId=select.dataset.orgId;
      const field=select.dataset.field;
      select.disabled=true;
      const {data:current,error:readError}=await C.supabase.from("organization_onboarding").select("*").eq("organization_id",orgId).maybeSingle();
      if(readError){C.showError(readError.message);select.disabled=false;return;}
      const payload={[field]:select.value,updated_by:C.state.session.user.id};
      const stepKeys=["company_status","assistant_status","catalog_status","integrations_status","users_status","testing_status","go_live_status"];
      const projected={...(current||{}),...payload};
      payload.overall_status=stepKeys.every((key)=>projected[key]==="done")?"live":"in_progress";
      const {error}=await C.supabase.from("organization_onboarding").update(payload).eq("organization_id",orgId);
      if(error){C.showError(error.message);select.disabled=false;return;}
      C.showToast("Onboarding actualizado.");await C.renderApp();
    });
  });

  document.querySelectorAll(".staff-start-onboarding").forEach((button)=>{
    button.addEventListener("click",async()=>{
      button.disabled=true;
      const {error}=await C.supabase.from("organization_onboarding").insert({
        organization_id:button.dataset.orgId,
        overall_status:"in_progress",
        updated_by:C.state.session.user.id,
      });
      if(error){C.showError(error.message);button.disabled=false;return;}
      C.showToast("Onboarding iniciado.");await C.renderApp();
    });
  });
}

export async function renderOperationsWorkspace(context){
  C=context;
  const clients=assignedClients();
  const ids=clients.map((o)=>o.id);
  if(!ids.length){
    C.$("content").innerHTML=C.emptyState("No tienes clientes operativos asignados.","El Founder o Operations Lead puede asignarlos.");
    return;
  }

  const [
    {data:assistants,error:assistantError},
    {data:conversations,error:conversationError},
    {data:appointments,error:appointmentError},
  ]=await Promise.all([
    C.supabase.from("assistants").select("*").in("organization_id",ids),
    C.supabase.from("conversations").select("*").in("organization_id",ids).order("last_message_at",{ascending:false}).limit(1000),
    C.supabase.from("appointments").select("*").in("organization_id",ids).order("starts_at",{ascending:true}).limit(1000),
  ]);
  if(assistantError)throw assistantError;
  if(conversationError)throw conversationError;
  if(appointmentError)throw appointmentError;

  const orgs=orgMap();
  const now=Date.now();
  const attention=(conversations||[]).filter((r)=>r.status==="Requiere atención");
  const active=(conversations||[]).filter((r)=>r.status==="Activa");
  const upcoming=(appointments||[]).filter((r)=>new Date(r.starts_at).getTime()>=now);
  const responseRows=(conversations||[]).filter((r)=>Number(r.response_seconds||0)>0);
  const avg=responseRows.length?Math.round(responseRows.reduce((sum,r)=>sum+Number(r.response_seconds||0),0)/responseRows.length):0;

  C.$("content").innerHTML=`
    <section class="staff-page-intro">
      <div><span class="eyebrow">NEXO · OPERATIONS</span><h2>Centro operativo</h2><p>Monitoreo de asistentes, conversaciones, atención requerida y agenda dentro de tu scope.</p></div>
    </section>
    <div class="staff-kpi-grid">
      <article><span>Conversaciones activas</span><b>${active.length}</b><small>Actividad visible</small></article>
      <article class="${attention.length?"risk":""}"><span>Requieren atención</span><b>${attention.length}</b><small>Prioridad operativa</small></article>
      <article><span>Citas próximas</span><b>${upcoming.length}</b><small>Desde ahora</small></article>
      <article><span>Respuesta promedio</span><b>${avg}s</b><small>Conversaciones con métrica</small></article>
    </div>

    <div class="grid-two">
      <section class="card">
        <div class="card-head"><div><h2>Atención operativa</h2><p>Conversaciones que requieren intervención</p></div></div>
        <div class="staff-ops-list">
          ${attention.length?attention.slice(0,20).map((row)=>`
            <article><div><b>${C.esc(row.name||"Contacto")}</b><small>${C.esc(orgs.get(row.organization_id)?.name||"Cliente")} · ${C.esc(row.channel||"")}</small></div><span>${safeDate(row.last_message_at)}</span></article>
          `).join(""):C.emptyState("Sin alertas operativas.","No hay conversaciones marcadas como Requiere atención.")}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Estado de asistentes</h2><p>Asistentes visibles por cliente</p></div></div>
        <div class="staff-ops-list">
          ${(assistants||[]).map((row)=>`
            <article><div><b>${C.esc(row.name||"Asistente NEXO")}</b><small>${C.esc(orgs.get(row.organization_id)?.name||"Cliente")} · ${C.esc(row.channel||"")}</small></div><span class="${row.status==="active"?"ok":""}">${C.esc(row.status||"—")}</span></article>
          `).join("")||C.emptyState("Sin asistentes visibles.","Aún no hay asistentes dentro de tu scope.")}
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-head"><div><h2>Próximas citas</h2><p>Agenda operativa de clientes asignados</p></div></div>
      <div class="staff-ops-list">
        ${upcoming.slice(0,30).map((row)=>`
          <article><div><b>${C.esc(row.name||"Cita")}</b><small>${C.esc(orgs.get(row.organization_id)?.name||"Cliente")} · ${C.esc(row.service||"")}</small></div><span>${safeDate(row.starts_at)} · ${C.esc(row.status||"")}</span></article>
        `).join("")||C.emptyState("Sin citas próximas.","No hay citas futuras visibles en este momento.")}
      </div>
    </section>
  `;
}
