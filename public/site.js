const menu=document.getElementById("menu");
const nav=document.getElementById("navLinks");
menu?.addEventListener("click",()=>{
  const open=nav.classList.toggle("open");
  menu.setAttribute("aria-expanded",String(open));
  menu.textContent=open?"×":"☰";
});
document.querySelectorAll("#navLinks a").forEach(a=>a.addEventListener("click",()=>{
  nav.classList.remove("open");menu?.setAttribute("aria-expanded","false");if(menu)menu.textContent="☰";
}));
const observer=new IntersectionObserver((entries)=>{
  entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("visible");observer.unobserve(entry.target);}});
},{threshold:.12,rootMargin:"0px 0px -30px 0px"});
document.querySelectorAll(".reveal").forEach(el=>observer.observe(el));

document.querySelectorAll(".faq-item").forEach((item)=>{
  item.addEventListener("toggle",()=>{
    if(!item.open)return;
    document.querySelectorAll(".faq-item").forEach((other)=>{if(other!==item)other.open=false;});
  });
});
const mobileDemoCta=document.querySelector(".mobile-demo-cta");
const contactSection=document.getElementById("contacto");
if(mobileDemoCta&&contactSection){
  const ctaObserver=new IntersectionObserver((entries)=>{
    entries.forEach(entry=>mobileDemoCta.classList.toggle("is-hidden",entry.isIntersecting));
  },{threshold:.15});
  ctaObserver.observe(contactSection);
}
