const menu=document.getElementById("menu");
const nav=document.getElementById("navLinks");

function closeMobileNav(){
  nav?.classList.remove("open");
  document.body.classList.remove("nav-open");
  menu?.setAttribute("aria-expanded","false");
  menu?.setAttribute("aria-label","Abrir menú");
  if(menu) menu.textContent="☰";
}

menu?.addEventListener("click",(event)=>{
  event.stopPropagation();
  const open=nav.classList.toggle("open");
  menu.setAttribute("aria-expanded",String(open));
  menu.setAttribute("aria-label",open?"Cerrar menú":"Abrir menú");
  document.body.classList.toggle("nav-open",open);
  menu.textContent=open?"×":"☰";
});

document.querySelectorAll("#navLinks a").forEach(a=>a.addEventListener("click",closeMobileNav));

document.addEventListener("keydown",(event)=>{
  if(event.key==="Escape") closeMobileNav();
});

document.addEventListener("click",(event)=>{
  if(!nav?.classList.contains("open")) return;
  if(nav.contains(event.target) || menu?.contains(event.target)) return;
  closeMobileNav();
});

window.addEventListener("resize",()=>{
  if(window.innerWidth>820) closeMobileNav();
},{passive:true});

const revealEls=document.querySelectorAll(".reveal");
if("IntersectionObserver" in window){
  const observer=new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },{threshold:.12,rootMargin:"0px 0px -30px 0px"});
  revealEls.forEach(el=>observer.observe(el));
}else{
  revealEls.forEach(el=>el.classList.add("visible"));
}

document.querySelectorAll(".faq-item").forEach((item)=>{
  item.addEventListener("toggle",()=>{
    if(!item.open)return;
    document.querySelectorAll(".faq-item").forEach((other)=>{if(other!==item)other.open=false;});
  });
});

const mobileDemoCta=document.querySelector(".mobile-demo-cta");
const contactSection=document.getElementById("contacto");
if(mobileDemoCta&&contactSection&&"IntersectionObserver" in window){
  const ctaObserver=new IntersectionObserver((entries)=>{
    entries.forEach(entry=>mobileDemoCta.classList.toggle("is-hidden",entry.isIntersecting));
  },{threshold:.15});
  ctaObserver.observe(contactSection);
}


// NEXO Growth V2: operational calculator
(function(){
  const conversations=document.getElementById("roiConversations");
  const minutes=document.getElementById("roiMinutes");
  const repeat=document.getElementById("roiRepeat");
  const cValue=document.getElementById("roiConversationsValue");
  const mValue=document.getElementById("roiMinutesValue");
  const rValue=document.getElementById("roiRepeatValue");
  const hours=document.getElementById("roiHours");
  function updateROI(){
    if(!conversations||!minutes||!repeat||!hours)return;
    const c=Number(conversations.value||0);
    const m=Number(minutes.value||0);
    const r=Number(repeat.value||0);
    cValue.textContent=c.toLocaleString("es-CO");
    mValue.textContent=m+" min";
    rValue.textContent=r+"%";
    hours.textContent=Math.round((c*m*(r/100))/60).toLocaleString("es-CO");
  }
  [conversations,minutes,repeat].forEach(el=>el?.addEventListener("input",updateROI));
  updateROI();
})();

const floatingWhatsapp=document.querySelector(".floating-whatsapp");
if(floatingWhatsapp&&contactSection&&"IntersectionObserver" in window){
  const waObserver=new IntersectionObserver((entries)=>{
    entries.forEach(entry=>floatingWhatsapp.classList.toggle("is-hidden",entry.isIntersecting));
  },{threshold:.2});
  waObserver.observe(contactSection);
}


