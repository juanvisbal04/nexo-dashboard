import { openTaskContext } from "./taskContext.js?v=20261013-work2";
import { openProspectEditorFromGrowth } from "./crm.js?v=20261013-finance1";
let C;
const stages=[['prospecto','Prospecto'],['demo','Demo'],['propuesta','Propuesta'],['cliente','Cliente'],['implementacion','Implementación'],['activo','Activo'],['perdido','Perdido']];
const statuses={pending:'Pendiente',in_progress:'En progreso',completed:'Completada',cancelled:'Cancelada'};
const esc=v=>C.esc(v);
const can=p=>C.hasPermission(p);
const writable=()=>can('crm.all.write')||can('crm.assigned.write');
const date=v=>v?C.dateTime(v):'Sin fecha';
const localDate=v=>{if(!v)return '';const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const amount=v=>v?new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(v)):'Por definir';
let leads=[],tasks=[],activities=[],people=[],internalOrg,view='pipeline',search='',owner='',stage='';
const person=id=>people.find(p=>p.id===id)?.full_name||people.find(p=>p.id===id)?.contact_email||(id?'Responsable asignado':'Sin asignar');
const ownTasks=id=>tasks.filter(t=>t.source_id===id);
const openTasks=id=>ownTasks(id).filter(t=>['pending','in_progress'].includes(t.status));
const stageName=v=>Object.fromEntries(stages)[v]||v;
const activeLead=r=>!['activo','perdido'].includes(r.stage);
function leadAlerts(r){
  if(!activeLead(r))return [];
  const flags=[],now=Date.now();
  if(!r.next_action_at)flags.push('Sin próxima acción');
  else if(new Date(r.next_action_at).getTime()<now)flags.push('Seguimiento vencido');
  const lastTouch=Math.max(0,...activities.filter(a=>a.demo_request_id===r.id).map(a=>new Date(a.created_at).getTime()||0));
  const latest=Math.max(new Date(r.updated_at||r.created_at).getTime()||0,lastTouch);
  if(latest&&now-latest>=7*86400000)flags.push('Sin actividad reciente (+7 días)');
  return flags;
}

