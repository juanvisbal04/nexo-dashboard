import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const allowedOrigins = new Set(["https://dashboard.nexobyjv.online","https://nexo-dashboard-pcfq.onrender.com"]);
function cors(req: Request){
  const origin=req.headers.get("origin")||"";
  return {
    "access-control-allow-origin": allowedOrigins.has(origin)?origin:"https://dashboard.nexobyjv.online",
    "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods":"POST, OPTIONS",
    "vary":"Origin","cache-control":"no-store"
  };
}
function json(req:Request,body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8"}})}
function cleanInitials(value:string,name:string){
  const candidate=value.trim().toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,3);
  if(candidate) return candidate;
  return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()||"").join("")||"NX";
}
function validColor(value:string){return /^#[0-9A-Fa-f]{6}$/.test(value)?value:"#316bff"}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST") return json(req,{error:"Method not allowed"},405);
  try{
    const auth=req.headers.get("authorization")||"";
    const jwt=auth.startsWith("Bearer ")?auth.slice(7):"";
    if(!jwt) return json(req,{error:"No autorizado"},401);

    const userResult=await service.auth.getUser(jwt);
    const adminUser=userResult.data.user;
    if(userResult.error||!adminUser) return json(req,{error:"Sesión inválida"},401);

    const profile=await service.from("profiles").select("platform_role").eq("id",adminUser.id).single();
    if(profile.error||profile.data?.platform_role!=="platform_admin") return json(req,{error:"Solo un Super Admin puede crear negocios"},403);

    const body=await req.json();
    const name=String(body.name||"").trim();
    const sector=String(body.sector||"").trim();
    const rawLines=body.service_lines??[];
    if(!Array.isArray(rawLines)||rawLines.some((line)=>!["marketing","assistants","solutions"].includes(line)))return json(req,{error:"Línea de negocio NEXO inválida"},400);
    const serviceLines=[...new Set(rawLines)];
    const assistantRequired=!serviceLines.length||serviceLines.includes("assistants");
    const assistant=assistantRequired?String(body.assistant||"").trim():"";
    const initials=cleanInitials(String(body.initials||""),name);
    const color=validColor(String(body.color||"#316bff"));
    if(!name) return json(req,{error:"Nombre del negocio es obligatorio"},400);
    if(assistantRequired&&!assistant) return json(req,{error:"Define el asistente para NEXO Assistants"},400);

    const existing=await service.from("organizations").select("id,name").ilike("name",name).limit(1);
    if(existing.error) throw existing.error;
    if(existing.data?.length) return json(req,{error:"Ya existe un negocio con ese nombre"},409);

    const org=await service.from("organizations").insert({
      name,sector,assistant,initials,color,service_lines:serviceLines,timezone:"America/Bogota",status:"active"
    }).select("*").single();
    if(org.error) throw org.error;

    if(assistantRequired){
    const assistantRow=await service.from("assistants").insert({
      organization_id:org.data.id,name:assistant,channel:"WhatsApp",status:"active"
    });
    if(assistantRow.error) throw assistantRow.error;
    }

    return json(req,{ok:true,organization:org.data});
  }catch(error){
    console.error("ADMIN_CREATE_ORG_ERROR",error);
    return json(req,{error:"No pudimos crear el negocio",detail:error?.message||"Error"},500);
  }
});
