let C=null;

const roleLabels={
  marketing:"Marketing",
  sales:"Sales",
  implementation_cs:"Implementation & Customer Success",
  operations:"Operations",
};

const permissionLabels={
  "internal.dashboard":"Acceso al workspace interno",
  "marketing.assigned.read":"Ver proyectos de marketing asignados",
  "marketing.assigned.write":"Gestionar proyectos de marketing asignados",
  "tasks.self.read":"Ver tus propias tareas",
  "tasks.self.write":"Crear y actualizar tus propias tareas",
};

function assignedClients(){
  return (C.state.organizations||[]).filter((org)=>org.name!=="NEXO Internal");
}

async function myTasks(){
  const userId=C.state.session?.user?.id;
  if(!userId)return [];
  const {data,error}=await C.supabase
    .from("work_tasks")
    .select("*")
    .eq("assigned_to",userId)
    .order("created_at",{ascending:false})
    .limit(1000);
  if(error)throw error;
  return data||[];
}

function roleName(){
  return C.state.internalRoleName||roleLabels[C.state.internalRoleKey]||"Equipo NEXO";
}

function dueState(task){
  if(!task?.due_at || !["pending","in_progress"].includes(task.status))return "";
  return new Date(task.due_at).getTime()<Date.now()?"overdue":"";
}

function taskStats(tasks){
  const open=tasks.filter((t)=>["pending","in_progress"].includes(t.status));
  const completed=tasks.filter((t)=>t.status==="completed");
  const overdue=open.filter((t)=>t.due_at&&new Date(t.due_at).getTime()<Date.now());
  const urgent=open.filter((t)=>t.priority==="urgent");
  return {open,completed,overdue,urgent};
}

function projectStatus(stats){
  if(stats.overdue.length)return '<span class="staff-project-status risk">Requiere atención</span>';
  if(stats.open.length)return '<span class="staff-project-status active">En progreso</span>';
  if(stats.completed.length)return '<span class="staff-project-status done">Al día</span>';
  return '<span class="staff-project-status neutral">Sin tareas</span>';
}

function navButton(page,label,orgId=null){
  return `<button class="btn small staff-nav-action" type="button" data-staff-page="${page}" ${orgId?`data-staff-org="${C.esc(orgId)}"`:""}>${C.esc(label)}</button>`;
}

function bindStaffNavigation(){
  document.querySelectorAll("[data-staff-page]").forEach((button)=>{
    button.addEventListener("click",async()=>{
      if(button.dataset.staffOrg)C.state.taskOrgFilter=button.dataset.staffOrg;
      await C.navigateToPage(button.dataset.staffPage,{historyMode:"push"});
    });
  });
}

