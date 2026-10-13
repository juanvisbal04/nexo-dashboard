// NEXO Shield 360 — Founder only. Uses server-side admin-only RPC and RLS.
const safe=(C,v)=>C.esc(String(v??""));
const number=v=>new Intl.NumberFormat("es-CO").format(Number(v||0));
const date=v=>v?new Date(v).toLocaleString("es-CO"):"Sin registros";
const fmtSeverity={low:"Baja",medium:"Media",high:"Alta",critical:"Crítica"};
const fmtStatus={open:"Abierto",investigating:"En investigación",resolved:"Resuelto"};
export async function mountShieldCenter(C){
  const root=document.getElementById("nexoShieldCenter");if(!root)return;
  if(!C.state.isAdmin){root.remove();return;}
  const render=async()=>{
    root.innerHTML='<div class="card-head"><div><span class="eyebrow">FOUNDER ONLY · SHIELD 360</span><h2>Centro de seguridad</h2><p>Controles de Supabase, actividad de auditoría y registro manual de incidentes.</p></div></div><p class="muted">Consultando indicadores…</p>';
    const [status,audit,incidents]=await Promise.all([
      C.supabase.rpc("nexo_shield_status"),
      C.supabase.from("audit_log").select("id,created_at,actor_email,action,table_name").order("created_at",{ascending:false}).limit(12),
      C.supabase.from("nexo_shield_incidents").select("id,title,severity,status,description,created_at").order("created_at",{ascending:false}).limit(30)
    ]);
    if(status.error)throw status.error;
    const s=status.data||{},logs=audit.error?[]:audit.data||[],issues=incidents.error?[]:incidents.data||[];
    root.innerHTML='<div class="card-head"><div><span class="eyebrow">FOUNDER ONLY · SHIELD 360</span><h2>Centro de seguridad</h2><p>Verificación del servidor: '+safe(C,date(s.checked_at))+'. No representa monitoreo de intentos de ingreso ni antivirus.</p></div><button class="btn small" type="button" data-shield-refresh>Actualizar</button></div>'+
      '<div class="founder-mini-metrics nexo-shield-metrics">'+
      '<div class="'+(s.tables_missing_rls?"risk":"")+'"><span>Tablas con RLS</span><b>'+number(s.rls_enabled)+'/'+number(s.public_tables)+'</b><small>'+number(s.tables_missing_rls)+' sin protección RLS</small></div>'+
      '<div><span>Almacenamientos privados</span><b>'+number(s.private_storage_buckets)+'</b><small>'+number(s.public_storage_buckets)+' públicos (revisar finalidad)</small></div>'+
      '<div><span>Eventos auditados · 7 días</span><b>'+number(s.audit_changes_7d)+'</b><small>Último: '+safe(C,date(s.audit_last_at))+'</small></div>'+
      '<div class="'+(s.incidents_open?"risk":"")+'"><span>Incidentes abiertos</span><b>'+number(s.incidents_open)+'</b><small>Registro manual del CEO</small></div>'+
      '</div>'+
      '<div class="nexo-shield-columns"><section><div class="card-head"><h3>Incidentes y seguimiento</h3><button class="btn small" data-shield-new>+ Registrar incidente</button></div>'+
      '<div class="nexo-shield-form-wrap" hidden></div>'+
      '<div class="nexo-shield-issues">'+(issues.length?issues.map(i=>
        '<article><b>'+safe(C,i.title)+'</b><small>'+safe(C,fmtSeverity[i.severity])+' · '+safe(C,date(i.created_at))+'</small><label>Estado <select data-shield-status="'+safe(C,i.id)+'">'+
         Object.keys(fmtStatus).map(v=>'<option value="'+v+'" '+(v===i.status?'selected':'')+'>'+safe(C,fmtStatus[v])+'</option>').join('')+
        '</select></label></article>').join(""):'<p class="muted">No hay incidentes registrados. Esto no implica ausencia de amenazas.</p>')+'</div></section>'+
      '<section><h3>Cambios recientes auditados</h3><div class="nexo-shield-audit">'+(audit.error?'<p class="muted">No se pudo consultar la auditoría.</p>':logs.length?logs.map(row=>
        '<article><b>'+safe(C,row.action)+' · '+safe(C,row.table_name)+'</b><small>'+safe(C,row.actor_email||"Sistema")+' · '+safe(C,date(row.created_at))+'</small></article>').join(""):'<p class="muted">Sin cambios recientes registrados.</p>')+'</div></section></div>'+
      '<p class="muted">Este panel no certifica pruebas de penetración, restauración de backups, contraseñas filtradas ni protección MFA de todos los usuarios.</p>';
    root.querySelector("[data-shield-refresh]")?.addEventListener("click",()=>render().catch(error=>C.showError(error.message)));
    root.querySelector("[data-shield-new]")?.addEventListener("click",()=>{
      const host=root.querySelector(".nexo-shield-form-wrap");host.hidden=false;
      host.innerHTML='<form class="nexo-shield-new"><label>Título del incidente<input name="title" maxlength="180" minlength="5" required placeholder="Describe el problema brevemente"></label><label>Severidad<select name="severity"><option value="low">Baja</option><option value="medium" selected>Media</option><option value="high">Alta</option><option value="critical">Crítica</option></select></label><label>Descripción<textarea name="description" rows="2" maxlength="2000"></textarea></label><button class="btn primary" type="submit">Registrar</button><button class="btn" type="button" data-shield-cancel>Cancelar</button></form>';
      host.querySelector("[data-shield-cancel]").addEventListener("click",()=>{host.hidden=true;host.replaceChildren()});
      host.querySelector("form").addEventListener("submit",async e=>{
        e.preventDefault();const btn=e.currentTarget.querySelector('[type="submit"]');btn.disabled=true;
        const data=new FormData(e.currentTarget);
        const {error}=await C.supabase.from("nexo_shield_incidents").insert({
          title:String(data.get("title")||"").trim(),severity:data.get("severity"),
          description:String(data.get("description")||"").trim()||null,created_by:C.state.session.user.id
        });
        if(error){C.showError(error.message);btn.disabled=false;return;}
        C.showToast("Incidente registrado.");await render();
      });
    });
    root.querySelectorAll("[data-shield-status]").forEach(select=>select.addEventListener("change",async()=>{
      const next=select.value;select.disabled=true;
      const {error}=await C.supabase.from("nexo_shield_incidents").update({
        status:next,resolved_at:next==="resolved"?new Date().toISOString():null,updated_at:new Date().toISOString()
      }).eq("id",select.dataset.shieldStatus).select("id").single();
      if(error){C.showError(error.message);select.disabled=false;return;}
      C.showToast("Incidente actualizado.");await render();
    }));
  };
  try{await render();}catch(error){
    root.innerHTML='<h2>Centro de seguridad</h2><p>No pudimos verificar los controles de seguridad en este momento.</p>';
    C.showError(error.message||"Error Shield 360.");
  }
}
