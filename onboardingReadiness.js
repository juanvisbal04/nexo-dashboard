/** Readiness checklist for a new organization. This is guidance in the UI;
 * the database RPC independently enforces the same required conditions.
 * Never infer a completed test or activated integration solely from its existence.
 */
export const ONBOARDING_REQUIRED_STEPS=[
  ["company_status","Empresa configurada"],
  ["assistant_status","Asistente configurado o no aplica"],
  ["catalog_status","Catálogo aprobado o no aplica"],
  ["integrations_status","Integraciones verificadas o no aplica"],
  ["users_status","Accesos de clientes o no aplica"],
  ["testing_status","Pruebas finales aprobadas"]
];
export function evaluateGoLiveReadiness({steps={},serviceLines=[],assistantActive=false,activeServices=0,hasOperationalContact=false,hasCommercial=false}={}){
  const reasons=[];
  const lines=Array.isArray(serviceLines)?serviceLines:[];
  if(!lines.length)reasons.push("Clasificar la línea de negocio NEXO del cliente.");
  if(!hasCommercial)reasons.push("Crear la ficha comercial y condiciones del cliente.");
  if(steps.company_status!=="done")reasons.push("Completar la información de la empresa.");
  for(const [field,label] of ONBOARDING_REQUIRED_STEPS){
    if(field==="company_status"||field==="testing_status")continue;
    if(!["done","not_needed"].includes(steps[field]))reasons.push(label+": pendiente o bloqueado.");
  }
  if(steps.testing_status!=="done")reasons.push("Aprobar explícitamente las pruebas finales.");
  if(!hasOperationalContact)reasons.push("Configurar al menos un contacto operativo.");
  if(lines.includes("assistants")){
    if(steps.assistant_status!=="done")reasons.push("Completar la configuración del asistente.");
    if(steps.catalog_status!=="done")reasons.push("Validar el catálogo del asistente.");
    if(!assistantActive)reasons.push("Activar el asistente de este cliente.");
    if(!(Number(activeServices)>0))reasons.push("Registrar al menos un servicio activo del catálogo.");
  }
  if(steps.go_live_status==="done")return {ready:false,alreadyLive:true,reasons:[]};
  return {ready:reasons.length===0,alreadyLive:false,reasons:[...new Set(reasons)]};
}
