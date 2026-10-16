/** Alerts for sales opportunities without a recorded next action.
 * No individual prospect data is stored in this summary alert.
 */
export function buildUnscheduledProspectsAlert(count){
  const n=Number(count)||0;
  if(!Number.isFinite(n) || n<1) return null;
  return {
    key:"prospects:unplanned-next-action",
    version:String(n),
    tone:"watch",
    priority:88,
    page:"pipeline",
    orgId:null,
    title:n===1?"1 prospecto sin próxima acción":n+" prospectos sin próxima acción",
    detail:"Revisa el pipeline comercial y registra el próximo seguimiento.",
    date:null
  };
}
