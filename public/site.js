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
