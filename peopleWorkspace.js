let C=null;

const candidateStages=[
  ["sourced","Prospecto"],
  ["screening","Screening"],
  ["interview","Entrevista"],
  ["assessment","Evaluación"],
  ["offer","Oferta"],
  ["hired","Contratado"],
  ["on_hold","En pausa"],
  ["rejected","Descartado"],
];
const stageLabel=(value)=>Object.fromEntries(candidateStages)[value]||value||"Prospecto";

function can(permission){return C.state.isAdmin||Boolean(C.hasPermission?.(permission));}
function safeDate(value){return value?C.dateTime(value):"—";}

async function loadDirectory(){
  const {data,error}=await C.supabase.functions.invoke("nexo-people-directory",{body:{}});
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.error||"No pudimos cargar el directorio.");
  return data.people||[];
}

function modalShell(id,title,subtitle,body){
  document.getElementById(id)?.remove();
  const root=document.createElement("div");
  root.id=id;root.className="staff-work-modal";
  root.innerHTML=\`
    <div class="staff-work-backdrop" data-people-close></div>
    <section class="staff-work-dialog">
      <header><div><span class="eyebrow">NEXO · TALENTO HUMANO</span><h2>\${C.esc(title)}</h2><p>\${C.esc(subtitle)}</p></div><button type="button" data-people-close>×</button></header>
      <div class="staff-work-body">\${body}</div>
    </section>\`;
  document.body.appendChild(root);document.body.classList.add("modal-open");
  const close=()=>{root.remove();document.body.classList.remove("modal-open");};
  root.querySelectorAll("[data-people-close]").forEach((el)=>el.addEventListener("click",close));
  return {root,close};
}

function openCandidateModal(departments,roles){
  const {root,close}=modalShell("peopleCandidateModal","Nuevo candidato","Registra un candidato y su proceso de selección.",\`
    <form id="peopleCandidateForm" class="staff-work-form">
      <label>Nombre completo<input id="pcName" required></label>
      <label>Correo<input id="pcEmail" type="email"></label>
      <label>Teléfono<input id="pcPhone"></label>
      <label>Fuente<input id="pcSource" placeholder="Referido, LinkedIn, Instagram..."></label>
      <label>Departamento<select id="pcDepartment"><option value="">Por definir</option>\${departments.map((d)=>\`<option value="\${d.id}">\${C.esc(d.name)}</option>\`).join("")}</select></label>
      <label>Cargo objetivo<select id="pcRole"><option value="">Por definir</option>\${roles.map((r)=>\`<option value="\${r.id}" data-dept="\${r.department_id||""}">\${C.esc(r.name)}</option>\`).join("")}</select></label>
      <label class="wide">Cargo / posición<input id="pcPosition" placeholder="Ej. Web & Catalog Designer"></label>
      <label>Próxima acción<input id="pcNext" type="datetime-local"></label>
      <label>Entrevista<input id="pcInterview" type="datetime-local"></label>
      <label class="wide">Notas<textarea id="pcNotes" rows="5"></textarea></label>
      <div class="staff-work-actions wide"><button class="btn primary" type="submit">Crear candidato</button></div>
    </form>\`);
  const departmentSelect=root.querySelector("#pcDepartment");
  const roleSelect=root.querySelector("#pcRole");
  const filterRoles=()=>{
    const dept=departmentSelect.value;
    [...roleSelect.options].forEach((option)=>{
      if(!option.value)return;
      option.hidden=Boolean(dept&&option.dataset.dept!==dept);
    });
    if(roleSelect.selectedOptions[0]?.hidden)roleSelect.value="";
  };
  departmentSelect.addEventListener("change",filterRoles);
  root.querySelector("#peopleCandidateForm").addEventListener("submit",async(event)=>{
    event.preventDefault();
    const button=event.currentTarget.querySelector('button[type="submit"]');
    button.disabled=true;button.textContent="Guardando…";
    const next=root.querySelector("#pcNext").value;
    const interview=root.querySelector("#pcInterview").value;
    const {error}=await C.supabase.from("nexo_people_candidates").insert({
      full_name:root.querySelector("#pcName").value.trim(),
      email:root.querySelector("#pcEmail").value.trim()||null,
      phone:root.querySelector("#pcPhone").value.trim()||null,
      source:root.querySelector("#pcSource").value.trim()||null,
      target_department_id:departmentSelect.value||null,
      target_role_id:roleSelect.value||null,
      position_title:root.querySelector("#pcPosition").value.trim()||null,
      next_action_at:next?new Date(next).toISOString():null,
      interview_at:interview?new Date(interview).toISOString():null,
      notes:root.querySelector("#pcNotes").value.trim()||null,
      owner_user_id:C.state.session.user.id,
      created_by:C.state.session.user.id,
      stage:"sourced",
    });
    if(error){C.showError(error.message);button.disabled=false;button.textContent="Crear candidato";return;}
    close();C.showToast("Candidato creado.");await C.renderApp();
  });
}

export async function renderPeopleWorkspace(context){
  C=context;
  const [directory,{data:candidates,error:candidateError},{data:onboarding,error:onboardingError},{data:departments,error:departmentError},{data:roles,error:roleError}]=await Promise.all([
    loadDirectory(),
    C.supabase.from("nexo_people_candidates").select("*").order("created_at",{ascending:false}).limit(1000),
    C.supabase.from("nexo_people_onboarding").select("*").order("created_at",{ascending:false}).limit(1000),
    C.supabase.from("nexo_departments").select("id,department_key,name,active,planned").eq("active",true).order("sort_order"),
    C.supabase.from("nexo_team_roles").select("id,role_key,name,department_id,active,assignable,planned").eq("active",true).eq("assignable",true).order("name"),
  ]);
  if(candidateError)throw candidateError;
  if(onboardingError)throw onboardingError;
  if(departmentError)throw departmentError;
  if(roleError)throw roleError;

  const canRecruit=can("people.recruiting.write");
  const canOnboard=can("people.onboarding.write");
  const people=directory||[];
  const rows=candidates||[];
  const onboardingRows=onboarding||[];
  const onboardingMap=new Map(onboardingRows.map((row)=>[row.user_id,row]));
  const activeCandidates=rows.filter((r)=>!["hired","rejected"].includes(r.stage));
  const interviews=rows.filter((r)=>r.stage==="interview"||r.interview_at&&new Date(r.interview_at).getTime()>=Date.now());
  const offers=rows.filter((r)=>r.stage==="offer");
  const pendingOnboarding=onboardingRows.filter((r)=>r.overall_status!=="complete");

  C.$("content").innerHTML=\`
    <section class="staff-page-intro staff-page-intro-actions">
      <div><span class="eyebrow">NEXO · TALENTO HUMANO</span><h2>People & Culture</h2><p>Reclutamiento, onboarding interno, directorio y seguimiento del equipo. Sin acceso a clientes o finanzas por defecto.</p></div>
      \${canRecruit?'<button id="peopleNewCandidate" class="btn primary" type="button">+ Nuevo candidato</button>':""}
    </section>

    <div class="staff-kpi-grid">
      <article><span>Equipo activo</span><b>\${people.filter((p)=>p.status==="active").length}</b><small>Colaboradores internos</small></article>
      <article><span>Candidatos activos</span><b>\${activeCandidates.length}</b><small>Procesos abiertos</small></article>
      <article><span>Entrevistas</span><b>\${interviews.length}</b><small>En etapa / programadas</small></article>
      <article class="\${pendingOnboarding.length?"risk":""}"><span>Onboarding pendiente</span><b>\${pendingOnboarding.length}</b><small>Colaboradores por completar</small></article>
    </div>

    <section class="card">
      <div class="card-head"><div><h2>Pipeline de talento</h2><p>Sourcing → entrevista → oferta → contratación</p></div><span class="count">\${rows.length}</span></div>
      <div class="people-pipeline">
        \${candidateStages.filter(([key])=>!["rejected","on_hold"].includes(key)).map(([stage,label])=>{
          const stageRows=rows.filter((r)=>r.stage===stage);
          return \`<div class="people-pipeline-column">
            <header><b>\${C.esc(label)}</b><span>\${stageRows.length}</span></header>
            <div>\${stageRows.length?stageRows.map((row)=>\`
              <article class="people-candidate-card">
                <span>\${C.esc(row.position_title||"Posición por definir")}</span>
                <b>\${C.esc(row.full_name)}</b>
                <small>\${C.esc(row.source||"Fuente no registrada")}</small>
                <div>Próxima acción: \${safeDate(row.next_action_at)}</div>
                \${canRecruit?\`<select class="people-stage-select" data-candidate-id="\${row.id}">\${candidateStages.map(([value,name])=>\`<option value="\${value}" \${row.stage===value?"selected":""}>\${C.esc(name)}</option>\`).join("")}</select>\`:""}
              </article>\`).join(""):'<div class="staff-sales-empty">Sin candidatos</div>'}</div>
          </div>\`;
        }).join("")}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Directorio NEXO</h2><p>Personas, departamento, cargo y onboarding</p></div><span class="count">\${people.length}</span></div>
      <div class="table-wrap">
        <table class="team-table people-directory-table">
          <thead><tr><th>Persona</th><th>Departamento</th><th>Cargo</th><th>Estado</th><th>Onboarding</th><th></th></tr></thead>
          <tbody>\${people.map((person)=>{
            const ob=onboardingMap.get(person.user_id);
            return \`<tr>
              <td><div class="team-person"><span class="team-person-avatar">\${C.esc((person.full_name||person.contact_email||"NX").split(/\\s+/).slice(0,2).map((x)=>x[0]?.toUpperCase()||"").join("")||"NX")}</span><div><b>\${C.esc(person.full_name||"Usuario NEXO")}</b><span>\${C.esc(person.contact_email||"—")}</span>\${person.phone?\`<small>\${C.esc(person.phone)}</small>\`:""}</div></div></td>
              <td><span class="team-role-department">\${C.esc(person.department_name||"—")}</span></td>
              <td><span class="team-role-pill">\${C.esc(person.role_name||person.job_title||"—")}</span></td>
              <td><span class="team-status \${person.status==="active"?"active":person.status==="invited"?"invited":"inactive"}">\${C.esc(person.status==="active"?"Activo":person.status==="invited"?"Invitado":"Inactivo")}</span></td>
              <td>\${ob?\`<span class="people-onboarding-status \${ob.overall_status==="complete"?"done":"active"}">\${C.esc(ob.overall_status)}</span>\`:'<span class="muted">Sin onboarding</span>'}</td>
              <td>\${canOnboard&&!ob&&person.status!=="inactive"?\`<button class="btn small people-start-onboarding" data-user-id="\${person.user_id}" type="button">Iniciar</button>\`:""}</td>
            </tr>\`;
          }).join("")}</tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><div><h2>Onboarding interno</h2><p>Documentos, accesos, herramientas, formación y claridad de rol</p></div><span class="count">\${onboardingRows.length}</span></div>
      <div class="people-onboarding-grid">
        \${onboardingRows.length?onboardingRows.map((row)=>{
          const person=people.find((p)=>p.user_id===row.user_id);
          const fields=[["documents_status","Documentos"],["access_status","Accesos"],["tools_status","Herramientas"],["training_status","Formación"],["role_clarity_status","Rol claro"]];
          return \`<article class="card people-onboarding-card">
            <div><b>\${C.esc(person?.full_name||"Colaborador")}</b><small>\${C.esc(person?.role_name||"Equipo NEXO")} · \${C.esc(person?.department_name||"")}</small></div>
            <div class="people-onboarding-steps">\${fields.map(([field,label])=>\`<label><span>\${label}</span>\${canOnboard?\`<select class="people-onboarding-step" data-onboarding-id="\${row.id}" data-field="\${field}"><option value="pending" \${row[field]==="pending"?"selected":""}>Pendiente</option><option value="done" \${row[field]==="done"?"selected":""}>Listo</option></select>\`:\`<b>\${row[field]==="done"?"Listo":"Pendiente"}</b>\`}</label>\`).join("")}</div>
          </article>\`;
        }).join(""):C.emptyState("Todavía no hay onboarding internos.","Talento Humano puede iniciar el proceso desde el directorio.")}
      </div>
    </section>\`;

  C.$("peopleNewCandidate")?.addEventListener("click",()=>openCandidateModal(departments||[],roles||[]));

  document.querySelectorAll(".people-stage-select").forEach((select)=>select.addEventListener("change",async()=>{
    const id=select.dataset.candidateId;
    const {error}=await C.supabase.from("nexo_people_candidates").update({stage:select.value}).eq("id",id);
    if(error){C.showError(error.message);return;}
    C.showToast("Candidato actualizado.");await C.renderApp();
  }));

  document.querySelectorAll(".people-start-onboarding").forEach((button)=>button.addEventListener("click",async()=>{
    button.disabled=true;
    const {error}=await C.supabase.from("nexo_people_onboarding").insert({
      user_id:button.dataset.userId,
      owner_user_id:C.state.session.user.id,
      start_date:new Date().toISOString().slice(0,10),
      overall_status:"in_progress",
      created_by:C.state.session.user.id,
      updated_by:C.state.session.user.id,
    });
    if(error){C.showError(error.message);button.disabled=false;return;}
    C.showToast("Onboarding iniciado.");await C.renderApp();
  }));

  document.querySelectorAll(".people-onboarding-step").forEach((select)=>select.addEventListener("change",async()=>{
    const id=select.dataset.onboardingId;
    const field=select.dataset.field;
    const row=onboardingRows.find((r)=>r.id===id);
    if(!row)return;
    const projected={...row,[field]:select.value};
    const allDone=["documents_status","access_status","tools_status","training_status","role_clarity_status"].every((key)=>projected[key]==="done");
    const {error}=await C.supabase.from("nexo_people_onboarding").update({
      [field]:select.value,
      overall_status:allDone?"complete":"in_progress",
      updated_by:C.state.session.user.id,
    }).eq("id",id);
    if(error){C.showError(error.message);return;}
    C.showToast("Onboarding actualizado.");await C.renderApp();
  }));
}