export async function renderStaffHome(context){
  C=context;
  const tasks=await myTasks();
  const clients=assignedClients();
  const stats=taskStats(tasks);
  const todayStart=new Date();todayStart.setHours(0,0,0,0);
  const tomorrow=new Date(todayStart);tomorrow.setDate(tomorrow.getDate()+1);
  const today=stats.open.filter((t)=>{
    if(!t.due_at)return false;
    const due=new Date(t.due_at);
    return due>=todayStart&&due<tomorrow;
  });
  const upcoming=stats.open
    .filter((t)=>!today.includes(t))
    .sort((a,b)=>(new Date(a.due_at||"2999-01-01")-new Date(b.due_at||"2999-01-01")))
    .slice(0,5);

  const displayName=C.state.profile?.full_name?.split(/\s+/)[0]||"";
  C.$("content").innerHTML=`
    <section class="staff-welcome">
      <div>
        <span class="eyebrow">NEXO INTERNAL · ${C.esc(roleName().toUpperCase())}</span>
        <h2>Hola${displayName?", "+C.esc(displayName):""}.</h2>
        <p>Este es tu espacio de trabajo. Aquí ves únicamente los clientes, proyectos y tareas que corresponden a tu rol.</p>
      </div>
      <div class="staff-role-badge"><span>Tu rol</span><b>${C.esc(roleName())}</b></div>
    </section>

    <div class="staff-kpi-grid">
      <article><span>Tareas abiertas</span><b>${stats.open.length}</b><small>Trabajo pendiente</small></article>
      <article class="${stats.overdue.length?"risk":""}"><span>Vencidas</span><b>${stats.overdue.length}</b><small>Requieren atención</small></article>
      <article><span>Clientes asignados</span><b>${clients.length}</b><small>Scope autorizado</small></article>
      <article><span>Completadas</span><b>${stats.completed.length}</b><small>Historial de trabajo</small></article>
    </div>

    <div class="grid-two staff-home-grid">
      <section class="card">
        <div class="card-head"><div><h2>Hoy</h2><p>Prioridades y próximos vencimientos</p></div>${navButton("tasks","Abrir mis tareas")}</div>
        <div class="staff-task-preview">
          ${[...today,...upcoming].slice(0,6).length?[...today,...upcoming].slice(0,6).map((task)=>`
            <article class="${dueState(task)}">
              <div><span class="staff-task-priority ${C.esc(task.priority||"medium")}">${C.esc(task.priority||"medium")}</span><b>${C.esc(task.title)}</b></div>
              <small>${C.esc((C.state.organizations||[]).find((o)=>o.id===task.organization_id)?.name||"NEXO")} · ${task.due_at?C.dateTime(task.due_at):"Sin fecha límite"}</small>
            </article>
          `).join(""):C.emptyState("No tienes tareas pendientes.","Puedes crear una desde Mis tareas.")}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Lo que puedes hacer</h2><p>Permisos efectivos de tu rol</p></div></div>
        <div class="staff-capability-list">
          ${(C.state.teamPermissions||[]).filter((p)=>permissionLabels[p]).map((p)=>`<div><i>✓</i><span>${C.esc(permissionLabels[p])}</span></div>`).join("")}
        </div>
        <div class="staff-scope-note"><strong>Acceso limitado por diseño</strong><p>No puedes consultar finanzas internas, costos, márgenes, administración del equipo, audit log ni CRM global.</p></div>
      </section>
    </div>

    <section class="card staff-clients-strip">
      <div class="card-head"><div><h2>Clientes asignados</h2><p>Los negocios en los que puedes trabajar ahora</p></div>${navButton("accounts","Ver clientes")}</div>
      <div class="staff-client-mini-grid">
        ${clients.length?clients.slice(0,6).map((org)=>`
          <article>
            <span class="staff-client-avatar" style="--staff-color:${C.esc(org.color||"#316bff")}">${C.esc(org.initials||"NX")}</span>
            <div><b>${C.esc(org.name)}</b><small>${C.esc(org.sector||"Cliente NEXO")}</small></div>
          </article>
        `).join(""):C.emptyState("Aún no tienes clientes asignados.","Tu Super Admin puede asignarlos desde Equipo & accesos.")}
      </div>
    </section>
  `;
  bindStaffNavigation();
}

export async function renderStaffProjects(context){
  C=context;
  const clients=assignedClients();
  const tasks=await myTasks();
  const byOrg=new Map();
  clients.forEach((org)=>byOrg.set(org.id,taskStats(tasks.filter((t)=>t.organization_id===org.id))));

  C.$("content").innerHTML=`
    <section class="staff-page-intro">
      <div><span class="eyebrow">NEXO MARKETING</span><h2>Mis proyectos</h2><p>Cada cliente asignado funciona como un espacio de proyecto. Tus tareas son los entregables y avances trazables del trabajo.</p></div>
    </section>
    <div class="staff-project-grid">
      ${clients.length?clients.map((org)=>{
        const stats=byOrg.get(org.id)||taskStats([]);
        const next=stats.open.slice().sort((a,b)=>(new Date(a.due_at||"2999-01-01")-new Date(b.due_at||"2999-01-01")))[0];
        return `
          <article class="card staff-project-card">
            <div class="staff-project-head">
              <span class="staff-client-avatar large" style="--staff-color:${C.esc(org.color||"#316bff")}">${C.esc(org.initials||"NX")}</span>
              <div><span>${C.esc(org.sector||"Cliente NEXO")}</span><h3>${C.esc(org.name)}</h3></div>
              ${projectStatus(stats)}
            </div>
            <div class="staff-project-numbers">
              <div><b>${stats.open.length}</b><span>abiertas</span></div>
              <div><b>${stats.completed.length}</b><span>completadas</span></div>
              <div class="${stats.overdue.length?"risk":""}"><b>${stats.overdue.length}</b><span>vencidas</span></div>
            </div>
            <div class="staff-project-next"><span>Próximo trabajo</span><b>${C.esc(next?.title||"Sin tareas pendientes")}</b><small>${next?.due_at?C.dateTime(next.due_at):"Sin fecha programada"}</small></div>
            <div class="staff-project-actions">
              ${navButton("tasks","Abrir tareas",org.id)}
            </div>
          </article>
        `;
      }).join(""):C.emptyState("No tienes proyectos asignados.","Cuando te asignen un cliente desde Equipo & accesos aparecerá aquí automáticamente.")}
    </div>
  `;
  bindStaffNavigation();
}

