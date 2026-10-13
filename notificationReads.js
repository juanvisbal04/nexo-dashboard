export function notificationFingerprint(item){return JSON.stringify([item.title,item.date||null,item.tone,item.version||null]);}
export async function loadNotificationReads(supabase,userId,items){
 if(!items.length)return new Map();
 const {data,error}=await supabase.from('notification_reads').select('notification_key,fingerprint').eq('user_id',userId).in('notification_key',items.map(i=>i.key));
 if(error)throw error;return new Map((data||[]).map(r=>[r.notification_key,r.fingerprint]));
}
export async function markNotificationReads(supabase,userId,items){
 if(!items.length)return;
 const rows=items.map(i=>({user_id:userId,notification_key:i.key,fingerprint:notificationFingerprint(i),read_at:new Date().toISOString()}));
 const {error}=await supabase.from('notification_reads').upsert(rows,{onConflict:'user_id,notification_key'});if(error)throw error;
}
