let C=null;

const permissionLabels={
  "internal.dashboard":"Acceso al workspace interno",
  "clients.assigned.read":"Ver clientes asignados",
  "clients.assigned.write":"Gestionar clientes asignados",
  "clients.create":"Crear nuevos clientes dentro de tu departamento",
  "clients.department.assign":"Coordinar clientes del equipo",
  "marketing.assigned.read":"Ver trabajo de marketing autorizado",
  "marketing.assigned.write":"Gestionar trabajo de marketing autorizado",
  "projects.department.read":"Ver proyectos del departamento",
  "projects.department.write":"Actualizar proyectos del departamento",
  "projects.department.create":"Crear proyectos",
  "projects.department.assign":"Coordinar proyectos del equipo",
  "tasks.self.read":"Ver tus tareas",
  "tasks.self.write":"Crear y actualizar tus tareas",
  "tasks.team.read":"Ver tareas del departamento",
  "tasks.team.write":"Asignar y gestionar tareas del departamento",
  "crm.assigned.read":"Ver oportunidades propias",
  "crm.assigned.write":"Gestionar oportunidades propias",
  "crm.team.read":"Ver pipeline del equipo",
  "crm.team.write":"Gestionar pipeline del equipo",
  "department.analytics.read":"Ver métricas del departamento",
};

const projectStatusLabels={
  brief:"Brief",
  planning:"Planificación",
  in_progress:"En ejecución",
  review:"Revisión",
  changes:"Cambios",
  delivered:"Entregado",
  on_hold:"Pausado",
  cancelled:"Cancelado",
};

const projectTypeLabels={
  website:"Website",
  landing_page:"Landing Page",
  catalog:"Catálogo / Brochure",
  branding:"Branding",
  creatives:"Creativos",
  campaign:"Campaña",
  implementation:"Implementación",
  operations:"Operación",
  product:"Producto",
  general:"Otro",
};

function assignedClients(){
  return (C.state.organizations||[]).filter((org)=>org.name!=="NEXO Internal");
}

async function visibleTasks(){
  const {data,error}=await C.supabase
    .from("work_tasks")
    .select("*")
    .order("created_at",{ascending:false})
    .limit(1000);
  if(error)throw error;
  return data||[];
}

async function visibleProjects(){
  if(!C.hasPermission?.("projects.department.read"))return [];
  const {data,error}=await C.supabase
    .from("nexo_projects")
    .select("*")
    .order("created_at",{ascending:false})
    .limit(1000);
  if(error)throw error;
  return data||[];
}

function roleName(){
  return C.state.internalRoleName||"Equipo NEXO";
}
function departmentName(){
  return C.state.internalDepartmentName||"NEXO";
}
function isLead(){
  return C.state.internalRoleScope==="department"||Number(C.state.internalHierarchyLevel||0)>=40;
}

function dueState(task){
  if(!task?.due_at||!["pending","in_progress"].includes(task.status))return "";
  return new Date(task.due_at).getTime()<Date.now()?"overdue":"";
}

function taskStats(tasks){
  const open=tasks.filter((t)=>["pending","in_progress"].includes(t.status));
  const completed=tasks.filter((t)=>t.status==="completed");
  const overdue=open.filter((t)=>t.due_at&&new Date(t.due_at).getTime()<Date.now());
  const urgent=open.filter((t)=>t.priority==="urgent");
  return {open,completed,overdue,urgent};
}

