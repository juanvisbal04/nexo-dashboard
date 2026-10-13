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

export { renderSalesWorkspace } from "./salesCrm.js?v=20261013-work2";

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
