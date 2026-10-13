// NEXO task collaboration: comments, checklist and private attachments.
// Access is enforced by Supabase RLS, never by this UI alone.
const html=(C,value)=>C.esc(String(value??""));
const taskBucket="nexo-task-files";
const shortDate=value=>value?new Date(value).toLocaleString("es-CO"):"";
export async function mountTaskContext(C,task,host){
  if(!task?.id||!host)return;
  host.querySelector(".nexo-task-context")?.remove();
  const box=document.createElement("section");
  box.className="nexo-task-context";
  box.innerHTML='<h3>Colaboración de la tarea</h3><p class="muted">Checklist, comentarios e información adjunta. Solo los usuarios autorizados pueden acceder.</p><div class="nexo-context-columns"><div><h4>Checklist</h4><div data-list="checklist">Cargando…</div><form data-add="check"><input name="title" maxlength="250" placeholder="Nuevo paso" required aria-label="Nuevo paso"><button class="btn" type="submit">Añadir</button></form></div><div><h4>Comentarios</h4><div data-list="comments">Cargando…</div><form data-add="comment"><textarea name="body" maxlength="4000" rows="2" required placeholder="Escribe un comentario para el equipo" aria-label="Comentario"></textarea><button class="btn" type="submit">Publicar</button></form></div></div><div class="nexo-files"><h4>Archivos privados</h4><div data-list="files">Cargando…</div><label class="nexo-upload-label">Adjuntar archivo (máx. 10 MB)<input type="file" data-file accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"></label></div>';
  host.appendChild(box);
  const output=(key)=>box.querySelector('[data-list="'+key+'"]');
  const err=error=>C.showError(error?.message||"No se pudo completar la acción.");
  const lock=(el,busy)=>{el.disabled=busy;};
  async function showChecklist(){
    const {data,error}=await C.supabase.from("nexo_task_checklist").select("*").eq("task_id",task.id).order("created_at");
    if(error)throw error;
    output("checklist").innerHTML=(data||[]).length?(data||[]).map(row=>
      '<div class="nexo-check-item"><label><input type="checkbox" data-check="'+html(C,row.id)+'" '+(row.is_done?'checked':'')+'><span class="'+(row.is_done?'done':'')+'">'+html(C,row.title)+'</span></label><button type="button" class="nexo-text-button" data-remove="'+html(C,row.id)+'" aria-label="Eliminar paso">×</button></div>'
    ).join(""):'<p class="muted">Sin pasos todavía.</p>';
    output("checklist").querySelectorAll("[data-check]").forEach(input=>input.addEventListener("change",async()=>{
      input.disabled=true;
      const {error}=await C.supabase.from("nexo_task_checklist").update({is_done:input.checked,completed_by:input.checked?C.state.session.user.id:null,updated_at:new Date().toISOString()}).eq("id",input.dataset.check).eq("task_id",task.id).select("id").single();
      if(error)err(error);try{await showChecklist();}catch(e){err(e);}
    }));
    output("checklist").querySelectorAll("[data-remove]").forEach(btn=>btn.addEventListener("click",async()=>{
      btn.disabled=true;
      const {error}=await C.supabase.from("nexo_task_checklist").delete().eq("id",btn.dataset.remove).eq("task_id",task.id).select("id").single();
      if(error)err(error);try{await showChecklist();}catch(e){err(e);}
    }));
  }
  async function showComments(){
    const {data,error}=await C.supabase.from("nexo_task_comments").select("*").eq("task_id",task.id).order("created_at",{ascending:false}).limit(100);
    if(error)throw error;
    output("comments").innerHTML=(data||[]).length?(data||[]).map(row=>
      '<article class="nexo-comment"><small>'+html(C,row.author_id===C.state.session.user.id?"Tú":"Colaborador")+' · '+html(C,shortDate(row.created_at))+'</small><p>'+html(C,row.body)+'</p></article>'
    ).join(""):'<p class="muted">Sin comentarios todavía.</p>';
  }
  async function showFiles(){
    const {data,error}=await C.supabase.storage.from(taskBucket).list(task.id,{limit:100,sortBy:{column:"created_at",order:"desc"}});
    if(error)throw error;
    const files=(data||[]).filter(item=>item.name&&!item.name.startsWith("."));
    output("files").innerHTML=files.length?files.map(row=>{
      const original=row.name.includes("__")?row.name.split("__").slice(1).join("__"):row.name;
      return '<div class="nexo-file-row"><button class="nexo-file-link" type="button" data-path="'+html(C,row.name)+'">'+html(C,original)+'</button><small>'+html(C,row.created_at?shortDate(row.created_at):"")+'</small><button type="button" class="nexo-text-button" data-file-remove="'+html(C,row.name)+'" aria-label="Eliminar archivo">×</button></div>';
    }).join(""):'<p class="muted">No hay archivos adjuntos.</p>';
    output("files").querySelectorAll("[data-path]").forEach(btn=>btn.addEventListener("click",async()=>{
      const popup=window.open("about:blank","_blank");
      const {data,error}=await C.supabase.storage.from(taskBucket).createSignedUrl(task.id+"/"+btn.dataset.path,120);
      if(error||!data?.signedUrl){popup?.close();err(error||new Error("No se pudo abrir el archivo."));return;}
      if(popup)popup.location.href=data.signedUrl;else window.location.assign(data.signedUrl);
    }));
    output("files").querySelectorAll("[data-file-remove]").forEach(btn=>btn.addEventListener("click",async()=>{
      if(!window.confirm("¿Eliminar este archivo adjunto?"))return;
      btn.disabled=true;
      const {error}=await C.supabase.storage.from(taskBucket).remove([task.id+"/"+btn.dataset.fileRemove]);
      if(error)err(error);try{await showFiles();}catch(e){err(e);}
    }));
  }
  box.querySelector('[data-add="check"]').addEventListener("submit",async(event)=>{
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector("button"),title=form.elements.title.value.trim();
    if(!title)return;lock(button,true);
    const {error}=await C.supabase.from("nexo_task_checklist").insert({task_id:task.id,title,created_by:C.state.session.user.id});
    if(error)err(error);else form.reset();
    try{await showChecklist();}catch(e){err(e);}lock(button,false);
  });
  box.querySelector('[data-add="comment"]').addEventListener("submit",async(event)=>{
    event.preventDefault();
    const form=event.currentTarget,button=form.querySelector("button"),body=form.elements.body.value.trim();
    if(!body)return;lock(button,true);
    const {error}=await C.supabase.from("nexo_task_comments").insert({task_id:task.id,body,author_id:C.state.session.user.id});
    if(error)err(error);else form.reset();
    try{await showComments();}catch(e){err(e);}lock(button,false);
  });
  box.querySelector('[data-file]').addEventListener("change",async(event)=>{
    const input=event.currentTarget,file=input.files?.[0];if(!file)return;
    if(file.size>10485760){err(new Error("El archivo supera el límite de 10 MB."));input.value="";return;}
    input.disabled=true;
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-110)||"adjunto";
    const objectName=(crypto.randomUUID?crypto.randomUUID():String(Date.now()))+"__"+safeName;
    const {error}=await C.supabase.storage.from(taskBucket).upload(task.id+"/"+objectName,file,{upsert:false,contentType:file.type||undefined});
    if(error)err(error);else C.showToast("Archivo adjuntado.");
    input.value="";input.disabled=false;
    try{await showFiles();}catch(e){err(e);}
  });
  await Promise.allSettled([showChecklist(),showComments(),showFiles()]).then(results=>{
    results.forEach((r,i)=>{if(r.status==="rejected"){output(["checklist","comments","files"][i]).textContent="No se pudo cargar.";err(r.reason);}});
  });
}
