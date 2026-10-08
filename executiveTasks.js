let C=null;

const statusLabels={pending:"Pendiente",in_progress:"En progreso",completed:"Completada",cancelled:"Cancelada"};
const priorityLabels={low:"Baja",medium:"Media",high:"Alta",urgent:"Urgente"};

function esc(v){return C.esc(v);}
function orgName(id){return C.state.organizations.find((o)=>o.id===id)?.name||"NEXO";}
function dt(v){return v?C.dateTime(v):"Sin fecha límite";}

async function assigneesForOrg(orgId){
  const {data,error}=await C.supabase.functions.invoke("task-assignees",{body:{organization_id:orgId}});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.error||"No pudimos cargar responsables.");
  return data.assignees||[];
}

function modal(task,assignees,onSaved){
  document.getElementById("executiveTaskModal")?.remove();
  const root=document.createElement("div");
  root.id="executiveTaskModal";
  root.className="staff-work-modal";
  const options=assignees.map((p)=>`<option value="${p.id}" ${task.assigned_to===p.id?"selected":""}>${esc(p.full_name||p.contact_email||"Usuario")} · ${esc(p.role||"")} ${p.department_name?"· "+esc(p.department_name):""}</option>`).join("");
  root.innerHTML=`
    <div class="staff-work-backdrop" data-close-exec-task></div>
    <section class="staff-work-dialog">
      <header>
        <div><span class="eyebrow">NEXO EXECUTIVE WORK CONTROL</span><h2>Editar tarea</h2><p>${esc(orgName(task.organization_id))}</p></div>
        <button type="button" data-close-exec-task>×</button>
      </header>
      <div class="staff-work-body">
        <form id="executiveTaskEditForm" class="staff-work-form">
          <label class="wide">Título<input id="execEditTitle" value="${esc(task.title||"")}" required></label>
          <label>Estado<select id="execEditStatus">${Object.entries(statusLabels).map(([v,l])=>`<option value="${v}" ${task.status===v?"selected":""}>${l}</option>`).join("")}</select></label>
          <label>Prioridad<select id="execEditPriority">${Object.entries(priorityLabels).map(([v,l])=>`<option value="${v}" ${task.priority===v?"selected":""}>${l}</option>`).join("")}</select></label>
          <label class="wide">Responsable<select id="execEditAssignee" required><option value="">Selecciona responsable</option>${options}</select></label>
          <label>Fecha límite<input id="execEditDue" type="datetime-local"></label>
          <label class="wide">Notas / contexto<textarea id="execEditDescription" rows="5">${esc(task.description||"")}</textarea></label>
          <div class="staff-work-actions wide"><button class="btn primary" type="submit">Guardar cambios</button></div>
        </form>
      </div>
    </section>`;
  document.body.appendChild(root);
  document.body.classList.add("modal-open");
  const due=root.querySelector("#execEditDue");
  if(task.due_at){
    const d=new Date(task.due_at);
    const pad=(n)=>String(n).padStart(2,"0");
    due.value=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  const close=()=>{root.remove();document.body.classList.remove("modal-open");};
  root.querySelectorAll("[data-close-exec-task]").forEach((el)=>el.addEventListener("click",close));
  root.querySelector("#executiveTaskEditForm")?.addEventListener("submit",async(event)=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;button.textContent="Guardando…";
    const nextStatus=root.querySelector("#execEditStatus").value;
    const dueValue=root.querySelector("#execEditDue").value;
    const {error}=await C.supabase.from("work_tasks").update({
      title:root.querySelector("#execEditTitle").value.trim(),
      description:root.querySelector("#execEditDescription").value.trim()||null,
      status:nextStatus,
      priority:root.querySelector("#execEditPriority").value,
      assigned_to:root.querySelector("#execEditAssignee").value,
      due_at:dueValue?new Date(dueValue).toISOString():null,
      completed_at:nextStatus==="completed"?(task.completed_at||new Date().toISOString()):null,
    }).eq("id",task.id);
    if(error){C.showError(error.message);button.disabled=false;button.textContent="Guardar cambios";return;}
    close();C.showToast("Tarea actualizada.");await onSaved();
  });
}

