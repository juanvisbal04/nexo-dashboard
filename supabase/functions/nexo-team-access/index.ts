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
function randomPassword(){
  const a=new Uint8Array(36); crypto.getRandomValues(a);
  return "Nx9!"+Array.from(a).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function randomToken(){
  const a=new Uint8Array(32); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}
async function sha256(v:string){
  const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));
  return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function assignmentType(roleKey:string){
  return roleKey==="sales"?"sales":roleKey==="marketing"?"marketing":roleKey==="implementation_cs"?"implementation":roleKey==="operations"?"operations":"collaborator";
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=="POST") return json(req,{error:"Method not allowed"},405);

  try{
    const auth=req.headers.get("authorization")||"";
    const jwt=auth.startsWith("Bearer ")?auth.slice(7):"";
    if(!jwt) return json(req,{error:"No autorizado"},401);

    const userResult=await service.auth.getUser(jwt);
    const requester=userResult.data.user;
    if(userResult.error||!requester) return json(req,{error:"Sesión inválida"},401);

    const requesterProfile=await service.from("profiles").select("platform_role").eq("id",requester.id).maybeSingle();
    if(requesterProfile.error||requesterProfile.data?.platform_role!=="platform_admin"){
      return json(req,{error:"Solo el Super Admin puede administrar el equipo interno de NEXO"},403);
    }

    const internalOrgRes=await service.from("organizations").select("id,name").eq("name","NEXO Internal").maybeSingle();
    if(internalOrgRes.error||!internalOrgRes.data) return json(req,{error:"NEXO Internal no está configurado"},500);
    const internalOrg=internalOrgRes.data;

    const body=await req.json();
    const action=String(body.action||"list");

    const getCatalog=async()=>{
      const [rolesRes,permissionsRes,rolePermRes,orgsRes]=await Promise.all([
        service.from("nexo_team_roles").select("id,role_key,name,description,active").eq("active",true).order("name"),
        service.from("nexo_permissions").select("permission_key,category,description").order("category").order("permission_key"),
        service.from("nexo_role_permissions").select("role_id,permission_key"),
        service.from("organizations").select("id,name,sector,status,initials,color").neq("name","NEXO Internal").order("name"),
      ]);
      if(rolesRes.error) throw rolesRes.error;
      if(permissionsRes.error) throw permissionsRes.error;
      if(rolePermRes.error) throw rolePermRes.error;
      if(orgsRes.error) throw orgsRes.error;
      const permissionsByRole=new Map<string,string[]>();
      for(const rp of rolePermRes.data||[]){
        const arr=permissionsByRole.get(rp.role_id)||[];
        arr.push(rp.permission_key);
        permissionsByRole.set(rp.role_id,arr);
      }
      return {
        roles:(rolesRes.data||[]).map(r=>({...r,permissions:(permissionsByRole.get(r.id)||[]).sort()})),
        permissions:permissionsRes.data||[],
        organizations:orgsRes.data||[],
      };
    };

    const buildUsers=async()=>{
      const catalog=await getCatalog();
      const roleIds=catalog.roles.map(r=>r.id);
      if(!roleIds.length) return {...catalog,users:[]};

      const roleRowsRes=await service.from("nexo_user_roles")
        .select("user_id,role_id,active,created_at,deactivated_at,deactivated_by")
        .in("role_id",roleIds)
        .order("created_at");
      if(roleRowsRes.error) throw roleRowsRes.error;
      const roleRows=roleRowsRes.data||[];
      const userIds=[...new Set(roleRows.map(r=>r.user_id))];

      let profiles:any[]=[];
      let assignments:any[]=[];
      if(userIds.length){
        const [profilesRes,assignmentsRes]=await Promise.all([
          service.from("profiles").select("id,full_name,job_title,avatar_url,contact_email,platform_role").in("id",userIds),
          service.from("nexo_client_assignments").select("organization_id,user_id,assignment_type,created_at").in("user_id",userIds),
        ]);
        if(profilesRes.error) throw profilesRes.error;
        if(assignmentsRes.error) throw assignmentsRes.error;
        profiles=profilesRes.data||[];
        assignments=assignmentsRes.data||[];
      }

      const authUsers=await service.auth.admin.listUsers({page:1,perPage:1000});
      if(authUsers.error) throw authUsers.error;
      const authMap=new Map(authUsers.data.users.map(u=>[u.id,u]));
      const profileMap=new Map(profiles.map(p=>[p.id,p]));
      const roleMap=new Map(catalog.roles.map(r=>[r.id,r]));

      const users=roleRows
        .filter(row=>profileMap.get(row.user_id)?.platform_role!=="platform_admin")
        .map(row=>{
          const p=profileMap.get(row.user_id)||{};
          const a=authMap.get(row.user_id);
          const role=roleMap.get(row.role_id);
          const userAssignments=assignments.filter(x=>x.user_id===row.user_id);
          return {
            user_id:row.user_id,
            full_name:p.full_name||"",
            job_title:p.job_title||"",
            avatar_url:p.avatar_url||null,
            email:a?.email||p.contact_email||"",
            role_id:row.role_id,
            role_key:role?.role_key||"",
            role_name:role?.name||"",
            permissions:role?.permissions||[],
            active:row.active===true,
            status:row.active===true?(a?.last_sign_in_at?"active":"invited"):"inactive",
            last_sign_in_at:a?.last_sign_in_at||null,
            access_created_at:row.created_at,
            deactivated_at:row.deactivated_at||null,
            organization_ids:userAssignments.map(x=>x.organization_id),
            assignments:userAssignments,
          };
        });
      return {...catalog,users};
    };

    const audit=async(actionType:string,tableName:string,recordId:string|null,oldData:unknown,newData:unknown,changedFields:unknown)=>{
      const ins=await service.from("audit_log").insert({
        organization_id:internalOrg.id,
        actor_user_id:requester.id,
        actor_email:requester.email||null,
        action:actionType,
        table_name:tableName,
        record_id:recordId,
        old_data:oldData,
        new_data:newData,
        changed_fields:changedFields,
      });
      if(ins.error) console.error("NEXO_TEAM_AUDIT_ERROR",ins.error);
    };

    if(action==="list"){
      return json(req,{ok:true,organization:internalOrg,...await buildUsers()});
    }

    if(action==="create"||action==="update"){
      const email=String(body.email||"").trim().toLowerCase();
      const fullName=String(body.full_name||"").trim();
      const jobTitle=String(body.job_title||"").trim();
      const roleKey=String(body.role_key||"").trim();
      const requestedClientIds=Array.isArray(body.organization_ids)?[...new Set(body.organization_ids.map((x:unknown)=>String(x)))]:[];
      if(!roleKey) return json(req,{error:"El rol es obligatorio"},400);
      if(action==="create"&&(!email||!email.includes("@"))) return json(req,{error:"Correo inválido"},400);

      const catalog=await getCatalog();
      const role=catalog.roles.find(r=>r.role_key===roleKey);
      if(!role) return json(req,{error:"Rol interno inválido"},400);
      const allowedOrgIds=new Set(catalog.organizations.map(o=>o.id));
      if(requestedClientIds.some(id=>!allowedOrgIds.has(id))) return json(req,{error:"Una de las empresas asignadas no es válida"},400);

      let target:any=null;
      let created=false;
      if(action==="create"){
        const listed=await service.auth.admin.listUsers({page:1,perPage:1000});
        if(listed.error) throw listed.error;
        target=listed.data.users.find(u=>(u.email||"").toLowerCase()===email)||null;
        if(target){
          const p=await service.from("profiles").select("platform_role").eq("id",target.id).maybeSingle();
          if(p.data?.platform_role==="platform_admin") return json(req,{error:"No puedes convertir una cuenta Platform Admin en colaborador"},400);
        }else{
          const createdUser=await service.auth.admin.createUser({
            email,
            password:randomPassword(),
            email_confirm:true,
            user_metadata:fullName?{full_name:fullName}:{},
          });
          if(createdUser.error||!createdUser.data.user) throw createdUser.error||new Error("No se pudo crear el usuario");
          target=createdUser.data.user;
          created=true;
        }
      }else{
        const userId=String(body.user_id||"").trim();
        if(!userId) return json(req,{error:"Usuario inválido"},400);
        if(userId===requester.id) return json(req,{error:"Tu cuenta Super Admin se administra fuera de este módulo"},400);
        const authUser=await service.auth.admin.getUserById(userId);
        if(authUser.error||!authUser.data.user) return json(req,{error:"Usuario no encontrado"},404);
        target=authUser.data.user;
        const p=await service.from("profiles").select("platform_role").eq("id",target.id).maybeSingle();
        if(p.data?.platform_role==="platform_admin") return json(req,{error:"No puedes modificar un Platform Admin desde aquí"},403);
      }

      const oldRolesRes=await service.from("nexo_user_roles").select("user_id,role_id,active,deactivated_at").eq("user_id",target.id);
      if(oldRolesRes.error) throw oldRolesRes.error;
      const oldAssignmentsRes=await service.from("nexo_client_assignments").select("organization_id,assignment_type").eq("user_id",target.id);
      if(oldAssignmentsRes.error) throw oldAssignmentsRes.error;
      const existingActive=(oldRolesRes.data||[])[0]?.active;
      const keepActive=action==="update" ? existingActive!==false : true;

      const existingProfile=await service.from("profiles").select("id").eq("id",target.id).maybeSingle();
      if(existingProfile.error) throw existingProfile.error;
      if(!existingProfile.data){
        const ins=await service.from("profiles").insert({
          id:target.id,full_name:fullName||null,job_title:jobTitle||null,contact_email:target.email||email||null,platform_role:"user",
        });
        if(ins.error) throw ins.error;
      }else{
        const up=await service.from("profiles").update({
          ...(fullName?{full_name:fullName}:{}),
          job_title:jobTitle||null,
          contact_email:target.email||email||null,
        }).eq("id",target.id);
        if(up.error) throw up.error;
      }

      const delRoles=await service.from("nexo_user_roles").delete().eq("user_id",target.id);
      if(delRoles.error) throw delRoles.error;
      const addRole=await service.from("nexo_user_roles").insert({
        user_id:target.id,
        role_id:role.id,
        assigned_by:requester.id,
        active:keepActive,
        deactivated_at:keepActive?null:new Date().toISOString(),
        deactivated_by:keepActive?null:requester.id,
      });
      if(addRole.error) throw addRole.error;

      const delAssignments=await service.from("nexo_client_assignments").delete().eq("user_id",target.id);
      if(delAssignments.error) throw delAssignments.error;
      if(requestedClientIds.length){
        const addAssignments=await service.from("nexo_client_assignments").insert(requestedClientIds.map(orgId=>({
          organization_id:orgId,
          user_id:target.id,
          assignment_type:assignmentType(role.role_key),
          assigned_by:requester.id,
        })));
        if(addAssignments.error) throw addAssignments.error;
      }

      let setupUrl:string|null=null;
      let expiresAt:string|null=null;
      if(created){
        const rawToken=randomToken();
        const tokenHash=await sha256(rawToken);
        expiresAt=new Date(Date.now()+48*60*60*1000).toISOString();
        await service.from("client_setup_tokens").update({used_at:new Date().toISOString()}).eq("user_id",target.id).is("used_at",null);
        const tokenInsert=await service.from("client_setup_tokens").insert({
          user_id:target.id,
          organization_id:internalOrg.id,
          token_hash:tokenHash,
          expires_at:expiresAt,
          created_by:requester.id,
        });
        if(tokenInsert.error) throw tokenInsert.error;
        setupUrl="https://dashboard.nexobyjv.online/activate.html#token="+encodeURIComponent(rawToken);
      }

      await audit(action==="create"?"INSERT":"UPDATE","nexo_user_roles",target.id,
        {roles:oldRolesRes.data||[],assignments:oldAssignmentsRes.data||[]},
        {role_key:role.role_key,active:keepActive,organization_ids:requestedClientIds},
        {role_key:role.role_key,organization_ids:requestedClientIds,active:keepActive}
      );

      return json(req,{
        ok:true,
        created,
        existing_user:!created,
        setup_url:setupUrl,
        expires_at:expiresAt,
        ...await buildUsers()
      });
    }

    if(action==="set_active"){
      const userId=String(body.user_id||"").trim();
      const active=body.active===true;
      if(!userId||userId===requester.id) return json(req,{error:"Usuario inválido"},400);
      const before=await service.from("nexo_user_roles").select("user_id,role_id,active,deactivated_at,deactivated_by").eq("user_id",userId);
      if(before.error) throw before.error;
      if(!(before.data||[]).length) return json(req,{error:"El usuario no pertenece al equipo NEXO"},404);
      const up=await service.from("nexo_user_roles").update({
        active,
        deactivated_at:active?null:new Date().toISOString(),
        deactivated_by:active?null:requester.id,
      }).eq("user_id",userId);
      if(up.error) throw up.error;
      await audit("UPDATE","nexo_user_roles",userId,before.data,{active},{active});
      return json(req,{ok:true,...await buildUsers()});
    }

    if(action==="remove"){
      const userId=String(body.user_id||"").trim();
      if(!userId||userId===requester.id) return json(req,{error:"Usuario inválido"},400);
      const beforeRoles=await service.from("nexo_user_roles").select("*").eq("user_id",userId);
      if(beforeRoles.error) throw beforeRoles.error;
      const beforeAssignments=await service.from("nexo_client_assignments").select("*").eq("user_id",userId);
      if(beforeAssignments.error) throw beforeAssignments.error;
      const delA=await service.from("nexo_client_assignments").delete().eq("user_id",userId);
      if(delA.error) throw delA.error;
      const delR=await service.from("nexo_user_roles").delete().eq("user_id",userId);
      if(delR.error) throw delR.error;
      await audit("DELETE","nexo_user_roles",userId,{roles:beforeRoles.data||[],assignments:beforeAssignments.data||[]},null,{removed:true});
      return json(req,{ok:true,...await buildUsers()});
    }

    return json(req,{error:"Acción no soportada"},400);
  }catch(error){
    console.error("NEXO_TEAM_ACCESS_ERROR",error);
    return json(req,{error:"No pudimos completar la operación",detail:error?.message||"Error"},500);
  }
});