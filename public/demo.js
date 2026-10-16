function applyIndustryFromUrl(){
  const value=new URLSearchParams(window.location.search).get("industry");
  const select=document.getElementById("demoIndustry");
  if(!select||!value)return;
  const map={
    estetica:"Estética & wellness",
    hotel:"Hotel",
    restaurante:"Restaurante",
    clinica:"Clínica / odontología"
  };
  const target=map[value]||value;
  const option=[...select.options].find(item=>item.value===target||item.textContent.trim()===target);
  if(option){
    select.value=option.value;
    option.selected=true;
  }
}

function applyPlanFromUrl(){
  const searchPlan=new URLSearchParams(window.location.search).get("plan");
  const hashPlan=new URLSearchParams(window.location.hash.replace(/^#/,"")).get("plan");
  const planParam=searchPlan||hashPlan;
  const planSelect=document.getElementById("demoPlan");
  if(planSelect&&["start","growth","pro","custom","marketing"].includes(planParam||"")){
    planSelect.value=planParam;
    const option=planSelect.querySelector('option[value="'+planParam+'"]');
    if(option) option.selected=true;
  }
}
applyPlanFromUrl();
applyIndustryFromUrl();
document.addEventListener("DOMContentLoaded",()=>{applyPlanFromUrl();applyIndustryFromUrl();});
window.addEventListener("pageshow",()=>{applyPlanFromUrl();applyIndustryFromUrl();});
requestAnimationFrame(()=>{applyPlanFromUrl();applyIndustryFromUrl();});
setTimeout(()=>{applyPlanFromUrl();applyIndustryFromUrl();},100);
setTimeout(()=>{applyPlanFromUrl();applyIndustryFromUrl();},700);

const form=document.getElementById("demoForm");
const result=document.getElementById("demoResult");
const button=document.getElementById("demoSubmit");
const SUPABASE_URL="https://ixewnbjndguchunwcuhf.supabase.co";
const KEY="sb_publishable_vFnLRe9cmnOcyz2Fivprhw_8UjBaRGL";

// One opaque UUID per unchanged submission. After an uncertain network error,
// reusing it guarantees that a retry cannot create a second CRM opportunity.
// Only a salted digest and UUID are stored; no email/phone/name is stored here.
const REQUEST_CACHE_KEY="nexo_demo_pending_request_v1";
let pendingInMemory=null;
async function requestIdFor(payload){
  const encoded=JSON.stringify(payload);
  let previous=pendingInMemory;
  try{
    const saved=JSON.parse(sessionStorage.getItem(REQUEST_CACHE_KEY)||"null");
    if(saved?.id && saved?.nonce && saved?.digest && Date.now()-saved.at<86400000) previous=saved;
  }catch(_error){/* Storage can be disabled in privacy modes. */}
  const digestFor=async(nonce)=>{
    const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(nonce+":"+encoded));
    return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,"0")).join("");
  };
  if(previous?.id && previous?.nonce && previous?.digest){
    if(await digestFor(previous.nonce)===previous.digest) return previous.id;
  }
  const nonce=crypto.randomUUID();
  const next={id:crypto.randomUUID(),nonce,digest:await digestFor(nonce),at:Date.now()};
  pendingInMemory=next;
  try{sessionStorage.setItem(REQUEST_CACHE_KEY,JSON.stringify(next));}catch(_error){}
  return next.id;
}
function clearRequestId(){
  pendingInMemory=null;
  try{sessionStorage.removeItem(REQUEST_CACHE_KEY);}catch(_error){}
}