// === NEXO INTERACTIVE DEMO · 2026-10-06 ===
(function(){
  const root=document.getElementById("interactiveDemo");
  if(!root)return;

  const chat=document.getElementById("interactiveDemoChat");
  const runButton=document.getElementById("runInteractiveDemo");
  const resetButton=document.getElementById("resetInteractiveDemo");
  const title=document.getElementById("demoScenarioTitle");
  const contactName=document.getElementById("demoContactName");
  const description=document.getElementById("demoScenarioDescription");
  const outcomeContext=document.getElementById("demoOutcomeContext");
  const outcomeAction=document.getElementById("demoOutcomeAction");
  const outcomeFollowup=document.getElementById("demoOutcomeFollowup");
  const outcomeStatus=document.getElementById("demoOutcomeStatus");
  const scenarioButtons=[...root.querySelectorAll("[data-demo-scenario]")];

  const scenarios={
    beauty:{
      contact:"Mariana López",
      title:"Mariana quiere agendar una limpieza facial",
      description:"Ejemplo ficticio de una clienta que pregunta por un servicio, define una preferencia de horario y deja una solicitud de cita organizada.",
      messages:[
        ["user","Hola, quiero hacerme una limpieza facial. ¿Cuánto cuesta y puedo pedir cita para mañana en la tarde?"],
        ["bot","Claro. La limpieza facial tiene la información y precio definidos por el negocio. Para la solicitud de mañana, ¿prefieres alrededor de las 3:00 p. m. o más tarde?"],
        ["user","A las 4:00 p. m. me sirve perfecto."],
        ["bot","Listo, Mariana. Tu cita para limpieza facial quedó confirmada para mañana a las 4:00 p. m."]
      ],
      context:"Mariana López · Limpieza facial",
      action:"Cita · mañana · 4:00 p. m.",
      followup:"Confirmado"
    },
    hotel:{
      contact:"Daniel Ruiz",
      title:"Daniel solicita alojamiento para dos personas",
      description:"Ejemplo ficticio de un huésped que comparte fechas y número de personas para crear una solicitud de alojamiento estructurada.",
      messages:[
        ["user","Hola, necesito una habitación para dos personas del 23 al 25 de octubre."],
        ["bot","Perfecto. ¿La solicitud es para dos adultos y buscas una sola habitación?"],
        ["user","Sí, dos adultos y una habitación."],
        ["bot","Listo, Daniel. Tu reserva quedó confirmada del 23 al 25 de octubre para dos adultos, una habitación."]
      ],
      context:"Daniel Ruiz · 2 adultos",
      action:"Reserva · 23–25 de octubre",
      followup:"Confirmado"
    },
    restaurant:{
      contact:"Laura Méndez",
      title:"Laura solicita una mesa en Laureles",
      description:"Ejemplo ficticio de una reserva donde NEXO recoge sede, hora y número de personas y deja el registro completo.",
      messages:[
        ["user","Hola, quiero una mesa para 4 este sábado a las 8 de la noche."],
        ["bot","Claro. ¿En cuál sede quieres hacer la solicitud?"],
        ["user","En Laureles."],
        ["bot","Perfecto, Laura. Tu reserva quedó confirmada para 4 personas en Laureles este sábado a las 8:00 p. m."]
      ],
      context:"Laura Méndez · 4 personas",
      action:"Reserva · Laureles · 8:00 p. m.",
      followup:"Confirmado"
    },
    clinic:{
      contact:"Andrés Molina",
      title:"Andrés solicita una cita de valoración",
      description:"Ejemplo ficticio centrado únicamente en agenda administrativa: tipo de cita, preferencia de horario y registro de la solicitud.",
      messages:[
        ["user","Hola, quisiera pedir una cita para una valoración la próxima semana."],
        ["bot","Claro. ¿Tienes preferencia por mañana o tarde?"],
        ["user","En la tarde, ojalá el jueves."],
        ["bot","Listo, Andrés. Tu cita de valoración quedó confirmada para el jueves en la tarde."]
      ],
      context:"Andrés Molina · Valoración",
      action:"Cita de valoración · Jueves tarde",
      followup:"Confirmado"
    }
  };
  let current="beauty";
  let timers=[];

  function clearTimers(){
    timers.forEach(clearTimeout);
    timers=[];
  }

  function addBubble(kind,text){
    const bubble=document.createElement("div");
    bubble.className="interactive-bubble "+kind;
    const label=document.createElement("small");
    label.textContent=kind==="bot"?"Asistente NEXO":(scenarios[current]?.contact||"Contacto ficticio");
    const body=document.createElement("p");
    body.textContent=text;
    bubble.append(label,body);
    chat.appendChild(bubble);
    chat.scrollTop=chat.scrollHeight;
  }

  function showTyping(){
    const typing=document.createElement("div");
    typing.className="interactive-typing";
    typing.id="interactiveTyping";
    typing.innerHTML="<i></i><i></i><i></i>";
    chat.appendChild(typing);
    chat.scrollTop=chat.scrollHeight;
  }

  function hideTyping(){
    document.getElementById("interactiveTyping")?.remove();
  }

  function reset(){
    clearTimers();
    hideTyping();
    const scenario=scenarios[current];
    chat.innerHTML="";
    addBubble("user",scenario.messages[0][1]);
    title.textContent=scenario.title;
    if(contactName) contactName.textContent=scenario.contact;
    description.textContent=scenario.description;
    outcomeContext.textContent=scenario.context;
    outcomeAction.textContent=scenario.action;
    outcomeFollowup.textContent=scenario.followup;
    outcomeStatus.classList.remove("complete");
    outcomeStatus.querySelector("span").textContent="Listo para iniciar";
    runButton.disabled=false;
    runButton.innerHTML='Probar conversación <span>→</span>';
  }

  function run(){
    reset();
    runButton.disabled=true;
    runButton.textContent="Ejecutando demo…";
    const scenario=scenarios[current];
    let delay=450;

    scenario.messages.slice(1).forEach(([kind,text],index)=>{
      if(kind==="bot"){
        timers.push(setTimeout(showTyping,delay));
        delay+=550;
        timers.push(setTimeout(()=>{hideTyping();addBubble(kind,text);},delay));
      }else{
        delay+=650;
        timers.push(setTimeout(()=>addBubble(kind,text),delay));
      }
      delay+=450;
    });

    timers.push(setTimeout(()=>{
      hideTyping();
      outcomeStatus.classList.add("complete");
      outcomeStatus.querySelector("span").textContent="Confirmación registrada en NEXO";
      runButton.disabled=false;
      runButton.innerHTML='Volver a probar <span>↻</span>';
    },delay+350));
  }

  scenarioButtons.forEach(button=>{
    button.addEventListener("click",()=>{
      current=button.dataset.demoScenario;
      scenarioButtons.forEach(item=>item.classList.toggle("active",item===button));
      reset();
    });
  });

  runButton?.addEventListener("click",run);
  resetButton?.addEventListener("click",reset);
  reset();
})();