function projectTone(status){
  if(status==="delivered")return "done";
  if(["review","changes"].includes(status))return "active";
  if(["on_hold","cancelled"].includes(status))return "risk";
  if(["brief","planning","in_progress"].includes(status))return "active";
  return "neutral";
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

function modalShell(title,subtitle,body){
  document.getElementById("staffWorkModal")?.remove();
  const root=document.createElement("div");
  root.id="staffWorkModal";
  root.className="staff-work-modal";
  root.innerHTML=`
    <div class="staff-work-backdrop" data-staff-modal-close></div>
    <section class="staff-work-dialog">
      <header>
        <div><span class="eyebrow">NEXO · ${C.esc(departmentName().toUpperCase())}</span><h2>${C.esc(title)}</h2><p>${C.esc(subtitle)}</p></div>
        <button type="button" data-staff-modal-close aria-label="Cerrar">×</button>
      </header>
      <div class="staff-work-body">${body}</div>
    </section>`;
  document.body.appendChild(root);
  document.body.classList.add("modal-open");
  const close=()=>{root.remove();document.body.classList.remove("modal-open");};
  root.querySelectorAll("[data-staff-modal-close]").forEach((el)=>el.addEventListener("click",close));
  return {root,close};
}

function projectFormFields({includeClient=false,organizationId=""}={}){
  const clientOptions=assignedClients().map((org)=>`<option value="${C.esc(org.id)}" ${org.id===organizationId?"selected":""}>${C.esc(org.name)}</option>`).join("");
  return `
    <form id="staffProjectForm" class="staff-work-form">
      ${includeClient?`<label class="wide">Cliente<select id="staffExistingClient" required><option value="">Selecciona cliente</option>${clientOptions}</select></label>`:""}
      <label class="wide">Nombre del proyecto<input id="staffProjectTitle" required placeholder="Ej. Sitio web corporativo"></label>
      <label>Tipo<select id="staffProjectType">
        ${Object.entries(projectTypeLabels).map(([key,label])=>`<option value="${key}">${C.esc(label)}</option>`).join("")}
      </select></label>
      <label>Fecha objetivo<input id="staffProjectDue" type="date"></label>
      <label class="wide">Brief / alcance<textarea id="staffProjectDescription" rows="5" placeholder="Objetivo, entregables, referencias, alcance..."></textarea></label>
      <div id="staffProjectResult" class="access-result hidden wide"></div>
      <div class="staff-work-actions wide"><button class="btn primary" type="submit">Crear proyecto</button></div>
    </form>`;
}

function openCreateProjectModal(organizationId=""){
  const {root,close}=modalShell(
    "Nuevo proyecto",
    "Crea un proyecto dentro de un cliente autorizado para tu departamento.",
    projectFormFields({includeClient:!organizationId,organizationId})
  );
  root.querySelector("#staffProjectForm")?.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    const result=root.querySelector("#staffProjectResult");
    const orgId=organizationId||root.querySelector("#staffExistingClient")?.value||"";
    button.disabled=true;button.textContent="Creando…";
    result.className="access-result hidden wide";
    try{
      const {data,error}=await C.supabase.functions.invoke("nexo-staff-work",{body:{
        action:"create_project",
        organization_id:orgId,
        project_title:root.querySelector("#staffProjectTitle").value.trim(),
        project_type:root.querySelector("#staffProjectType").value,
        due_at:root.querySelector("#staffProjectDue").value||null,
        description:root.querySelector("#staffProjectDescription").value.trim(),
      }});
      if(error)throw error;
      if(!data?.ok)throw new Error(data?.error||data?.detail||"No pudimos crear el proyecto.");
      close();C.showToast("Proyecto creado.");await C.renderApp();
    }catch(error){
      result.innerHTML=`<strong>No pudimos crear el proyecto</strong><p>${C.esc(error.message||"Inténtalo nuevamente.")}</p>`;
      result.className="access-result error wide";
      button.disabled=false;button.textContent="Crear proyecto";
    }
  });
}

