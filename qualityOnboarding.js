let Q=null;

const STEP_FIELDS=[
  ["company_status","Empresa"],
  ["assistant_status","Asistente"],
  ["catalog_status","Catálogo"],
  ["integrations_status","Integraciones"],
  ["users_status","Usuarios"],
  ["testing_status","Pruebas"],
  ["go_live_status","Go Live"],
];

const STEP_LABELS={
  pending:"Pendiente",
  in_progress:"En progreso",
  done:"Completado",
  blocked:"Bloqueado",
  not_needed:"No aplica",
};

export function configureQualityOnboarding(context){Q=context;}

function esc(v){return Q.esc(v);}
function money(v){return Q.money(v);}
function shortDate(v){return Q.shortDate(v);}

function normalizePhone(value){
  return String(value||"").replace(/\D/g,"");
}

function ensureDrawer(id){
  let root=document.getElementById(id);
  if(root)return root;
  root=document.createElement("div");
  root.id=id;
  root.className="nexo-drawer hidden";
  root.innerHTML='<div class="nexo-drawer-backdrop" data-quality-close></div><section class="nexo-drawer-panel"><div class="nexo-drawer-content"></div></section>';
  document.body.appendChild(root);
  root.querySelector("[data-quality-close]")?.addEventListener("click",()=>closeQualityDrawer(id));
  return root;
}

export function closeQualityDrawer(id="onboardingDrawer"){
  document.getElementById(id)?.classList.add("hidden");
  if(!document.querySelector(".nexo-drawer:not(.hidden)"))document.body.classList.remove("modal-open");
}

function showDrawer(id,html){
  const root=ensureDrawer(id);
  root.querySelector(".nexo-drawer-content").innerHTML=html;
  root.classList.remove("hidden");
  document.body.classList.add("modal-open");
  return root;
}

function stepSelect(field,value){
  return `<select class="onboarding-step-select" data-step-field="${field}">
    ${Object.entries(STEP_LABELS).map(([key,label])=>`<option value="${key}" ${key===value?"selected":""}>${label}</option>`).join("")}
  </select>`;
}

function stepTone(value){
  return value==="done"||value==="not_needed"?"good":value==="blocked"?"risk":value==="in_progress"?"watch":"neutral";
}

function progressPercent(row){
  const complete=STEP_FIELDS.filter(([field])=>["done","not_needed"].includes(row?.[field])).length;
  return Math.round((complete/STEP_FIELDS.length)*100);
}

function deriveOverall(values){
  if(values.go_live_status==="done")return "live";
  if(Object.values(values).includes("blocked"))return "blocked";
  const prep=["company_status","assistant_status","catalog_status","integrations_status","users_status","testing_status"];
  if(prep.every((key)=>["done","not_needed"].includes(values[key])))return "ready";
  return "in_progress";
}