export async function renderExecutiveTasks(context){
  C=context;
  const internalOrg=C.state.organizations.find((o)=>o.name==="NEXO Internal");
  if(!internalOrg){C.$("content").innerHTML=C.emptyState("NEXO Internal no está configurado.","");return;}

  const [{data:tasks,error:taskError},companyAssignees]=await Promise.all([
    C.supabase.from("work_tasks").select("*").order("created_at",{ascending:false}).limit(2000),
    assigneesForOrg(internalOrg.id),
  ]);
  if(taskError)throw taskError;

  const peopleMap=new Map(companyAssignees.map((p)=>[p.id,p]));
  const rows=tasks||[];
  const open=rows.filter((r)=>["pending","in_progress"].includes(r.status));
  const overdue=open.filter((r)=>r.due_at&&new Date(r.due_at).getTime()<Date.now());
  const completed=rows.filter((r)=>r.status==="completed");
  const departments=[...new Map(companyAssignees.filter((p)=>p.department_key).map((p)=>[p.department_key,p.department_name||p.department_key])).entries()]
    .sort((a,b)=>String(a[1]).localeCompare(String(b[1]),"es"));

  C.$("content").innerHTML=`
    <section class="staff-page-intro">
      <div><span class="eyebrow">FOUNDER / CEO</span><h2>Executive Work Control</h2><p>Asigna, supervisa y reasigna trabajo de cualquier departamento de NEXO desde una sola vista.</p></div>
    </section>

    <div class="staff-kpi-grid">
      <article><span>Abiertas</span><b>${open.length}</b><small>Todo NEXO</small></article>
      <article><span>En progreso</span><b>${rows.filter((r)=>r.status==="in_progress").length}</b><small>Trabajo activo</small></article>
      <article class="${overdue.length?"risk":""}"><span>Vencidas</span><b>${overdue.length}</b><small>Requieren seguimiento</small></article>
      <article><span>Completadas</span><b>${completed.length}</b><small>Histórico visible</small></article>
    </div>

    <section class="card task-create-card">
      <div class="card-head"><div><h2>Asignar nueva tarea</h2><p>Selecciona cuenta, departamento y responsable.</p></div></div>
      <form id="executiveTaskCreateForm" class="task-create-form executive-task-create">
        <select id="execTaskOrg" required>${C.state.organizations.map((org)=>`<option value="${org.id}" ${org.id===internalOrg.id?"selected":""}>${esc(org.name)}</option>`).join("")}</select>
        <select id="execTaskDepartment"><option value="">Todos los departamentos</option>${departments.map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join("")}</select>
        <select id="execTaskAssignee" required><option value="">Selecciona responsable</option></select>
        <input id="execTaskTitle" required placeholder="Qué hay que hacer">
        <select id="execTaskPriority"><option value="medium">Prioridad media</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baja</option></select>
        <input id="execTaskDue" type="datetime-local">
        <input id="execTaskDescription" placeholder="Notas / contexto">
        <button class="btn primary" type="submit">Asignar tarea</button>
      </form>
    </section>

    <section class="card task-center-card">
      <div class="card-head">
        <div><h2>Control de tareas</h2><p>Estado de trabajo por equipo y responsable.</p></div>
        <div class="task-toolbar">
          <select id="execStatusFilter" class="control"><option value="open">Abiertas</option><option value="">Todas</option><option value="pending">Pendientes</option><option value="in_progress">En progreso</option><option value="completed">Completadas</option><option value="cancelled">Canceladas</option></select>
          <select id="execDepartmentFilter" class="control"><option value="">Todos los departamentos</option>${departments.map(([key,name])=>`<option value="${esc(key)}">${esc(name)}</option>`).join("")}</select>
          <select id="execAssigneeFilter" class="control"><option value="">Todos los responsables</option>${companyAssignees.map((p)=>`<option value="${p.id}">${esc(p.full_name||p.contact_email||"Usuario")}</option>`).join("")}</select>
          <select id="execOrgFilter" class="control"><option value="">Todas las cuentas</option>${C.state.organizations.map((org)=>`<option value="${org.id}">${esc(org.name)}</option>`).join("")}</select>
        </div>
      </div>
      <div id="executiveTaskRows" class="task-list"></div>
    </section>`;

  let currentCreateAssignees=companyAssignees;
  const populateCreate=async()=>{
    const orgId=C.$("execTaskOrg").value;
    const dept=C.$("execTaskDepartment").value;
    try{currentCreateAssignees=orgId===internalOrg.id?companyAssignees:await assigneesForOrg(orgId);}
    catch{currentCreateAssignees=[];}
    const visible=currentCreateAssignees.filter((p)=>!dept||p.department_key===dept);
    C.$("execTaskAssignee").innerHTML='<option value="">Selecciona responsable</option>'+visible.map((p)=>`<option value="${p.id}">${esc(p.full_name||p.contact_email||"Usuario")} · ${esc(p.role||"")} ${p.department_name?"· "+esc(p.department_name):""}</option>`).join("");
  };
  C.$("execTaskOrg").addEventListener("change",populateCreate);
  C.$("execTaskDepartment").addEventListener("change",populateCreate);
  await populateCreate();

  const draw=()=>{
    const status=C.$("execStatusFilter").value;
    const dept=C.$("execDepartmentFilter").value;
    const assignee=C.$("execAssigneeFilter").value;
    const org=C.$("execOrgFilter").value;
    const visible=rows.filter((row)=>{
      if(status==="open"&&!["pending","in_progress"].includes(row.status))return false;
      if(status&&status!=="open"&&row.status!==status)return false;
      if(assignee&&row.assigned_to!==assignee)return false;
      if(org&&row.organization_id!==org)return false;
      if(dept&&(peopleMap.get(row.assigned_to)?.department_key||"")!==dept)return false;
      return true;
    });
    C.$("executiveTaskRows").innerHTML=visible.length?visible.map((row)=>{
      const person=peopleMap.get(row.assigned_to);
      const isOverdue=row.due_at&&new Date(row.due_at).getTime()<Date.now()&&["pending","in_progress"].includes(row.status);
      return `<article class="task-row ${isOverdue?"overdue":""}">
        <div class="task-row-main">
          <div class="task-row-top"><span class="task-priority ${esc(row.priority||"medium")}">${esc(priorityLabels[row.priority]||row.priority||"Media")}</span><span>${esc(orgName(row.organization_id))}</span></div>
          <b>${esc(row.title)}</b>
          <p>${esc(row.description||"Sin nota adicional")}</p>
          <div class="task-row-meta"><span>${esc(person?.full_name||"Sin responsable")} · ${esc(person?.department_name||"Sin departamento")}</span><span>${isOverdue?"Vencida · ":""}${dt(row.due_at)}</span></div>
        </div>
        <div class="task-row-actions">
          <select class="execTaskStatus" data-task-id="${row.id}">${Object.entries(statusLabels).map(([v,l])=>`<option value="${v}" ${row.status===v?"selected":""}>${l}</option>`).join("")}</select>
          <button class="btn small execTaskEdit" type="button" data-task-id="${row.id}">Editar</button>
        </div>
      </article>`;
    }).join(""):C.emptyState("No hay tareas con este filtro.","Cambia los filtros o asigna una nueva tarea.");

    document.querySelectorAll(".execTaskStatus").forEach((select)=>select.addEventListener("change",async()=>{
      const row=rows.find((r)=>r.id===select.dataset.taskId); if(!row)return;
      const next=select.value;select.disabled=true;
      const {error}=await C.supabase.from("work_tasks").update({status:next,completed_at:next==="completed"?(row.completed_at||new Date().toISOString()):null}).eq("id",row.id);
      if(error){C.showError(error.message);select.value=row.status;select.disabled=false;return;}
      C.showToast("Estado actualizado.");await C.renderApp();
    }));
    document.querySelectorAll(".execTaskEdit").forEach((button)=>button.addEventListener("click",async()=>{
      const row=rows.find((r)=>r.id===button.dataset.taskId);if(!row)return;
      let assignees=companyAssignees;
      if(row.organization_id!==internalOrg.id){try{assignees=await assigneesForOrg(row.organization_id);}catch{}}
      modal(row,assignees,()=>C.renderApp());
    }));
  };

  ["execStatusFilter","execDepartmentFilter","execAssigneeFilter","execOrgFilter"].forEach((id)=>C.$(id)?.addEventListener("change",draw));
  draw();

  C.$("executiveTaskCreateForm").addEventListener("submit",async(event)=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;button.textContent="Asignando…";
    const due=C.$("execTaskDue").value;
    const {error}=await C.supabase.from("work_tasks").insert({
      organization_id:C.$("execTaskOrg").value,
      title:C.$("execTaskTitle").value.trim(),
      description:C.$("execTaskDescription").value.trim()||null,
      priority:C.$("execTaskPriority").value,
      due_at:due?new Date(due).toISOString():null,
      assigned_to:C.$("execTaskAssignee").value,
      created_by:C.state.session.user.id,
      status:"pending",
      source_type:"manual",
    });
    if(error){C.showError(error.message);button.disabled=false;button.textContent="Asignar tarea";return;}
    C.showToast("Tarea asignada.");await C.renderApp();
  });
}
