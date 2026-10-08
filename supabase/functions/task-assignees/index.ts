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

    const [{data:profile},{data:membership},{data:org,error:orgError},{data:roleRows,error:roleError}] = await Promise.all([
      service.from("profiles").select("platform_role").eq("id",user.id).maybeSingle(),
      service.from("organization_members").select("role").eq("organization_id",orgId).eq("user_id",user.id).maybeSingle(),
      service.from("organizations").select("id,name").eq("id",orgId).maybeSingle(),
      service.from("nexo_user_roles")
        .select("role_id,active,nexo_team_roles(id,name,department_id,active,nexo_departments(department_key,name))")
        .eq("user_id",user.id)
        .eq("active",true)
    ]);
    if(orgError) throw orgError;
    if(roleError) throw roleError;
    if(!org) return json({error:"Organization not found"},404);

    const isInternal=org.name==="NEXO Internal";
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

    const collectInternalStaff=async(candidateIds?:string[]|null,requiredDepartmentId?:string|null)=>{
      let roleQuery=service.from("nexo_user_roles")
        .select("user_id,role_id,active,nexo_team_roles(id,name,department_id,active,nexo_departments(department_key,name))")
        .eq("active",true);
      if(candidateIds&&candidateIds.length) roleQuery=roleQuery.in("user_id",candidateIds);
      const {data:staffRoles,error:staffRoleError}=await roleQuery;
      if(staffRoleError) throw staffRoleError;

      const valid=(staffRoles||[]).filter((row:any)=>
        row.nexo_team_roles?.active===true &&
        row.nexo_team_roles?.department_id &&
        (!requiredDepartmentId||row.nexo_team_roles.department_id===requiredDepartmentId)
      );
      const ids=[...new Set(valid.map((row:any)=>row.user_id))];
      if(!ids.length) return [];

      const {data:profiles,error:profilesError}=await service.from("profiles")
        .select("id,full_name,contact_email,job_title,avatar_url")
        .in("id",ids);
      if(profilesError) throw profilesError;

      const roleMap=new Map<string,any>();
      for(const row of valid){
        if(!roleMap.has((row as any).user_id)) roleMap.set((row as any).user_id,(row as any).nexo_team_roles);
      }
      return (profiles||[]).map((row:any)=>{
        const role:any=roleMap.get(row.id)||{};
        const dept:any=role.nexo_departments||{};
        return {
          ...row,
          role:role.name||"Equipo NEXO",
          department_id:role.department_id||null,
          department_key:dept.department_key||null,
          department_name:dept.name||null,
        };
      });
    };

    const platformAdmins=async()=>{
      const {data,error}=await service.from("profiles")
        .select("id,full_name,contact_email,job_title,avatar_url")
        .eq("platform_role","platform_admin");
      if(error) throw error;
      return (data||[]).map((row:any)=>({
        ...row,role:"Founder / CEO",department_key:"executive",department_name:"Executive & Leadership"
      }));
    };

    let internalStaff:any[]=[];
    if(isInternal){
      internalStaff=await collectInternalStaff(null,isAdmin?null:departmentId);
    }else{
      const {data:assignments,error}=await service.from("nexo_client_assignments")
        .select("user_id")
        .eq("organization_id",orgId);
      if(error) throw error;
      const assignedIds=[...new Set((assignments||[]).map((row:any)=>row.user_id).filter(Boolean))];
      internalStaff=assignedIds.length
        ? await collectInternalStaff(assignedIds,isAdmin?null:departmentId)
        : [];
    }

    if(isAdmin||canManageTeam){
      const rows=[...internalStaff];
      if(isAdmin) rows.push(...await platformAdmins());
      else if(!rows.some((row:any)=>row.id===user.id)){
        const {data:selfProfile,error:selfError}=await service.from("profiles")
          .select("id,full_name,contact_email,job_title,avatar_url")
          .eq("id",user.id).maybeSingle();
        if(selfError) throw selfError;
        if(selfProfile) rows.push({
          ...selfProfile,
          role:activeRole?.nexo_team_roles?.name||"Team Lead",
          department_id:departmentId,
          department_key:activeRole?.nexo_team_roles?.nexo_departments?.department_key||null,
          department_name:activeRole?.nexo_team_roles?.nexo_departments?.name||null,
        });
      }
      const byId=new Map(rows.map((row:any)=>[row.id,row]));
      const assignees=[...byId.values()].sort((a:any,b:any)=>{
        const dept=String(a.department_name||"").localeCompare(String(b.department_name||""),"es");
        if(dept!==0)return dept;
        return String(a.full_name||a.contact_email||"").localeCompare(String(b.full_name||b.contact_email||""),"es");
      });
      return json({ok:true,assignees,scope:isAdmin?"company":"department"});
    }

    const {data:members,error:membersError}=await service.from("organization_members")
      .select("user_id,role")
      .eq("organization_id",orgId);
    if(membersError) throw membersError;
    const memberIds=[...new Set((members||[]).map((row:any)=>row.user_id).filter(Boolean))];
    let memberProfiles:any[]=[];
    if(memberIds.length){
      const {data,error}=await service.from("profiles")
        .select("id,full_name,contact_email,job_title,avatar_url")
        .in("id",memberIds);
      if(error) throw error;
      memberProfiles=data||[];
    }
    const roleMap=new Map((members||[]).map((row:any)=>[row.user_id,row.role]));
    return json({
      ok:true,
      assignees:memberProfiles.map((row:any)=>({...row,role:roleMap.get(row.id)||"viewer"}))
    });
  }catch(error){
    console.error("TASK_ASSIGNEES_ERROR",error);
    return json({error:"No pudimos cargar los responsables."},500);
  }
});