function openCreateClientProjectModal(){
  const {root,close}=modalShell(
    "Nuevo cliente + proyecto",
    "Crea un cliente de tu departamento y abre su primer proyecto. No crea usuario de portal, factura ni asistente automáticamente.",
    `<form id="staffClientProjectForm" class="staff-work-form">
      <label>Cliente / empresa<input id="staffClientName" required placeholder="Nombre del negocio"></label>
      <label>Sector<input id="staffClientSector" placeholder="Ej. Salud, Restaurante, Retail"></label>
      <label class="wide">Proyecto inicial<input id="staffClientProjectTitle" required placeholder="Ej. Nuevo website + catálogo"></label>
      <label>Tipo<select id="staffClientProjectType">
        ${Object.entries(projectTypeLabels).map(([key,label])=>`<option value="${key}">${C.esc(label)}</option>`).join("")}
      </select></label>
      <label>Fecha objetivo<input id="staffClientProjectDue" type="date"></label>
      <label>Contacto<input id="staffClientContact" placeholder="Nombre"></label>
      <label>Email<input id="staffClientEmail" type="email" placeholder="correo@empresa.com"></label>
      <label>Teléfono / WhatsApp<input id="staffClientPhone" placeholder="+57 ..."></label>
      <label class="wide">Brief inicial<textarea id="staffClientBrief" rows="5" placeholder="Qué necesita el cliente, referencias y alcance inicial..."></textarea></label>
      <div id="staffClientProjectResult" class="access-result hidden wide"></div>
      <div class="staff-work-actions wide"><button class="btn primary" type="submit">Crear cliente y proyecto</button></div>
    </form>`
  );
  root.querySelector("#staffClientProjectForm")?.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    const result=root.querySelector("#staffClientProjectResult");
    button.disabled=true;button.textContent="Creando…";
    result.className="access-result hidden wide";
    try{
      const {data,error}=await C.supabase.functions.invoke("nexo-staff-work",{body:{
        action:"create_client_project",
        client_name:root.querySelector("#staffClientName").value.trim(),
        sector:root.querySelector("#staffClientSector").value.trim(),
        project_title:root.querySelector("#staffClientProjectTitle").value.trim(),
        project_type:root.querySelector("#staffClientProjectType").value,
        due_at:root.querySelector("#staffClientProjectDue").value||null,
        contact_name:root.querySelector("#staffClientContact").value.trim(),
        contact_email:root.querySelector("#staffClientEmail").value.trim(),
        contact_phone:root.querySelector("#staffClientPhone").value.trim(),
        description:root.querySelector("#staffClientBrief").value.trim(),
      }});
      if(error)throw error;
      if(!data?.ok)throw new Error(data?.error||data?.detail||"No pudimos crear el cliente.");
      close();
      await C.loadOrganizations();
      C.showToast("Cliente y proyecto creados.");
      await C.renderApp();
    }catch(error){
      result.innerHTML=`<strong>No pudimos crear el cliente</strong><p>${C.esc(error.message||"Inténtalo nuevamente.")}</p>`;
      result.className="access-result error wide";
      button.disabled=false;button.textContent="Crear cliente y proyecto";
    }
  });
}

function bindProjectActions(projects){
  document.querySelectorAll(".staff-create-client-project").forEach((button)=>button.addEventListener("click",openCreateClientProjectModal));
  document.querySelectorAll(".staff-create-project").forEach((button)=>button.addEventListener("click",()=>openCreateProjectModal(button.dataset.orgId||"")));
  document.querySelectorAll(".staff-project-status-select").forEach((select)=>{
    select.addEventListener("change",async()=>{
      const project=projects.find((row)=>row.id===select.dataset.projectId);
      if(!project)return;
      select.disabled=true;
      const {error}=await C.supabase.from("nexo_projects").update({status:select.value}).eq("id",project.id);
      if(error){C.showError(error.message||"No pudimos actualizar el proyecto.");select.value=project.status;select.disabled=false;return;}
      C.showToast("Proyecto actualizado.");
      await C.renderApp();
    });
  });
}

