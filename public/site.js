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
