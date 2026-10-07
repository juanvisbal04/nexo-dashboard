import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  try{
    const auth=req.headers.get("authorization")||"";
    const token=auth.replace(/^Bearer\s+/i,"");
    if(!token) return json({error:"Unauthorized"},401);

    const {data:userData,error:userError}=await service.auth.getUser(token);
    if(userError||!userData.user) return json({error:"Unauthorized"},401);
    const user=userData.user;

    const body=await req.json().catch(()=>({}));
    const orgId=String(body.organization_id||"").trim();
    if(!/^[0-9a-f-]{36}$/i.test(orgId)) return json({error:"organization_id is required"},400);

    const [{data:profile},{data:membership},{data:roleRows,error:roleError}] = await Promise.all([
      service.from("profiles").select("platform_role").eq("id",user.id).maybeSingle(),
      service.from("organization_members").select("role").eq("organization_id",orgId).eq("user_id",user.id).maybeSingle(),
      service.from("nexo_user_roles")
        .select("role_id,active,nexo_team_roles(id,name,department_id,active)")
        .eq("user_id",user.id)
        .eq("active",true)
    ]);
    if(roleError) throw roleError;

    const isAdmin=profile?.platform_role==="platform_admin";
    const activeRole=(roleRows||[]).find((row:any)=>row.nexo_team_roles?.active===true&&row.nexo_team_roles?.department_id)||null;
    const departmentId=activeRole?.nexo_team_roles?.department_id||null;

    let canManageTeam=false;
    if(activeRole?.role_id){
      const {data:perms,error}=await service.from("nexo_role_permissions")
        .select("permission_key")
        .eq("role_id",activeRole.role_id)
        .in("permission_key",["tasks.team.read","tasks.team.write"]);
      if(error) throw error;
      canManageTeam=Boolean((perms||[]).length);
    }

    if(!isAdmin&&!membership&&!canManageTeam) return json({error:"Forbidden"},403);

    if(canManageTeam&&!isAdmin&&!membership){
      const {data:internalOrg,error:internalError}=await service.from("organizations").select("id,name").eq("id",orgId).maybeSingle();
      if(internalError) throw internalError;
      const isInternal=internalOrg?.name==="NEXO Internal";

      let candidateIds:string[]=[];
      if(isInternal){
        const {data:sameDeptRoles,error}=await service.from("nexo_user_roles")
          .select("user_id,role_id,active,nexo_team_roles(id,name,department_id,active)")
          .eq("active",true);
        if(error) throw error;
        candidateIds=[...new Set((sameDeptRoles||[])
          .filter((row:any)=>row.nexo_team_roles?.active===true&&row.nexo_team_roles?.department_id===departmentId)
          .map((row:any)=>row.user_id))];
      }else{
        const {data:assignments,error}=await service.from("nexo_client_assignments")
          .select("user_id")
          .eq("organization_id",orgId);
        if(error) throw error;
        const assignedIds=[...new Set((assignments||[]).map((row:any)=>row.user_id).filter(Boolean))];
        if(assignedIds.length){
          const {data:sameDeptRoles,error:rolesError}=await service.from("nexo_user_roles")
            .select("user_id,role_id,active,nexo_team_roles(id,name,department_id,active)")
            .in("user_id",assignedIds)
            .eq("active",true);
          if(rolesError) throw rolesError;
          candidateIds=[...new Set((sameDeptRoles||[])
            .filter((row:any)=>row.nexo_team_roles?.active===true&&row.nexo_team_roles?.department_id===departmentId)
            .map((row:any)=>row.user_id))];
        }
      }

      if(!candidateIds.includes(user.id)) candidateIds.push(user.id);
      if(!candidateIds.length) return json({ok:true,assignees:[]});

      const [{data:profiles,error:profilesError},{data:roles,error:rolesError}] = await Promise.all([
        service.from("profiles").select("id,full_name,contact_email,job_title,avatar_url").in("id",candidateIds),
        service.from("nexo_user_roles")
          .select("user_id,role_id,active,nexo_team_roles(name,department_id,active)")
          .in("user_id",candidateIds)
          .eq("active",true)
      ]);
      if(profilesError) throw profilesError;
      if(rolesError) throw rolesError;

      const roleMap=new Map<string,string>();
      for(const row of roles||[]){
        const nested:any=(row as any).nexo_team_roles;
        if(nested?.active&&nested?.department_id===departmentId) roleMap.set((row as any).user_id,nested.name||"Equipo NEXO");
      }
      const assignees=(profiles||[])
        .map((row:any)=>({...row,role:roleMap.get(row.id)||"Equipo NEXO"}))
        .sort((a:any,b:any)=>String(a.full_name||a.contact_email||"").localeCompare(String(b.full_name||b.contact_email||""),"es"));
      return json({ok:true,assignees,scope:"department"});
    }

    const {data:members,error:membersError}=await service
      .from("organization_members")
      .select("user_id,role")
      .eq("organization_id",orgId);
    if(membersError) throw membersError;

    const memberIds=[...new Set((members||[]).map((row:any)=>row.user_id).filter(Boolean))];
    const {data:platformAdmins,error:adminError}=await service
      .from("profiles")
      .select("id,full_name,contact_email,job_title,avatar_url")
      .eq("platform_role","platform_admin");
    if(adminError) throw adminError;

    let memberProfiles:any[]=[];
    if(memberIds.length){
      const {data,error}=await service
        .from("profiles")
        .select("id,full_name,contact_email,job_title,avatar_url")
        .in("id",memberIds);
      if(error) throw error;
      memberProfiles=data||[];
    }

    const roleMap=new Map((members||[]).map((row:any)=>[row.user_id,row.role]));
    const byId=new Map<string,any>();
    for(const row of memberProfiles){
      byId.set(row.id,{...row,role:roleMap.get(row.id)||"viewer"});
    }
    for(const row of platformAdmins||[]){
      byId.set(row.id,{...row,role:"platform_admin"});
    }

    const assignees=[...byId.values()].sort((a,b)=>
      String(a.full_name||a.contact_email||"").localeCompare(String(b.full_name||b.contact_email||""),"es")
    );
    return json({ok:true,assignees});
  }catch(error){
    console.error("TASK_ASSIGNEES_ERROR",error);
    return json({error:"No pudimos cargar los responsables."},500);
  }
});