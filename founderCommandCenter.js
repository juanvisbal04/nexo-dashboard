let C=null;

const money=(value)=>new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(value||0));
const sum=(rows,key)=>rows.reduce((total,row)=>total+Number(row?.[key]||0),0);
const openTask=(row)=>["pending","in_progress"].includes(row.status);
const openProject=(row)=>!["delivered","cancelled"].includes(row.status);
const activeProspect=(row)=>!["activo","perdido"].includes(row.stage);
const safe=(result)=>result?.error?[]:(result?.data||[]);

async function loadPeople(){
  try{
    const {data,error}=await C.supabase.functions.invoke("nexo-people-directory",{body:{}});
    if(error||!data?.ok)return [];
    return data.people||[];
  }catch{return [];}
}

function orgName(map,id){return map.get(id)?.name||"NEXO";}
function personName(map,id){return map.get(id)?.full_name||map.get(id)?.contact_email||"Sin responsable";}
function daysAgo(value){
  if(!value)return "";
  const diff=Math.floor((Date.now()-new Date(value).getTime())/86400000);
  return diff<=0?"hoy":diff===1?"hace 1 día":`hace ${diff} días`;
}
function dueLabel(value){
  if(!value)return "Sin fecha";
  const d=new Date(value);
  return C.shortDate(value);
}
function toneCount(value){return value>0?"risk":"ok";}

function attentionItem(type,title,detail,meta,page,tone="warn"){
  return {type,title,detail,meta,page,tone};
}

function bindActions(){
  document.querySelectorAll("[data-founder-page]").forEach((button)=>{
    button.addEventListener("click",()=>C.navigateToPage(button.dataset.founderPage,{historyMode:"push"}));
  });
}

