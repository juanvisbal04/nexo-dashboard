const menu=document.getElementById("menu");
const nav=document.getElementById("navLinks");

function closeMobileNav(){
  nav?.classList.remove("open");
  menu?.setAttribute("aria-expanded","false");
  if(menu) menu.textContent="☰";
}

menu?.addEventListener("click",(event)=>{
  event.stopPropagation();
  const open=nav.classList.toggle("open");
  menu.setAttribute("aria-expanded",String(open));
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
  const description=document.getElementById("demoScenarioDescription");
  const outcomeContext=document.getElementById("demoOutcomeContext");
  const outcomeAction=document.getElementById("demoOutcomeAction");
  const outcomeFollowup=document.getElementById("demoOutcomeFollowup");
  const outcomeStatus=document.getElementById("demoOutcomeStatus");
  const scenarioButtons=[...root.querySelectorAll("[data-demo-scenario]")];

  const scenarios={
    beauty:{
      title:"Estética & wellness",
      description:"Una consulta de servicio se organiza como una solicitud lista para seguimiento.",
      messages:[
        ["user","Hola, quiero saber el precio de una limpieza facial y si tienen disponibilidad mañana."],
        ["bot","Claro. Puedo compartirte la información aprobada del servicio y ayudarte a revisar opciones para registrar tu solicitud."],
        ["user","Sí, quiero dejar la solicitud."],
        ["bot","Perfecto. Dejo tu interés organizado para que el negocio pueda continuar el seguimiento."]
      ],
      context:"Servicio identificado",action:"Solicitud registrada",followup:"Seguimiento visible"
    },
    hotel:{
      title:"Hotel",
      description:"La conversación recoge fechas y huéspedes antes de pasar la solicitud a recepción.",
      messages:[
        ["user","Hola, busco habitación para dos personas este fin de semana."],
        ["bot","Claro. Puedo ayudarte a organizar la solicitud. ¿Qué fechas de entrada y salida necesitas?"],
        ["user","Del viernes al domingo, para dos adultos."],
        ["bot","Listo. La solicitud queda estructurada con fechas y huéspedes para revisar disponibilidad y continuar con recepción."]
      ],
      context:"Fechas + huéspedes",action:"Solicitud organizada",followup:"Recepción puede continuar"
    },
    restaurant:{
      title:"Restaurante",
      description:"Una intención de reserva se transforma en datos claros para la operación.",
      messages:[
        ["user","Quiero reservar una mesa para 4 mañana en la noche."],
        ["bot","Con gusto. Puedo registrar la solicitud. ¿Qué sede prefieres?"],
        ["user","Laureles, alrededor de las 8:00 p. m."],
        ["bot","Perfecto. Dejo organizada la sede, hora y número de personas para continuar con la confirmación."]
      ],
      context:"Sede + horario",action:"Reserva solicitada",followup:"Pendiente de confirmación"
    },
    clinic:{
      title:"Clínica",
      description:"NEXO organiza una solicitud administrativa sin reemplazar el criterio profesional.",
      messages:[
        ["user","Hola, quisiera pedir una cita para una valoración."],
        ["bot","Claro. Puedo ayudarte con la solicitud administrativa y recopilar los datos necesarios para agenda."],
        ["user","Me gustaría esta semana en la tarde."],
        ["bot","Perfecto. Dejo registrada tu preferencia para que el equipo revise opciones y continúe contigo."]
      ],
      context:"Tipo de cita",action:"Solicitud de agenda",followup:"Equipo revisa opciones"
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
    label.textContent=kind==="bot"?"Asistente NEXO":"Cliente";
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
      outcomeStatus.querySelector("span").textContent="Acción organizada en NEXO";
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
