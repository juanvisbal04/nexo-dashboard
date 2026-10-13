import { serviceLinesLabel } from './serviceLines.js?v=20261013-lines2';
import { openTaskContext } from './taskContext.js?v=20261013-work2';
// This collaborator card uses ordinary queries and inherits each table's RLS.
export async function openClientWorkspace(C,org){
  if(!org)return;
  document.getElementById('clientWorkspaceModal')?.remove();
  const root=document.createElement('div');root.id='clientWorkspaceModal';root.className='staff-work-modal';
  root.innerHTML=`<div class="staff-work-backdrop" data-client-close></div><section class="staff-work-dialog" role="dialog" aria-modal="true" aria-label="Ficha del cliente"><header><div><span class="eyebrow">${C.esc(serviceLinesLabel(org.service_lines))}</span><h2>${C.esc(org.name)}</h2><p>${C.esc(org.sector||'Cliente NEXO')}</p></div><button type="button" data-client-close aria-label="Cerrar">×</button></header><div class="staff-work-body" data-client-body>Cargando ficha…</div></section>`;
  const previous=document.activeElement;
  const close=()=>{root.remove();document.removeEventListener('keydown',onKey);if(!document.querySelector('.staff-work-modal,.nexo-drawer:not(.hidden)'))document.body.classList.remove('modal-open');previous?.focus();};
  const onKey=e=>{if(e.key==='Escape')close();};
  root.querySelectorAll('[data-client-close]').forEach(b=>b.addEventListener('click',close));document.addEventListener('keydown',onKey);
  document.body.appendChild(root);document.body.classList.add('modal-open');root.querySelector('button[data-client-close]').focus();
  const query=(table)=>C.supabase.from(table).select('*').eq('organization_id',org.id);
  const noData=Promise.resolve({data:[]});
  try{
    const [taskR,projectR,contactR,historyR]=await Promise.all([
      query('work_tasks').order('created_at',{ascending:false}).limit(100),
      C.hasPermission?.('projects.department.read')?query('nexo_projects').order('updated_at',{ascending:false}).limit(100):noData,
      C.hasPermission?.('client_data.assigned.read')?query('contacts').order('created_at',{ascending:false}).limit(100):noData,
      C.hasPermission?.('crm.assigned.read')||C.hasPermission?.('crm.all.read')?query('crm_activities').order('created_at',{ascending:false}).limit(20):noData
    ]);
    if(!root.isConnected)return;
    const data=r=>r.error?[]:r.data||[],tasks=data(taskR),projects=data(projectR),contacts=data(contactR),history=data(historyR);
    const statuses={brief:'Brief',planning:'Planeación',in_progress:'En progreso',review:'Revisión',changes:'Cambios',delivered:'Entregado',on_hold:'En pausa',cancelled:'Cancelado',pending:'Pendiente',completed:'Completada'};
    const list=(rows,render,result)=>result.error?'<p class="muted">No se pudo cargar esta sección. Cierra y vuelve a abrir la ficha.</p>':rows.length?rows.map(render).join(''):'<p class="muted">Sin registros visibles en tu acceso.</p>';
    root.querySelector('[data-client-body]').innerHTML=`<div class="nexo-client-summary"><div><span>Línea de negocio</span><b>${C.esc(serviceLinesLabel(org.service_lines))}</b></div><div><span>Responsable NEXO</span><b>${C.esc(org.internal_owner_user_id===C.state.session.user.id?C.state.profile?.full_name||'Tú':org.internal_owner_user_id?'Asignado por el CEO':'Sin asignar')}</b></div><div><span>Tareas abiertas</span><b>${tasks.filter(t=>['pending','in_progress'].includes(t.status)).length}</b></div></div>
    <section class="drawer-card"><h3>Proyectos y entregables</h3><div class="drawer-list">${list(projects,p=>`<div><b>${C.esc(p.title)}</b><span>${C.esc(statuses[p.status]||p.status)} · ${p.due_at?C.shortDate(p.due_at):'Sin fecha'}</span><p>${C.esc(p.description||'')}</p></div>`,projectR)}</div></section>
    <section class="drawer-card"><h3>Tareas del cliente</h3><div class="drawer-list">${list(tasks,t=>`<div><button class="nexo-file-link" type="button" data-client-task="${C.esc(t.id)}">${C.esc(t.title)}</button><span>${C.esc(statuses[t.status]||t.status)} · ${t.due_at?C.dateTime(t.due_at):'Sin fecha'}</span></div>`,taskR)}</div></section>
    ${C.hasPermission?.('client_data.assigned.read')?`<section class="drawer-card"><h3>Contactos</h3><div class="drawer-list">${list(contacts,c=>`<div><b>${C.esc(c.name)}</b><span>${C.esc(c.email||'')} · ${C.esc(c.phone||'')}</span></div>`,contactR)}</div></section>`:''}
    ${C.hasPermission?.('crm.assigned.read')||C.hasPermission?.('crm.all.read')?`<section class="drawer-card"><h3>Historial comercial</h3><div class="drawer-list">${list(history,h=>`<div><b>${C.esc(h.title)}</b><span>${C.dateTime(h.created_at)}</span><p>${C.esc(h.details||'')}</p></div>`,historyR)}</div></section>`:''}`;
    root.querySelectorAll('[data-client-task]').forEach(b=>b.addEventListener('click',()=>{const task=tasks.find(t=>t.id===b.dataset.clientTask);close();openTaskContext(C,task);}));
  }catch(error){root.querySelector('[data-client-body]').textContent='No se pudo cargar la ficha.';C.showError(error.message);}
}
