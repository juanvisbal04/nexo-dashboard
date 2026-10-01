let C=null;

const taskStatusLabels={pending:"Pendiente",in_progress:"En progreso",completed:"Completada",cancelled:"Cancelada"};
const priorityLabels={low:"Baja",medium:"Media",high:"Alta",urgent:"Urgente"};

export function configureWorkspace360(context){ C=context; }

function esc(v){return C.esc(v);}
function money(v){return C.money(v);}
function dateTime(v){return C.dateTime(v);}
function shortDate(v){return C.shortDate(v);}

function ensureDrawer(id){
  let root=document.getElementById(id);
  if(root)return root;
  root=document.createElement("div");
  root.id=id;
  root.className="nexo-drawer hidden";
  root.innerHTML='<div class="nexo-drawer-backdrop" data-drawer-close></div><section class="nexo-drawer-panel"><div class="nexo-drawer-content"></div></section>';
  document.body.appendChild(root);
  root.querySelector("[data-drawer-close]")?.addEventListener("click",()=>closeDrawer(id));
  return root;
}

export function closeDrawer(id){
  document.getElementById(id)?.classList.add("hidden");
  if(!document.querySelector(".nexo-drawer:not(.hidden)")) document.body.classList.remove("modal-open");
}

function showDrawer(id,html){
  const root=ensureDrawer(id);
  root.querySelector(".nexo-drawer-content").innerHTML=html;
  root.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

document.addEventListener("keydown",(event)=>{
  if(event.key!=="Escape")return;
  document.querySelectorAll(".nexo-drawer:not(.hidden)").forEach((drawer)=>closeDrawer(drawer.id));
});

function orgById(id){return C.state.organizations.find((o)=>o.id===id)||null;}
function orgName(id){return orgById(id)?.name||"NEXO";}
function currentRole(){return C.state.isAdmin?"platform_admin":C.currentOrgRole();}
function canWrite(){return C.state.isAdmin || ["owner","admin","operator"].includes(currentRole());}

async function assigneesForOrg(orgId){
  const {data,error}=await C.supabase.rpc("org_task_assignees",{target_org:orgId});
  if(error)throw error;
  return data||[];
}
function assigneeName(map,id){return id?(map.get(id)?.full_name||map.get(id)?.contact_email||"Usuario"):"Sin asignar";}

function taskStatusSelect(row,disabled=false){
  return '<select class="task-status-control" data-task-id="'+row.id+'" '+(disabled?"disabled":"")+'>'+
    Object.entries(taskStatusLabels).map(([v,l])=>'<option value="'+v+'" '+(v===row.status?"selected":"")+'>'+l+'</option>').join("")+
  '</select>';
}
function priorityPill(value){
  return '<span class="task-priority '+esc(value||"medium")+'">'+esc(priorityLabels[value]||value||"Media")+'</span>';
}

export async function renderTasks(context=C){
  if(context)C=context;
  const internal=C.state.isAdmin && C.isInternalOrg();
  const orgIds=internal?C.state.organizations.map((o)=>o.id):(C.currentOrgId()?[C.currentOrgId()]:[]);
  if(!orgIds.length){C.$("content").innerHTML=C.emptyState("No hay una empresa seleccionada.","Selecciona una empresa.");return;}

  let request=C.supabase.from("work_tasks").select("*").order("created_at",{ascending:false}).limit(1000);
  request=orgIds.length===1?request.eq("organization_id",orgIds[0]):request.in("organization_id",orgIds);
  const {data:tasks,error}=await request;
  if(error)throw error;

  const assigneeLists=await Promise.all(orgIds.map(async(id)=>[id,await assigneesForOrg(id)]));
  const assigneesByOrg=new Map(assigneeLists);
  const allAssignees=new Map();
  assigneeLists.forEach(([,rows])=>rows.forEach((row)=>allAssignees.set(row.id,row)));

  const rows=tasks||[];
  const open=rows.filter((r)=>["pending","in_progress"].includes(r.status));
  const overdue=open.filter((r)=>r.due_at&&new Date(r.due_at).getTime()<Date.now());
  const completed=rows.filter((r)=>r.status==="completed");
  const canEdit=canWrite();

  C.state.currentRows=rows;
  C.$("content").innerHTML=`
    <div class="task-summary-grid">
      <div><span>Abiertas</span><b>${open.length}</b><small>Pendientes + en progreso</small></div>
      <div class="${overdue.length?"risk":""}"><span>Vencidas</span><b>${overdue.length}</b><small>Requieren atención</small></div>
      <div><span>Completadas</span><b>${completed.length}</b><small>Historial reciente</small></div>
      <div><span>Urgentes</span><b>${open.filter((r)=>r.priority==="urgent").length}</b><small>Prioridad máxima</small></div>
    </div>

    ${canEdit?`<section class="card task-create-card">
      <div class="card-head"><div><h2>Nueva tarea</h2><p>Asigna responsable, prioridad y fecha límite</p></div></div>
      <form id="taskCreateForm" class="task-create-form">
        ${internal?`<select id="taskOrg" required>${C.state.organizations.map((org)=>`<option value="${org.id}">${esc(org.name)}</option>`).join("")}</select>`:""}
        <input id="taskTitle" required placeholder="Qué hay que hacer">
        <select id="taskPriority"><option value="medium">Prioridad media</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baja</option></select>
        <input id="taskDue" type="datetime-local">
        <select id="taskAssignee"><option value="">Sin asignar</option></select>
        <input id="taskDescription" placeholder="Nota / contexto">
        <button class="btn primary" type="submit">Crear tarea</button>
      </form>
    </section>`:""}

    <section class="card task-center-card">
      <div class="card-head">
        <div><h2>Centro de tareas</h2><p>Trabajo asignable y trazable para NEXO y cada cliente</p></div>
        <div class="task-toolbar">
          <select id="taskStatusFilter" class="control"><option value="open">Abiertas</option><option value="">Todas</option><option value="pending">Pendientes</option><option value="in_progress">En progreso</option><option value="completed">Completadas</option></select>
          ${internal?`<select id="taskOrgFilter" class="control"><option value="">Todos los negocios</option>${C.state.organizations.map((org)=>`<option value="${org.id}">${esc(org.name)}</option>`).join("")}</select>`:""}
        </div>
      </div>
      <div id="taskRows" class="task-list"></div>
    </section>`;

  const populateAssignees=()=>{
    const orgId=internal?C.$("taskOrg")?.value:C.currentOrgId();
    const select=C.$("taskAssignee");
    if(!select)return;
    const list=assigneesByOrg.get(orgId)||[];
    select.innerHTML='<option value="">Sin asignar</option>'+list.map((p)=>'<option value="'+p.id+'">'+esc(p.full_name||p.contact_email||"Usuario")+' · '+esc(p.role||"")+'</option>').join("");
  };
  C.$("taskOrg")?.addEventListener("change",populateAssignees);
  populateAssignees();

  const draw=()=>{
    const status=C.$("taskStatusFilter")?.value||"";
    const orgFilter=C.$("taskOrgFilter")?.value||"";
    const visible=rows.filter((row)=>{
      if(orgFilter&&row.organization_id!==orgFilter)return false;
      if(status==="open"&&!["pending","in_progress"].includes(row.status))return false;
      if(status&&status!=="open"&&row.status!==status)return false;
      return true;
    });
    C.$("taskRows").innerHTML=visible.length?visible.map((row)=>{
      const due=row.due_at?new Date(row.due_at).getTime():null;
      const isOverdue=due&&due<Date.now()&&["pending","in_progress"].includes(row.status);
      return `<article class="task-row ${isOverdue?"overdue":""}">
        <div class="task-row-main">
          <div class="task-row-top">${priorityPill(row.priority)}<span>${esc(internal?orgName(row.organization_id):"")}</span></div>
          <b>${esc(row.title)}</b>
          <p>${esc(row.description||"Sin nota adicional")}</p>
          <div class="task-row-meta"><span>Responsable: ${esc(assigneeName(allAssignees,row.assigned_to))}</span><span>${row.due_at?(isOverdue?"Venció ":"Vence ")+dateTime(row.due_at):"Sin fecha límite"}</span></div>
        </div>
        <div class="task-row-actions">
          ${taskStatusSelect(row,!canEdit)}
          ${row.contact_id?`<button class="btn small task-contact-360" data-contact-id="${row.contact_id}" data-org-id="${row.organization_id}" type="button">Contacto 360</button>`:""}
        </div>
      </article>`;
    }).join(""):C.emptyState("No hay tareas con este filtro.","Crea una tarea o cambia el filtro.");

    document.querySelectorAll(".task-status-control").forEach((select)=>{
      select.addEventListener("change",async()=>{
        const task=rows.find((r)=>r.id===select.dataset.taskId);
        if(!task)return;
        select.disabled=true;
        const next=select.value;
        const payload={status:next,updated_at:new Date().toISOString(),completed_at:next==="completed"?new Date().toISOString():null};
        const {error}=await C.supabase.from("work_tasks").update(payload).eq("id",task.id);
        if(error){C.showError(error.message);select.disabled=false;return;}
        C.showToast("Tarea actualizada.");
        await C.renderApp();
      });
    });
    document.querySelectorAll(".task-contact-360").forEach((button)=>button.addEventListener("click",()=>openContact360(C,button.dataset.contactId,button.dataset.orgId)));
  };
  C.$("taskStatusFilter")?.addEventListener("change",draw);
  C.$("taskOrgFilter")?.addEventListener("change",draw);
  draw();

  C.$("taskCreateForm")?.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const orgId=internal?C.$("taskOrg").value:C.currentOrgId();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;button.textContent="Creando…";
    const due=C.$("taskDue").value;
    const {error}=await C.supabase.from("work_tasks").insert({
      organization_id:orgId,
      title:C.$("taskTitle").value.trim(),
      description:C.$("taskDescription").value.trim()||null,
      priority:C.$("taskPriority").value,
      due_at:due?new Date(due).toISOString():null,
      assigned_to:C.$("taskAssignee").value||null,
      created_by:C.state.session.user.id,
      status:"pending",
      source_type:"manual"
    });
    if(error){C.showError(error.message);button.disabled=false;button.textContent="Crear tarea";return;}
    C.showToast("Tarea creada.");
    await C.renderApp();
  });
}

