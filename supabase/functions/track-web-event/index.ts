import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service=createClient(URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const allowedOrigins=new Set([
  "https://nexobyjv.online",
  "https://www.nexobyjv.online",
  "https://nexo-public.onrender.com"
]);
const allowedEvents=new Set([
  "page_view",
  "whatsapp_click",
  "demo_click",
  "interactive_demo_run",
  "demo_submit_success",
  "plans_click",
  "marketing_click",
  "case_lia_click",
  "industry_click",
  "dashboard_click"
]);
const allowedIndustries=new Set(["estetica","hotel","restaurante","clinica","otro"]);
const allowedPlans=new Set(["start","growth","pro","custom","marketing"]);
const allowedScenarios=new Set(["beauty","hotel","restaurant","clinic"]);
const allowedPlacements=new Set([
  "floating","mobile_sticky","navigation","hero","cta_section",
  "footer","body","interactive_demo","demo_form","unknown"
]);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  return {
    "access-control-allow-origin":allowedOrigins.has(origin)?origin:"https://nexobyjv.online",
    "access-control-allow-headers":"content-type, apikey, x-client-info",
    "access-control-allow-methods":"POST, OPTIONS",
    "vary":"Origin",
    "cache-control":"no-store"
  };
}
function json(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...cors(req),"content-type":"application/json; charset=utf-8"}
  });
}
function clean(v:unknown,max:number){
  const value=String(v??"").trim();
  return value?value.slice(0,max):null;
}
function safePath(v:unknown){
  const value=clean(v,200);
  if(!value)return null;
  try{
    const parsed=new URL(value,"https://nexobyjv.online");
    const path=parsed.pathname||"/";
    return path.startsWith("/")?path.slice(0,160):null;
  }catch{
    return value.startsWith("/")?value.split(/[?#]/,1)[0].slice(0,160):null;
  }
}
function safeHost(v:unknown){
  const value=clean(v,140)?.toLowerCase();
  if(!value)return null;
  return /^[a-z0-9.-]+$/.test(value)?value.slice(0,120):null;
}
function safeToken(v:unknown,max:number){
  const value=clean(v,max)?.toLowerCase();
  if(!value)return null;
  return /^[a-z0-9._-]+$/.test(value)?value:null;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"Method not allowed"},405);

  const origin=req.headers.get("origin")||"";
  if(!allowedOrigins.has(origin))return json(req,{error:"Origin not allowed"},403);

  const contentLength=Number(req.headers.get("content-length")||"0");
  if(contentLength>5000)return json(req,{error:"Payload too large"},413);

  try{
    const body=await req.json();
    const eventId=clean(body.event_id,40);
    const sessionId=clean(body.session_id,40);
    const eventType=clean(body.event_type,40);

    if(!eventId||!uuid.test(eventId)||!sessionId||!uuid.test(sessionId)){
      return json(req,{error:"Invalid event identifier"},400);
    }
    if(!eventType||!allowedEvents.has(eventType)){
      return json(req,{error:"Invalid event type"},400);
    }

    const pagePath=safePath(body.page_path);
    if(!pagePath)return json(req,{error:"Invalid page path"},400);

    const industryRaw=safeToken(body.industry,30);
    const planRaw=safeToken(body.plan,20);
    const scenarioRaw=safeToken(body.scenario,20);
    const placementRaw=safeToken(body.placement,40);

    const industry=industryRaw&&allowedIndustries.has(industryRaw)?industryRaw:null;
    const plan=planRaw&&allowedPlans.has(planRaw)?planRaw:null;
    const scenario=scenarioRaw&&allowedScenarios.has(scenarioRaw)?scenarioRaw:null;
    const placement=placementRaw&&allowedPlacements.has(placementRaw)?placementRaw:null;

    const since=new Date(Date.now()-60_000).toISOString();
    const countResult=await service
      .from("web_funnel_events")
      .select("id",{count:"exact",head:true})
      .eq("session_id",sessionId)
      .gte("created_at",since);

    if(countResult.error)throw countResult.error;
    if((countResult.count||0)>=30)return json(req,{error:"Rate limit"},429);

    const payload={
      event_id:eventId,
      session_id:sessionId,
      event_type:eventType,
      page_path:pagePath,
      landing_path:safePath(body.landing_path),
      target_path:safePath(body.target_path),
      placement,
      industry,
      plan,
      scenario,
      utm_source:safeToken(body.utm_source,80),
      utm_medium:safeToken(body.utm_medium,80),
      utm_campaign:safeToken(body.utm_campaign,120),
      referrer_host:safeHost(body.referrer_host)
    };

    const inserted=await service
      .from("web_funnel_events")
      .upsert(payload,{onConflict:"event_id",ignoreDuplicates:true});

    if(inserted.error)throw inserted.error;
    return json(req,{ok:true},202);
  }catch(error){
    console.error("TRACK_WEB_EVENT_ERROR",error);
    return json(req,{error:"Unable to record event"},500);
  }
});