export async function renderStaffHome(context){
  C=context;
  const [tasks,projects]=await Promise.all([visibleTasks(),visibleProjects()]);
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
  const teamScope=isLead()&&C.hasPermission?.("tasks.team.read");

  C.$("content").innerHTML=`
    <section class="staff-welcome">
      <div>
        <span class="eyebrow">NEXO · ${C.esc(departmentName().toUpperCase())}</span>
        <h2>Hola${displayName?", "+C.esc(displayName):""}.</h2>
        <p>Tu cargo es <strong>${C.esc(roleName())}</strong>. Aquí ves únicamente información y acciones autorizadas para tu departamento y nivel.</p>
      </div>
      <div class="staff-role-badge"><span>${C.esc(departmentName())}</span><b>${C.esc(roleName())}</b></div>
    </section>

    <div class="staff-kpi-grid">
      <article><span>${teamScope?"Tareas del equipo":"Tareas abiertas"}</span><b>${stats.open.length}</b><small>Trabajo pendiente visible</small></article>
      <article class="${stats.overdue.length?"risk":""}"><span>Vencidas</span><b>${stats.overdue.length}</b><small>Requieren atención</small></article>
      <article><span>Clientes en scope</span><b>${clients.length}</b><small>Asignados a ti o a tu equipo</small></article>
      <article><span>Proyectos</span><b>${projects.length}</b><small>Proyectos autorizados</small></article>
    </div>

    <div class="grid-two staff-home-grid">
      <section class="card">
        <div class="card-head"><div><h2>${teamScope?"Prioridades del equipo":"Hoy"}</h2><p>Próximos vencimientos</p></div>${navButton("tasks",teamScope?"Abrir tareas":"Abrir mis tareas")}</div>
        <div class="staff-task-preview">
          ${[...today,...upcoming].slice(0,6).length?[...today,...upcoming].slice(0,6).map((task)=>`
            <article class="${dueState(task)}">
              <div><span class="staff-task-priority ${C.esc(task.priority||"medium")}">${C.esc(task.priority||"medium")}</span><b>${C.esc(task.title)}</b></div>
              <small>${C.esc((C.state.organizations||[]).find((o)=>o.id===task.organization_id)?.name||"NEXO")} · ${task.due_at?C.dateTime(task.due_at):"Sin fecha límite"}</small>
            </article>
          `).join(""):C.emptyState("No hay tareas pendientes.","Puedes crear una desde Tareas.")}
        </div>
      </section>

      <section class="card">
        <div class="card-head"><div><h2>Tu alcance</h2><p>Permisos efectivos de ${C.esc(roleName())}</p></div></div>
        <div class="staff-capability-list">
          ${(C.state.teamPermissions||[]).filter((p)=>permissionLabels[p]).map((p)=>`<div><i>✓</i><span>${C.esc(permissionLabels[p])}</span></div>`).join("")}
        </div>
        <div class="staff-scope-note"><strong>Least privilege</strong><p>Tu cargo solo abre datos de su departamento y clientes autorizados. Finanzas, equipo, auditoría y configuración global permanecen separados salvo permiso explícito.</p></div>
      </section>
    </div>

    ${C.hasPermission?.("clients.create")?`
      <section class="staff-lead-callout">
        <div><span class="eyebrow">LIDERAZGO · ${C.esc(departmentName().toUpperCase())}</span><h3>Puedes abrir nuevos clientes y proyectos.</h3><p>Los nuevos registros quedan dentro de tu departamento y son visibles para el Founder.</p></div>
        <button class="btn primary staff-create-client-project" type="button">+ Nuevo cliente / proyecto</button>
      </section>`:""}

    <section class="card staff-clients-strip">
      <div class="card-head"><div><h2>Clientes en tu scope</h2><p>Negocios donde tu departamento puede trabajar</p></div>${C.hasPermission?.("clients.assigned.read")||C.hasPermission?.("clients.department.assign")?navButton("accounts","Ver clientes"):""}</div>
      <div class="staff-client-mini-grid">
        ${clients.length?clients.slice(0,6).map((org)=>`
          <article>
            <span class="staff-client-avatar" style="--staff-color:${C.esc(org.color||"#316bff")}">${C.esc(org.initials||"NX")}</span>
            <div><b>${C.esc(org.name)}</b><small>${C.esc(org.sector||"Cliente NEXO")}</small></div>
          </article>
        `).join(""):C.emptyState("Aún no hay clientes en tu scope.","El Founder o un Lead autorizado puede agregarlos.")}
      </div>
    </section>
  `;
  bindStaffNavigation();
  bindProjectActions(projects);
}

