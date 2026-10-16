import { createClient } from "npm:@supabase/supabase-js@2.58.0";
const URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service=createClient(URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const allowedOrigins=new Set(["https://nexobyjv.online","https://www.nexobyjv.online","https://nexo-public.onrender.com"]);
const PRIVACY_POLICY_VERSION="2026-10-06";

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  return {
    "access-control-allow-origin":allowedOrigins.has(origin)?origin:"https://nexobyjv.online",
    "access-control-allow-headers":"content-type, apikey, x-client-info",
    "access-control-allow-methods":"POST, OPTIONS",
    "vary":"Origin","cache-control":"no-store"
  };
}
function json(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{...cors(req),"content-type":"application/json; charset=utf-8"}
  });
}
const clean=(v:unknown,max=500)=>String(v??"").trim().slice(0,max);

// Follow the same owner-routing rules used by Nora: route marketing leads to the
// active marketing lead, if configured; otherwise to the platform administrator.
// An assigned lead automatically gets a durable bell notification via the DB trigger.
async function findOwner(planInterest:string|null){
  const founder=await service.from("profiles").select("id")
    .eq("platform_role","platform_admin").order("created_at").limit(1).maybeSingle();
  if(founder.error) throw founder.error;
  const fallback=founder.data?.id||null;
  if(!fallback) throw new Error("No platform administrator available for new lead assignment");
  if(planInterest!=="marketing") return fallback;
  const role=await service.from("nexo_team_roles").select("id")
    .eq("role_key","marketing_lead").eq("active",true).maybeSingle();
  if(role.error) throw role.error;
  if(!role.data?.id) return fallback;
  const assignee=await service.from("nexo_user_roles").select("user_id")
    .eq("role_id",role.data.id).eq("active",true)
    .order("created_at").limit(1).maybeSingle();
  if(assignee.error) throw assignee.error;
  return assignee.data?.user_id||fallback;
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST") return json(req,{error:"Method not allowed"},405);

  const origin=req.headers.get("origin")||"";
  if(!allowedOrigins.has(origin)) return json(req,{error:"Origin not allowed"},403);

  const contentLength=Number(req.headers.get("content-length")||"0");
  if(contentLength>12000) return json(req,{error:"Payload too large"},413);

  try{
    const body=await req.json();
    if(clean(body.website,200)) return json(req,{ok:true});

    if(body.privacy_consent!==true){
      return json(req,{error:"Debes autorizar el tratamiento de datos para enviar la solicitud."},400);
    }

    const fullName=clean(body.full_name,120);
    const businessName=clean(body.business_name,160);
    const email=clean(body.email,180).toLowerCase();
    const phone=clean(body.phone,80);
    const industry=clean(body.industry,120);
    const message=clean(body.message,1200);
    const source=clean(body.source,160)||"website";
    const requestedPlan=clean(body.plan_interest,40).toLowerCase();
    const allowedPlans=new Set(["start","growth","pro","custom","marketing"]);
    const planInterest=allowedPlans.has(requestedPlan)?requestedPlan:null;
    const requestId=clean(body.client_request_id,48).toLowerCase()||null;
    if(requestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId)){
      return json(req,{error:"Identificador de envío inválido."},400);
    }

    if(!fullName||!businessName) return json(req,{error:"Nombre y negocio son obligatorios"},400);
    if(!email&&!phone) return json(req,{error:"Comparte un correo o WhatsApp para poder contactarte"},400);
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(req,{error:"Correo inválido"},400);

    // Return the first accepted submission after a lost connection. Do this before
    // rate limiting so a network retry never consumes the visitor's quota.
    if(requestId){
      const existing=await service.from("demo_requests").select("id")
        .eq("client_request_id",requestId).maybeSingle();
      if(existing.error) throw existing.error;
      if(existing.data?.id) return json(req,{ok:true,id:existing.data.id,already_received:true});
    }

    // Rate-limit valid submissions atomically, without storing visitor IP addresses.
    const ip=clean(req.headers.get("cf-connecting-ip")||req.headers.get("x-forwarded-for")?.split(",")[0]||"unknown",100);
    const period=15*60*1000;
    const start=new Date(Math.floor(Date.now()/period)*period).toISOString();
    const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("demo:v1:"+ip+":"+start));
    const rateKey=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,"0")).join("");
    const rate=await service.rpc("nexo_public_rate_limit",{p_rate_key:rateKey,p_window_start:start,p_limit:6});
    if(rate.error){
      console.error("DEMO_RATE_LIMIT_ERROR",rate.error);
      return json(req,{error:"El formulario no está disponible por el momento. Escríbenos por WhatsApp."},503);
    }
    if(rate.data!==true) return json(req,{error:"Demasiadas solicitudes. Intenta nuevamente más tarde."},429);


    let expectedMrr:null|number=null;
    let expectedSetup:null|number=null;
    if(planInterest){
      const plan=await service.from("nexo_plans")
        .select("monthly_fee,setup_fee_min")
        .eq("code",planInterest)
        .eq("active",true)
        .maybeSingle();
      if(plan.error) throw plan.error;
      expectedMrr=plan.data?.monthly_fee == null ? null : Number(plan.data.monthly_fee);
      expectedSetup=plan.data?.setup_fee_min == null ? null : Number(plan.data.setup_fee_min);
    }

    const owner=await findOwner(planInterest);
    const insert=await service.from("demo_requests").insert({
      full_name:fullName,
      business_name:businessName,
      email:email||null,
      phone:phone||null,
      industry:industry||null,
      message:message||null,
      source,
      status:"Nuevo",
      stage:"prospecto",
      plan_interest:planInterest,
      owner_user_id:owner,
      client_request_id:requestId,
      expected_mrr:expectedMrr,
      expected_setup_fee:expectedSetup,
      privacy_consent:true,
      privacy_consent_at:new Date().toISOString(),
      privacy_policy_version:PRIVACY_POLICY_VERSION
    }).select("id").single();

    // Two retries can race past the initial lookup; the partial UNIQUE index
    // makes one INSERT win and the other recover the very same prospect.
    if(insert.error?.code==="23505" && requestId){
      const duplicate=await service.from("demo_requests").select("id")
        .eq("client_request_id",requestId).maybeSingle();
      if(duplicate.error) throw duplicate.error;
      if(duplicate.data?.id) return json(req,{ok:true,id:duplicate.data.id,already_received:true});
    }
    if(insert.error) throw insert.error;
    return json(req,{ok:true,id:insert.data.id,already_received:false});
  }catch(error){
    console.error("SUBMIT_DEMO_REQUEST_ERROR",error);
    return json(req,{error:"No pudimos registrar la solicitud. Escríbenos por WhatsApp si el problema continúa."},500);
  }
});