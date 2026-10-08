import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"content-type, apikey, x-client-info",
  "access-control-allow-methods":"POST, OPTIONS",
  "cache-control":"no-store",
};
const clean=(value:unknown,max=1200)=>String(value??"").trim().slice(0,max);
const norm=(value:unknown)=>clean(value,1200).toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...CORS,"content-type":"application/json; charset=utf-8"}
});
const emailRe=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRe=/\+?[0-9][0-9\s().-]{6,24}/;

type Quick={id:string,label:string};
type SessionRow={
  id:string; visitor_id:string; status:string; stage:string; product_interest:string|null;
  goal:string|null; full_name:string|null; business_name:string|null; email:string|null;
  phone:string|null; industry:string|null; privacy_consent:boolean; source_path:string|null;
  landing_path:string|null; utm_source:string|null; utm_medium:string|null; utm_campaign:string|null;
  lead_id:string|null; message_count:number;
};

const productButtons:Quick[]=[
  {id:"product_assistants",label:"Quiero automatizar atención"},
  {id:"product_marketing",label:"Necesito web, catálogo o branding"},
  {id:"product_solutions",label:"Tengo un proyecto especial"},
  {id:"product_exploring",label:"Solo estoy explorando"},
];

const assistantGoals:Quick[]=[
  {id:"goal_service",label:"Atención y WhatsApp"},
  {id:"goal_leads",label:"Leads y ventas"},
  {id:"goal_booking",label:"Reservas o citas"},
  {id:"goal_followup",label:"Seguimiento e integraciones"},
];

const marketingGoals:Quick[]=[
  {id:"goal_web",label:"Web o landing page"},
  {id:"goal_catalog",label:"Catálogo o brochure"},
  {id:"goal_brand",label:"Branding / identidad"},
  {id:"goal_campaign",label:"Creativos o campaña"},
  {id:"goal_presence",label:"Mejorar presencia digital"},
];

