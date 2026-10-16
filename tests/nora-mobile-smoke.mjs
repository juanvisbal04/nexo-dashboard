/**
 * NEXO public-site smoke tests. Chromium with mobile emulation and an isolated,
 * in-memory mock of the Nora Edge Function. This test NEVER writes production data.
 *
 * Run (from repository root with the site served at port 4173):
 *   npm install --no-save playwright@1.58.2
 *   npx playwright install chromium
 *   node tests/nora-mobile-smoke.mjs
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const BASE=process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
let passed=0;
async function test(name,fn){
  try{await fn();passed++;console.log('PASS',name);}
  catch(error){console.error('FAIL',name,error.stack||error);process.exitCode=1;}
}
function mockNora(page){
  let stage='welcome',failNext=false,requests=[],leadRequests=0;
  const products=[
    {id:'product_assistants',label:'Quiero automatizar atención'},
    {id:'product_marketing',label:'Necesito web, catálogo o branding'},
    {id:'product_solutions',label:'Tengo un proyecto especial'},
    {id:'product_exploring',label:'Solo estoy explorando'}
  ];
  const goals=[{id:'goal_service',label:'Atención y WhatsApp'}];
  const consent=[{id:'consent_accept',label:'Sí, autorizo'},{id:'consent_decline',label:'No, gracias'}];
  page.route('**/*', async (route)=>{
    const url=route.request().url();
    if(url.includes('/functions/v1/nora-web-chat')){
      const body=route.request().postDataJSON()||{};
      requests.push(body);
      if(failNext&&body.action==='message'){
        failNext=false;await route.abort('failed');return;
      }
      if(body.action==='start')stage='welcome';
      else if(stage==='welcome' && body.quick_reply?.startsWith('product_'))stage='ask_goal';
      else if(stage==='ask_goal' && (body.quick_reply?.startsWith('goal_')||body.message))stage='ask_business';
      else if(stage==='ask_business')stage='ask_industry';
      else if(stage==='ask_industry')stage='ask_consent';
      else if(stage==='ask_consent'&&body.quick_reply==='consent_decline')stage='welcome';
      else if(stage==='ask_consent'&&body.quick_reply==='consent_accept')stage='ask_name';
      else if(stage==='ask_name' || stage==='ask_contact'){leadRequests++;throw Error('Test must never submit real contact details');}
      const replies={
        welcome:{reply:'Hola, soy Nora. ¿Qué te gustaría trabajar?',quick_replies:products},
        ask_goal:{reply:'¿Qué te gustaría mejorar primero?',quick_replies:goals},
        ask_business:{reply:'¿Cómo se llama tu negocio?',quick_replies:[]},
        ask_industry:{reply:'¿A qué se dedica tu negocio?',quick_replies:[]},
        ask_consent:{reply:'¿Autorizas que NEXO trate tus datos?',quick_replies:consent},
        ask_name:{reply:'¿Cómo te llamas?',quick_replies:[]}
      };
      await route.fulfill({status:200,contentType:'application/json',
        headers:{'access-control-allow-origin':'*'},
        body:JSON.stringify({ok:true,mode:'guided',session_id:'test-session-01',...replies[stage]})});
    }else if(url.startsWith(BASE) || url.startsWith('http://127.0.0.1:4173')){
      await route.continue();
    }else{
      // Prevent external tracking, fonts, images and payments during local smoke tests.
      await route.abort();
    }
  });
  return {get stage(){return stage;},get requests(){return requests;},
    get leadRequests(){return leadRequests;},failOnce(){failNext=true;},
    reset(){stage='welcome';}};
}
try{
  await test('Home critical CSS: primary headline visible and shared footer restored',async()=>{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();mockNora(page);
    await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>{
      const l=document.querySelector('link[href*="styles.css"]');
      return l && l.media==='all';
    },{timeout:15000});
    const values=await page.evaluate(()=>({
      hero: getComputedStyle(document.querySelector('.nx-hero h1')).color,
      footer: getComputedStyle(document.querySelector('.site-footer')).display,
      width:document.documentElement.scrollWidth,
      viewport:window.innerWidth,
      font: getComputedStyle(document.body).fontFamily
    }));
    assert.equal(values.hero,'rgb(255, 255, 255)');
    assert.equal(values.footer,'grid');
    assert.ok(values.width<=values.viewport+2,'No horizontal scroll on 390px viewport');
    assert.ok(values.font.includes('Montserrat'));
    await context.close();
  });
  await test('Home hero visible before site.js or IntersectionObserver runs',async()=>{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    await page.route('**/*',route=>{
      if(route.request().url().startsWith(BASE))return route.continue();
      return route.abort();
    });
    // Simulate delayed/failed site.js, without blocking the site's CSS.
    await page.route('**/site.js*',route=>route.abort('failed'));
    await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
    await page.locator('.nx-hero-copy h1').waitFor();
    const state=await page.locator('.nx-hero-copy').evaluate(el=>({
      opacity:getComputedStyle(el).opacity,
      visibility:getComputedStyle(el).visibility,
      rendered:el.getBoundingClientRect().height>0,
      hiddenAncestor:[...function*(n){for(let v=n;v;v=v.parentElement)yield v}(el)]
        .some(n=>getComputedStyle(n).opacity==='0')
    }));
    assert.equal(state.opacity,'1','The primary headline must not begin hidden');
    assert.equal(state.visibility,'visible');
    assert.equal(state.hiddenAncestor,false,'No parent may hide the hero');
    assert.equal(state.rendered,true);
    await context.close();
  });
  await test('Mobile: header/menu opens and navigates without overflow',async()=>{
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    const page=await context.newPage();const api=mockNora(page);
    await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(await page.locator('#menu').isVisible(),true);
    await page.locator('#menu').click();
    assert.equal(await page.locator('#menu').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#navLinks').evaluate(el=>el.classList.contains('open')),true);
    await page.locator('#navLinks a[href="./catalogo.html"]').click();
    await page.waitForURL('**/catalogo.html');
    assert.equal(await page.locator('h1').count(),1);
    assert.equal(api.leadRequests,0);
    await context.close();
  });
  await test('Tablet 1024px: menu remains open at responsive breakpoint',async()=>{
    const context=await browser.newContext({viewport:{width:1024,height:800},isMobile:true,hasTouch:true});
    const page=await context.newPage();mockNora(page);
    await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
    await page.locator('#menu').click();
    assert.equal(await page.locator('#navLinks').evaluate(el=>el.classList.contains('open')),true);
    // Old bug: resize handler closed menu for widths >820 even though CSS uses <=1220.
    await page.setViewportSize({width:1025,height:801});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#navLinks').evaluate(el=>el.classList.contains('open')),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#navLinks').evaluate(el=>el.classList.contains('open')),false);
    await context.close();
  });
  await test('Nora: failed connection preserves typed draft, choices and privacy consent',async()=>{
    const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
    const page=await context.newPage();const api=mockNora(page);
    await page.goto(BASE+'/',{waitUntil:'domcontentloaded'});
    await page.locator('.nora-launcher').click();
    await page.getByRole('button',{name:'Quiero automatizar atención'}).waitFor();
    api.failOnce();
    await page.getByRole('button',{name:'Quiero automatizar atención'}).click();
    await page.locator('.nora-error').waitFor();
    assert.equal(await page.getByRole('button',{name:'Quiero automatizar atención'}).isVisible(),true);
    assert.equal(api.stage,'welcome');
    await page.getByRole('button',{name:'Quiero automatizar atención'}).click();
    await page.getByRole('button',{name:'Atención y WhatsApp'}).click();
    await page.getByText('¿Cómo se llama tu negocio?').waitFor();
    const input=page.locator('.nora-composer textarea');
    await input.fill('Negocio ficticio de interfaz');
    api.failOnce();
    await page.locator('.nora-send').click();
    await page.locator('.nora-error').waitFor();
    assert.equal(await input.inputValue(),'Negocio ficticio de interfaz');
    assert.equal(api.stage,'ask_business');
    await page.locator('.nora-send').click();
    await page.getByText('¿A qué se dedica tu negocio?').waitFor();
    assert.equal(await input.inputValue(),'');
    await input.fill('Servicios profesionales');
    await page.locator('.nora-send').click();
    await page.getByText('¿Autorizas que NEXO trate tus datos?').waitFor();
    assert.equal(await page.getByRole('button',{name:'Sí, autorizo'}).isVisible(),true);
    assert.equal(await page.getByRole('button',{name:'No, gracias'}).isVisible(),true);
    await page.locator('[data-nora-close]').click();
    await page.locator('.nora-launcher').click();
    assert.equal(await page.getByRole('button',{name:'Sí, autorizo'}).isVisible(),true);
    await page.getByRole('button',{name:'No, gracias'}).click();
    assert.equal(api.stage,'welcome');
    assert.equal(api.leadRequests,0);
    await page.locator('[data-nora-reset]').click();
    await page.getByRole('button',{name:'Quiero automatizar atención'}).click();
    await page.getByRole('button',{name:'Atención y WhatsApp'}).click();
    await input.fill('Negocio ficticio de interfaz');
    await page.locator('.nora-send').click();
    await input.fill('Servicios profesionales');
    await page.locator('.nora-send').click();
    await page.getByRole('button',{name:'Sí, autorizo'}).click();
    assert.equal(api.stage,'ask_name');
    await page.getByText('¿Cómo te llamas?').waitFor();
    assert.equal(api.leadRequests,0);
    assert.equal(api.requests.some(p=>/[\w.+-]+@[\w.-]+/.test(p.message||'')),false);
    await context.close();
  });
} finally {await browser.close();}
console.log('SMOKE RESULTS:',passed,'of 5 tests passed; no production leads or Supabase requests sent.');
if(passed!==5)process.exitCode=1;