form?.addEventListener("submit",async(event)=>{
  event.preventDefault();
  result.className="demo-result hidden";
  const phone=document.getElementById("demoPhone").value.trim();
  const email=document.getElementById("demoEmail").value.trim();
  if(!phone&&!email){
    result.textContent="Comparte un WhatsApp o correo para poder contactarte.";
    result.className="demo-result error";
    document.getElementById("demoPhone")?.focus({preventScroll:true});
    return;
  }
  if(document.getElementById("privacyConsent")?.checked!==true){
    result.textContent="Para atender tu solicitud necesitamos tu autorización de tratamiento de datos.";
    result.className="demo-result error";
    document.getElementById("privacyConsent")?.focus({preventScroll:true});
    return;
  }
  button.disabled=true;button.textContent="Enviando…";
  try{
    const payload=(()=>{
        const goal=document.getElementById("demoGoal")?.value||"";
        const volume=document.getElementById("demoVolume")?.value||"";
        const channel=document.getElementById("demoChannel")?.value||"";
        const message=document.getElementById("demoMessage").value.trim();
        const goalLabels={
          atencion:"Responder consultas repetitivas",
          leads:"Capturar y dar seguimiento a leads",
          agenda:"Organizar citas o reservas",
          seguimiento:"Mejorar seguimiento a clientes",
          integraciones:"Conectar herramientas y procesos",
          web:"Crear o rediseñar sitio web / landing",
          catalogo:"Diseñar catálogo, brochure o material comercial",
          branding:"Crear o mejorar identidad visual / branding",
          creativos:"Crear piezas promocionales o campaña",
          presencia:"Mejorar presencia digital y conversión",
          otro:"Otro"
        };
        const volumeLabels={
          "menos-100":"Menos de 100",
          "100-500":"100–500",
          "500-1500":"500–1.500",
          "1500-5000":"1.500–5.000",
          "5000+":"Más de 5.000"
        };
        const channelLabels={
          whatsapp:"WhatsApp",
          instagram:"Instagram / DM",
          web:"Web / formularios",
          telefono:"Teléfono",
          multicanal:"Varios canales",
          otro:"Otro"
        };
        const qualification=[
          goal&&"Objetivo principal: "+(goalLabels[goal]||goal),
          volume&&"Volumen aproximado: "+(volumeLabels[volume]||volume)+" conversaciones/mes",
          channel&&"Canal principal: "+(channelLabels[channel]||channel)
        ].filter(Boolean);
        const crmMessage=[
          message,
          qualification.length?"--- Calificación web ---\n"+qualification.join("\n"):""
        ].filter(Boolean).join("\n\n");
        return {
          full_name:document.getElementById("demoName").value.trim(),
          business_name:document.getElementById("demoBusiness").value.trim(),
          phone,email,
          industry:document.getElementById("demoIndustry").value,
          plan_interest:document.getElementById("demoPlan").value,
          message:crmMessage,
          website:document.getElementById("demoWebsite").value,
          privacy_consent:document.getElementById("privacyConsent")?.checked===true,
          privacy_policy_version:"2026-10-06",
          source:document.getElementById("demoPlan").value==="marketing"?"nexobyjv.online/nexo-marketing":"nexobyjv.online/demo"
        };
      })();
    payload.client_request_id=await requestIdFor(payload);
    const response=await fetch(SUPABASE_URL+"/functions/v1/submit-demo-request",{
      method:"POST",
      headers:{"content-type":"application/json","apikey":KEY},
      body:JSON.stringify(payload)
    });
    // Some infrastructure errors return an HTML page, not JSON.
    // Preserve the prospect's form and display a useful Spanish message in that case.
    const data=await response.json().catch(()=>null);
    if(!response.ok || !data?.ok){
      throw new Error(data?.error||"No pudimos confirmar el envío. Tus datos siguen en el formulario; puedes intentar de nuevo.");
    }
    window.NEXOFunnel?.track?.("demo_submit_success",{
      industry:document.getElementById("demoIndustry")?.value||"",
      plan:document.getElementById("demoPlan")?.value||"",
      placement:"demo_form"
    });
    form.reset();
    clearRequestId();
    result.innerHTML="<strong>Solicitud recibida.</strong><br>Gracias. Ya tenemos el contexto inicial para revisar tu operación y preparar el siguiente paso.";
    result.className="demo-result success";
    button.textContent="Solicitud enviada ✓";
  }catch(error){
    // A lost response does not prove that the server rejected the request.
    // Never automatically resend or clear the form: the visitor decides whether to retry.
    const networkError=error instanceof TypeError || error instanceof SyntaxError;
    result.textContent=networkError
      ?"No pudimos confirmar el envío por un problema de conexión. Conservamos el formulario; revisa tu conexión antes de intentar nuevamente."
      :(error.message||"No pudimos registrar tu solicitud. Intenta de nuevo.");
    result.className="demo-result error";
    button.disabled=false;button.innerHTML='Solicitar mi demo <span>→</span>';
  }
});