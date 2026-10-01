
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const URL="https://ixewnbjndguchunwcuhf.supabase.co";
const KEY="sb_publishable_vFnLRe9cmnOcyz2Fivprhw_8UjBaRGL";
const db=createClient(URL,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>new Intl.NumberFormat("es-CO",{style:"currency",currency:"COP",maximumFractionDigits:0}).format(Number(v||0));
const dt=v=>v?new Intl.DateTimeFormat("es-CO",{dateStyle:"medium",timeStyle:"short",timeZone:"America/Bogota"}).format(new Date(v)):"—";
const initials=v=>String(v||"NX").split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join("")||"NX";

let orgs=[],profile=null,isAdmin=false,currentView=null;

async function identity(){
  const {data:{session}}=await db.auth.getSession();
  if(!session) return false;
  const p=await db.from("profiles").select("*").eq("id",session.user.id).maybeSingle();
  profile=p.data||null;
  const a=await db.rpc("is_platform_admin");
  isAdmin=a.data===true;
  return true;
}
function currentOrgId(){return $("orgSelect")?.value||null}
function currentOrg(){return orgs.find(x=>x.id===currentOrgId())||null}
function internalSelected(){return currentOrg()?.name==="NEXO Internal"}
function toast(m){const el=$("toast");if(el){el.textContent=m;el.classList.remove("hidden");setTimeout(()=>el.classList.add("hidden"),2800)}}
function err(m){const e=$("errorBox");if(e){e.textContent=m;e.classList.remove("hidden")}}
function closeModal(){document.querySelector(".n360-modal")?.remove();document.body.classList.remove("modal-open")}
function shell(title,sub,body){
  closeModal();
  const m=document.createElement("div");m.className="n360-modal";m.innerHTML=`
    <div class="n360-backdrop" data-n360-close></div>
    <section class="n360-panel">
      <header class="n360-head"><div><span class="eyebrow">NEXO 360</span><h2>${esc(title)}</h2><p>${esc(sub||"")}</p></div><button class="n360-close" data-n360-close>×</button></header>
      <div class="n360-body">${body}</div>
    </section>`;
  document.body.appendChild(m);document.body.classList.add("modal-open");
  m.querySelectorAll("[data-n360-close]").forEach(x=>x.addEventListener("click",closeModal));
  return m;
}
async function loadOrgs(){
  const r=await db.from("organizations").select("*").order("name");
  if(!r.error) orgs=r.data||[];
}

async function openContact360(contactId,orgId=currentOrgId()){
  try{
    const [c,conv,lead,appt,fu,notes,tasks]=await Promise.all([
      db.from("contacts").select("*").eq("id",contactId).single(),
      db.from("conversations").select("id,service,status,source,created_at,last_message_at").eq("organization_id",orgId).eq("contact_id",contactId).order("last_message_at",{ascending:false}),
      db.from("leads").select("*").eq("organization_id",orgId).eq("contact_id",contactId).order("created_at",{ascending:false}),
      db.from("appointments").select("*").eq("organization_id",orgId).eq("contact_id",contactId).order("starts_at",{ascending:false}),
      db.from("followups").select("*").eq("organization_id",orgId).eq("contact_id",contactId).order("due_at",{ascending:false}),
      db.from("contact_notes").select("*").eq("organization_id",orgId).eq("contact_id",contactId).order("created_at",{ascending:false}),
      db.from("work_tasks").select("*").eq("organization_id",orgId).eq("contact_id",contactId).order("created_at",{ascending:false})
    ]);
    if(c.error)throw c.error;
    const contact=c.data, leads=lead.data||[], appointments=appt.data||[], conversations=conv.data||[], followups=fu.data||[], ns=notes.data||[], ts=tasks.data||[];
    const value=appointments.filter(x=>["Confirmada","Completada"].includes(x.status)).reduce((s,x)=>s+Number(x.value||0),0);
    const modal=shell(contact.name||"Contacto","Ficha única del cliente final",`
      <section class="n360-hero">
        <div class="n360-avatar">${esc(initials(contact.name))}</div>
        <div><h3>${esc(contact.name||"Contacto")}</h3><p>${esc(contact.phone||"Sin teléfono")} · ${esc(contact.email||"Sin email")}<br>${conversations[0]?esc(conversations[0].service||"Sin servicio"):"Sin conversaciones"}</p></div>
        <button class="n360-btn primary" id="n360Whats">Abrir WhatsApp</button>
      </section>
      <div class="n360-grid">
        <div class="n360-stat"><span>Conversaciones</span><b>${conversations.length}</b></div>
        <div class="n360-stat"><span>Leads</span><b>${leads.length}</b></div>
        <div class="n360-stat"><span>Citas</span><b>${appointments.length}</b></div>
        <div class="n360-stat"><span>Valor confirmado</span><b>${esc(money(value))}</b></div>
      </div>
      <div class="n360-two">
        <section class="n360-card"><h3>Datos del contacto</h3><p>Edita la información principal sin salir de la ficha.</p>
          <form id="n360ContactForm" class="n360-form">
            <label>Nombre<input name="name" value="${esc(contact.name||"")}" required></label>
            <label>Teléfono<input name="phone" value="${esc(contact.phone||"")}"></label>
            <label class="wide">Email<input name="email" type="email" value="${esc(contact.email||"")}"></label>
            <button class="n360-btn primary wide" type="submit">Guardar perfil</button>
          </form>
        </section>
        <section class="n360-card"><h3>Seguimiento comercial</h3><p>Leads, citas y próximos pasos.</p>
          <div class="n360-list">
            ${[...leads.slice(0,3).map(x=>({t:x.service||"Lead",s:`${x.stage||"—"} · ${money(x.value)}`,d:x.created_at})),...appointments.slice(0,3).map(x=>({t:x.service||"Cita",s:`${x.status||"—"} · ${money(x.value)}`,d:x.starts_at})),...followups.slice(0,2).map(x=>({t:x.service||"Seguimiento",s:x.status||"—",d:x.due_at}))].slice(0,6).map(x=>`<div class="n360-row"><div><b>${esc(x.t)}</b><small>${esc(x.s)}</small></div><em>${esc(dt(x.d))}</em></div>`).join("")||'<p class="muted">Sin actividad comercial.</p>'}
          </div>
        </section>
      </div>
      <div class="n360-two">
        <section class="n360-card"><h3>Notas internas</h3><p>Contexto visible para el equipo de esta empresa.</p>
          <form id="n360NoteForm" class="n360-form"><label class="wide">Nueva nota<textarea name="note" placeholder="Añadir contexto, preferencia o acuerdo..." required></textarea></label><button class="n360-btn primary wide">Guardar nota</button></form>
          <div id="n360Notes" class="n360-list" style="margin-top:10px">${ns.map(n=>`<div class="n360-row"><div><b>Nota</b><small>${esc(n.note)}</small></div><em>${esc(dt(n.created_at))}</em></div>`).join("")||'<p class="muted">Sin notas todavía.</p>'}</div>
        </section>
        <section class="n360-card"><h3>Tareas del contacto</h3><p>Responsable, prioridad y estado en un mismo lugar.</p>
          <form id="n360TaskForm" class="n360-form">
            <label class="wide">Tarea<input name="title" placeholder="Ej. Confirmar pago o próxima cita" required></label>
            <label>Prioridad<select name="priority"><option value="low">Baja</option><option value="medium" selected>Media</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label>
            <label>Vence<input name="due_at" type="datetime-local"></label>
            <button class="n360-btn primary wide">Crear tarea</button>
          </form>
          <div id="n360Tasks" style="margin-top:10px;display:grid;gap:7px">${taskHtml(ts)}</div>
        </section>
      </div>`);
    modal.querySelector("#n360Whats").onclick=()=>{const d=String(contact.phone||"").replace(/\D/g,""); if(d)window.open("https://wa.me/"+d,"_blank")};
    modal.querySelector("#n360ContactForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const r=await db.from("contacts").update({name:f.get("name"),phone:f.get("phone")||null,email:f.get("email")||null}).eq("id",contactId);if(r.error)err(r.error.message);else toast("Contacto actualizado.")};
    modal.querySelector("#n360NoteForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {data:{session}}=await db.auth.getSession();const r=await db.from("contact_notes").insert({organization_id:orgId,contact_id:contactId,note:f.get("note"),created_by:session?.user?.id||null});if(r.error)err(r.error.message);else{toast("Nota guardada.");openContact360(contactId,orgId)}};
    modal.querySelector("#n360TaskForm").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {data:{session}}=await db.auth.getSession();const due=f.get("due_at");const r=await db.from("work_tasks").insert({organization_id:orgId,contact_id:contactId,title:f.get("title"),priority:f.get("priority"),due_at:due?new Date(due).toISOString():null,created_by:session?.user?.id||null,assigned_to:session?.user?.id||null,source_type:"contact_360",source_id:contactId});if(r.error)err(r.error.message);else{toast("Tarea creada.");openContact360(contactId,orgId)}};
    bindTaskSelects(modal,()=>openContact360(contactId,orgId));
  }catch(e){err(e.message||"No pudimos abrir Contact 360.")}
}
function taskHtml(tasks){
  return tasks.length?tasks.map(t=>`<div class="n360-task"><div><strong>${esc(t.title)}</strong><small>${esc(t.priority||"medium")} · ${t.due_at?esc(dt(t.due_at)):"Sin vencimiento"}</small></div><select class="n360-task-status" data-id="${t.id}"><option value="pending" ${t.status==="pending"?"selected":""}>Pendiente</option><option value="in_progress" ${t.status==="in_progress"?"selected":""}>En progreso</option><option value="completed" ${t.status==="completed"?"selected":""}>Completada</option><option value="cancelled" ${t.status==="cancelled"?"selected":""}>Cancelada</option></select></div>`).join(""):'<p class="muted">Sin tareas.</p>';
}
function bindTaskSelects(root,refresh){
  root.querySelectorAll(".n360-task-status").forEach(s=>s.addEventListener("change",async()=>{const patch={status:s.value,completed_at:s.value==="completed"?new Date().toISOString():null};const r=await db.from("work_tasks").update(patch).eq("id",s.dataset.id);if(r.error)err(r.error.message);else{toast("Tarea actualizada.");refresh?.()}}));
}

async function openCustomer360(orgId){
  try{
    const [o,a,set,members,convs,leads,apps,invoices,tasks]=await Promise.all([
      db.from("organizations").select("*").eq("id",orgId).single(),
      db.from("assistants").select("*").eq("organization_id",orgId).maybeSingle(),
      db.from("organization_settings").select("*").eq("organization_id",orgId).maybeSingle(),
      db.from("organization_members").select("user_id,role").eq("organization_id",orgId),
      db.from("conversations").select("id,status").eq("organization_id",orgId),
      db.from("leads").select("id,stage,value").eq("organization_id",orgId),
      db.from("appointments").select("id,status,value").eq("organization_id",orgId),
      db.from("client_invoices").select("*").eq("organization_id",orgId).order("created_at",{ascending:false}),
      db.from("work_tasks").select("*").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(8)
    ]);
    if(o.error)throw o.error;
    const org=o.data,asst=a.data||{},settings=set.data||{},cs=convs.data||[],ls=leads.data||[],aps=apps.data||[],ivs=invoices.data||[],ts=tasks.data||[];
    const confirmed=aps.filter(x=>["Confirmada","Completada"].includes(x.status));const value=confirmed.reduce((s,x)=>s+Number(x.value||0),0);
    const unpaid=ivs.filter(x=>!["paid","waived","cancelled"].includes(x.status)).reduce((s,x)=>s+Number(x.amount_cop||0),0);
    shell(org.name,"Customer 360 · operación, asistente, equipo y facturación",`
      <section class="n360-hero"><div class="n360-avatar">${esc(org.initials||initials(org.name))}</div><div><h3>${esc(org.name)}</h3><p>${esc(org.sector||"Sin sector")} · ${esc(settings.city||"Colombia")}<br>${esc(settings.public_email||"Sin email público")} · ${esc(settings.phone||settings.whatsapp||"Sin teléfono")}</p></div><span class="pill green">${esc(org.status||"active")}</span></section>
      <div class="n360-grid"><div class="n360-stat"><span>Conversaciones</span><b>${cs.length}</b></div><div class="n360-stat"><span>Leads</span><b>${ls.length}</b></div><div class="n360-stat"><span>Citas confirmadas</span><b>${confirmed.length}</b></div><div class="n360-stat"><span>Valor confirmado</span><b>${esc(money(value))}</b></div></div>
      <div class="n360-two">
        <section class="n360-card"><h3>Asistente virtual</h3><p>Identidad y contexto operativo.</p><div class="n360-assistant"><div class="n360-avatar">${asst.avatar_url?`<img src="${esc(asst.avatar_url)}" alt="">`:esc(initials(asst.name||org.assistant))}</div><div><b>${esc(asst.name||org.assistant||"Asistente NEXO")}</b><small>${esc(asst.role_label||"Asistente virtual")}</small><p style="font-size:8px;color:#7f8da0;margin-top:7px;line-height:1.5">${esc(asst.context_summary||asst.description||"Sin contexto resumido.")}</p><div class="n360-tags">${(Array.isArray(asst.capabilities)?asst.capabilities:[]).slice(0,6).map(x=>`<span>${esc(x)}</span>`).join("")}</div></div></div></section>
        <section class="n360-card"><h3>Cuenta NEXO</h3><p>Equipo, cartera y estado operativo.</p><div class="n360-list"><div class="n360-row"><div><b>Usuarios con acceso</b><small>Miembros asignados a esta organización</small></div><em>${(members.data||[]).length}</em></div><div class="n360-row"><div><b>Tareas abiertas</b><small>Pendientes o en progreso</small></div><em>${ts.filter(x=>!["completed","cancelled"].includes(x.status)).length}</em></div><div class="n360-row"><div><b>Cartera pendiente</b><small>Facturas por cobrar</small></div><em>${esc(money(unpaid))}</em></div></div></section>
      </div>
      <div class="n360-two">
        <section class="n360-card"><h3>Facturación reciente</h3><p>Últimos cobros y su estado.</p><div class="n360-list">${ivs.slice(0,6).map(i=>`<div class="n360-row"><div><b>${esc(i.invoice_number||i.reference||"Factura")}</b><small>${esc(i.status)} · ${esc(i.payment_status||"not_requested")}</small></div><em>${esc(money(i.amount_cop))}</em></div>`).join("")||'<p class="muted">Sin facturas.</p>'}</div></section>
        <section class="n360-card"><h3>Tareas recientes</h3><p>Trabajo operativo asociado a este cliente.</p><div style="display:grid;gap:7px">${taskHtml(ts)}</div></section>
      </div>`);
    bindTaskSelects(document.querySelector(".n360-modal"),()=>openCustomer360(orgId));
  }catch(e){err(e.message||"No pudimos abrir Customer 360.")}
}

async function renderTasksPage(){
  currentView="tasks";
  const content=$("content");if(!content)return;
  const orgId=currentOrgId();let q=db.from("work_tasks").select("*,contacts(name,phone),organizations(name)").order("created_at",{ascending:false}).limit(500);
  if(!(isAdmin&&internalSelected()))q=q.eq("organization_id",orgId);
  const r=await q;if(r.error){err(r.error.message);return}
  const rows=r.data||[];const cols={pending:[],in_progress:[],completed:[]};rows.forEach(x=>(cols[x.status]||cols.pending).push(x));
  content.innerHTML=`<div class="n360-page"><div class="n360-page-head"><div><span class="eyebrow">NEXO TASKS</span><h2>Centro de tareas</h2><p>Asignables, con prioridad, vencimiento y estado.</p></div><button class="n360-btn primary" id="n360NewTask">Nueva tarea</button></div>
    <div class="n360-grid"><div class="n360-stat"><span>Pendientes</span><b>${cols.pending.length}</b></div><div class="n360-stat"><span>En progreso</span><b>${cols.in_progress.length}</b></div><div class="n360-stat"><span>Completadas</span><b>${cols.completed.length}</b></div><div class="n360-stat"><span>Urgentes abiertas</span><b>${rows.filter(x=>x.priority==="urgent"&&!["completed","cancelled"].includes(x.status)).length}</b></div></div>
    <div class="n360-task-board">${[["pending","Pendientes"],["in_progress","En progreso"],["completed","Completadas"]].map(([k,l])=>`<section class="n360-column"><h3>${l} · ${cols[k].length}</h3>${cols[k].map(t=>`<div class="n360-task"><div><strong>${esc(t.title)}</strong><small>${esc(t.organizations?.name||"")} ${t.contacts?.name?"· "+esc(t.contacts.name):""}<br>${esc(t.priority)} · ${t.due_at?esc(dt(t.due_at)):"Sin vencimiento"}</small></div><select class="n360-task-status" data-id="${t.id}"><option value="pending" ${t.status==="pending"?"selected":""}>Pendiente</option><option value="in_progress" ${t.status==="in_progress"?"selected":""}>En progreso</option><option value="completed" ${t.status==="completed"?"selected":""}>Completada</option><option value="cancelled">Cancelada</option></select></div>`).join("")||'<p class="muted">Sin tareas.</p>'}</section>`).join("")}</div></div>`;
  $("breadcrumb").textContent="Centro de tareas";$("pageEyebrow").textContent="NEXO TASKS";$("pageTitle").textContent="Trabajo claro, sin pendientes invisibles.";$("pageSubtitle").textContent="Asigna, prioriza y completa tareas desde una sola vista.";
  bindTaskSelects(content,renderTasksPage);
  $("n360NewTask").onclick=()=>newGeneralTask();
}
function newGeneralTask(){
  const m=shell("Nueva tarea","Crear una tarea para la organización seleccionada",`<section class="n360-card"><form id="n360GeneralTask" class="n360-form"><label class="wide">Título<input name="title" required></label><label class="wide">Descripción<textarea name="description"></textarea></label><label>Prioridad<select name="priority"><option value="low">Baja</option><option value="medium" selected>Media</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label>Vence<input name="due_at" type="datetime-local"></label><button class="n360-btn primary wide">Crear tarea</button></form></section>`);
  m.querySelector("#n360GeneralTask").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const {data:{session}}=await db.auth.getSession();const due=f.get("due_at");const r=await db.from("work_tasks").insert({organization_id:currentOrgId(),title:f.get("title"),description:f.get("description")||null,priority:f.get("priority"),due_at:due?new Date(due).toISOString():null,created_by:session?.user?.id||null,assigned_to:session?.user?.id||null,source_type:"manual"});if(r.error)err(r.error.message);else{closeModal();toast("Tarea creada.");renderTasksPage()}};
}

async function renderBillingPage(){
  currentView="billing";const content=$("content");if(!content)return;
  const orgId=currentOrgId();let q=db.from("client_invoices").select("*").order("created_at",{ascending:false}).limit(250);if(!(isAdmin&&internalSelected()))q=q.eq("organization_id",orgId);
  const r=await q;if(r.error){err(r.error.message);return}const rows=r.data||[];
  const due=rows.filter(x=>!["paid","waived","cancelled"].includes(x.status)).reduce((s,x)=>s+Number(x.amount_cop||0),0);
  content.innerHTML=`<div class="n360-page"><div class="n360-page-head"><div><span class="eyebrow">NEXO BILLING</span><h2>Facturación y pagos</h2><p>Facturas, estado Wompi y conciliación.</p></div></div>
  <div class="n360-grid"><div class="n360-stat"><span>Facturas</span><b>${rows.length}</b></div><div class="n360-stat"><span>Por cobrar</span><b>${esc(money(due))}</b></div><div class="n360-stat"><span>Pagadas</span><b>${rows.filter(x=>x.status==="paid").length}</b></div><div class="n360-stat"><span>Pagos Wompi aprobados</span><b>${rows.filter(x=>x.payment_status==="approved").length}</b></div></div>
  <section class="card n360-billing-table"><div class="card-head"><div><h2>Facturas</h2><p>El estado de pago se actualiza por webhook.</p></div></div><div class="table-wrap"><table><thead><tr><th>Factura</th><th>Cliente</th><th>Vence</th><th>Valor</th><th>Factura</th><th>Wompi</th><th>Acción</th></tr></thead><tbody>${rows.map(i=>`<tr><td><b>${esc(i.invoice_number||i.reference||i.id.slice(0,8))}</b></td><td>${esc(orgs.find(o=>o.id===i.organization_id)?.name||"")}</td><td>${esc(i.due_date||"—")}</td><td>${esc(money(i.amount_cop))}</td><td>${esc(i.status)}</td><td class="${i.payment_status==="approved"?"n360-payment-ok":i.payment_status==="declined"?"n360-payment-bad":""}"><b>${esc(i.payment_status||"not_requested")}</b></td><td>${i.payment_url?`<a href="${esc(i.payment_url)}" target="_blank" rel="noopener">Pagar / abrir</a>`:isAdmin?`<button class="n360-btn n360-wompi" data-id="${i.id}">Generar Wompi</button>`:'<span class="muted">Sin link</span>'}</td></tr>`).join("")||'<tr><td colspan="7">Sin facturas.</td></tr>'}</tbody></table></div></section></div>`;
  $("breadcrumb").textContent="Facturación";$("pageEyebrow").textContent="NEXO BILLING";$("pageTitle").textContent="Cobros y pagos, conectados.";$("pageSubtitle").textContent="Wompi + NEXO en una sola trazabilidad.";
  content.querySelectorAll(".n360-wompi").forEach(b=>b.onclick=()=>createWompi(b.dataset.id,b));
}
async function createWompi(invoiceId,button){
  button.disabled=true;button.textContent="Generando…";
  try{const r=await db.functions.invoke("create-invoice-payment",{body:{invoice_id:invoiceId}});if(r.error)throw r.error;if(!r.data?.ok)throw new Error(r.data?.error||"No se pudo generar el link.");toast("Link Wompi generado.");renderBillingPage()}
  catch(e){err((e.message||"Wompi todavía no está configurado.")+" Revisa llaves y secretos del backend.");button.disabled=false;button.textContent="Generar Wompi"}
}

function nav(){
  const mainNav=document.querySelector("#sidebar nav");if(!mainNav||document.querySelector('[data-n360-page="tasks"]'))return;
  const t=document.createElement("button");t.className="nav-item";t.dataset.n360Page="tasks";t.textContent="Centro de tareas";
  const b=document.createElement("button");b.className="nav-item";b.dataset.n360Page="billing";b.textContent="Facturación";
  mainNav.append(t,b);
  [t,b].forEach(x=>x.addEventListener("click",async()=>{document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));x.classList.add("active");if(x.dataset.n360Page==="tasks")await renderTasksPage();else await renderBillingPage()}));
}
function decorate(){
  document.querySelectorAll(".chat-button:not([data-n360-ready])").forEach(btn=>{
    btn.dataset.n360Ready="1";const b=document.createElement("button");b.type="button";b.className="n360-btn";b.textContent="360";b.style.marginLeft="5px";b.onclick=()=>openContact360(btn.dataset.contactId,btn.dataset.orgId||currentOrgId());btn.insertAdjacentElement("afterend",b);
  });
  document.querySelectorAll(".admin-table-card tbody tr").forEach(async tr=>{
    if(tr.dataset.n360Ready)return;const name=tr.querySelector("td:first-child b")?.textContent?.trim();if(!name)return;const org=orgs.find(o=>o.name===name);if(!org)return;tr.dataset.n360Ready="1";const td=tr.querySelector("td:first-child");const b=document.createElement("button");b.className="n360-btn";b.style.marginTop="6px";b.textContent="Abrir 360";b.onclick=()=>openCustomer360(org.id);td.appendChild(document.createElement("br"));td.appendChild(b);
  });
}
async function boot(){
  if(!(await identity()))return;await loadOrgs();nav();decorate();
  new MutationObserver(()=>{nav();decorate()}).observe(document.body,{childList:true,subtree:true});
  $("orgSelect")?.addEventListener("change",()=>{if(currentView==="tasks")renderTasksPage();if(currentView==="billing")renderBillingPage()});
}
boot();
