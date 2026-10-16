/** Isolated unit tests for the real Supabase Edge Function source.
 * Fake service-role client + in-memory records: NEVER contacts production.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { webcrypto } from 'node:crypto';
const src=fs.readFileSync('supabase/functions/submit-demo-request/index.ts','utf8');
const migration=fs.readFileSync('supabase/migrations/20261016_demo_request_idempotency.sql','utf8');
assert.ok(migration.includes('create unique index if not exists demo_requests_client_request_id_unique'));
assert.ok(migration.includes('client_request_id'));
const rows=[];
let rateCalls=0,ownerNotices=0;
const founderId='11111111-1111-4111-8111-111111111111';
const marketingOwner='22222222-2222-4222-8222-222222222222';
const supabase={
  rpc:async(name,payload)=>{
    assert.equal(name,'nexo_public_rate_limit');
    assert.equal(payload.p_limit,6);
    rateCalls++;
    return {data:true,error:null};
  },
  from(name){
    const filters={};
    const query={
      select(){return query},
      eq(field,value){filters[field]=value;return query},
      order(){return query},
      limit(){return query},
      async maybeSingle(){
        if(name==='demo_requests'){
          const data=rows.find(x=>x.client_request_id&&x.client_request_id===filters.client_request_id);
          return {data:data?{id:data.id}:null,error:null};
        }
        if(name==='profiles')return {data:{id:founderId},error:null};
        if(name==='nexo_team_roles')return {data:{id:'33333333-3333-4333-8333-333333333333'},error:null};
        if(name==='nexo_user_roles')return {data:{user_id:marketingOwner},error:null};
        if(name==='nexo_plans')return {data:{monthly_fee:490000,setup_fee_min:600000},error:null};
        throw new Error('Unexpected lookup '+name);
      },
      insert(payload){
        assert.equal(name,'demo_requests');
        return {select(){return {async single(){
          if(payload.client_request_id&&rows.some(r=>r.client_request_id===payload.client_request_id)){
            return {data:null,error:{code:'23505',message:'duplicate key'}};
          }
          const id=webcrypto.randomUUID();
          rows.push({...payload,id});
          if(payload.owner_user_id)ownerNotices++;
          return {data:{id},error:null};
        }}}};
      }
    };
    return query;
  }
};
let handler;
const globals={
  createClient:()=>supabase,
  Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://example.test':'fake-service-key'},serve:fn=>{handler=fn}},
  Request,Response,Headers,TextEncoder,crypto:webcrypto,console,Date,Set,Uint8Array,String,Number,Array,Error
};
const stripped=src.replace(/^import\s+\{ createClient \}\s+from\s+["'][^"']+["'];\s*/m,'');
assert.notEqual(stripped,src,'Must remove npm import in the isolated transpilation only');
const compiled=ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
vm.runInNewContext(compiled,globals,{filename:'submit-demo-request.mocked.js'});
assert.equal(typeof handler,'function');
const id1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const base={full_name:'Demo Mock',business_name:'Test Shop',email:'qa@example.test',
  industry:'Servicios profesionales',plan_interest:'growth',phone:'',message:'Mocked only',
  privacy_consent:true,source:'nexobyjv.online/demo',client_request_id:id1};
const invoke=async(payload,origin='https://nexobyjv.online')=>{
  const req=new Request('https://example.test/functions/v1/submit-demo-request',{
    method:'POST',headers:{'content-type':'application/json',origin},
    body:JSON.stringify(payload)
  });
  const res=await handler(req);
  return {status:res.status,data:await res.json()};
};
const a=await invoke(base);
assert.equal(a.status,200);
assert.equal(a.data.already_received,false);
assert.equal(rows.length,1);
assert.equal(rows[0].owner_user_id,founderId);
assert.equal(ownerNotices,1);
assert.equal(rateCalls,1);
console.log('PASS create one assigned lead on first request');
const b=await invoke(base);
assert.equal(b.status,200);
assert.equal(b.data.id,a.data.id);
assert.equal(b.data.already_received,true);
assert.equal(rows.length,1);
assert.equal(ownerNotices,1);
assert.equal(rateCalls,1,'Retry should not use rate limit quota');
console.log('PASS retry after lost acknowledgment returns original lead, no extra alert/insert');
const c=await invoke({...base,client_request_id:id2,plan_interest:'marketing'});
assert.equal(c.status,200);
assert.equal(c.data.already_received,false);
assert.equal(rows.length,2);
assert.equal(rows[1].owner_user_id,marketingOwner);
assert.equal(ownerNotices,2);
console.log('PASS distinct inquiry gets new lead and marketing owner');
const old=await invoke({...base,client_request_id:undefined});
assert.equal(old.status,200);
assert.equal(rows.length,3);
assert.equal(rows[2].client_request_id,null);
console.log('PASS older clients without UUID remain compatible');
const rejected=await invoke({...base,privacy_consent:false,client_request_id:webcrypto.randomUUID()});
assert.equal(rejected.status,400);
assert.equal(rows.length,3);
console.log('PASS no consent prevents insertion');
const invalid=await invoke({...base,client_request_id:'not-a-valid-uuid'});
assert.equal(invalid.status,400);
assert.equal(rows.length,3);
console.log('PASS malformed retry ID is rejected');
const blocked=await invoke({...base,client_request_id:webcrypto.randomUUID()},'https://evil.example');
assert.equal(blocked.status,403);
assert.equal(rows.length,3);
console.log('PASS other origins rejected');
console.log('EDGE TEST RESULTS: 7/7 approved; all data isolated in memory, zero production writes.');
