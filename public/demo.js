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
  if(planSelect&&["start","growth","pro","custom"].includes(planParam||"")){
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

form?.addEventListener("submit",async(event)=>{
  event.preventDefault();
  result.className="demo-result hidden";
  const phone=document.getElementById("demoPhone").value.trim();
  const email=document.getElementById("demoEmail").value.trim();
  if(!phone&&!email){
    result.textContent="Comparte un WhatsApp o correo para poder contactarte.";
    result.className="demo-result error";
    return;
  }
  button.disabled=true;button.textContent="Enviando…";
  try{
    const response=await fetch(SUPABASE_URL+"/functions/v1/submit-demo-request",{
      method:"POST",
      headers:{"content-type":"application/json","apikey":KEY},
      body:JSON.stringify((()=>{
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
        const params=new URLSearchParams(window.location.search);
        const qualification=[
          goal&&"Objetivo principal: "+(goalLabels[goal]||goal),
          volume&&"Volumen aproximado: "+(volumeLabels[volume]||volume)+" conversaciones/mes",
          channel&&"Canal principal: "+(channelLabels[channel]||channel),
          params.get("utm_source")&&"UTM source: "+params.get("utm_source"),
          params.get("utm_campaign")&&"UTM campaign: "+params.get("utm_campaign"),
          document.referrer&&"Referido desde: "+document.referrer
        ].filter(Boolean);
        const funnelSummary=window.NEXOFunnel?.summary?.()||"";
        const crmMessage=[
          message,
          qualification.length?"--- Calificación web ---\n"+qualification.join("\n"):"",
          funnelSummary?"--- Recorrido web ---\n"+funnelSummary:""
        ].filter(Boolean).join("\n\n");
        return {
          full_name:document.getElementById("demoName").value.trim(),
          business_name:document.getElementById("demoBusiness").value.trim(),
          phone,email,
          industry:document.getElementById("demoIndustry").value,
          plan_interest:document.getElementById("demoPlan").value,
          message:crmMessage,
          website:document.getElementById("demoWebsite").value,
          source:"nexobyjv.online/demo"
        };
      })())
    });
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||"No pudimos registrar la solicitud.");
    form.reset();
    result.innerHTML="<strong>Solicitud recibida.</strong><br>Gracias. Ya tenemos el contexto inicial para revisar tu operación y preparar el siguiente paso.";
    result.className="demo-result success";
    button.textContent="Solicitud enviada ✓";
  }catch(error){
    result.textContent=error.message||"No pudimos registrar la solicitud.";
    result.className="demo-result error";
    button.disabled=false;button.innerHTML='Solicitar mi demo <span>→</span>';
  }
});