export async function renderStaffProjects(context){
  C=context;
  const [projects,tasks]=await Promise.all([visibleProjects(),visibleTasks()]);
  const clients=assignedClients();
  const orgMap=new Map(clients.map((org)=>[org.id,org]));
  const canCreate=C.hasPermission?.("projects.department.create");
  const canCreateClient=C.hasPermission?.("clients.create");
  const canWrite=C.hasPermission?.("projects.department.write");

  C.$("content").innerHTML=`
    <section class="staff-page-intro staff-page-intro-actions">
      <div><span class="eyebrow">NEXO · ${C.esc(departmentName().toUpperCase())}</span><h2>Proyectos del departamento</h2><p>Proyectos reales con tipo, estado, responsable y fecha objetivo.</p></div>
      <div class="staff-intro-actions">
        ${canCreate&&clients.length?`<button class="btn staff-create-project" type="button">+ Proyecto</button>`:""}
        ${canCreateClient?`<button class="btn primary staff-create-client-project" type="button">+ Cliente / proyecto</button>`:""}
      </div>
    </section>
    <div class="staff-project-grid">
      ${projects.length?projects.map((project)=>{
        const org=orgMap.get(project.organization_id)||{name:"Cliente NEXO",sector:"",initials:"NX",color:"#316bff"};
        const ownTasks=tasks.filter((t)=>t.organization_id===project.organization_id);
        const stats=taskStats(ownTasks);
        return `
          <article class="card staff-project-card">
            <div class="staff-project-head">
              <span class="staff-client-avatar large" style="--staff-color:${C.esc(org.color||"#316bff")}">${C.esc(org.initials||"NX")}</span>
              <div><span>${C.esc(org.name)}</span><h3>${C.esc(project.title)}</h3><small>${C.esc(projectTypeLabels[project.project_type]||project.project_type||"Proyecto")}</small></div>
              <span class="staff-project-status ${projectTone(project.status)}">${C.esc(projectStatusLabels[project.status]||project.status)}</span>
            </div>
            <div class="staff-project-meta-grid">
              <div><span>Estado</span>
                ${canWrite?`<select class="staff-project-status-select" data-project-id="${project.id}">
                  ${Object.entries(projectStatusLabels).map(([value,label])=>`<option value="${value}" ${project.status===value?"selected":""}>${C.esc(label)}</option>`).join("")}
                </select>`:`<b>${C.esc(projectStatusLabels[project.status]||project.status)}</b>`}
              </div>
              <div><span>Fecha objetivo</span><b>${project.due_at?C.shortDate(project.due_at):"Sin fecha"}</b></div>
              <div><span>Tareas visibles</span><b>${stats.open.length} abiertas · ${stats.overdue.length} vencidas</b></div>
            </div>
            <p class="staff-project-description">${C.esc(project.description||"Sin brief adicional.")}</p>
            <div class="staff-project-actions">
              ${navButton("tasks","Abrir tareas",project.organization_id)}
              ${canCreate?`<button class="btn small staff-create-project" data-org-id="${project.organization_id}" type="button">+ Otro proyecto</button>`:""}
            </div>
          </article>
        `;
      }).join(""):C.emptyState("Aún no hay proyectos.","Crea el primero o espera una asignación de tu Lead / Founder.")}
    </div>
  `;
  bindStaffNavigation();
  bindProjectActions(projects);
}