export async function renderStaffAccounts(context){
  C=context;
  const clients=assignedClients();
  C.$("content").innerHTML=`
    <section class="staff-page-intro">
      <div><span class="eyebrow">SCOPE DE TRABAJO</span><h2>Clientes asignados</h2><p>Solo puedes trabajar con estos clientes. NEXO mantiene el resto de la cartera fuera de tu alcance.</p></div>
    </section>
    <div class="staff-account-grid">
      ${clients.length?clients.map((org)=>`
        <article class="card staff-account-card">
          <div class="staff-account-top">
            <span class="staff-client-avatar large" style="--staff-color:${C.esc(org.color||"#316bff")}">${C.esc(org.initials||"NX")}</span>
            <div><h3>${C.esc(org.name)}</h3><p>${C.esc(org.sector||"Cliente NEXO")}</p></div>
          </div>
          <div class="staff-account-scope">
            <span>Tu acceso</span>
            <b>${C.esc(roleName())}</b>
            <p>Puedes gestionar el trabajo de marketing que tengas asignado y tus propias tareas. No incluye información financiera interna del cliente ni de NEXO.</p>
          </div>
          ${navButton("tasks","Ver mis tareas de este cliente",org.id)}
        </article>
      `).join(""):C.emptyState("Sin clientes asignados.","Tu Super Admin puede asignarte clientes desde Equipo & accesos.")}
    </div>
  `;
  bindStaffNavigation();
}

export async function renderStaffPerformance(context){
  C=context;
  const tasks=await myTasks();
  const stats=taskStats(tasks);
  const since=Date.now()-30*24*60*60*1000;
  const completed30=stats.completed.filter((t)=>t.completed_at&&new Date(t.completed_at).getTime()>=since);
  const created30=tasks.filter((t)=>new Date(t.created_at).getTime()>=since);
  const completionRate=created30.length?Math.round((completed30.length/created30.length)*100):0;
  const clients=assignedClients();
  const clientBreakdown=clients.map((org)=>{
    const own=tasks.filter((t)=>t.organization_id===org.id);
    return {org,stats:taskStats(own)};
  }).filter((row)=>row.stats.open.length||row.stats.completed.length);

  C.$("content").innerHTML=`
    <section class="staff-page-intro">
      <div><span class="eyebrow">MI RENDIMIENTO</span><h2>Tu trabajo, medido sin rankings.</h2><p>Seguimiento personal de ejecución. No compara tu desempeño con otros colaboradores.</p></div>
    </section>
    <div class="staff-kpi-grid">
      <article><span>Completadas · 30 días</span><b>${completed30.length}</b><small>Trabajo cerrado</small></article>
      <article><span>Abiertas</span><b>${stats.open.length}</b><small>Carga actual</small></article>
      <article class="${stats.overdue.length?"risk":""}"><span>Vencidas</span><b>${stats.overdue.length}</b><small>Atención requerida</small></article>
      <article><span>Resolución · 30 días</span><b>${completionRate}%</b><small>Completadas / creadas</small></article>
    </div>
    <section class="card">
      <div class="card-head"><div><h2>Trabajo por cliente</h2><p>Distribución de tus tareas asignadas</p></div></div>
      <div class="staff-performance-list">
        ${clientBreakdown.length?clientBreakdown.map(({org,stats})=>`
          <div>
            <span class="staff-client-avatar" style="--staff-color:${C.esc(org.color||"#316bff")}">${C.esc(org.initials||"NX")}</span>
            <div><b>${C.esc(org.name)}</b><small>${stats.open.length} abiertas · ${stats.completed.length} completadas</small></div>
            <span class="${stats.overdue.length?"risk":""}">${stats.overdue.length} vencidas</span>
          </div>
        `).join(""):C.emptyState("Aún no hay actividad suficiente.","Tus métricas aparecerán a medida que trabajes tareas y proyectos.")}
      </div>
    </section>
  `;
}
