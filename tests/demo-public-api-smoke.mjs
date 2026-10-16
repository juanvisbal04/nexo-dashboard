/**
 * Public production Edge API checks that cannot write leads.
 * Do not use successful submissions here; consent and ID validations must fail.
 */
import assert from 'node:assert/strict';
const url='https://ixewnbjndguchunwcuhf.supabase.co/functions/v1/submit-demo-request';
const origin='https://nexobyjv.online';
async function check(name,init,status){
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(18000)});
  const body=await response.text();
  assert.equal(response.status,status,name+': '+response.status+' '+body.slice(0,160));
  console.log('PASS',name,'HTTP',status);
}
await check('Allowed site CORS preflight',{
  method:'OPTIONS',headers:{origin,'access-control-request-method':'POST'}
},204);
await check('Missing consent must fail before insert',{
  method:'POST',headers:{origin,'content-type':'application/json'},
  body:JSON.stringify({privacy_consent:false})
},400);
await check('Malformed request ID rejected before any possible insert',{
  method:'POST',headers:{origin,'content-type':'application/json'},
  body:JSON.stringify({privacy_consent:true,client_request_id:'not-a-uuid'})
},400);
await check('Foreign origin must be rejected',{
  method:'POST',headers:{origin:'https://not-nexo.example','content-type':'application/json'},
  body:JSON.stringify({privacy_consent:false})
},403);
await check('GET cannot create a prospect',{
  method:'GET',headers:{origin}
},405);
console.log('PRODUCTION API: 5/5 safe negative checks; zero successful submissions.');
