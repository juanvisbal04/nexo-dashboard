import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service=createClient(URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  try{
    const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
    if(!token) return json({error:"Unauthorized"},401);
    const {data:userData,error:userError}=await service.auth.getUser(token);
    if(userError||!userData.user) return json({error:"Unauthorized"},401);
    const user=userData.user;

    const [{data:profile,error:profileError},{data:roleRows,error:roleError}]=await Promise.all([
      service.from("profiles").select("platform_role").eq("id",user.id).maybeSingle(),
      service.from("nexo_user_roles")
        .select("role_id,active,nexo_team_roles(id,active)")
        .eq("user_id",user.id).eq("active",true)
    ]);
    if(profileError) throw profileError;
    if(roleError) throw roleError;

    const isAdmin=profile?.platform_role==="platform_admin";
    let canDirectory=false;
    const roleIds=(roleRows||[]).filter((r:any)=>r.nexo_team_roles?.active===true).map((r:any)=>r.role_id);
    if(roleIds.length){
      const {data:perms,error}=await service.from("nexo_role_permissions")
        .select("permission_key").in("role_id",roleIds).eq("permission_key","people.directory.read");
      if(error) throw error;
      canDirectory=Boolean((perms||[]).length);
    }
    if(!isAdmin&&!canDirectory) return json({error:"Forbidden"},403);

    const [{data:roles,error:rolesError},{data:profiles,error:profilesError},{data:invites,error:inviteError}]=await Promise.all([
      service.from("nexo_user_roles")
        .select("user_id,role_id,active,deactivated_at,nexo_team_roles(id,role_key,name,hierarchy_level,role_scope,active,nexo_departments(department_key,name))"),
      service.from("profiles")
        .select("id,full_name,contact_email,phone,job_title,avatar_url,created_at"),
      service.from("nexo_team_invites")
        .select("user_id,status,sent_at,accepted_at,cancelled_at")
        .order("created_at",{ascending:false})
    ]);
    if(rolesError) throw rolesError;
    if(profilesError) throw profilesError;
    if(inviteError) throw inviteError;

    const latestInvite=new Map<string,any>();
    for(const invite of invites||[]) if(!latestInvite.has((invite as any).user_id)) latestInvite.set((invite as any).user_id,invite);

    const rows:any[]=[];
    const authList=await service.auth.admin.listUsers({page:1,perPage:1000});
    if(authList.error) throw authList.error;
    const authMap=new Map(authList.data.users.map((u:any)=>[u.id,u]));

    for(const roleRow of roles||[]){
      const nested:any=(roleRow as any).nexo_team_roles;
      if(!nested?.role_key) continue;
      const p:any=(profiles||[]).find((x:any)=>x.id===(roleRow as any).user_id);
      if(!p) continue;
      const authUser:any=authMap.get(p.id);
      const invite:any=latestInvite.get(p.id);
      const status=(roleRow as any).active===true
        ? (authUser?.last_sign_in_at?"active":invite?.status==="pending"?"invited":"active")
        : "inactive";
      rows.push({
        user_id:p.id,
        full_name:p.full_name,
        contact_email:p.contact_email||authUser?.email||null,
        phone:p.phone,
        job_title:p.job_title,
        avatar_url:p.avatar_url,
        joined_at:p.created_at,
        last_sign_in_at:authUser?.last_sign_in_at||null,
        status,
        role_key:nested.role_key,
        role_name:nested.name,
        hierarchy_level:nested.hierarchy_level,
        role_scope:nested.role_scope,
        department_key:nested.nexo_departments?.department_key||null,
        department_name:nested.nexo_departments?.name||null,
      });
    }

    const adminProfiles=(profiles||[]).filter((p:any)=>p.platform_role==="platform_admin");
    for(const p of adminProfiles){
      if(rows.some((row)=>row.user_id===p.id)) continue;
      const authUser:any=authMap.get((p as any).id);
      rows.push({
        user_id:(p as any).id,
        full_name:(p as any).full_name,
        contact_email:(p as any).contact_email||authUser?.email||null,
        phone:(p as any).phone,
        job_title:(p as any).job_title||"Founder / CEO",
        avatar_url:(p as any).avatar_url,
        joined_at:(p as any).created_at,
        last_sign_in_at:authUser?.last_sign_in_at||null,
        status:"active",
        role_key:"founder_ceo",
        role_name:"Founder / CEO",
        hierarchy_level:100,
        role_scope:"company",
        department_key:"executive",
        department_name:"Executive & Leadership",
      });
    }

    rows.sort((a,b)=>{
      const d=String(a.department_name||"").localeCompare(String(b.department_name||""),"es");
      if(d)return d;
      return String(a.full_name||a.contact_email||"").localeCompare(String(b.full_name||b.contact_email||""),"es");
    });
    return json({ok:true,people:rows});
  }catch(error){
    console.error("NEXO_PEOPLE_DIRECTORY_ERROR",error);
    return json({error:"No pudimos cargar el directorio interno."},500);
  }
});