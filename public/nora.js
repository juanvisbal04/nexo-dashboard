(()=>{
  if(window.__NEXO_NORA_LOADED__) return;
  window.__NEXO_NORA_LOADED__=true;

  const ENDPOINT="https://ixewnbjndguchunwcuhf.supabase.co/functions/v1/nora-web-chat";
  const WA_URL="https://wa.me/573006150188?text=Hola%20NEXO,%20estaba%20hablando%20con%20Nora%20en%20la%20web%20y%20quiero%20continuar.";
  const VISITOR_KEY="nexo_nora_visitor_v1";
  const SESSION_KEY="nexo_nora_session_v1";
  const STATE_KEY="nexo_nora_state_v1";
  const TEASER_KEY="nexo_nora_teaser_v1";
  const MAX_STORED_MESSAGES=40;

  const qs=new URLSearchParams(location.search);
  const now=Date.now();
  const uuid=()=>crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const getVisitor=()=>{
    let id=localStorage.getItem(VISITOR_KEY);
    if(!id){id=uuid();localStorage.setItem(VISITOR_KEY,id);}
    return id;
  };
  const readState=()=>{
    try{
      const parsed=JSON.parse(localStorage.getItem(STATE_KEY)||"null");
      if(!parsed||!parsed.saved_at||now-parsed.saved_at>12*60*60*1000) return null;
      return parsed;
    }catch{return null;}
  };
  const saved=readState();
  const state={
    visitorId:getVisitor(),
    sessionId:saved?.session_id||localStorage.getItem(SESSION_KEY)||null,
    product:saved?.product||null,
    started:Boolean(saved?.session_id),
    open:false,
    loading:false,
    messages:Array.isArray(saved?.messages)?saved.messages.slice(-MAX_STORED_MESSAGES):[],
  };

  function persist(){
    if(state.sessionId) localStorage.setItem(SESSION_KEY,state.sessionId);
    localStorage.setItem(STATE_KEY,JSON.stringify({
      session_id:state.sessionId,
      product:state.product,
      messages:state.messages.slice(-MAX_STORED_MESSAGES),
      saved_at:Date.now()
    }));
  }
  function clearConversation(){
    state.sessionId=null;state.product=null;state.started=false;state.messages=[];
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(STATE_KEY);
  }

  function injectAssets(){
    if(!document.querySelector('link[data-nora-css]')){
      const link=document.createElement("link");
      link.rel="stylesheet";
      link.href="./nora.css?v=20261008-nora1";
      link.dataset.noraCss="1";
      document.head.appendChild(link);
    }
  }

  function createUi(){
    const launcher=document.createElement("button");
    launcher.type="button";
    launcher.className="nora-launcher";
    launcher.setAttribute("aria-label","Abrir conversación con Nora, asistente de NEXO");
    launcher.innerHTML='<span class="nora-launcher-avatar">N</span><span class="nora-launcher-copy"><b>Nora</b><span>Asistente de NEXO</span></span><span class="nora-launcher-dot"></span>';

    const teaser=document.createElement("div");
    teaser.className="nora-teaser";
    teaser.innerHTML='<button type="button" class="nora-teaser-close" aria-label="Cerrar">×</button><b>Hola, soy Nora 👋</b><span>Si me cuentas qué quieres mejorar, te ayudo a encontrar por dónde empezar con NEXO.</span>';

    const panel=document.createElement("section");
    panel.className="nora-panel";
    panel.setAttribute("role","dialog");
    panel.setAttribute("aria-label","Nora, asistente de NEXO");
    panel.innerHTML=`
      <header class="nora-head">
        <span class="nora-head-avatar">N</span>
        <div class="nora-head-copy"><b>Nora · Asistente de NEXO</b><span>En línea</span></div>
        <div class="nora-head-actions">
          <button type="button" data-nora-reset aria-label="Nueva conversación">↻</button>
          <button type="button" data-nora-close aria-label="Cerrar">×</button>
        </div>
      </header>
      <div class="nora-messages" aria-live="polite"></div>
      <div class="nora-quick"></div>
      <div>
        <form class="nora-composer">
          <textarea rows="1" maxlength="1200" placeholder="Escríbele a Nora…" aria-label="Mensaje para Nora"></textarea>
          <button class="nora-send" type="submit" aria-label="Enviar mensaje">→</button>
        </form>
        <div class="nora-foot">Nora puede ayudarte a orientarte y registrar tu solicitud. <a href="./privacidad.html">Privacidad</a></div>
      </div>
    `;

    document.body.append(teaser,panel,launcher);
    return {
      launcher,teaser,panel,
      messages:panel.querySelector(".nora-messages"),
      quick:panel.querySelector(".nora-quick"),
      form:panel.querySelector(".nora-composer"),
      input:panel.querySelector("textarea"),
      send:panel.querySelector(".nora-send"),
      close:panel.querySelector("[data-nora-close]"),
      reset:panel.querySelector("[data-nora-reset]"),
      teaserClose:teaser.querySelector(".nora-teaser-close"),
    };
  }

  injectAssets();
  const ui=createUi();

  function addMessage(role,content,{store=true}={}){
    const row=document.createElement("div");
    row.className=`nora-message ${role}`;
    const bubble=document.createElement("div");
    bubble.className="nora-bubble";
    bubble.textContent=content;
    row.appendChild(bubble);
    ui.messages.appendChild(row);
    ui.messages.scrollTop=ui.messages.scrollHeight;
    if(store){
      state.messages.push({role,content});
      state.messages=state.messages.slice(-MAX_STORED_MESSAGES);
      persist();
    }
    return row;
  }
  function restoreMessages(){
    ui.messages.innerHTML="";
    state.messages.forEach((m)=>addMessage(m.role,m.content,{store:false}));
  }
  function setLoading(flag){
    state.loading=flag;
    ui.send.disabled=flag;
    ui.input.disabled=flag;
    ui.quick.querySelectorAll("button").forEach((b)=>b.disabled=flag);
  }
  function showTyping(){
    const row=document.createElement("div");
    row.className="nora-message assistant";
    row.dataset.typing="1";
    row.innerHTML='<div class="nora-bubble nora-typing"><i></i><i></i><i></i></div>';
    ui.messages.appendChild(row);
    ui.messages.scrollTop=ui.messages.scrollHeight;
  }
  function hideTyping(){ui.messages.querySelector('[data-typing="1"]')?.remove();}
  function showError(message){
    ui.panel.querySelector(".nora-error")?.remove();
    const div=document.createElement("div");
    div.className="nora-error";
    div.textContent=message;
    ui.quick.before(div);
  }
  function clearError(){ui.panel.querySelector(".nora-error")?.remove();}

  function renderQuick(items=[]){
    ui.quick.innerHTML="";
    if(!items.length){ui.quick.style.display="none";return;}
    ui.quick.style.display="flex";
    items.forEach((item)=>{
      const button=document.createElement("button");
      button.type="button";
      button.textContent=item.label;
      button.dataset.quick=item.id;
      button.addEventListener("click",()=>handleQuick(item));
      ui.quick.appendChild(button);
    });
  }

  function productFromQuick(id){
    if(id==="product_assistants") return "assistants";
    if(id==="product_marketing") return "marketing";
    if(id==="product_solutions") return "solutions";
    return state.product;
  }
  function productUrl(){
    if(state.product==="marketing") return "./nexo-marketing.html";
    if(state.product==="assistants") return "./catalogo.html#assistants";
    return "./catalogo.html#lineas";
  }

  async function callNora(payload){
    const response=await fetch(ENDPOINT,{
      method:"POST",
      headers:{"content-type":"application/json","x-client-info":"nexo-web-nora/1"},
      body:JSON.stringify({
        visitor_id:state.visitorId,
        session_id:state.sessionId,
        source_path:location.pathname+location.search,
        landing_path:sessionStorage.getItem("nexo_nora_landing")||location.pathname,
        utm_source:qs.get("utm_source")||null,
        utm_medium:qs.get("utm_medium")||null,
        utm_campaign:qs.get("utm_campaign")||null,
        ...payload
      })
    });
    let data={};
    try{data=await response.json();}catch{}
    if(!response.ok) throw new Error(data.error||"No pude conectar con Nora.");
    return data;
  }

  async function startConversation(){
    if(state.started&&state.sessionId){
      restoreMessages();
      if(!state.messages.length){
        clearConversation();
      }else{
        renderQuick([]);
        return;
      }
    }
    setLoading(true);clearError();showTyping();
    try{
      const data=await callNora({action:"start"});
      hideTyping();
      state.sessionId=data.session_id;
      state.started=true;
      state.messages=[];
      addMessage("assistant",data.reply);
      renderQuick(data.quick_replies||[]);
      persist();
    }catch(error){
      hideTyping();
      showError(error.message||"Nora no pudo iniciar la conversación.");
    }finally{
      setLoading(false);
      ui.input.focus({preventScroll:true});
    }
  }

  async function sendMessage(text,quickId=""){
    const value=String(text||"").trim();
    if(!value||state.loading)return;
    addMessage("user",value);
    renderQuick([]);
    setLoading(true);clearError();showTyping();
    try{
      const data=await callNora({action:"message",message:value,quick_reply:quickId||null});
      hideTyping();
      if(data.session_id) state.sessionId=data.session_id;
      addMessage("assistant",data.reply||"Estoy aquí.");
      renderQuick(data.quick_replies||[]);
      persist();
    }catch(error){
      hideTyping();
      showError(error.message||"No pude enviar tu mensaje. Intenta de nuevo.");
    }finally{
      setLoading(false);
      ui.input.focus({preventScroll:true});
    }
  }

  async function handleQuick(item){
    if(item.id==="open_whatsapp"){
      window.open(WA_URL,"_blank","noopener");
      return;
    }
    if(item.id==="view_product"){
      location.href=productUrl();
      return;
    }
    if(item.id==="restart"){
      clearConversation();
      restoreMessages();
      await startConversation();
      return;
    }
    state.product=productFromQuick(item.id);
    persist();
    await sendMessage(item.label,item.id);
  }

  function openPanel(){
    state.open=true;
    ui.panel.classList.add("open");
    ui.teaser.classList.remove("show");
    ui.launcher.setAttribute("aria-expanded","true");
    if(!state.started||!state.sessionId) startConversation();
    else restoreMessages();
    setTimeout(()=>ui.input.focus({preventScroll:true}),180);
  }
  function closePanel(){
    state.open=false;
    ui.panel.classList.remove("open");
    ui.launcher.setAttribute("aria-expanded","false");
  }

  ui.launcher.addEventListener("click",()=>state.open?closePanel():openPanel());
  ui.close.addEventListener("click",closePanel);
  ui.reset.addEventListener("click",async()=>{
    clearConversation();
    restoreMessages();
    renderQuick([]);
    await startConversation();
  });
  ui.teaser.addEventListener("click",(event)=>{
    if(event.target.closest(".nora-teaser-close"))return;
    openPanel();
  });
  ui.teaserClose.addEventListener("click",()=>{
    ui.teaser.classList.remove("show");
    localStorage.setItem(TEASER_KEY,String(Date.now()));
  });

  ui.form.addEventListener("submit",(event)=>{
    event.preventDefault();
    const value=ui.input.value.trim();
    if(!value)return;
    ui.input.value="";
    ui.input.style.height="";
    sendMessage(value);
  });
  ui.input.addEventListener("keydown",(event)=>{
    if(event.key==="Enter"&&!event.shiftKey){
      event.preventDefault();
      ui.form.requestSubmit();
    }
  });
  ui.input.addEventListener("input",()=>{
    ui.input.style.height="auto";
    ui.input.style.height=Math.min(ui.input.scrollHeight,100)+"px";
  });
  document.addEventListener("keydown",(event)=>{
    if(event.key==="Escape"&&state.open)closePanel();
  });

  restoreMessages();

  const lastTeaser=Number(localStorage.getItem(TEASER_KEY)||0);
  if(Date.now()-lastTeaser>24*60*60*1000){
    setTimeout(()=>{
      if(!state.open){
        ui.teaser.classList.add("show");
        localStorage.setItem(TEASER_KEY,String(Date.now()));
        setTimeout(()=>ui.teaser.classList.remove("show"),9000);
      }
    },4200);
  }
})();