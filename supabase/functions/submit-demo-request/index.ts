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

    if(!fullName||!businessName) return json(req,{error:"Nombre y negocio son obligatorios"},400);
    if(!email&&!phone) return json(req,{error:"Comparte un correo o WhatsApp para poder contactarte"},400);
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(req,{error:"Correo inválido"},400);

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
      expected_mrr:expectedMrr,
      expected_setup_fee:expectedSetup,
      privacy_consent:true,
      privacy_consent_at:new Date().toISOString(),
      privacy_policy_version:PRIVACY_POLICY_VERSION
    }).select("id").single();

    if(insert.error) throw insert.error;
    return json(req,{ok:true,id:insert.data.id});
  }catch(error){
    console.error("SUBMIT_DEMO_REQUEST_ERROR",error);
    return json(req,{error:"No pudimos registrar la solicitud. Escríbenos por WhatsApp si el problema continúa."},500);
  }
});