export async function openCustomer360(context,orgId){
  C=context||C;
  const org=orgById(orgId);
  if(!org)return;
  showDrawer("customer360Modal",'<div class="drawer-loading">Cargando Customer 360…</div>');
  try{
    const [settingsR,commercialR,integrationsR,conversationsR,leadsR,appointmentsR,invoicesR,tasksR,servicesR,assignees]=await Promise.all([
      C.supabase.from("organization_settings").select("*").eq("organization_id",orgId).maybeSingle(),
      C.supabase.from("organization_commercials").select("*").eq("organization_id",orgId).maybeSingle(),
      C.supabase.from("crm_integrations").select("*").eq("organization_id",orgId).order("created_at"),
      C.supabase.from("conversations").select("*").eq("organization_id",orgId).order("last_message_at",{ascending:false}).limit(500),
      C.supabase.from("leads").select("*").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(500),
      C.supabase.from("appointments").select("*").eq("organization_id",orgId).order("starts_at",{ascending:false}).limit(500),
      C.supabase.from("client_invoices").select("*").eq("organization_id",orgId).order("due_date",{ascending:false}).limit(500),
      C.supabase.from("work_tasks").select("*").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(200),
      C.supabase.from("services").select("id,name,price,active").eq("organization_id",orgId),
      assigneesForOrg(orgId)
    ]);
    const commercial=commercialR.data||{};
    const settings=settingsR.data||{};
    const integrations=integrationsR.data||[];
    const conversations=conversationsR.data||[];
    const leads=leadsR.data||[];
    const appointments=appointmentsR.data||[];
    const invoices=invoicesR.data||[];
    const tasks=tasksR.data||[];
    const services=servicesR.data||[];
    const assistant=C.state.assistantProfiles[orgId]||null;
    const openTasks=tasks.filter((r)=>["pending","in_progress"].includes(r.status));
    const confirmed=appointments.filter((r)=>["Confirmada","Completada"].includes(r.status));
    const receivable=invoices.filter((r)=>["pending","overdue"].includes(r.status)).reduce((s,r)=>s+Number(r.amount_cop||0),0);
    const directCost=Number(commercial.monthly_cost||0);
    const mrr=Number(commercial.mrr||0);
    const margin=mrr?Math.round(((mrr-directCost)/mrr)*100):0;
    const current=ensureDrawer("customer360Modal");
    current.querySelector(".nexo-drawer-content").innerHTML=`
      <header class="drawer-header">
        <div class="drawer-title-row">
          ${C.assistantAvatarHtml(assistant,org,"drawer-org-avatar")}
          <div><span class="eyebrow">CUSTOMER 360</span><h2>${esc(org.name)}</h2><p>${esc(org.sector||"Sin sector")} · ${esc(commercial.plan_name||"Plan por definir")}</p></div>
        </div>
        <button class="drawer-close" type="button" data-customer-close>×</button>
      </header>
      <div class="drawer-actions">
        <button class="btn primary" id="customer360Portal" type="button">Ver portal</button>
        <button class="btn" id="customer360Settings" type="button">Configuración</button>
        <button class="btn" id="customer360Tasks" type="button">Tareas</button>
        <button class="btn" id="customer360Billing" type="button">Facturación</button>
      </div>
      <div class="customer360-kpis">
        <div><span>Conversaciones</span><b>${conversations.length}</b></div>
        <div><span>Leads</span><b>${leads.length}</b></div>
        <div><span>Citas confirmadas</span><b>${confirmed.length}</b></div>
        <div><span>Tareas abiertas</span><b>${openTasks.length}</b></div>
        <div><span>MRR</span><b>${money(mrr)}</b></div>
        <div><span>Margen</span><b>${mrr?margin+"%":"—"}</b></div>
      </div>
      <div class="customer360-grid">
        <section class="drawer-card">
          <h3>Asistente virtual</h3>
          <div class="drawer-assistant">${C.assistantAvatarHtml(assistant,org,"drawer-assistant-avatar")}<div><b>${esc(assistant?.name||org.assistant||"Asistente NEXO")}</b><span>${esc(assistant?.role_label||"Asistente virtual")}</span><p>${esc(assistant?.description||"Configurado por NEXO.")}</p></div></div>
        </section>
        <section class="drawer-card"><h3>Estado comercial</h3><dl class="drawer-dl">
          <div><dt>Etapa</dt><dd>${esc(commercial.lifecycle_stage||"—")}</dd></div>
          <div><dt>Implementación</dt><dd>${esc(commercial.implementation_status||"—")}</dd></div>
          <div><dt>Integraciones</dt><dd>${esc(commercial.integration_status||"—")}</dd></div>
          <div><dt>Facturación</dt><dd>${esc(commercial.billing_status||"—")}</dd></div>
          <div><dt>Por cobrar</dt><dd>${money(receivable)}</dd></div>
        </dl></section>
        <section class="drawer-card"><h3>Contacto del negocio</h3><dl class="drawer-dl">
          <div><dt>Correo</dt><dd>${esc(settings.notification_email||settings.public_email||commercial.billing_email||"—")}</dd></div>
          <div><dt>WhatsApp</dt><dd>${esc(settings.whatsapp||"—")}</dd></div>
          <div><dt>Ciudad</dt><dd>${esc(settings.city||"—")}</dd></div>
          <div><dt>Usuarios</dt><dd>${assignees.length}</dd></div>
          <div><dt>Servicios</dt><dd>${services.filter((s)=>s.active!==false).length}</dd></div>
        </dl></section>
        <section class="drawer-card"><h3>Integraciones</h3><div class="drawer-list">${integrations.length?integrations.map((r)=>`<div><b>${esc(r.integration_name)}</b><span>${esc(r.provider||"")} · ${esc(r.status)}</span></div>`).join(""):'<p class="muted">Sin integraciones registradas.</p>'}</div></section>
      </div>
      <section class="drawer-card drawer-wide"><div class="drawer-card-head"><h3>Tareas abiertas</h3><span>${openTasks.length}</span></div><div class="drawer-list">
        ${openTasks.length?openTasks.slice(0,8).map((r)=>`<div><b>${esc(r.title)}</b><span>${esc(priorityLabels[r.priority]||r.priority)} · ${r.due_at?dateTime(r.due_at):"Sin fecha"}</span></div>`).join(""):'<p class="muted">No hay tareas abiertas.</p>'}
      </div></section>
      <section class="drawer-card drawer-wide"><div class="drawer-card-head"><h3>Actividad reciente</h3><span>${conversations.slice(0,5).length} chats recientes</span></div><div class="drawer-list">
        ${conversations.slice(0,5).map((r)=>`<div><b>${esc(r.name||"Conversación")}</b><span>${esc(r.status)} · ${dateTime(r.last_message_at)}</span></div>`).join("")||'<p class="muted">Sin actividad reciente.</p>'}
      </div></section>
    `;
    current.querySelector("[data-customer-close]")?.addEventListener("click",()=>closeDrawer("customer360Modal"));
    C.$("customer360Portal")?.addEventListener("click",async()=>{closeDrawer("customer360Modal");C.$("orgSelect").value=orgId;C.state.page="overview";C.persistUiState();await C.renderApp();});
    C.$("customer360Settings")?.addEventListener("click",async()=>{closeDrawer("customer360Modal");C.state.settingsOrgId=orgId;C.state.page="settings";C.persistUiState();await C.renderApp();});
    C.$("customer360Tasks")?.addEventListener("click",async()=>{closeDrawer("customer360Modal");C.state.page="tasks";C.persistUiState();await C.renderApp();});
    C.$("customer360Billing")?.addEventListener("click",async()=>{closeDrawer("customer360Modal");C.$("orgSelect").value=orgId;C.state.page="billing";C.persistUiState();await C.renderApp();});
  }catch(error){closeDrawer("customer360Modal");C.showError(error.message||"No pudimos abrir Customer 360.");}
}

