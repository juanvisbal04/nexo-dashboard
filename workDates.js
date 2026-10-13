// Calendar dates for the team's Colombia workday, independent of device timezone.
export function bogotaDay(value=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
}
export function bogotaDayStart(value=new Date()){
  return new Date(bogotaDay(value)+'T00:00:00-05:00');
}