export async function renderStaffAccounts(context){
  C=context;
  const [clients,projects]=[assignedClients(),await visibleProjects()];
  const canCreate=C.hasPermission?.("projects.department.create");
  const canCreateClient=C.hasPermission?.("clients.create");
  const byOrg=new Map();
  projects.forEach((p)=>{const arr=byOrg.get(p.organization_id)||[];arr.push(p);byOrg.set(p.organization_id,arr);});

  C.$("content").innerHTML=`
    <section class="staff-page-intro staff-page-intro-actions">
      <div><span class="eyebrow">SCOPE · ${C.esc(departmentName().toUpperCase())}</span><h2>Clientes del departamento</h2><p>Clientes asignados a ti o, si eres Lead, a integrantes de tu mismo departamento.</p></div>
      ${canCreateClient?`<button class="btn primary staff-create-client-project" type="button">+ Nuevo cliente</button>`:""}
    </section>
    <div class="staff-account-grid">
      ${clients.length?clients.map((org)=>{
        const orgProjects=byOrg.get(org.id)||[];
        return `
          <article class="card staff-account-card">
            <div class="staff-account-top">
              <span class="staff-client-avatar large" style="--staff-color:${C.esc(org.color||"#316bff")}">${C.esc(org.initials||"NX")}</span>
              <div><h3>${C.esc(org.name)}</h3><p>${C.esc(org.sector||"Cliente NEXO")}</p></div>
            </div>
            <div class="staff-account-scope">
              <span>Departamento</span>
              <b>${C.esc(departmentName())}</b>
              <p>${orgProjects.length} proyecto${orgProjects.length===1?"":"s"} visible${orgProjects.length===1?"":"s"} · acceso limitado por RBAC.</p>
            </div>
            <div class="staff-project-actions">
              ${navButton("tasks","Ver tareas",org.id)}
              ${canCreate?`<button class="btn small staff-create-project" data-org-id="${org.id}" type="button">+ Proyecto</button>`:""}
            </div>
          </article>
        `;
      }).join(""):C.emptyState("Sin clientes en tu scope.","El Founder o un Lead autorizado puede asignarlos o crearlos.")}
    </div>
  `;
  bindStaffNavigation();
  bindProjectActions(projects);
}

export async function renderStaffPerformance(context){
  C=context;
  const tasks=await visibleTasks();
  const stats=taskStats(tasks);
  const since=Date.now()-30*24*60*60*1000;
  const completed30=stats.completed.filter((t)=>t.completed_at&&new Date(t.completed_at).getTime()>=since);
  const created30=tasks.filter((t)=>new Date(t.created_at).getTime()>=since);
  const completionRate=created30.length?Math.min(100,Math.round((completed30.length/created30.length)*100)):0;
  const clients=assignedClients();
  const teamScope=isLead()&&C.hasPermission?.("tasks.team.read");
  const clientBreakdown=clients.map((org)=>{
    const own=tasks.filter((t)=>t.organization_id===org.id);
    return {org,stats:taskStats(own)};
  }).filter((row)=>row.stats.open.length||row.stats.completed.length);

  C.$("content").innerHTML=`
    <section class="staff-page-intro">
      <div><span class="eyebrow">${teamScope?"RENDIMIENTO DEL DEPARTAMENTO":"MI RENDIMIENTO"}</span><h2>${teamScope?"Ejecución del equipo.":"Tu trabajo, medido sin rankings."}</h2><p>${teamScope?"Métricas del trabajo que tu cargo puede supervisar.":"Seguimiento personal de ejecución sin comparaciones entre colaboradores."}</p></div>
    </section>
    <div class="staff-kpi-grid">
      <article><span>Completadas · 30 días</span><b>${completed30.length}</b><small>Trabajo cerrado</small></article>
      <article><span>Abiertas</span><b>${stats.open.length}</b><small>Carga actual</small></article>
      <article class="${stats.overdue.length?"risk":""}"><span>Vencidas</span><b>${stats.overdue.length}</b><small>Atención requerida</small></article>
      <article><span>Resolución · 30 días</span><b>${completionRate}%</b><small>Completadas / creadas</small></article>
    </div>
    <section class="card">
      <div class="card-head"><div><h2>Trabajo por cliente</h2><p>Distribución dentro de tu scope</p></div></div>
      <div class="staff-performance-list">
        ${clientBreakdown.length?clientBreakdown.map(({org,stats})=>`
          <div>
            <span class="staff-client-avatar" style="--staff-color:${C.esc(org.color||"#316bff")}">${C.esc(org.initials||"NX")}</span>
            <div><b>${C.esc(org.name)}</b><small>${stats.open.length} abiertas · ${stats.completed.length} completadas</small></div>
            <span class="${stats.overdue.length?"risk":""}">${stats.overdue.length} vencidas</span>
          </div>
        `).join(""):C.emptyState("Aún no hay actividad suficiente.","Las métricas aparecerán a medida que avance el trabajo.")}
      </div>
    </section>
  `;
}
