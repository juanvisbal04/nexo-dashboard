/**
 * Non-destructive demo form regression suite.
 * All Supabase requests are intercepted and simulated by Chromium.
 * No prospect data is written to production.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE=process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let passed=0;
const test=async (name,fn)=>{
  try{await fn();passed++;console.log('PASS',name);}
  catch(error){console.error('FAIL',name,error.stack||error);process.exitCode=1;}
};
function intercept(page,handler){
  let calls=0;
  page.route('**/*',async route=>{
    const url=route.request().url();
    if(url.includes('/functions/v1/submit-demo-request')){
      calls++;
      return handler(route,route.request().postDataJSON());
    }
    if(url.startsWith(BASE))return route.continue();
    return route.abort();
  });
  return {get calls(){return calls;}};
}
async function fill(page,{contact=true,consent=true}={}){
  await page.locator('#demoName').fill('Prospecto Prueba Local');
  await page.locator('#demoBusiness').fill('Comercio Prueba UI');
  if(contact)await page.locator('#demoEmail').fill('qa-only@example.test');
  await page.locator('#demoIndustry').selectOption({label:'Comercio'});
  await page.locator('#demoGoal').selectOption('leads');
  if(consent)await page.locator('#privacyConsent').check();
}
try{
  await test('Demo form: requires contact and preserves inputs without sending',async()=>{
    const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await c.newPage(),api=intercept(page,async route=>route.abort());
    await page.goto(BASE+'/demo.html',{waitUntil:'domcontentloaded'});
    await fill(page,{contact:false});
    await page.locator('#demoSubmit').click();
    await page.getByText('Comparte un WhatsApp o correo para poder contactarte.').waitFor();
    assert.equal(api.calls,0);
    assert.equal(await page.locator('#demoName').inputValue(),'Prospecto Prueba Local');
    await c.close();
  });
  await test('Demo form: cannot submit without consent',async()=>{
    const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await c.newPage(),api=intercept(page,async route=>route.abort());
    await page.goto(BASE+'/demo.html',{waitUntil:'domcontentloaded'});
    await fill(page,{consent:false});
    await page.locator('#demoSubmit').click();
    assert.equal(api.calls,0);
    assert.equal(await page.locator('#privacyConsent').isChecked(),false);
    assert.equal(await page.locator('#demoName').inputValue(),'Prospecto Prueba Local');
    await c.close();
  });
  await test('Demo form: network failure gives Spanish error without losing data',async()=>{
    const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await c.newPage(),api=intercept(page,async route=>route.abort('failed'));
    await page.goto(BASE+'/demo.html',{waitUntil:'domcontentloaded'});
    await fill(page);
    await page.locator('#demoSubmit').click();
    await page.getByText(/No pudimos confirmar el envío por un problema de conexión/).waitFor();
    assert.equal(api.calls,1);
    assert.equal(await page.locator('#demoEmail').inputValue(),'qa-only@example.test');
    assert.equal(await page.locator('#privacyConsent').isChecked(),true);
    assert.equal(await page.locator('#demoSubmit').isEnabled(),true);
    await c.close();
  });
  await test('Demo form: HTML error response shows fallback without clearing fields',async()=>{
    const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await c.newPage(),api=intercept(page,async route=>route.fulfill({
      status:503,contentType:'text/html',body:'<h1>Proxy temporarily unavailable</h1>'
    }));
    await page.goto(BASE+'/demo.html',{waitUntil:'domcontentloaded'});
    await fill(page);
    await page.locator('#demoSubmit').click();
    await page.getByText(/No pudimos confirmar el envío\. Tus datos siguen en el formulario/).waitFor();
    assert.equal(api.calls,1);
    assert.equal(await page.locator('#demoBusiness').inputValue(),'Comercio Prueba UI');
    assert.equal(await page.locator('#demoSubmit').isEnabled(),true);
    await c.close();
  });
  await test('Demo form: interrupted submission reuses one ID and stores no contact data locally',async()=>{
    const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await c.newPage();
    let firstId=null;
    const api=intercept(page,async(route,body)=>{
      assert.match(body.client_request_id,/^[0-9a-f-]{36}$/);
      if(!firstId){
        firstId=body.client_request_id;
        return route.abort('failed');
      }
      assert.equal(body.client_request_id,firstId,'Retried form must keep same opaque ID');
      return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"id":"same-mock-id","already_received":true}'});
    });
    await page.goto(BASE+'/demo.html',{waitUntil:'domcontentloaded'});
    await fill(page);
    await page.locator('#demoSubmit').click();
    await page.getByText(/No pudimos confirmar el envío por un problema de conexión/).waitFor();
    const stored=await page.evaluate(()=>sessionStorage.getItem('nexo_demo_pending_request_v1'));
    assert.ok(stored);
    assert.ok(!stored.includes('qa-only@example.test'));
    assert.ok(!stored.includes('Prospecto Prueba Local'));
    await page.locator('#demoSubmit').click();
    await page.getByText(/Solicitud recibida/).waitFor();
    assert.equal(api.calls,2);
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('nexo_demo_pending_request_v1')),null);
    await c.close();
  });
  await test('Demo form: changing details after a failed attempt starts a new ID',async()=>{
    const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await c.newPage();
    let id=null;
    const api=intercept(page,async(route,body)=>{
      if(id===null)id=body.client_request_id;
      else assert.notEqual(body.client_request_id,id,'Edited lead details need a fresh submission ID');
      return route.abort('failed');
    });
    await page.goto(BASE+'/demo.html',{waitUntil:'domcontentloaded'});
    await fill(page);
    await page.locator('#demoSubmit').click();
    await page.getByText(/No pudimos confirmar el envío por un problema de conexión/).waitFor();
    await page.locator('#demoMessage').fill('Nuevo requisito para mi negocio.');
    await page.locator('#demoSubmit').click();
    await page.waitForFunction(()=>document.querySelector('#demoSubmit')&&!document.querySelector('#demoSubmit').disabled);
    assert.equal(api.calls,2);
    await c.close();
  });
  await test('All four plan-specific demos use the current retry-safe script',async()=>{
    const paths=[
      ['/demo-start.html','start'],['/demo-growth.html','growth'],
      ['/demo-pro.html','pro'],['/demo-custom.html','custom']
    ];
    for(const [path,expectedPlan] of paths){
      const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const page=await c.newPage();
      const api=intercept(page,async(route,body)=>{
        assert.equal(body.plan_interest,expectedPlan,path+' should preserve its plan');
        assert.match(body.client_request_id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"id":"mock-plan-only"}'});
      });
      await page.goto(BASE+path,{waitUntil:'domcontentloaded'});
      assert.equal(await page.locator('#demoPlan').inputValue(),expectedPlan);
      await page.locator('#demoName').fill('Prospecto Ficticio Local');
      await page.locator('#demoBusiness').fill('Negocio Prueba');
      await page.locator('#demoEmail').fill('qa-only@example.test');
      await page.locator('#demoIndustry').selectOption({label:'Comercio'});
      await page.locator('#privacyConsent').check();
      await page.locator('#demoSubmit').click();
      await page.getByText(/Solicitud recibida/).waitFor();
      assert.equal(api.calls,1);
      await c.close();
    }
  });
  await test('Demo form: server success sends consent and resets fields once',async()=>{
    const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await c.newPage();
    const api=intercept(page,async(route,body)=>{
      assert.equal(body.privacy_consent,true);
      assert.equal(body.privacy_policy_version,'2026-10-06');
      assert.equal(body.full_name,'Prospecto Prueba Local');
      assert.equal(body.email,'qa-only@example.test');
      return route.fulfill({status:200,contentType:'application/json',body:'{"ok":true,"id":"mock-only"}'});
    });
    await page.goto(BASE+'/demo.html?plan=pro&industry=estetica',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#demoPlan').inputValue(),'pro');
    assert.equal(await page.locator('#demoIndustry').inputValue(),'Estética & wellness');
    await fill(page);
    await page.locator('#demoSubmit').click();
    await page.getByText(/Solicitud recibida/).waitFor();
    assert.equal(api.calls,1);
    assert.equal(await page.locator('#demoName').inputValue(),'');
    assert.equal(await page.locator('#demoSubmit').isDisabled(),true);
    await c.close();
  });
}finally{await browser.close();}
console.log('DEMO RESULTS:',passed,'of 8 checks; all API calls intercepted, no production writes.');
if(passed!==8)process.exitCode=1;