const productName=(key:string|null)=>{
  if(key==="assistants") return "NEXO Assistants";
  if(key==="marketing") return "NEXO Marketing";
  if(key==="solutions") return "NEXO Solutions";
  return "NEXO";
};
const goalLabel=(id:string,message:string)=>{
  const labels:Record<string,string>={
    goal_service:"Atención y WhatsApp",
    goal_leads:"Leads y ventas",
    goal_booking:"Reservas o citas",
    goal_followup:"Seguimiento e integraciones",
    goal_web:"Web o landing page",
    goal_catalog:"Catálogo o brochure",
    goal_brand:"Branding / identidad visual",
    goal_campaign:"Creativos o campaña",
    goal_presence:"Presencia digital y conversión",
  };
  return labels[id]||clean(message,500);
};
function detectProduct(message:string,quick:string){
  if(quick==="product_assistants") return "assistants";
  if(quick==="product_marketing") return "marketing";
  if(quick==="product_solutions") return "solutions";
  if(quick==="product_exploring") return "exploring";
  const n=norm(message);
  if(/marketing|pagina|web|landing|catalog|brochure|branding|logo|identidad|publicidad|campana|creativo/.test(n)) return "marketing";
  if(/asistente|whatsapp|chat|atencion|reserva|cita|lead|seguimiento|automatiz/.test(n)) return "assistants";
  if(/software|integracion|proyecto|sistema|dashboard|solucion a medida|personalizado/.test(n)) return "solutions";
  return null;
}
function pricingAnswer(product:string|null){
  if(product==="marketing") return "NEXO Marketing se cotiza por alcance: depende de si necesitas web, catálogo, branding, piezas o una combinación. No te voy a inventar un precio sin entender primero el proyecto.";
  if(product==="assistants") return "En NEXO Assistants tenemos planes Start, Growth y Pro, además de Custom. El valor depende del alcance e integraciones; puedo ayudarte a identificar cuál encaja mejor.";
  if(product==="solutions") return "NEXO Solutions se cotiza como proyecto a medida, porque combina componentes distintos según el problema que quieras resolver.";
  return "Tenemos modelos distintos: Assistants funciona con planes, Marketing se cotiza por proyecto y Solutions se diseña a medida. Dime cuál te interesa y te oriento.";
}
function nextPrompt(session:SessionRow){
  if(session.stage==="ask_goal"){
    if(session.product_interest==="assistants") return {reply:"¿Qué te gustaría mejorar primero?",quick_replies:assistantGoals};
    if(session.product_interest==="marketing") return {reply:"¿Qué necesitas trabajar primero?",quick_replies:marketingGoals};
    return {reply:"Cuéntame en una frase qué quieres resolver o construir.",quick_replies:[]};
  }
  if(session.stage==="ask_business") return {reply:"Perfecto. ¿Cómo se llama tu negocio o proyecto?",quick_replies:[]};
  if(session.stage==="ask_industry") return {reply:"¿A qué se dedica tu negocio? Con una frase corta está bien.",quick_replies:[]};
  if(session.stage==="ask_name") return {reply:"¿Cómo te llamas?",quick_replies:[]};
  if(session.stage==="ask_contact") return {reply:"¿Dónde prefieres que te contactemos? Puedes dejarme tu correo o WhatsApp. Al compartirlo aceptas nuestra Política de Privacidad para que el equipo de NEXO te contacte.",quick_replies:[]};
  return {reply:"¿En qué más te puedo ayudar?",quick_replies:productButtons};
}
async function addMessage(sessionId:string,role:"user"|"assistant"|"system",content:string,metadata:Record<string,unknown>={}){
  await service.from("nora_web_messages").insert({session_id:sessionId,role,content,metadata});
}
async function hashKey(value:string){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,"0")).join("");
}
async function rateLimit(req:Request){
  const ip=clean(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown",100);
  const bucketMs=10*60*1000;
  const bucketStart=new Date(Math.floor(Date.now()/bucketMs)*bucketMs).toISOString();
  const key=await hashKey(`${ip}:${bucketStart}`);
  const existing=await service.from("nora_web_rate_limits").select("request_count,window_start").eq("rate_key",key).maybeSingle();
  const count=Number(existing.data?.request_count||0);
  if(count>=40) return false;
  await service.from("nora_web_rate_limits").upsert({
    rate_key:key,window_start:bucketStart,request_count:count+1,updated_at:new Date().toISOString()
  });
  return true;
}
async function findOwner(product:string|null){
  const founder=await service.from("profiles").select("id").eq("platform_role","platform_admin").order("created_at").limit(1).maybeSingle();
  if(product!=="marketing") return founder.data?.id||null;
  const role=await service.from("nexo_team_roles").select("id").eq("role_key","marketing_lead").eq("active",true).maybeSingle();
  if(!role.data?.id) return founder.data?.id||null;
  const user=await service.from("nexo_user_roles").select("user_id").eq("role_id",role.data.id).eq("active",true).order("created_at").limit(1).maybeSingle();
  return user.data?.user_id||founder.data?.id||null;
}
async function createLead(session:SessionRow){
  if(session.lead_id) return session.lead_id;
  const owner=await findOwner(session.product_interest);
  const product=productName(session.product_interest);
  const source=`nora_web_${session.product_interest||"general"}`;
  const planInterest=session.product_interest==="marketing"?"marketing":null;
  const summary=[
    "Capturado por Nora, asistente web de NEXO.",
    `Producto: ${product}.`,
    session.goal?`Necesidad: ${session.goal}.`:"",
    session.industry?`Industria: ${session.industry}.`:"",
    session.source_path?`Página: ${session.source_path}.`:"",
    `Sesión Nora: ${session.id}.`
  ].filter(Boolean).join(" ");

  const insert=await service.from("demo_requests").insert({
    full_name:session.full_name||"Visitante web",
    business_name:session.business_name||"Negocio por confirmar",
    email:session.email||null,
    phone:session.phone||null,
    industry:session.industry||null,
    message:summary,
    crm_notes:summary,
    source,
    status:"Nuevo",
    stage:"prospecto",
    plan_interest:planInterest,
    expected_mrr:null,
    expected_setup_fee:null,
    owner_user_id:owner,
    privacy_consent:true,
    privacy_consent_at:new Date().toISOString(),
    privacy_policy_version:"2026-10-08"
  }).select("id").single();
  if(insert.error) throw insert.error;

  await service.from("nora_web_sessions").update({
    lead_id:insert.data.id,status:"lead_created",stage:"lead_created",privacy_consent:true
  }).eq("id",session.id);

  await service.from("web_funnel_events").insert({
    event_id:crypto.randomUUID(),
    session_id:session.id,
    event_type:"demo_submit_success",
    page_path:session.source_path||"/",
    landing_path:session.landing_path||session.source_path||"/",
    target_path:"/nora",
    placement:"nora_web_chat",
    industry:session.industry||null,
    plan:planInterest,
    scenario:session.product_interest||null,
    utm_source:session.utm_source||null,
    utm_medium:session.utm_medium||null,
    utm_campaign:session.utm_campaign||null
  });

  return insert.data.id;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:CORS});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  if(Number(req.headers.get("content-length")||"0")>16000) return json({error:"Payload too large"},413);
  if(!(await rateLimit(req))) return json({error:"Has enviado demasiados mensajes. Intenta de nuevo en unos minutos."},429);

  try{
    const body=await req.json().catch(()=>({}));
    const action=clean(body.action,40)||"message";
    const visitorId=clean(body.visitor_id,120)||crypto.randomUUID();
    const sourcePath=clean(body.source_path,240)||"/";
    const landingPath=clean(body.landing_path,240)||sourcePath;
    const message=clean(body.message,1200);
    const quick=clean(body.quick_reply,80);

    if(action==="start"){
      const insert=await service.from("nora_web_sessions").insert({
        visitor_id:visitorId,stage:"welcome",source_path:sourcePath,landing_path:landingPath,
        utm_source:clean(body.utm_source,120)||null,
        utm_medium:clean(body.utm_medium,120)||null,
        utm_campaign:clean(body.utm_campaign,160)||null,
      }).select("*").single();
      if(insert.error) throw insert.error;
      const greeting="Hola 👋 Soy Nora, asistente de NEXO. Puedo ayudarte a identificar qué necesitas y, si tiene sentido, dejar todo listo para que nuestro equipo continúe contigo. ¿Qué te gustaría trabajar?";
      await addMessage(insert.data.id,"assistant",greeting,{stage:"welcome"});
      return json({ok:true,session_id:insert.data.id,mode:"guided",reply:greeting,quick_replies:productButtons});
    }

    const sessionId=clean(body.session_id,80);
    if(!sessionId) return json({error:"session_id is required"},400);
    const loaded=await service.from("nora_web_sessions").select("*").eq("id",sessionId).eq("visitor_id",visitorId).maybeSingle();
    if(loaded.error) throw loaded.error;
    if(!loaded.data) return json({error:"Sesión no encontrada"},404);
    let session=loaded.data as SessionRow;
    if(session.message_count>=80) return json({error:"Esta conversación alcanzó su límite. Escríbenos por WhatsApp para continuar."},429);
    if(!message&&!quick) return json({error:"Escribe un mensaje"},400);

    const displayMessage=message||quick;
    await addMessage(session.id,"user",displayMessage,{quick_reply:quick||null,stage:session.stage});
    await service.from("nora_web_sessions").update({
      message_count:session.message_count+1,last_message_at:new Date().toISOString()
    }).eq("id",session.id);

    const lower=norm(displayMessage);
    if(/precio|cuanto|costo|valor|tarifa|plan/.test(lower)){
      const answer=pricingAnswer(session.product_interest);
      const prompt=nextPrompt(session);
      const reply=`${answer}\n\n${prompt.reply}`;
      await addMessage(session.id,"assistant",reply,{intent:"pricing"});
      return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:prompt.quick_replies});
    }

    if(/humano|persona|asesor|juan|hablar con alguien|contactar/.test(lower)&&session.stage!=="ask_contact"){
      await service.from("nora_web_sessions").update({stage:"ask_contact"}).eq("id",session.id);
      const reply="Claro. Puedo dejar tu solicitud lista para una persona del equipo. ¿Me compartes tu correo o WhatsApp? Al compartirlo aceptas nuestra Política de Privacidad para que NEXO te contacte.";
      await addMessage(session.id,"assistant",reply,{intent:"handoff"});
      return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:[]});
    }

    if(session.stage==="welcome"){
      const product=detectProduct(displayMessage,quick);
      if(!product){
        const reply="Puedo orientarte en tres frentes: NEXO Assistants para atención y automatización, NEXO Marketing para web/branding/catálogos, y NEXO Solutions para proyectos a medida. ¿Cuál se parece más a lo que buscas?";
        await addMessage(session.id,"assistant",reply,{stage:"welcome"});
        return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:productButtons});
      }
      if(product==="exploring"){
        await service.from("nora_web_sessions").update({product_interest:"exploring",stage:"welcome"}).eq("id",session.id);
        const reply="Perfecto. NEXO tiene tres líneas: Assistants, Marketing y Solutions. Puedes explorar sin compromiso; dime qué te llamó la atención o elige una opción para que te muestre por dónde empezar.";
        await addMessage(session.id,"assistant",reply,{stage:"welcome"});
        return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:productButtons.slice(0,3)});
      }
      const intro=product==="assistants"
        ?"Perfecto. NEXO Assistants se diseña alrededor de la lógica real del negocio, no como un bot genérico."
        :product==="marketing"
          ?"Perfecto. NEXO Marketing trabaja web, catálogos, branding, creativos y presencia digital con un objetivo comercial claro."
          :"Perfecto. NEXO Solutions es para problemas que requieren una solución más personalizada o varias capacidades conectadas.";
      await service.from("nora_web_sessions").update({product_interest:product,stage:"ask_goal"}).eq("id",session.id);
      session={...session,product_interest:product,stage:"ask_goal"};
      const prompt=nextPrompt(session);
      const reply=`${intro}\n\n${prompt.reply}`;
      await addMessage(session.id,"assistant",reply,{stage:"ask_goal",product});
      return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:prompt.quick_replies});
    }

    if(session.stage==="ask_goal"){
      const goal=goalLabel(quick,displayMessage);
      await service.from("nora_web_sessions").update({goal,stage:"ask_business"}).eq("id",session.id);
      const reply="Entiendo. Para aterrizarlo mejor: ¿cómo se llama tu negocio o proyecto?";
      await addMessage(session.id,"assistant",reply,{stage:"ask_business"});
      return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:[]});
    }

    if(session.stage==="ask_business"){
      await service.from("nora_web_sessions").update({business_name:clean(displayMessage,160),stage:"ask_industry"}).eq("id",session.id);
      const reply="¿A qué se dedica tu negocio? Con una frase corta está bien.";
      await addMessage(session.id,"assistant",reply,{stage:"ask_industry"});
      return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:[]});
    }

    if(session.stage==="ask_industry"){
      await service.from("nora_web_sessions").update({industry:clean(displayMessage,120),stage:"ask_name"}).eq("id",session.id);
      const reply="Perfecto. ¿Cómo te llamas?";
      await addMessage(session.id,"assistant",reply,{stage:"ask_name"});
      return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:[]});
    }

    if(session.stage==="ask_name"){
      await service.from("nora_web_sessions").update({full_name:clean(displayMessage,120),stage:"ask_contact"}).eq("id",session.id);
      const reply="Gracias. ¿Dónde prefieres que te contactemos? Puedes dejarme tu correo o WhatsApp. Al compartirlo aceptas nuestra Política de Privacidad para que el equipo de NEXO te contacte.";
      await addMessage(session.id,"assistant",reply,{stage:"ask_contact"});
      return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:[]});
    }

    if(session.stage==="ask_contact"){
      const raw=clean(displayMessage,180);
      const email=emailRe.test(raw.toLowerCase())?raw.toLowerCase():null;
      const phoneMatch=raw.match(phoneRe);
      const phone=phoneMatch?clean(phoneMatch[0],80):null;
      if(!email&&!phone){
        const reply="No alcancé a identificar un correo o WhatsApp válido. Puedes escribir, por ejemplo, nombre@empresa.com o +57 300 000 0000.";
        await addMessage(session.id,"assistant",reply,{stage:"ask_contact",validation:"invalid_contact"});
        return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:[]});
      }
      const update:Record<string,unknown>={privacy_consent:true,status:"qualified"};
      if(email) update.email=email;
      if(phone) update.phone=phone;
      const updated=await service.from("nora_web_sessions").update(update).eq("id",session.id).select("*").single();
      if(updated.error) throw updated.error;
      session=updated.data as SessionRow;
      const leadId=await createLead(session);
      const reply=`Listo, ${session.full_name||"gracias"}. Ya registré tu solicitud como interés en ${productName(session.product_interest)} y dejé el contexto para que no tengas que repetir todo. Nuestro equipo puede continuar contigo por el dato que compartiste.`;
      await addMessage(session.id,"assistant",reply,{stage:"lead_created",lead_id:leadId});
      return json({
        ok:true,session_id:session.id,mode:"guided",reply,lead_created:true,
        quick_replies:[
          {id:"open_whatsapp",label:"Hablar por WhatsApp"},
          {id:"view_product",label:`Ver ${productName(session.product_interest)}`}
        ]
      });
    }

    if(session.stage==="lead_created"){
      const reply="Tu solicitud ya quedó registrada. Si quieres avanzar de inmediato, puedes hablar con NEXO por WhatsApp o seguir explorando la web.";
      await addMessage(session.id,"assistant",reply,{stage:"lead_created"});
      return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:[
        {id:"open_whatsapp",label:"Hablar por WhatsApp"},
        {id:"restart",label:"Consultar otra cosa"}
      ]});
    }

    const reply="Puedo ayudarte con Assistants, Marketing o Solutions. ¿Qué quieres explorar?";
    await addMessage(session.id,"assistant",reply,{stage:"fallback"});
    return json({ok:true,session_id:session.id,mode:"guided",reply,quick_replies:productButtons});
  }catch(error){
    console.error("NORA_WEB_CHAT_ERROR",error);
    return json({error:"Nora tuvo un problema para responder. Puedes intentar de nuevo o hablar con NEXO por WhatsApp."},500);
  }
});