export async function renderFounderCommandCenter(context){
  C=context;
  const orgs=(C.state.organizations||[]).filter((org)=>org.name!=="NEXO Internal");
  const orgIds=orgs.map((o)=>o.id);
  const orgMap=new Map(orgs.map((o)=>[o.id,o]));

  const [
    commercialsRes,
    tasksRes,
    prospectsRes,
    projectsRes,
    conversationsRes,
    appointmentsRes,
    onboardingRes,
    assistantsRes,
    candidatesRes,
    peopleOnboardingRes,
    invoicesRes,
    expensesRes,
    departmentsRes,
    people,
  ]=await Promise.all([
    C.supabase.from("organization_commercials").select("*"),
    C.supabase.from("work_tasks").select("*").order("created_at",{ascending:false}).limit(3000),
    C.supabase.from("demo_requests").select("*").is("archived_at",null).order("created_at",{ascending:false}).limit(1000),
    C.supabase.from("nexo_projects").select("*").order("created_at",{ascending:false}).limit(1000),
    orgIds.length?C.supabase.from("conversations").select("*").in("organization_id",orgIds).order("last_message_at",{ascending:false}).limit(5000):Promise.resolve({data:[],error:null}),
    orgIds.length?C.supabase.from("appointments").select("*").in("organization_id",orgIds).order("starts_at",{ascending:true}).limit(3000):Promise.resolve({data:[],error:null}),
    orgIds.length?C.supabase.from("organization_onboarding").select("*").in("organization_id",orgIds):Promise.resolve({data:[],error:null}),
    orgIds.length?C.supabase.from("assistants").select("*").in("organization_id",orgIds):Promise.resolve({data:[],error:null}),
    C.supabase.from("nexo_people_candidates").select("*").order("created_at",{ascending:false}).limit(1000),
    C.supabase.from("nexo_people_onboarding").select("*").order("created_at",{ascending:false}).limit(1000),
    C.supabase.from("client_invoices").select("*").order("created_at",{ascending:false}).limit(2000),
    C.supabase.from("nexo_expenses").select("*").eq("active",true).limit(1000),
    C.supabase.from("nexo_departments").select("id,department_key,name,active,planned").eq("active",true),
    loadPeople(),
  ]);

  const commercials=safe(commercialsRes);
  const tasks=safe(tasksRes);
  const prospects=safe(prospectsRes);
  const projects=safe(projectsRes);
  const conversations=safe(conversationsRes);
  const appointments=safe(appointmentsRes);
  const onboardings=safe(onboardingRes);
  const assistants=safe(assistantsRes);
  const candidates=safe(candidatesRes);
  const peopleOnboarding=safe(peopleOnboardingRes);
  const invoices=safe(invoicesRes);
  const expenses=safe(expensesRes);
  const departments=safe(departmentsRes);
  const departmentKeyById=new Map(departments.map((d)=>[d.id,d.department_key]));
  const peopleMap=new Map((people||[]).map((p)=>[p.user_id,p]));

  const now=Date.now();
  const thirtyDaysAgo=now-30*86400000;
  const activeClients=orgs.filter((o)=>o.status==="active").length;
  const clientCommercials=commercials.filter((row)=>orgMap.has(row.organization_id));
  const mrr=sum(clientCommercials,"mrr");
  const directMonthlyCost=sum(clientCommercials,"monthly_cost");
  const recurringExpenses=expenses
    .filter((e)=>["monthly","mensual","month"].includes(String(e.frequency||"").toLowerCase()))
    .reduce((n,e)=>n+Number(e.amount_cop||0),0);
  const grossContribution=mrr-directMonthlyCost;

  const openTasks=tasks.filter(openTask);
  const overdueTasks=openTasks.filter((t)=>t.due_at&&new Date(t.due_at).getTime()<now);
  const urgentTasks=openTasks.filter((t)=>t.priority==="urgent");

  const openProspects=prospects.filter(activeProspect);
  const pipelineMrr=sum(openProspects,"expected_mrr");
  const overdueFollowups=openProspects.filter((p)=>p.next_action_at&&new Date(p.next_action_at).getTime()<now);
  const upcomingDemos=openProspects.filter((p)=>p.demo_at&&new Date(p.demo_at).getTime()>=now);

  const activeProjects=projects.filter(openProject);
  const projectReview=projects.filter((p)=>["review","changes"].includes(p.status));
  const overdueProjects=activeProjects.filter((p)=>p.due_at&&new Date(p.due_at).getTime()<now);

  const attentionConversations=conversations.filter((r)=>r.status==="Requiere atención");
  const conv30=conversations.filter((r)=>r.last_message_at&&new Date(r.last_message_at).getTime()>=thirtyDaysAgo);
  const responseRows=conv30.filter((r)=>Number(r.response_seconds||0)>0);
  const avgResponse=responseRows.length?Math.round(responseRows.reduce((n,r)=>n+Number(r.response_seconds||0),0)/responseRows.length):0;
  const upcomingAppointments=appointments.filter((r)=>r.starts_at&&new Date(r.starts_at).getTime()>=now);

  const clientOnboardingPending=onboardings.filter((r)=>r.overall_status!=="live");
  const activeAssistants=assistants.filter((a)=>a.status==="active").length;

  const activePeople=(people||[]).filter((p)=>p.status==="active");
  const invitedPeople=(people||[]).filter((p)=>p.status==="invited");
  const inactivePeople=(people||[]).filter((p)=>p.status==="inactive");
  const peopleOnboardingPending=peopleOnboarding.filter((r)=>r.overall_status!=="complete");
  const activeCandidates=candidates.filter((r)=>!["hired","rejected"].includes(r.stage));
  const interviews=candidates.filter((r)=>r.stage==="interview"||(r.interview_at&&new Date(r.interview_at).getTime()>=now));

  const clientInvoices=invoices.filter((r)=>orgMap.has(r.organization_id));
  const unpaidInvoices=clientInvoices.filter((r)=>!["paid","pagada","paid_full"].includes(String(r.status||"").toLowerCase())&&!r.paid_at);
  const overdueInvoices=unpaidInvoices.filter((r)=>r.due_date&&new Date(`${r.due_date}T23:59:59`).getTime()<now);
  const outstandingAmount=sum(unpaidInvoices,"amount_cop");

  const attention=[];
  overdueTasks.slice(0,8).forEach((row)=>attention.push(attentionItem(
    "Tarea vencida",row.title,
    `${personName(peopleMap,row.assigned_to)} · ${orgName(orgMap,row.organization_id)}`,
    row.due_at?dueLabel(row.due_at):"Sin fecha","tasks","danger"
  )));
  attentionConversations.slice(0,6).forEach((row)=>attention.push(attentionItem(
    "Operación",row.name||"Conversación requiere atención",
    `${orgName(orgMap,row.organization_id)} · ${row.channel||"Canal"}`,
    row.last_message_at?daysAgo(row.last_message_at):"","operations","danger"
  )));
  overdueFollowups.slice(0,6).forEach((row)=>attention.push(attentionItem(
    "Seguimiento comercial",row.business_name||row.full_name||"Prospecto",
    `${row.full_name||"Contacto"} · ${row.stage||"prospecto"}`,
    row.next_action_at?dueLabel(row.next_action_at):"","crm","warn"
  )));
  overdueProjects.slice(0,6).forEach((row)=>attention.push(attentionItem(
    "Proyecto vencido",row.title,
    orgName(orgMap,row.organization_id),
    row.due_at?dueLabel(row.due_at):"","clients","warn"
  )));
  overdueInvoices.slice(0,4).forEach((row)=>attention.push(attentionItem(
    "Factura vencida",orgName(orgMap,row.organization_id),
    money(row.amount_cop),
    row.due_date?C.shortDate(row.due_date):"","clients","danger"
  )));

  const marketingProjects=projects.filter((p)=>departmentKeyById.get(p.department_id)==="marketing");
  const marketingActiveProjects=marketingProjects.filter(openProject);
  const marketingReview=marketingProjects.filter((p)=>["review","changes"].includes(p.status));
  const marketingOverdue=marketingActiveProjects.filter((p)=>p.due_at&&new Date(p.due_at).getTime()<now);

  const deptStats=[
    {
      key:"sales",name:"Sales",page:"crm",
      lead:"Pipeline comercial",
      primary:openProspects.length,
      primaryLabel:"oportunidades",
      secondary:money(pipelineMrr),
      detail:`${overdueFollowups.length} seguimientos vencidos · ${upcomingDemos.length} demos próximas`,
      risk:overdueFollowups.length,
    },
    {
      key:"marketing",name:"Marketing",page:"clients",
      lead:"Proyectos & entregables",
      primary:marketingActiveProjects.length,
      primaryLabel:"proyectos activos",
      secondary:`${marketingReview.length} en revisión/cambios`,
      detail:`${marketingOverdue.length} vencidos · ${marketingProjects.filter((p)=>p.status==="delivered"&&new Date(p.updated_at).getTime()>=thirtyDaysAgo).length} entregados 30d`,
      risk:marketingOverdue.length,
    },
    {
      key:"implementation_cs",name:"Implementation & CS",page:"clients",
      lead:"Onboarding de clientes",
      primary:clientOnboardingPending.length,
      primaryLabel:"onboarding pendientes",
      secondary:`${onboardings.filter((r)=>r.overall_status==="live").length} live`,
      detail:`${assistants.length} asistentes configurados`,
      risk:clientOnboardingPending.length,
    },
    {
      key:"operations",name:"Operations",page:"operations",
      lead:"Operación diaria",
      primary:attentionConversations.length,
      primaryLabel:"requieren atención",
      secondary:`${activeAssistants} asistentes activos`,
      detail:`${upcomingAppointments.length} citas próximas · ${avgResponse}s respuesta prom.`,
      risk:attentionConversations.length,
    },
    {
      key:"people_culture",name:"Talento Humano",page:"people",
      lead:"Equipo & contratación",
      primary:activePeople.length,
      primaryLabel:"colaboradores activos",
      secondary:`${activeCandidates.length} candidatos activos`,
      detail:`${peopleOnboardingPending.length} onboarding pendientes · ${interviews.length} entrevistas`,
      risk:peopleOnboardingPending.length,
    },
  ];

  const departmentPeople=[...new Map((people||[]).filter((p)=>p.department_key).map((p)=>[p.department_key,p.department_name||p.department_key])).entries()];

  const clientHealth=orgs.map((org)=>{
    const commercial=commercials.find((r)=>r.organization_id===org.id);
    const onboarding=onboardings.find((r)=>r.organization_id===org.id);
    const assistant=assistants.find((r)=>r.organization_id===org.id);
    const clientAttention=attentionConversations.filter((r)=>r.organization_id===org.id).length;
    const clientProjects=projects.filter((r)=>r.organization_id===org.id&&openProject(r)).length;
    return {org,commercial,onboarding,assistant,clientAttention,clientProjects};
  }).sort((a,b)=>(b.clientAttention-a.clientAttention)||Number(b.commercial?.mrr||0)-Number(a.commercial?.mrr||0));

  C.$("content").innerHTML=`
    <section class="founder-command-hero">
      <div>
        <span class="eyebrow">FOUNDER / CEO · COMMAND CENTER</span>
        <h2>NEXO bajo control.</h2>
        <p>Una vista ejecutiva de ventas, clientes, equipo, proyectos, operación, talento y finanzas. Los detalles operativos viven en cada departamento.</p>
      </div>
      <div class="founder-command-actions">
        <button class="btn primary" data-founder-page="tasks" type="button">Asignar / controlar tareas</button>
        <button class="btn" data-founder-page="team" type="button">Equipo & accesos</button>
      </div>
    </section>

    <div class="founder-kpi-grid">
      <article><span>Clientes activos</span><b>${activeClients}</b><small>${orgs.length} organizaciones cliente</small></article>
      <article><span>MRR NEXO</span><b>${money(mrr)}</b><small>Ingreso recurrente mensual</small></article>
      <article><span>Pipeline MRR</span><b>${money(pipelineMrr)}</b><small>${openProspects.length} oportunidades abiertas</small></article>
      <article class="${overdueTasks.length?"risk":""}"><span>Tareas vencidas</span><b>${overdueTasks.length}</b><small>${openTasks.length} abiertas · ${urgentTasks.length} urgentes</small></article>
      <article><span>Equipo activo</span><b>${activePeople.length}</b><small>${invitedPeople.length} invitados · ${inactivePeople.length} inactivos</small></article>
      <article class="${attentionConversations.length?"risk":""}"><span>Atención operativa</span><b>${attentionConversations.length}</b><small>${conv30.length} chats monitoreados · 30d</small></article>
    </div>

    <div class="founder-command-layout">
      <section class="card founder-attention-panel">
        <div class="card-head">
          <div><span class="eyebrow">PRIORIDAD EJECUTIVA</span><h2>Qué necesita tu atención</h2><p>Ordenado por vencimientos, operación, ventas, proyectos y cobros.</p></div>
          <span class="founder-attention-count">${attention.length}</span>
        </div>
        <div class="founder-attention-list">
          ${attention.length?attention.slice(0,14).map((item)=>`
            <button class="founder-attention-item ${item.tone}" data-founder-page="${item.page}" type="button">
              <i></i>
              <div><span>${C.esc(item.type)}</span><b>${C.esc(item.title)}</b><small>${C.esc(item.detail)}</small></div>
              <em>${C.esc(item.meta||"")}</em>
            </button>
          `).join(""):C.emptyState("Nada crítico por ahora.","No hay vencimientos ni alertas ejecutivas activas.")}
        </div>
      </section>

      <section class="card founder-finance-panel">
        <div class="card-head"><div><span class="eyebrow">FOUNDER ONLY</span><h2>Snapshot financiero</h2><p>Información interna reservada al Super Admin.</p></div></div>
        <div class="founder-finance-grid">
          <div><span>MRR</span><b>${money(mrr)}</b></div>
          <div><span>Costo mensual clientes</span><b>${money(directMonthlyCost)}</b></div>
          <div><span>Contribución bruta</span><b>${money(grossContribution)}</b></div>
          <div><span>Gastos recurrentes plataforma</span><b>${money(recurringExpenses)}</b></div>
          <div class="${overdueInvoices.length?"risk":""}"><span>Facturas vencidas</span><b>${overdueInvoices.length}</b><small>${money(sum(overdueInvoices,"amount_cop"))}</small></div>
          <div><span>Cartera pendiente</span><b>${money(outstandingAmount)}</b><small>${unpaidInvoices.length} facturas no pagadas</small></div>
        </div>
      </section>
    </div>

    <section class="card founder-departments-section">
      <div class="card-head"><div><span class="eyebrow">DEPARTAMENTOS</span><h2>Salud de la empresa</h2><p>Cada área con sus indicadores esenciales y riesgos actuales.</p></div></div>
      <div class="founder-department-grid">
        ${deptStats.map((d)=>`
          <button class="founder-department-card ${d.risk?"risk":""}" data-founder-page="${d.page}" type="button">
            <div class="founder-dept-top"><span>${C.esc(d.name)}</span><i class="${d.risk?"risk":"ok"}"></i></div>
            <small>${C.esc(d.lead)}</small>
            <div class="founder-dept-main"><b>${d.primary}</b><span>${C.esc(d.primaryLabel)}</span></div>
            <strong>${C.esc(d.secondary)}</strong>
            <p>${C.esc(d.detail)}</p>
          </button>
        `).join("")}
      </div>
    </section>

    <div class="founder-command-layout founder-lower-layout">
      <section class="card">
        <div class="card-head"><div><span class="eyebrow">CLIENT HEALTH</span><h2>Clientes y operación</h2><p>MRR, asistente, onboarding, proyectos y alertas por cliente.</p></div><button class="btn small" data-founder-page="clients" type="button">Ver clientes</button></div>
        <div class="founder-client-health">
          ${clientHealth.length?clientHealth.map(({org,commercial,onboarding,assistant,clientAttention,clientProjects})=>`
            <article>
              <span class="staff-client-avatar" style="--staff-color:${C.esc(org.color||"#316bff")}">${C.esc(org.initials||"NX")}</span>
              <div><b>${C.esc(org.name)}</b><small>${C.esc(org.sector||"Cliente NEXO")} · ${money(commercial?.mrr||0)} MRR</small></div>
              <div class="founder-client-signals">
                <span class="${assistant?.status==="active"?"ok":"neutral"}">Asistente: ${C.esc(assistant?.status||"—")}</span>
                <span class="${onboarding?.overall_status==="live"?"ok":"neutral"}">Onboarding: ${C.esc(onboarding?.overall_status||"—")}</span>
                <span>${clientProjects} proyectos</span>
                <span class="${clientAttention?"risk":""}">${clientAttention} alertas</span>
              </div>
            </article>
          `).join(""):C.emptyState("Sin clientes todavía.","Los clientes activos aparecerán aquí.")}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><span class="eyebrow">TEAM CONTROL</span><h2>Equipo NEXO</h2><p>Headcount, departamentos y onboarding interno.</p></div><button class="btn small" data-founder-page="people" type="button">Talento Humano</button></div>
        <div class="founder-team-summary">
          <div class="founder-team-numbers">
            <div><b>${activePeople.length}</b><span>activos</span></div>
            <div><b>${invitedPeople.length}</b><span>invitados</span></div>
            <div class="${peopleOnboardingPending.length?"risk":""}"><b>${peopleOnboardingPending.length}</b><span>onboarding</span></div>
            <div><b>${activeCandidates.length}</b><span>candidatos</span></div>
          </div>
          <div class="founder-department-headcount">
            ${departmentPeople.map(([key,name])=>{
              const count=(people||[]).filter((p)=>p.department_key===key&&p.status==="active").length;
              return `<div><span>${C.esc(name)}</span><b>${count}</b></div>`;
            }).join("")||'<p class="muted">Sin colaboradores por departamento todavía.</p>'}
          </div>
        </div>
      </section>
    </div>

    <div class="founder-command-layout founder-lower-layout">
      <section class="card">
        <div class="card-head"><div><span class="eyebrow">SALES</span><h2>Pipeline ejecutivo</h2><p>Valor, seguimiento y demos.</p></div><button class="btn small" data-founder-page="crm" type="button">Abrir CRM</button></div>
        <div class="founder-mini-metrics">
          <div><span>Prospectos abiertos</span><b>${openProspects.length}</b></div>
          <div><span>Pipeline MRR</span><b>${money(pipelineMrr)}</b></div>
          <div class="${overdueFollowups.length?"risk":""}"><span>Seguimientos vencidos</span><b>${overdueFollowups.length}</b></div>
          <div><span>Demos próximas</span><b>${upcomingDemos.length}</b></div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><div><span class="eyebrow">DELIVERY + OPERATIONS</span><h2>Entrega y servicio</h2><p>Proyectos, onboarding y actividad de clientes.</p></div><button class="btn small" data-founder-page="operations" type="button">Operación</button></div>
        <div class="founder-mini-metrics">
          <div><span>Proyectos activos</span><b>${activeProjects.length}</b></div>
          <div class="${projectReview.length?"risk":""}"><span>Revisión / cambios</span><b>${projectReview.length}</b></div>
          <div class="${clientOnboardingPending.length?"risk":""}"><span>Onboarding cliente</span><b>${clientOnboardingPending.length}</b></div>
          <div><span>Citas próximas</span><b>${upcomingAppointments.length}</b></div>
        </div>
      </section>
    </div>
  `;

  bindActions();
}
