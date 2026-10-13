export const SERVICE_LINES=[['marketing','NEXO Marketing'],['assistants','NEXO Assistants'],['solutions','NEXO Solutions']];
export function serviceLinesLabel(lines){return (Array.isArray(lines)?lines:[]).map(key=>Object.fromEntries(SERVICE_LINES)[key]||key).join(' · ')||'Sin clasificar';}
export function needsAssistant(lines){return !lines?.length||lines.includes('assistants');}
export function serviceLinesField(id,selected=[],disabled=false){return `<fieldset class="nexo-service-lines" id="${id}"><legend>Línea de negocio NEXO</legend><p>Puedes seleccionar varias si el cliente contrata más de un servicio.</p>${SERVICE_LINES.map(([value,label])=>`<label><input type="checkbox" value="${value}" ${selected.includes(value)?'checked':''} ${disabled?'disabled':''}>${label}</label>`).join('')}</fieldset>`;}
export function selectedServiceLines(root,id){return [...root.querySelectorAll('#'+id+' input:checked')].map(input=>input.value);}
export function bindServiceLines(root,id,onChange){root.querySelector('#'+id)?.addEventListener('change',()=>onChange(selectedServiceLines(root,id)));onChange(selectedServiceLines(root,id));}
export function openServiceLineEditor(context,org){
  if(!context.state.isAdmin)return;
  document.getElementById('serviceLineModal')?.remove();
  const root=document.createElement('div');root.id='serviceLineModal';root.className='staff-work-modal';
  root.innerHTML=`<div class="staff-work-backdrop" data-close-service-lines></div><section class="staff-work-dialog" role="dialog" aria-modal="true" aria-label="Editar línea NEXO"><header><div><span class="eyebrow">CLIENTE NEXO</span><h2>${context.esc(org.name)}</h2></div><button type="button" aria-label="Cerrar" data-close-service-lines>×</button></header><div class="staff-work-body"><form id="editClientLinesForm">${serviceLinesField('editClientLines',org.service_lines||[])}<p class="muted">Clasifica los servicios contratados por este cliente.</p><button class="btn primary" type="submit">Guardar línea NEXO</button></form></div></section>`;
  document.body.appendChild(root);document.body.classList.add('modal-open');const close=()=>{root.remove();document.body.classList.remove('modal-open');};root.querySelectorAll('[data-close-service-lines]').forEach(b=>b.addEventListener('click',close));
  root.querySelector('#editClientLinesForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const button=form.querySelector('button[type="submit"]');
    const lines=selectedServiceLines(root,'editClientLines');
    if(!lines.length){context.showError('Selecciona al menos una línea de negocio.');return;}
    button.disabled=true;
    button.textContent='Guardando…';
    try{
      const {data,error}=await context.supabase.from('organizations')
        .update({service_lines:lines,updated_at:new Date().toISOString()})
        .eq('id',org.id).select('id,service_lines').single();
      if(error)throw error;
      if(!data||lines.some(line=>!data.service_lines?.includes(line))||data.service_lines.length!==lines.length){
        throw new Error('No se pudo verificar la clasificación guardada.');
      }
      org.service_lines=data.service_lines;
      close();
      context.showToast('Línea NEXO guardada correctamente.');
      try{await context.onSaved();}catch(refreshError){console.error('No se pudo refrescar el directorio:',refreshError);}
    }catch(error){
      context.showError(error?.message||'No pudimos guardar la línea NEXO.');
      button.disabled=false;
      button.textContent='Guardar línea NEXO';
    }
  });
  root.querySelector('input')?.focus();
}
