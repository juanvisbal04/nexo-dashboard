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
    "vary":"Origin","cache-control":"no-store",
  };
}
function json(req:Request,body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...cors(req),"content-type":"application/json; charset=utf-8"}});
}
function clean(value:unknown,max=500){
  return String(value??"").trim().slice(0,max);
}
function initials(name:string){
  const parts=name.trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0,2).map(x=>x[0]?.toUpperCase()||"").join("")||"NX").slice(0,3);
}
function validEmail(value:string){
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function dueIso(value:unknown){
  const raw=clean(value,80);
  if(!raw) return null;
  const d=new Date(raw);
  return Number.isNaN(d.getTime())?null:d.toISOString();
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST") return json(req,{error:"Method not allowed"},405);

  try{
    const auth=req.headers.get("authorization")||"";
    const jwt=auth.startsWith("Bearer ")?auth.slice(7):"";
    if(!jwt) return json(req,{error:"No autorizado"},401);

    const userRes=await service.auth.getUser(jwt);
    const requester=userRes.data.user;
    if(userRes.error||!requester) return json(req,{error:"Sesión inválida"},401);

    const {data:roleRows,error:roleError}=await service
      .from("nexo_user_roles")
      .select("role_id,active,nexo_team_roles(id,role_key,name,department_id,hierarchy_level,role_scope,active,nexo_departments(id,department_key,name,active,planned))")
      .eq("user_id",requester.id)
      .eq("active",true);
    if(roleError) throw roleError;

    const roleRow=(roleRows||[])
      .filter((row:any)=>row.nexo_team_roles?.active===true&&row.nexo_team_roles?.department_id)
      .sort((a:any,b:any)=>(b.nexo_team_roles?.hierarchy_level||0)-(a.nexo_team_roles?.hierarchy_level||0))[0] as any;
    const role=roleRow?.nexo_team_roles;
    const department=role?.nexo_departments;
    if(!role||!department||department.active!==true) return json(req,{error:"No tienes un cargo interno activo"},403);

    const {data:permRows,error:permError}=await service
      .from("nexo_role_permissions")
      .select("permission_key")
      .eq("role_id",role.id);
    if(permError) throw permError;
    const perms=new Set((permRows||[]).map((row:any)=>row.permission_key));
    const can=(permission:string)=>perms.has(permission);

    const body=await req.json().catch(()=>({}));
    const action=clean(body.action,80);

    const audit=async(actionType:string,orgId:string,recordId:string|null,newData:unknown)=>{
      const {error}=await service.from("audit_log").insert({
        organization_id:orgId,
        actor_user_id:requester.id,
        actor_email:requester.email||null,
        action:actionType,
        table_name:"nexo_projects",
        record_id:recordId,
        old_data:null,
        new_data:newData,
        changed_fields:newData,
      });
      if(error) console.error("NEXO_STAFF_WORK_AUDIT",error);
    };

    if(action==="create_client_project"){
      if(!can("clients.create")||!can("projects.department.create")){
        return json(req,{error:"Tu cargo no puede crear clientes/proyectos"},403);
      }

      const clientName=clean(body.client_name,160);
      const sector=clean(body.sector,120);
      const projectTitle=clean(body.project_title,180);
      const projectType=clean(body.project_type,80)||"general";
      const description=clean(body.description,3000);
      const contactName=clean(body.contact_name,160);
      const contactEmail=clean(body.contact_email,240).toLowerCase();
      const contactPhone=clean(body.contact_phone,80);
      const dueAt=dueIso(body.due_at);

      if(!clientName) return json(req,{error:"El nombre del cliente es obligatorio"},400);
      if(!projectTitle) return json(req,{error:"El nombre del proyecto es obligatorio"},400);
      if(!validEmail(contactEmail)) return json(req,{error:"Correo de contacto inválido"},400);

      const duplicate=await service.from("organizations").select("id,name").ilike("name",clientName).maybeSingle();
      if(duplicate.error&&duplicate.error.code!=="PGRST116") throw duplicate.error;
      if(duplicate.data) return json(req,{error:"Ya existe una organización con ese nombre. Crea un proyecto sobre el cliente existente."},409);

      const orgRes=await service.from("organizations").insert({
        name:clientName,
        sector:sector||"NEXO Marketing",
        initials:initials(clientName),
        color:"#316bff",
        timezone:"America/Bogota",
        status:"active",
        service_lines:[department.department_key],
        created_by_department_id:department.id,
        internal_owner_user_id:requester.id,
      }).select("id,name,sector,status,initials,color,service_lines").single();
      if(orgRes.error) throw orgRes.error;
      const org=orgRes.data;

      try{
        const assignRes=await service.from("nexo_client_assignments").insert({
          organization_id:org.id,
          user_id:requester.id,
          assignment_type:department.department_key,
          assigned_by:requester.id,
        });
        if(assignRes.error) throw assignRes.error;

        const projectRes=await service.from("nexo_projects").insert({
          organization_id:org.id,
          department_id:department.id,
          title:projectTitle,
          project_type:projectType,
          status:"brief",
          description:description||null,
          owner_user_id:requester.id,
          created_by:requester.id,
          due_at:dueAt,
          metadata:{
            contact_name:contactName||null,
            contact_email:contactEmail||null,
            contact_phone:contactPhone||null,
            created_from:"staff_workspace",
          },
        }).select("*").single();
        if(projectRes.error) throw projectRes.error;

        await audit("STAFF_CREATE_CLIENT_PROJECT",org.id,projectRes.data.id,{
          department_key:department.department_key,
          client_name:clientName,
          project_title:projectTitle,
          project_type:projectType,
        });
        return json(req,{ok:true,organization:org,project:projectRes.data});
      }catch(error){
        await service.from("nexo_client_assignments").delete().eq("organization_id",org.id).eq("user_id",requester.id);
        await service.from("organizations").delete().eq("id",org.id);
        throw error;
      }
    }

    if(action==="create_project"){
      if(!can("projects.department.create")){
        return json(req,{error:"Tu cargo no puede crear proyectos"},403);
      }
      const organizationId=clean(body.organization_id,80);
      const projectTitle=clean(body.project_title,180);
      const projectType=clean(body.project_type,80)||"general";
      const description=clean(body.description,3000);
      const dueAt=dueIso(body.due_at);
      if(!/^[0-9a-f-]{36}$/i.test(organizationId)) return json(req,{error:"Cliente inválido"},400);
      if(!projectTitle) return json(req,{error:"El nombre del proyecto es obligatorio"},400);

      const assignment=await service.from("nexo_client_assignments")
        .select("organization_id")
        .eq("organization_id",organizationId)
        .eq("user_id",requester.id)
        .maybeSingle();
      if(assignment.error) throw assignment.error;
      if(!assignment.data) return json(req,{error:"No tienes este cliente asignado"},403);

      const projectRes=await service.from("nexo_projects").insert({
        organization_id:organizationId,
        department_id:department.id,
        title:projectTitle,
        project_type:projectType,
        status:"brief",
        description:description||null,
        owner_user_id:requester.id,
        created_by:requester.id,
        due_at:dueAt,
        metadata:{created_from:"staff_workspace"},
      }).select("*").single();
      if(projectRes.error) throw projectRes.error;

      await audit("STAFF_CREATE_PROJECT",organizationId,projectRes.data.id,{
        department_key:department.department_key,
        project_title:projectTitle,
        project_type:projectType,
      });
      return json(req,{ok:true,project:projectRes.data});
    }

    return json(req,{error:"Acción no soportada"},400);
  }catch(error){
    console.error("NEXO_STAFF_WORK_ERROR",error);
    return json(req,{error:"No pudimos completar la operación",detail:error?.message||"Error"},500);
  }
});