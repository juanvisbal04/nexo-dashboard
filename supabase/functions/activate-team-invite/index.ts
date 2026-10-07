import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service=createClient(URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

const allowedOrigins=new Set([
  "https://dashboard.nexobyjv.online",
  "https://nexo-dashboard-pcfq.onrender.com",
]);

function cors(req:Request){
  const origin=req.headers.get("origin")||"";
  return {
    "access-control-allow-origin":allowedOrigins.has(origin)?origin:"https://dashboard.nexobyjv.online",
    "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods":"POST, OPTIONS",
    "vary":"Origin",
    "cache-control":"no-store",
  };
}
function json(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8"}});
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST") return json(req,{error:"Method not allowed"},405);

  try{
    const auth=req.headers.get("authorization")||"";
    const jwt=auth.startsWith("Bearer ")?auth.slice(7):"";
    if(!jwt) return json(req,{error:"No autorizado"},401);

    const userResult=await service.auth.getUser(jwt);
    const user=userResult.data.user;
    if(userResult.error||!user) return json(req,{error:"Sesión inválida"},401);

    const body=await req.json();
    const password=String(body.password||"");
    if(password.length<10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)){
      return json(req,{error:"La contraseña debe tener mínimo 10 caracteres e incluir mayúscula, minúscula y número."},400);
    }

    const inviteRes=await service.from("nexo_team_invites")
      .select("id,status,user_id")
      .eq("user_id",user.id)
      .eq("status","pending")
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();

    if(inviteRes.error) throw inviteRes.error;
    if(!inviteRes.data){
      return json(req,{error:"Esta invitación ya no está activa. Solicita una nueva invitación a NEXO."},403);
    }

    const roleRes=await service.from("nexo_user_roles")
      .select("user_id,active")
      .eq("user_id",user.id)
      .maybeSingle();

    if(roleRes.error) throw roleRes.error;
    if(!roleRes.data){
      return json(req,{error:"Tu acceso interno ya no está disponible."},403);
    }

    const updated=await service.auth.admin.updateUserById(user.id,{password});
    if(updated.error) throw updated.error;

    const now=new Date().toISOString();
    const markInvite=await service.from("nexo_team_invites")
      .update({status:"accepted",accepted_at:now,cancelled_at:null})
      .eq("id",inviteRes.data.id)
      .eq("status","pending");
    if(markInvite.error) throw markInvite.error;

    const activateRole=await service.from("nexo_user_roles")
      .update({active:true,deactivated_at:null,deactivated_by:null})
      .eq("user_id",user.id);
    if(activateRole.error) throw activateRole.error;

    return json(req,{ok:true,login_url:"https://dashboard.nexobyjv.online"});
  }catch(error){
    console.error("ACTIVATE_TEAM_INVITE_ERROR",error);
    return json(req,{error:"No pudimos completar tu registro. Solicita una nueva invitación a NEXO.",detail:error?.message||"Error"},500);
  }
});