// === NEXO PRIVACY-CONSCIOUS FUNNEL · 2026-10-06 ===
(function(){
  const STORAGE_KEY="nexo.web.funnel.v2";
  const LEGACY_STORAGE_KEY="nexo.web.funnel.v1";
  const PREF_KEY="nexo.analytics";
  const MAX_PAGES=20;
  const MAX_EVENTS=30;
  const SUPABASE_URL="https://ixewnbjndguchunwcuhf.supabase.co";
  const KEY="sb_publishable_vFnLRe9cmnOcyz2Fivprhw_8UjBaRGL";
  const TRACK_URL=SUPABASE_URL+"/functions/v1/track-web-event";

  const gpc=navigator.globalPrivacyControl===true;
  const dnt=[navigator.doNotTrack,window.doNotTrack,navigator.msDoNotTrack].some(value=>String(value||"").toLowerCase()==="1"||String(value||"").toLowerCase()==="yes");
  let preference="";
  try{preference=localStorage.getItem(PREF_KEY)||"";}catch{}
  const analyticsEnabled=preference!=="off"&&!gpc&&!dnt;
  try{sessionStorage.removeItem(LEGACY_STORAGE_KEY);}catch{}

  function safeUUID(){
    return crypto?.randomUUID?.()||"00000000-0000-4000-8000-"+Math.random().toString(16).slice(2,14).padEnd(12,"0").slice(0,12);
  }
  function read(){
    if(!analyticsEnabled)return {};
    try{return JSON.parse(sessionStorage.getItem(STORAGE_KEY)||"null")||{};}catch{return {};}
  }
  function write(data){
    if(!analyticsEnabled)return;
    try{sessionStorage.setItem(STORAGE_KEY,JSON.stringify(data));}catch{}
  }
  function cleanPath(url){
    try{
      const u=new URL(url,location.origin);
      return (u.pathname||"/").slice(0,160);
    }catch{
      const value=String(url||"").split(/[?#]/,1)[0];
      return value.startsWith("/")?value.slice(0,160):"/";
    }
  }
  function internalTarget(url){
    try{
      const u=new URL(url,location.origin);
      if(u.origin!==location.origin)return "";
      return cleanPath(u.href);
    }catch{return "";}
  }
  function referrerHost(){
    try{
      if(!document.referrer)return "";
      const u=new URL(document.referrer);
      return u.origin===location.origin?"":u.hostname.slice(0,120);
    }catch{return "";}
  }
  function safeToken(value,max=80){
    const token=String(value||"").trim().toLowerCase().replace(/[^a-z0-9._-]/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");
    return token.slice(0,max);
  }
  function normalizeIndustry(value){
    const raw=String(value||"").trim().toLowerCase();
    const map={
      "estetica":"estetica","estética":"estetica","estética & wellness":"estetica","beauty":"estetica",
      "hotel":"hotel","hoteles":"hotel",
      "restaurante":"restaurante","restaurant":"restaurante","restaurantes":"restaurante",
      "clinica":"clinica","clínica":"clinica","clínica / odontología":"clinica","clinic":"clinica",
      "otro":"otro","other":"otro"
    };
    return map[raw]||"";
  }
  function currentIndustry(){
    const params=new URLSearchParams(location.search);
    const fromQuery=normalizeIndustry(params.get("industry"));
    if(fromQuery)return fromQuery;
    const select=document.getElementById("demoIndustry");
    const fromSelect=normalizeIndustry(select?.value);
    if(fromSelect)return fromSelect;
    const path=location.pathname;
    if(/industria-estetica/i.test(path))return "estetica";
    if(/industria-hoteles/i.test(path))return "hotel";
    if(/industria-restaurantes/i.test(path))return "restaurante";
    if(/industria-clinicas/i.test(path))return "clinica";
    return "";
  }
  function currentPlan(){
    const params=new URLSearchParams(location.search);
    const raw=String(params.get("plan")||document.getElementById("demoPlan")?.value||"").toLowerCase();
    return ["start","growth","pro","custom","marketing"].includes(raw)?raw:"";
  }
  function placementFor(element){
    if(!element)return "unknown";
    if(element.classList?.contains("floating-whatsapp"))return "floating";
    if(element.classList?.contains("mobile-demo-cta"))return "mobile_sticky";
    if(element.closest?.("#navLinks"))return "navigation";
    if(element.closest?.(".hero,.vertical-hero,.pricing-hero,.subpage-hero,.marketing-hero"))return "hero";
    if(element.closest?.("#contacto,.contact,.quick-contact,.cta-panel,.pricing-cta,.marketing-cta"))return "cta_section";
    if(element.closest?.(".site-footer"))return "footer";
    return "body";
  }
  function eventLabel(anchor){
    const href=anchor?.href||"";
    let path="";
    try{path=new URL(href,location.origin).pathname||"";}catch{}
    if(/wa\.me\//i.test(href))return "whatsapp_click";
    if(/demo(?:-|\.)/i.test(path))return "demo_click";
    if(/nexo-marketing\.html/i.test(path))return "marketing_click";
    if(/planes\.html/i.test(path))return "plans_click";
    if(/caso-lia\.html/i.test(path))return "case_lia_click";
    if(/industria-/i.test(path))return "industry_click";
    if(/dashboard\.nexobyjv\.online/i.test(href))return "dashboard_click";
    return "";
  }

  function sanitizeDetail(type,detail){
    const input=detail&&typeof detail==="object"?detail:{};
    const output={};
    const industry=normalizeIndustry(input.industry||currentIndustry());
    const plan=String(input.plan||currentPlan()).toLowerCase();
    const scenario=String(input.scenario||"").toLowerCase();
    if(industry)output.industry=industry;
    if(["start","growth","pro","custom","marketing"].includes(plan))output.plan=plan;
    if(["beauty","hotel","restaurant","clinic"].includes(scenario))output.scenario=scenario;
    if(input.target_path){
      const target=String(input.target_path);
      if(target.startsWith("/"))output.target_path=target.slice(0,160);
    }
    if(input.placement)output.placement=safeToken(input.placement,40);
    return output;
  }

  function sendRemote(type,detail,data){
    if(!analyticsEnabled)return;
    const safe=sanitizeDetail(type,detail);
    const payload={
      event_id:safeUUID(),
      session_id:data.session_id,
      event_type:type,
      page_path:cleanPath(location.href),
      landing_path:data.landing||cleanPath(location.href),
      target_path:safe.target_path||null,
      placement:safe.placement||null,
      industry:safe.industry||null,
      plan:safe.plan||null,
      scenario:safe.scenario||null,
      utm_source:data.utm?.source||null,
      utm_medium:data.utm?.medium||null,
      utm_campaign:data.utm?.campaign||null,
      referrer_host:data.referrer_host||null
    };
    fetch(TRACK_URL,{
      method:"POST",
      headers:{"content-type":"application/json","apikey":KEY},
      body:JSON.stringify(payload),
      credentials:"omit",
      referrerPolicy:"no-referrer",
      keepalive:true
    }).catch(()=>{});
  }

  function setEnabled(enabled){
    try{
      localStorage.setItem(PREF_KEY,enabled?"on":"off");
      if(!enabled)sessionStorage.removeItem(STORAGE_KEY);
    }catch{}
  }

  if(!analyticsEnabled){
    try{sessionStorage.removeItem(STORAGE_KEY);}catch{}
    window.NEXOFunnel={
      disabled:true,
      track(){},
      get(){return {};},
      summary(){return "";},
      setEnabled
    };
    return;
  }

  const params=new URLSearchParams(location.search);
  const existing=read();
  let legacyReferrer="";
  try{
    if(existing.referrer)legacyReferrer=new URL(existing.referrer).hostname;
  }catch{}
  const funnel={
    session_id:existing.session_id||safeUUID(),
    started_at:existing.started_at||new Date().toISOString(),
    landing:existing.landing||cleanPath(location.href),
    referrer_host:existing.referrer_host||legacyReferrer||referrerHost(),
    utm:existing.utm||{
      source:safeToken(params.get("utm_source"),80),
      medium:safeToken(params.get("utm_medium"),80),
      campaign:safeToken(params.get("utm_campaign"),120)
    },
    pages:Array.isArray(existing.pages)?existing.pages:[],
    events:Array.isArray(existing.events)?existing.events:[]
  };

  const currentPath=cleanPath(location.href);
  if(!funnel.pages.length||funnel.pages[funnel.pages.length-1]?.path!==currentPath){
    funnel.pages.push({path:currentPath,at:new Date().toISOString()});
    funnel.pages=funnel.pages.slice(-MAX_PAGES);
  }
  write(funnel);

  function track(type,detail={}){
    if(!type)return;
    const next=read();
    if(!next.session_id)return;
    const safe=sanitizeDetail(type,detail);
    next.events=Array.isArray(next.events)?next.events:[];
    next.events.push({
      type,
      ...safe,
      at:new Date().toISOString()
    });
    next.events=next.events.slice(-MAX_EVENTS);
    write(next);
    sendRemote(type,safe,next);
  }

  document.addEventListener("click",(event)=>{
    const run=event.target.closest?.("#runInteractiveDemo");
    if(run){
      track("interactive_demo_run",{
        scenario:document.querySelector("[data-demo-scenario].active")?.dataset?.demoScenario||"",
        placement:"interactive_demo"
      });
      return;
    }
    const anchor=event.target.closest?.("a");
    if(!anchor)return;
    const label=eventLabel(anchor);
    if(!label)return;
    const detail={placement:placementFor(anchor)};
    const target=internalTarget(anchor.href);
    if(target)detail.target_path=target;
    track(label,detail);
  },{passive:true});

  sendRemote("page_view",{industry:currentIndustry(),plan:currentPlan()},funnel);

  window.NEXOFunnel={
    disabled:false,
    track,
    get(){return read();},
    setEnabled,
    summary(){
      const data=read();
      const pages=(data.pages||[]).map(item=>item.path).filter(Boolean);
      const events=(data.events||[]).map(item=>item.type).filter(Boolean);
      const utm=data.utm||{};
      return [
        data.session_id&&"Session: "+data.session_id,
        data.landing&&"Landing: "+data.landing,
        pages.length&&"Recorrido: "+pages.join(" → "),
        events.length&&"Eventos: "+events.join(" · "),
        utm.source&&"UTM: "+[utm.source,utm.medium,utm.campaign].filter(Boolean).join(" / "),
        data.referrer_host&&"Referrer host: "+data.referrer_host
      ].filter(Boolean).join("\n");
    }
  };
})();


/* Nora · NEXO website assistant */
(()=>{
  if(document.querySelector('script[data-nora-loader]')) return;
  const script=document.createElement("script");
  script.src="./nora.js?v=20261008-nora1";
  script.defer=true;
  script.dataset.noraLoader="1";
  document.head.appendChild(script);
})();