export async function renderSalesWorkspace(context){
  C=context;
  if(C.state.salesCrmView){view=C.state.salesCrmView;C.state.salesCrmView=null;}
  internalOrg=C.state.organizations.find(o=>o.name==='NEXO Internal');
  if(!internalOrg)throw new Error('NEXO Internal no está disponible.');
  const results=await Promise.all([
    C.supabase.from('demo_requests').select('*').is('archived_at',null).order('created_at',{ascending:false}).limit(1000),
    C.supabase.from('work_tasks').select('*').eq('organization_id',internalOrg.id).eq('source_type','crm_lead').order('due_at',{ascending:true,nullsFirst:false}).limit(2000),
    C.supabase.from('crm_activities').select('*').order('created_at',{ascending:false}).limit(1000),
  ]);
  for(const r of results)if(r.error)throw r.error;
  [leads,tasks,activities]=results.map(r=>r.data||[]);
  people=[{id:C.state.session.user.id,full_name:C.state.profile?.full_name||'Yo'}];
  if(C.state.isAdmin||can('tasks.team.write')||can('tasks.team.read')){
    const {data,error}=await C.supabase.functions.invoke('task-assignees',{body:{organization_id:internalOrg.id}});
    if(error||!data?.ok)throw new Error(error?.message||data?.error||'No pudimos cargar el equipo.');
    // Only people with a commercial role can open assigned leads under existing RLS.
    people=(data.assignees||[]).filter(p=>['sales','executive'].includes(p.department_key));
    if(!people.some(p=>p.id===C.state.session.user.id))people.push({id:C.state.session.user.id,full_name:'Yo'});
  }
  C.$('content').innerHTML=`<section class="crm-workspace-toolbar"><p>Gestiona oportunidades y seguimientos con tu equipo.</p>${writable()?'<button class="btn primary" id="crmAddLead">+ Agregar lead</button>':''}</section>
  <div class="crm-hub-tabs" role="tablist">${[['pipeline','Pipeline'],['attention','Requieren seguimiento'],['leads','Leads y contactos'],['tasks','Tareas comerciales'],['activity','Actividad']].map(([v,l])=>`<button role="tab" data-hub-view="${v}" aria-selected="${view===v}">${l}</button>`).join('')}</div>
  <section class="card"><div class="crm-hub-filters"><input id="hubSearch" type="search" placeholder="Buscar negocio, contacto, teléfono o correo" value="${esc(search)}" aria-label="Buscar lead"><select id="hubOwner" aria-label="Responsable"><option value="">Todos los responsables</option><option value="unassigned" ${owner==='unassigned'?'selected':''}>Sin asignar</option>${people.map(p=>`<option value="${esc(p.id)}" ${owner===p.id?'selected':''}>${esc(p.full_name||p.contact_email)}</option>`).join('')}</select><select id="hubStage" aria-label="Etapa"><option value="">Todas las etapas</option>${stages.map(([v,l])=>`<option value="${v}" ${stage===v?'selected':''}>${l}</option>`).join('')}</select></div><div id="hubBody"></div></section>`;
  C.$('crmAddLead')?.addEventListener('click',()=>editor());
  C.$('hubSearch').addEventListener('input',e=>{search=e.target.value;draw();});
  C.$('hubOwner').addEventListener('change',e=>{owner=e.target.value;draw();});
  C.$('hubStage').addEventListener('change',e=>{stage=e.target.value;draw();});
  document.querySelectorAll('[data-hub-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.hubView;document.querySelectorAll('[data-hub-view]').forEach(t=>t.setAttribute('aria-selected',t===b));draw();}));
  draw();
  if(C.state.crmLeadId){const id=C.state.crmLeadId;C.state.crmLeadId=null;const lead=leads.find(r=>r.id===id);if(lead)editor(lead);else C.showToast('El lead ya no está disponible en tu acceso actual.');}
}
function filtered(){return leads.filter(r=>(!owner||(owner==='unassigned'?!r.owner_user_id:r.owner_user_id===owner))&&(!stage||r.stage===stage)&&[r.full_name,r.business_name,r.phone,r.email,r.industry].join(' ').toLowerCase().includes(search.trim().toLowerCase()));}
const movingLeads=new Set();
function card(r){return `<article class="staff-sales-card crm-board-deal" data-deal-id="${esc(r.id)}" draggable="${writable()&&!movingLeads.has(r.id)}">
  <div class="crm-deal-heading"><button class="crm-hub-open" data-open-lead="${esc(r.id)}"><b>${esc(r.business_name)}</b><span>${esc(r.full_name)}</span></button>${writable()?`<button class="crm-drag-grip" data-drag-lead="${esc(r.id)}" type="button" aria-label="Arrastrar ${esc(r.business_name)}" title="Arrastrar a otra etapa">⠿</button>`:''}</div>
  <small class="crm-deal-owner">${esc(person(r.owner_user_id))}</small><strong class="crm-deal-value">${esc(amount(r.expected_mrr))}${r.expected_mrr?' / mes':''}</strong>
  <div class="crm-deal-next">${r.next_action_at?'Próxima acción: '+esc(date(r.next_action_at)):'Sin próxima acción'}</div>${leadAlerts(r).length?'<div class="crm-alert-tags">'+leadAlerts(r).map(label=>'<span class="pill">'+esc(label)+'</span>').join('')+'</div>':''}<small>${openTasks(r.id).length} tareas pendientes</small>
  ${writable()?`<label class="crm-deal-move">Mover a etapa<select data-move-lead="${esc(r.id)}" aria-label="Etapa de ${esc(r.business_name)}" ${movingLeads.has(r.id)?'disabled':''}>${stages.map(([v,l])=>`<option value="${v}" ${r.stage===v?'selected':''}>${l}</option>`).join('')}</select></label>`:''}
</article>`;}
function taskRows(rows){return rows.map(t=>{const lead=leads.find(r=>r.id===t.source_id);return `<article class="task-row"><div class="task-row-main"><b>${esc(t.title)}</b><p>${esc(t.description||'')}</p>${lead?`<button class="crm-hub-open" data-open-lead="${esc(lead.id)}">${esc(lead.business_name)}</button>`:'<small>Lead fuera de tu acceso actual</small>'}<div class="task-row-meta"><span>${esc(person(t.assigned_to))}</span><span>${esc(date(t.due_at))}</span></div></div><div class="task-row-actions"><button class="btn small" type="button" data-task-context="${esc(t.id)}">Detalle</button>${(can('tasks.team.write')||(t.assigned_to===C.state.session.user.id&&can('tasks.self.write')))?`<select data-task-status="${esc(t.id)}" aria-label="Estado de tarea">${Object.entries(statuses).map(([v,l])=>`<option value="${v}" ${t.status===v?'selected':''}>${l}</option>`).join('')}</select>`:esc(statuses[t.status])}</div></article>`;}).join('')||C.emptyState('Sin tareas comerciales.','Agrega una tarea desde la ficha de un lead.');}
function activityRows(rows){return rows.map(a=>`<article class="crm-hub-activity"><b>${esc(a.title)}</b><small>${esc(date(a.created_at))}</small><p>${esc(a.details||'')}</p></article>`).join('')||C.emptyState('Sin actividad registrada.','Las notas y seguimientos aparecerán aquí.');}
function draw(){
  const rows=filtered(),ids=new Set(rows.map(r=>r.id));
  if(view==='pipeline')C.$('hubBody').innerHTML=`<div class="crm-board-caption"><span>${rows.length} oportunidades · ${writable()?'Arrastra las tarjetas para cambiar de etapa':'Vista de oportunidades'}</span><span class="crm-board-status" role="status" aria-live="polite">${movingLeads.size?'Guardando cambio…':''}</span></div><div class="staff-sales-pipeline crm-fit-board">${stages.map(([v,l])=>`<section class="staff-sales-column crm-board-column" data-drop-stage="${v}" aria-label="Etapa ${l}"><header><b>${l}</b><span>${rows.filter(r=>r.stage===v).length}</span></header><div class="crm-stage-deals">${rows.filter(r=>r.stage===v).map(card).join('')||'<div class="staff-sales-empty">Sin oportunidades</div>'}</div></section>`).join('')}</div>`;
  else if(view==='attention'){
    const flagged=rows.map(r=>({lead:r,flags:leadAlerts(r)})).filter(item=>item.flags.length)
      .sort((a,b)=>(b.flags.includes('Seguimiento vencido')?1:0)-(a.flags.includes('Seguimiento vencido')?1:0));
    C.$('hubBody').innerHTML=`<div class="crm-board-caption"><span>${flagged.length} oportunidades requieren seguimiento · ${flagged.filter(x=>x.flags.includes('Seguimiento vencido')).length} vencidas</span></div>
      <div class="crm-hub-table"><table><thead><tr><th>Negocio / contacto</th><th>Alertas</th><th>Responsable</th><th>Próxima acción</th><th>Etapa</th></tr></thead><tbody>${flagged.map(({lead:r,flags})=>`<tr><td><button class="crm-hub-open" data-open-lead="${esc(r.id)}"><b>${esc(r.business_name)}</b><span>${esc(r.full_name)}</span></button></td><td>${flags.map(label=>`<span class="pill">${esc(label)}</span>`).join(' ')}</td><td>${esc(person(r.owner_user_id))}</td><td>${esc(date(r.next_action_at))}</td><td>${esc(stageName(r.stage))}</td></tr>`).join('')}</tbody></table>${flagged.length?'':C.emptyState('No hay oportunidades pendientes de seguimiento.','Todo al día con estos filtros.')}</div>`;
  }
  else if(view==='leads')C.$('hubBody').innerHTML=`<div class="crm-hub-table"><table><thead><tr><th>Negocio / contacto</th><th>Correo / WhatsApp</th><th>Etapa</th><th>Responsable</th><th>Próxima acción</th><th>Tareas abiertas</th></tr></thead><tbody>${rows.map(r=>`<tr><td><button class="crm-hub-open" data-open-lead="${esc(r.id)}"><b>${esc(r.business_name)}</b><span>${esc(r.full_name)}</span></button></td><td>${esc(r.email||'—')}<br>${esc(r.phone||'—')}</td><td>${esc(stageName(r.stage))}</td><td>${esc(person(r.owner_user_id))}</td><td>${esc(date(r.next_action_at))}</td><td>${openTasks(r.id).length}</td></tr>`).join('')}</tbody></table>${rows.length?'':C.emptyState('No hay leads con estos filtros.','Agrega un lead o cambia los filtros.')}</div>`;
  else if(view==='tasks')C.$('hubBody').innerHTML=taskRows(tasks.filter(t=>ids.has(t.source_id)));
  else C.$('hubBody').innerHTML=activityRows(activities.filter(a=>ids.has(a.demo_request_id)).slice(0,100));
  bind(C.$('hubBody'));
  bindBoard(C.$('hubBody'));
}
function bind(root){
  root.querySelectorAll('[data-task-context]').forEach(b=>b.addEventListener('click',()=>openTaskContext(C,tasks.find(t=>t.id===b.dataset.taskContext))));
  root.querySelectorAll('[data-open-lead]').forEach(b=>b.addEventListener('click',()=>editor(leads.find(r=>r.id===b.dataset.openLead))));
  root.querySelectorAll('[data-task-status]').forEach(s=>s.addEventListener('change',async()=>{
    const t=tasks.find(t=>t.id===s.dataset.taskStatus),next=s.value;s.disabled=true;
    const {data,error}=await C.supabase.from('work_tasks').update({status:next,completed_at:next==='completed'?new Date().toISOString():null}).eq('id',t.id).select('id').single();
    if(error||!data){C.showError(error?.message||'No se pudo actualizar la tarea.');s.value=t.status;s.disabled=false;return;}
    t.status=next;C.showToast('Tarea actualizada.');s.disabled=false;
  }));
}
async function moveLead(id,nextStage){
  const lead=leads.find(r=>r.id===id);
  if(!writable()||!lead||!stages.some(([v])=>v===nextStage)||lead.stage===nextStage||movingLeads.has(id))return;
  const previous=lead.stage;movingLeads.add(id);draw();
  try{
    const {data,error}=await C.supabase.from('demo_requests').update({stage:nextStage,updated_at:new Date().toISOString()}).eq('id',id).eq('stage',previous).select('id').single();
    if(error||!data)throw new Error(error?.message||'La oportunidad cambió o no tienes permiso. Actualiza el CRM e inténtalo de nuevo.');
    lead.stage=nextStage;
    const {error:logError}=await C.supabase.from('crm_activities').insert({demo_request_id:id,activity_type:'status_change',title:`Etapa: ${stageName(previous)} → ${stageName(nextStage)}`,created_by:C.state.session.user.id});
    if(!logError)activities.unshift({demo_request_id:id,activity_type:'status_change',title:`Etapa: ${stageName(previous)} → ${stageName(nextStage)}`,created_at:new Date().toISOString()});
    C.showToast(logError?'Etapa guardada. No se pudo registrar el historial.':`Oportunidad movida a ${stageName(nextStage)}.`);
  }catch(error){C.showError(error.message||'No se pudo cambiar la etapa.');}
  finally{movingLeads.delete(id);draw();}
}
function bindBoard(root){
  if(!writable())return;
  root.querySelectorAll('[data-move-lead]').forEach(select=>select.addEventListener('change',()=>moveLead(select.dataset.moveLead,select.value)));
  let draggedId=null;
  const clear=()=>{root.querySelectorAll('.crm-drop-active,.crm-deal-dragging').forEach(el=>el.classList.remove('crm-drop-active','crm-deal-dragging'));document.body.classList.remove('crm-board-dragging');draggedId=null;};
  root.querySelectorAll('[data-deal-id]').forEach(card=>{
    card.addEventListener('dragstart',event=>{
      if(movingLeads.has(card.dataset.dealId)){event.preventDefault();return;}
      draggedId=card.dataset.dealId;event.dataTransfer.setData('text/plain',draggedId);event.dataTransfer.effectAllowed='move';card.classList.add('crm-deal-dragging');document.body.classList.add('crm-board-dragging');
    });card.addEventListener('dragend',clear);
  });
  root.querySelectorAll('[data-drop-stage]').forEach(column=>{
    column.addEventListener('dragover',event=>{if(!draggedId)return;event.preventDefault();event.dataTransfer.dropEffect='move';root.querySelectorAll('.crm-drop-active').forEach(el=>el.classList.remove('crm-drop-active'));column.classList.add('crm-drop-active');});
    column.addEventListener('dragleave',event=>{if(!column.contains(event.relatedTarget))column.classList.remove('crm-drop-active');});
    column.addEventListener('drop',event=>{if(!draggedId)return;event.preventDefault();const id=draggedId;clear();moveLead(id,column.dataset.dropStage);});
  });
  // Pointer handle also supports touch and pen without relying on native HTML drag.
  root.querySelectorAll('[data-drag-lead]').forEach(grip=>{
    grip.addEventListener('dragstart',event=>event.preventDefault());
    grip.addEventListener('pointerdown',event=>{
      if(event.button!==0||movingLeads.has(grip.dataset.dragLead))return;
      event.preventDefault();event.stopPropagation();
      const id=grip.dataset.dragLead,card=grip.closest('[data-deal-id]'),board=root.querySelector('.crm-fit-board');
      const ghost=card.cloneNode(true);ghost.classList.add('crm-drag-ghost');ghost.style.width=card.getBoundingClientRect().width+'px';ghost.setAttribute('aria-hidden','true');ghost.querySelectorAll('button,select').forEach(el=>el.tabIndex=-1);document.body.appendChild(ghost);
      card.classList.add('crm-deal-dragging');document.body.classList.add('crm-board-dragging');grip.setPointerCapture(event.pointerId);
      let target=null;
      const track=e=>{ghost.style.left=(e.clientX+12)+'px';ghost.style.top=(e.clientY+12)+'px';const rect=board.getBoundingClientRect();if(e.clientX<rect.left+40)board.scrollLeft-=20;else if(e.clientX>rect.right-40)board.scrollLeft+=20;root.querySelectorAll('.crm-drop-active').forEach(el=>el.classList.remove('crm-drop-active'));target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-drop-stage]');if(target&&root.contains(target))target.classList.add('crm-drop-active');else target=null;};
      const cleanup=()=>{ghost.remove();clear();grip.removeEventListener('pointermove',track);grip.removeEventListener('pointerup',finish);grip.removeEventListener('pointercancel',cancel);document.removeEventListener('keydown',escape);if(grip.hasPointerCapture(event.pointerId))grip.releasePointerCapture(event.pointerId);};
      const finish=e=>{track(e);const next=target?.dataset.dropStage;cleanup();if(next)moveLead(id,next);};const cancel=()=>cleanup();const escape=e=>{if(e.key==='Escape')cleanup();};
      grip.addEventListener('pointermove',track);grip.addEventListener('pointerup',finish);grip.addEventListener('pointercancel',cancel);document.addEventListener('keydown',escape);track(event);
    });
    grip.addEventListener('click',()=>grip.closest('[data-deal-id]').querySelector('[data-move-lead]')?.focus());
  });
}
function editor(lead){
  document.getElementById('salesCrmModal')?.remove();
  const r=lead||{},root=document.createElement('div');root.id='salesCrmModal';root.className='staff-work-modal';
  const canAssign=can('crm.all.write'),canTask=can('tasks.self.write')||can('tasks.team.write');
  const options=(selected,assign=true)=>people.filter(p=>assign||p.id===C.state.session.user.id).map(p=>`<option value="${esc(p.id)}" ${selected===p.id?'selected':''}>${esc(p.full_name||p.contact_email)}</option>`).join('');
  root.innerHTML=`<div class="staff-work-backdrop" data-close></div><section class="staff-work-dialog" role="dialog" aria-modal="true" aria-label="Ficha del lead"><header><div><span class="eyebrow">CRM · ${lead?'FICHA DEL LEAD':'NUEVO LEAD'}</span><h2>${esc(r.business_name||'Agregar lead')}</h2></div><button data-close aria-label="Cerrar">×</button></header><div class="staff-work-body"><form id="hubLeadForm" class="staff-work-form">
  ${[['full_name','Contacto'],['business_name','Negocio'],['email','Correo'],['phone','WhatsApp'],['industry','Sector']].map(([k,l])=>`<label>${l}<input name="${k}" value="${esc(r[k]||'')}" type="${k==='email'?'email':'text'}" ${['full_name','business_name'].includes(k)?'required':''} ${!writable()?'disabled':''}></label>`).join('')}
  <label>Responsable<select name="owner_user_id" ${!canAssign?'disabled':''}><option value="">Sin asignar</option>${r.owner_user_id&&!people.some(p=>p.id===r.owner_user_id)?`<option value="${esc(r.owner_user_id)}" selected>Responsable actual</option>`:''}${options(r.owner_user_id||(!lead?C.state.session.user.id:''))}</select></label>
  <label>Etapa<select name="stage" ${!writable()?'disabled':''}>${stages.map(([v,l])=>`<option value="${v}" ${(r.stage||'prospecto')===v?'selected':''}>${l}</option>`).join('')}</select></label>
  <label>MRR esperado<input name="expected_mrr" type="number" min="0" step="1000" value="${r.expected_mrr??''}" ${!writable()?'disabled':''}></label>
  <label>Próxima acción<input name="next_action_at" type="datetime-local" value="${localDate(r.next_action_at)}" ${!writable()?'disabled':''}></label><label>Motivo perdido<input name="lost_reason" value="${esc(r.lost_reason||'')}" ${!writable()?'disabled':''}></label>
  <label class="wide">Notas<textarea name="crm_notes" ${!writable()?'disabled':''}>${esc(r.crm_notes||r.message||'')}</textarea></label>${writable()?'<div class="wide"><button class="btn primary" type="submit">Guardar lead</button></div>':''}</form>
  ${lead?`${C.state.isAdmin&&!r.organization_id?'<button class="btn" id="hubConvertClient" type="button">Convertir a cliente</button>':''}<h3>Tareas vinculadas</h3><div id="hubLeadTasks">${taskRows(ownTasks(r.id))}</div>${canTask?`<form id="hubTaskForm" class="staff-work-form"><label class="wide">Nueva tarea<input name="title" placeholder="Ej. Llamar para coordinar demo" required></label><label>Responsable<select name="assigned_to" required>${options(can('tasks.team.write')?r.owner_user_id:C.state.session.user.id,can('tasks.team.write'))}</select></label><label>Fecha límite<input name="due_at" type="datetime-local"></label><label>Prioridad<select name="priority"><option value="medium">Media</option><option value="high">Alta</option><option value="urgent">Urgente</option><option value="low">Baja</option></select></label><label class="wide">Detalle<textarea name="description"></textarea></label><button class="btn" type="submit">Asignar tarea</button></form>`:''}<h3>Historial del lead</h3>${writable()?'<form id="hubNoteForm" class="staff-work-form"><label>Tipo<select name="activity_type"><option value="note">Nota</option><option value="call">Llamada</option><option value="followup">Seguimiento</option><option value="demo">Demo</option><option value="proposal">Propuesta</option></select></label><label>Título<input name="title" required></label><label class="wide">Detalle<textarea name="details"></textarea></label><button class="btn" type="submit">Registrar actividad</button></form>':''}<div>${activityRows(activities.filter(a=>a.demo_request_id===r.id))}</div>`:''}</div></section>`;
  document.body.appendChild(root);document.body.classList.add('modal-open');
  const close=()=>{root.remove();document.body.classList.remove('modal-open');};root.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',close));
  bind(root);root.querySelector('input')?.focus();
  root.querySelector('#hubConvertClient')?.addEventListener('click',async()=>{const {data,error}=await C.supabase.from('nexo_plans').select('*').order('sort_order');if(error)return C.showError(error.message);close();await openProspectEditorFromGrowth(C,r,data||[]);});
  const submit=(id,fn)=>root.querySelector('#'+id)?.addEventListener('submit',async e=>{e.preventDefault();const b=e.currentTarget.querySelector('button[type="submit"]');b.disabled=true;try{await fn(e.currentTarget);}catch(error){C.showError(error.message);}finally{b.disabled=false;}});
  submit('hubLeadForm',async form=>{
    const f=form.elements,payload={};for(const k of ['full_name','business_name','email','phone','industry','lost_reason','crm_notes'])payload[k]=f[k].value.trim()||null;
    if(!payload.full_name||!payload.business_name)throw new Error('Completa contacto y negocio.');
    payload.stage=f.stage.value;payload.expected_mrr=f.expected_mrr.value?Number(f.expected_mrr.value):null;
    payload.next_action_at=f.next_action_at.value?new Date(f.next_action_at.value).toISOString():null;
    payload.owner_user_id=canAssign?(f.owner_user_id.value||null):(r.owner_user_id||C.state.session.user.id);
    payload.updated_at=new Date().toISOString();
    if(!lead){payload.source='internal_sales';payload.status='Nuevo';}
    const req=lead?C.supabase.from('demo_requests').update(payload).eq('id',r.id):C.supabase.from('demo_requests').insert(payload);
    const {data,error}=await req.select('id').single();if(error||!data)throw error||new Error('No se guardó el lead.');
    let activityWarning=false;
    if(!lead||r.stage!==payload.stage||r.owner_user_id!==payload.owner_user_id){
      const changes=!lead?'Lead creado manualmente':[r.stage!==payload.stage?`Etapa: ${stageName(r.stage)} → ${stageName(payload.stage)}`:'',r.owner_user_id!==payload.owner_user_id?`Responsable: ${person(r.owner_user_id)} → ${person(payload.owner_user_id)}`:''].filter(Boolean).join(' · ');
      const {error:activityError}=await C.supabase.from('crm_activities').insert({demo_request_id:data.id,activity_type:lead?'status_change':'note',title:changes,created_by:C.state.session.user.id});activityWarning=Boolean(activityError);
    }
    close();C.showToast(activityWarning?'Lead guardado. No se pudo registrar el cambio en el historial.':'Lead guardado.');await C.renderApp();
  });
  submit('hubTaskForm',async form=>{
    const f=form.elements,title=f.title.value.trim();if(!title)throw new Error('Escribe el título de la tarea.');
    const {data,error}=await C.supabase.from('work_tasks').insert({organization_id:internalOrg.id,source_type:'crm_lead',source_id:r.id,title,description:f.description.value.trim()||null,assigned_to:f.assigned_to.value,created_by:C.state.session.user.id,priority:f.priority.value,status:'pending',due_at:f.due_at.value?new Date(f.due_at.value).toISOString():null}).select('id').single();
    if(error||!data)throw error||new Error('No se creó la tarea.');close();C.showToast('Tarea asignada al lead.');await C.renderApp();editor(leads.find(l=>l.id===r.id));
  });
  submit('hubNoteForm',async form=>{
    const f=form.elements,title=f.title.value.trim();if(!title)throw new Error('Escribe un título.');
    const {error}=await C.supabase.from('crm_activities').insert({demo_request_id:r.id,activity_type:f.activity_type.value,title,details:f.details.value.trim()||null,created_by:C.state.session.user.id});if(error)throw error;
    close();C.showToast('Actividad registrada.');await C.renderApp();editor(leads.find(l=>l.id===r.id));
  });
}