async function loadQualityData(){
  const clients=Q.clientOrganizations({activeOnly:false});
  const ids=clients.map((org)=>org.id);
  if(!ids.length)return {clients,rows:[]};

  const [
    contactsR,conversationsR,leadsR,appointmentsR,servicesR,aliasesR,
    integrationsR,onboardingR,settingsR,membersR,exclusionsR
  ]=await Promise.all([
    Q.supabase.from("contacts").select("id,organization_id,name,phone").in("organization_id",ids),
    Q.supabase.from("conversations").select("id,organization_id,contact_id,status").in("organization_id",ids),
    Q.supabase.from("leads").select("id,organization_id,contact_id,name,service,value").in("organization_id",ids),
    Q.supabase.from("appointments").select("id,organization_id,contact_id,name,service,value,status").in("organization_id",ids),
    Q.supabase.from("services").select("id,organization_id,name,price,active").in("organization_id",ids),
    Q.supabase.from("service_aliases").select("organization_id,alias,service_id").in("organization_id",ids),
    Q.supabase.from("crm_integrations").select("organization_id,integration_name,status").in("organization_id",ids),
    Q.supabase.from("organization_onboarding").select("*").in("organization_id",ids),
    Q.supabase.from("organization_settings").select("organization_id,notification_email,whatsapp,handoff_phone").in("organization_id",ids),
    Q.supabase.from("organization_members").select("organization_id,user_id,role").in("organization_id",ids),
    Q.supabase.from("ingest_exclusions").select("organization_id,normalized_phone,active").in("organization_id",ids).eq("active",true),
  ]);

  const results=[contactsR,conversationsR,leadsR,appointmentsR,servicesR,aliasesR,integrationsR,onboardingR,settingsR,membersR,exclusionsR];
  const error=results.find((r)=>r.error)?.error;
  if(error)throw error;

  const contacts=contactsR.data||[];
  const conversations=conversationsR.data||[];
  const leads=leadsR.data||[];
  const appointments=appointmentsR.data||[];
  const services=servicesR.data||[];
  const aliases=aliasesR.data||[];
  const integrations=integrationsR.data||[];
  const onboarding=onboardingR.data||[];
  const settings=settingsR.data||[];
  const members=membersR.data||[];
  const exclusions=exclusionsR.data||[];

  const serviceById=new Map(services.map((s)=>[s.id,s]));
  const catalogByOrg=new Map();
  services.filter((s)=>s.active).forEach((s)=>{
    if(!catalogByOrg.has(s.organization_id))catalogByOrg.set(s.organization_id,new Map());
    catalogByOrg.get(s.organization_id).set(String(s.name||"").trim().toLowerCase(),s);
  });
  aliases.forEach((a)=>{
    const svc=serviceById.get(a.service_id);
    if(!svc)return;
    if(!catalogByOrg.has(a.organization_id))catalogByOrg.set(a.organization_id,new Map());
    catalogByOrg.get(a.organization_id).set(String(a.alias||"").trim().toLowerCase(),svc);
  });

  const onboardMap=new Map(onboarding.map((r)=>[r.organization_id,r]));
  const settingsMap=new Map(settings.map((r)=>[r.organization_id,r]));
  const exclusionMap=new Map();
  exclusions.forEach((x)=>{
    if(!exclusionMap.has(x.organization_id))exclusionMap.set(x.organization_id,new Set());
    exclusionMap.get(x.organization_id).add(x.normalized_phone);
  });

  const rows=clients.map((org)=>{
    const orgContacts=contacts.filter((r)=>r.organization_id===org.id);
    const orgLeads=leads.filter((r)=>r.organization_id===org.id);
    const orgAppointments=appointments.filter((r)=>r.organization_id===org.id);
    const catalog=catalogByOrg.get(org.id)||new Map();
    const excluded=exclusionMap.get(org.id)||new Set();

    const phoneCounts=new Map();
    orgContacts.forEach((c)=>{
      const phone=normalizePhone(c.phone);
      if(phone)phoneCounts.set(phone,(phoneCounts.get(phone)||0)+1);
    });
    const duplicatePhones=[...phoneCounts.values()].filter((n)=>n>1).length;
    const missingContactData=orgContacts.filter((c)=>!String(c.name||"").trim()||!normalizePhone(c.phone)).length;
    const excludedReentry=orgContacts.filter((c)=>excluded.has(normalizePhone(c.phone))).length;

    let priceMismatch=0;
    let unknownService=0;
    [...orgLeads,...orgAppointments].forEach((row)=>{
      const service=String(row.service||"").trim();
      if(!service)return;
      const expected=catalog.get(service.toLowerCase());
      if(!expected){unknownService+=1;return;}
      if(Number(row.value||0)!==Number(expected.price||0))priceMismatch+=1;
    });

    const activeIntegrations=integrations.filter((r)=>r.organization_id===org.id);
    const integrationIssues=activeIntegrations.filter((r)=>!["active","connected","done"].includes(String(r.status||"").toLowerCase())).length;
    const assistant=Q.assistantForOrg(org.id);
    const assistantIssue=!assistant||assistant.status!=="active"?1:0;
    const setting=settingsMap.get(org.id)||{};
    const configMissing=[setting.notification_email,setting.whatsapp,setting.handoff_phone].filter((v)=>!String(v||"").trim()).length;
    const onboardingRow=onboardMap.get(org.id)||{};
    const onboardingProgress=progressPercent(onboardingRow);
    const clientUsers=members.filter((m)=>m.organization_id===org.id&&m.role!=="platform_admin").length;

    const critical=duplicatePhones+priceMismatch+excludedReentry;
    const warnings=missingContactData+unknownService+assistantIssue+configMissing;
    let score=100;
    score-=Math.min(30,duplicatePhones*10);
    score-=Math.min(30,priceMismatch*10);
    score-=Math.min(30,excludedReentry*15);
    score-=Math.min(20,missingContactData*4);
    score-=Math.min(15,unknownService*3);
    score-=assistantIssue*10;
    score-=Math.min(10,configMissing*2);
    score=Math.max(0,score);
    const tone=score>=95?"good":score>=80?"watch":"risk";

    return {
      organization_id:org.id,
      organization:org.name,
      contacts:orgContacts.length,
      conversations:conversations.filter((r)=>r.organization_id===org.id).length,
      duplicatePhones,missingContactData,priceMismatch,unknownService,excludedReentry,
      integrationIssues,assistantIssue,configMissing,critical,warnings,score,tone,
      onboardingProgress,onboardingStatus:onboardingRow.overall_status||"not_started",
      clientUsers,
    };
  });

  return {clients,rows};
}