export async function openContact360(context,contactId,organizationId){
  C=context||C;
  const orgId=organizationId||C.currentOrgId();
  showDrawer("contact360Modal",'<div class="drawer-loading">Cargando Contact 360…</div>');
  try{
    const [contactR,conversationsR,leadsR,appointmentsR,followupsR,notesR,tasksR,assignees]=await Promise.all([
      C.supabase.from("contacts").select("*").eq("id",contactId).eq("organization_id",orgId).single(),
      C.supabase.from("conversations").select("*").eq("organization_id",orgId).eq("contact_id",contactId).order("last_message_at",{ascending:false}),
      C.supabase.from("leads").select("*").eq("organization_id",orgId).eq("contact_id",contactId).order("created_at",{ascending:false}),
      C.supabase.from("appointments").select("*").eq("organization_id",orgId).eq("contact_id",contactId).order("starts_at",{ascending:false}),
      C.supabase.from("followups").select("*").eq("organization_id",orgId).eq("contact_id",contactId).order("due_at",{ascending:false}),
      C.supabase.from("contact_notes").select("*").eq("organization_id",orgId).eq("contact_id",contactId).order("created_at",{ascending:false}),
      C.supabase.from("work_tasks").select("*").eq("organization_id",orgId).eq("contact_id",contactId).order("created_at",{ascending:false}),
      assigneesForOrg(orgId)
    ]);
    if(contactR.error)throw contactR.error;
    const contact=contactR.data;
    const conversations=conversationsR.data||[];
    const leads=leadsR.data||[];
    const appointments=appointmentsR.data||[];
    const followups=followupsR.data||[];
    const notes=notesR.data||[];
    const tasks=tasksR.data||[];
    const canEdit=canWrite();
    const assigneeMap=new Map(assignees.map((r)=>[r.id,r]));
    const totalValue=leads.reduce((s,r)=>s+Number(r.value||0),0);
    const confirmed=appointments.filter((r)=>["Confirmada","Completada"].includes(r.status)).length;
    const digits=String(contact.phone||"").replace(/\D/g,"");
    const root=ensureDrawer("contact360Modal");
    root.querySelector(".nexo-drawer-content").innerHTML=`
      <header class="drawer-header">
        <div class="drawer-title-row"><span class="contact360-avatar">${esc((contact.name||"C")[0].toUpperCase())}</span><div><span class="eyebrow">CONTACT 360</span><h2>${esc(contact.name||"Contacto")}</h2><p>${esc(orgName(orgId))} · ${esc(contact.source||"WhatsApp")}</p></div></div>
        <button class="drawer-close" type="button" data-contact-close>×</button>
      </header>
      <div class="drawer-actions">
        ${digits?`<a class="btn primary" href="https://wa.me/${digits}" target="_blank" rel="noopener">WhatsApp</a>`:""}
        <button class="btn" id="contact360Chat" type="button">Ver chat</button>
      </div>
      <div class="contact360-kpis"><div><span>Conversaciones</span><b>${conversations.length}</b></div><div><span>Leads</span><b>${leads.length}</b></div><div><span>Citas confirmadas</span><b>${confirmed}</b></div><div><span>Valor leads</span><b>${money(totalValue)}</b></div><div><span>Tareas abiertas</span><b>${tasks.filter((r)=>["pending","in_progress"].includes(r.status)).length}</b></div></div>
      <div class="contact360-grid">
        <section class="drawer-card">
          <h3>Datos del contacto</h3>
          <form id="contact360Form" class="contact360-form">
            <label>Nombre<input id="contact360Name" value="${esc(contact.name||"")}" ${canEdit?"":"disabled"}></label>
            <label>Teléfono<input id="contact360Phone" value="${esc(contact.phone||"")}" ${canEdit?"":"disabled"}></label>
            <label>Correo<input id="contact360Email" type="email" value="${esc(contact.email||"")}" ${canEdit?"":"disabled"}></label>
            ${canEdit?'<button class="btn small" type="submit">Guardar contacto</button>':""}
          </form>
        </section>
        <section class="drawer-card">
          <h3>Nueva tarea</h3>
          ${canEdit?`<form id="contactTaskForm" class="contact360-task-form">
            <input id="contactTaskTitle" placeholder="Qué hay que hacer" required>
            <div><select id="contactTaskPriority"><option value="medium">Media</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baja</option></select><input id="contactTaskDue" type="datetime-local"></div>
            <select id="contactTaskAssignee"><option value="">Sin asignar</option>${assignees.map((p)=>`<option value="${p.id}">${esc(p.full_name||p.contact_email||"Usuario")}</option>`).join("")}</select>
            <button class="btn primary small" type="submit">Crear tarea</button>
          </form>`:'<p class="muted">Tu rol tiene acceso de solo lectura.</p>'}
        </section>
        <section class="drawer-card drawer-wide">
          <div class="drawer-card-head"><h3>Notas internas</h3><span>${notes.length}</span></div>
          ${canEdit?`<form id="contactNoteForm" class="contact-note-form"><textarea id="contactNoteText" rows="2" placeholder="Agregar contexto interno sobre este contacto…" required></textarea><button class="btn small" type="submit">Agregar nota</button></form>`:""}
          <div class="contact-note-list">${notes.length?notes.map((n)=>`<div><p>${esc(n.note)}</p><small>${dateTime(n.created_at)}</small></div>`).join(""):'<p class="muted">Sin notas internas.</p>'}</div>
        </section>
        <section class="drawer-card drawer-wide"><div class="drawer-card-head"><h3>Oportunidades</h3><span>${leads.length}</span></div><div class="drawer-list">${leads.length?leads.map((r)=>`<div><b>${esc(r.service||"Lead")}</b><span>${esc(r.stage)} · ${money(r.value)} · ${dateTime(r.created_at)}</span></div>`).join(""):'<p class="muted">Sin oportunidades registradas.</p>'}</div></section>
        <section class="drawer-card drawer-wide"><div class="drawer-card-head"><h3>Citas</h3><span>${appointments.length}</span></div><div class="drawer-list">${appointments.length?appointments.map((r)=>`<div><b>${esc(r.service||"Cita")}</b><span>${esc(r.status)} · ${money(r.value)} · ${dateTime(r.starts_at)}</span></div>`).join(""):'<p class="muted">Sin citas registradas.</p>'}</div></section>
        <section class="drawer-card drawer-wide"><div class="drawer-card-head"><h3>Seguimientos</h3><span>${followups.length}</span></div><div class="drawer-list">${followups.length?followups.map((r)=>`<div><b>${esc(r.service||"Seguimiento")}</b><span>${esc(r.status)} · ${dateTime(r.due_at)}</span></div>`).join(""):'<p class="muted">Sin seguimientos.</p>'}</div></section>
        <section class="drawer-card drawer-wide"><div class="drawer-card-head"><h3>Tareas</h3><span>${tasks.length}</span></div><div class="drawer-list">${tasks.length?tasks.map((r)=>`<div><b>${esc(r.title)}</b><span>${esc(taskStatusLabels[r.status]||r.status)} · ${esc(assigneeName(assigneeMap,r.assigned_to))} · ${r.due_at?dateTime(r.due_at):"Sin fecha"}</span></div>`).join(""):'<p class="muted">Sin tareas vinculadas.</p>'}</div></section>
      </div>
    `;
    root.querySelector("[data-contact-close]")?.addEventListener("click",()=>closeDrawer("contact360Modal"));
    C.$("contact360Chat")?.addEventListener("click",()=>{closeDrawer("contact360Modal");C.openContactChat(contactId,orgId);});
    C.$("contact360Form")?.addEventListener("submit",async(event)=>{
      event.preventDefault();
      const {error}=await C.supabase.from("contacts").update({
        name:C.$("contact360Name").value.trim(),phone:C.$("contact360Phone").value.trim()||null,email:C.$("contact360Email").value.trim()||null
      }).eq("id",contactId).eq("organization_id",orgId);
      if(error)return C.showError(error.message);
      C.showToast("Contacto actualizado."); await openContact360(C,contactId,orgId);
    });
    C.$("contactNoteForm")?.addEventListener("submit",async(event)=>{
      event.preventDefault();
      const {error}=await C.supabase.from("contact_notes").insert({organization_id:orgId,contact_id:contactId,note:C.$("contactNoteText").value.trim(),created_by:C.state.session.user.id});
      if(error)return C.showError(error.message);
      C.showToast("Nota agregada."); await openContact360(C,contactId,orgId);
    });
    C.$("contactTaskForm")?.addEventListener("submit",async(event)=>{
      event.preventDefault();
      const due=C.$("contactTaskDue").value;
      const {error}=await C.supabase.from("work_tasks").insert({
        organization_id:orgId,contact_id:contactId,title:C.$("contactTaskTitle").value.trim(),
        priority:C.$("contactTaskPriority").value,due_at:due?new Date(due).toISOString():null,
        assigned_to:C.$("contactTaskAssignee").value||null,created_by:C.state.session.user.id,status:"pending",source_type:"contact360",source_id:contactId
      });
      if(error)return C.showError(error.message);
      C.showToast("Tarea creada."); await openContact360(C,contactId,orgId);
    });
  }catch(error){closeDrawer("contact360Modal");C.showError(error.message||"No pudimos abrir Contact 360.");}
}
