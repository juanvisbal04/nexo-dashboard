function applyPlanFromUrl(){
  const planParam=new URLSearchParams(window.location.search).get("plan");
  const planSelect=document.getElementById("demoPlan");
  if(planSelect&&["start","growth","pro","custom"].includes(planParam||"")){
    planSelect.value=planParam;
    const option=planSelect.querySelector('option[value="'+planParam+'"]');
    if(option) option.selected=true;
  }
}
applyPlanFromUrl();
window.addEventListener("pageshow",applyPlanFromUrl);

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
      body:JSON.stringify({
        full_name:document.getElementById("demoName").value.trim(),
        business_name:document.getElementById("demoBusiness").value.trim(),
        phone,email,
        industry:document.getElementById("demoIndustry").value,
        plan_interest:document.getElementById("demoPlan").value,
        message:document.getElementById("demoMessage").value.trim(),
        website:document.getElementById("demoWebsite").value,
        source:"nexobyjv.online/demo"
      })
    });
    const data=await response.json();
    if(!response.ok) throw new Error(data.error||"No pudimos registrar la solicitud.");
    form.reset();
    result.innerHTML="<strong>Solicitud recibida.</strong><br>Gracias. Revisaremos tu información para preparar el siguiente paso.";
    result.className="demo-result success";
    button.textContent="Solicitud enviada ✓";
  }catch(error){
    result.textContent=error.message||"No pudimos registrar la solicitud.";
    result.className="demo-result error";
    button.disabled=false;button.innerHTML='Solicitar mi demo <span>→</span>';
  }
});