export async function renderDataQuality(context=Q){
  if(context)Q=context;
  if(!(Q.state.isAdmin&&Q.isInternalOrg())){
    Q.$("content").innerHTML=Q.emptyState("Calidad de datos es privada de NEXO.","Selecciona NEXO Internal.");
    return;
  }

  const {rows}=await loadQualityData();
  Q.state.currentRows=rows;
  const totalIssues=rows.reduce((sum,r)=>sum+r.critical+r.warnings,0);
  const criticalClients=rows.filter((r)=>r.critical>0).length;
  const cleanClients=rows.filter((r)=>r.score>=95).length;
  const avgOnboarding=rows.length?Math.round(rows.reduce((s,r)=>s+r.onboardingProgress,0)/rows.length):0;

  Q.$("content").innerHTML=`
    <div class="quality-summary">
      <div><span>Salud de datos</span><b>${rows.length?Math.round(rows.reduce((s,r)=>s+r.score,0)/rows.length):100}%</b><small>promedio de clientes</small></div>
      <div class="${criticalClients?"risk":""}"><span>Críticos</span><b>${criticalClients}</b><small>clientes con inconsistencias críticas</small></div>
      <div><span>Clientes limpios</span><b>${cleanClients}</b><small>score ≥ 95</small></div>
      <div><span>Onboarding</span><b>${avgOnboarding}%</b><small>avance promedio</small></div>
    </div>

    <section class="card quality-card">
      <div class="card-head">
        <div><h2>Data Quality</h2><p>Duplicados, datos incompletos, precios, pruebas e integridad operativa.</p></div>
        <span class="count">${totalIssues} señal${totalIssues===1?"":"es"}</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Cliente</th><th>Score</th><th>Contactos</th><th>Duplicados</th><th>Incompletos</th><th>Precios</th><th>Servicios desconocidos</th><th>Pruebas reingresadas</th><th>Onboarding</th><th></th></tr></thead>
          <tbody>
            ${rows.length?rows.map((r)=>`<tr>
              <td><b>${esc(r.organization)}</b><br><small class="muted">${r.clientUsers} usuario${r.clientUsers===1?"":"s"} cliente</small></td>
              <td><span class="quality-score ${r.tone}">${r.score}</span></td>
              <td>${r.contacts}</td>
              <td>${r.duplicatePhones||'<span class="quality-zero">0</span>'}</td>
              <td>${r.missingContactData||'<span class="quality-zero">0</span>'}</td>
              <td>${r.priceMismatch||'<span class="quality-zero">0</span>'}</td>
              <td>${r.unknownService||'<span class="quality-zero">0</span>'}</td>
              <td>${r.excludedReentry||'<span class="quality-zero">0</span>'}</td>
              <td><div class="quality-progress"><i style="width:${r.onboardingProgress}%"></i></div><small>${r.onboardingProgress}% · ${esc(r.onboardingStatus)}</small></td>
              <td><div class="row-actions"><button class="btn small quality-360" data-org="${r.organization_id}" type="button">Customer 360</button><button class="btn small primary quality-onboarding" data-org="${r.organization_id}" type="button">Onboarding</button></div></td>
            </tr>`).join(""):`<tr><td colspan="10">${Q.emptyState("Sin clientes para auditar.","Crea el primer cliente NEXO.")}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card quality-rules-card">
      <div class="card-head"><div><h2>Qué estamos vigilando</h2><p>Reglas automáticas aplicadas a la base actual.</p></div></div>
      <div class="quality-rule-grid">
        <div><b>Teléfonos duplicados</b><span>Un WhatsApp no debería existir dos veces dentro de la misma empresa.</span></div>
        <div><b>Precios inconsistentes</b><span>Lead/cita versus catálogo y aliases oficiales.</span></div>
        <div><b>Pruebas reingresadas</b><span>Números excluidos que intenten volver a métricas.</span></div>
        <div><b>Contactos incompletos</b><span>Nombre o teléfono ausente.</span></div>
        <div><b>Servicios desconocidos</b><span>Servicios no reconocidos por catálogo/alias.</span></div>
        <div><b>Configuración</b><span>Asistente, contacto operativo y onboarding.</span></div>
      </div>
    </section>
  `;

  document.querySelectorAll(".quality-onboarding").forEach((button)=>button.addEventListener("click",()=>openOnboarding(Q,button.dataset.org)));
  document.querySelectorAll(".quality-360").forEach((button)=>button.addEventListener("click",()=>Q.openCustomer360(Q.workspaceContext(),button.dataset.org)));
}

export async function openOnboarding(context=Q,orgId){
  if(context)Q=context;
  if(!Q.state.isAdmin)return;
  const org=Q.state.organizations.find((o)=>o.id===orgId);
  if(!org)return;

  const [onboardingR,assistantR,servicesR,integrationsR,membersR,settingsR,commercialR]=await Promise.all([
    Q.supabase.from("organization_onboarding").select("*").eq("organization_id",orgId).maybeSingle(),
    Q.supabase.from("assistants").select("*").eq("organization_id",orgId).maybeSingle(),
    Q.supabase.from("services").select("id,active").eq("organization_id",orgId),
    Q.supabase.from("crm_integrations").select("*").eq("organization_id",orgId),
    Q.supabase.from("organization_members").select("organization_id,user_id,role").eq("organization_id",orgId),
    Q.supabase.from("organization_settings").select("*").eq("organization_id",orgId).maybeSingle(),
    Q.supabase.from("organization_commercials").select("*").eq("organization_id",orgId).maybeSingle(),
  ]);
  const error=[onboardingR,assistantR,servicesR,integrationsR,membersR,settingsR,commercialR].find((r)=>r.error)?.error;
  if(error)throw error;

  let row=onboardingR.data;
  if(!row){
    const {data,error:insertError}=await Q.supabase.from("organization_onboarding").insert({organization_id:orgId,updated_by:Q.state.session.user.id}).select("*").single();
    if(insertError)throw insertError;
    row=data;
  }
  const assistant=assistantR.data;
  const services=servicesR.data||[];
  const integrations=integrationsR.data||[];
  const clientMembers=(membersR.data||[]).filter((m)=>m.role!=="platform_admin");
  const setting=settingsR.data||{};
  const commercial=commercialR.data||{};
  const progress=progressPercent(row);

  const evidence={
    company_status:`${setting.notification_email||setting.whatsapp?"Contacto configurado":"Falta contacto operativo"}`,
    assistant_status:assistant?`${assistant.name} · ${assistant.status}`:"Sin asistente registrado",
    catalog_status:`${services.filter((s)=>s.active).length} servicios activos`,
    integrations_status:integrations.length?`${integrations.length} integración${integrations.length===1?"":"es"} registrada${integrations.length===1?"":"s"}`:"Sin integraciones registradas",
    users_status:`${clientMembers.length} usuario${clientMembers.length===1?"":"s"} cliente`,
    testing_status:row.testing_status==="done"?"Pruebas aprobadas":"Pendiente de validación final",
    go_live_status:commercial.go_live_date?`Live desde ${shortDate(commercial.go_live_date)}`:"Sin fecha de Go Live",
  };

  const root=showDrawer("onboardingDrawer",`
    <header class="drawer-header">
      <div><span class="eyebrow">NEXO IMPLEMENTATION</span><h2>${esc(org.name)}</h2><p>Onboarding guiado · ${progress}% completado</p></div>
      <button class="drawer-close" type="button" data-onboarding-close>×</button>
    </header>

    <div class="onboarding-overview">
      <div class="onboarding-progress-ring"><strong>${progress}%</strong><span>avance</span></div>
      <div><span>Estado general</span><b>${esc(row.overall_status||"in_progress")}</b><p>Plan: ${esc(commercial.plan_name||"Por definir")} · Implementación: ${esc(commercial.implementation_status||"pending")}</p></div>
    </div>

    <form id="onboardingForm">
      <div class="onboarding-steps">
        ${STEP_FIELDS.map(([field,label],index)=>`
          <section class="onboarding-step ${stepTone(row[field])}">
            <div class="onboarding-step-number">${String(index+1).padStart(2,"0")}</div>
            <div class="onboarding-step-copy"><b>${esc(label)}</b><span>${esc(evidence[field])}</span></div>
            ${stepSelect(field,row[field])}
          </section>
        `).join("")}
      </div>
      <label class="onboarding-notes">Notas de implementación<textarea id="onboardingNotes" rows="4" placeholder="Pendientes, decisiones, información del cliente…">${esc(row.notes||"")}</textarea></label>
      <div class="onboarding-actions">
        <button id="onboardingConfigure" class="btn" type="button">Abrir configuración</button>
        <button id="onboardingCustomer360" class="btn" type="button">Customer 360</button>
        ${row.go_live_status!=="done"?'<button id="onboardingGoLive" class="btn" type="button">Activar Go Live</button>':""}
        <button class="btn primary" type="submit">Guardar onboarding</button>
      </div>
    </form>
  `);

  root.querySelector("[data-onboarding-close]")?.addEventListener("click",()=>closeQualityDrawer("onboardingDrawer"));
  root.querySelector("#onboardingConfigure")?.addEventListener("click",async()=>{
    closeQualityDrawer("onboardingDrawer");
    Q.state.settingsOrgId=orgId;
    Q.state.page="settings";
    Q.persistUiState();
    await Q.renderApp();
  });
  root.querySelector("#onboardingCustomer360")?.addEventListener("click",async()=>{
    closeQualityDrawer("onboardingDrawer");
    await Q.openCustomer360(Q.workspaceContext(),orgId);
  });

  root.querySelector("#onboardingForm")?.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;button.textContent="Guardando…";
    const values={};
    root.querySelectorAll("[data-step-field]").forEach((select)=>{values[select.dataset.stepField]=select.value;});
    const overall=deriveOverall(values);
    const {error}=await Q.supabase.from("organization_onboarding").update({
      ...values,
      overall_status:overall,
      notes:root.querySelector("#onboardingNotes").value.trim()||null,
      updated_by:Q.state.session.user.id,
    }).eq("organization_id",orgId);
    if(error){Q.showError(error.message||"No pudimos guardar el onboarding.");button.disabled=false;button.textContent="Guardar onboarding";return;}
    Q.showToast("Onboarding actualizado.");
    closeQualityDrawer("onboardingDrawer");
    await Q.renderApp();
  });

  root.querySelector("#onboardingGoLive")?.addEventListener("click",async()=>{
    if(!confirm(`¿Activar ${org.name} como cliente LIVE? Esto actualizará su etapa comercial y fecha de Go Live.`))return;
    const button=root.querySelector("#onboardingGoLive");
    button.disabled=true;button.textContent="Activando…";
    const {error:goError}=await Q.supabase.rpc("platform_activate_go_live",{p_organization_id:orgId});
    if(goError){Q.showError(goError.message||"No pudimos activar Go Live.");button.disabled=false;button.textContent="Activar Go Live";return;}
    Q.showToast(org.name+" está LIVE.");
    closeQualityDrawer("onboardingDrawer");
    await Q.loadOrganizations();
    await Q.renderApp();
  });
}
