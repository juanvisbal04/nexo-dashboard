import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync('onboardingReadiness.js','utf8');
const {evaluateGoLiveReadiness}=await import('data:text/javascript;base64,'+Buffer.from(src).toString('base64'));
const base={steps:{
  company_status:'done',assistant_status:'not_needed',catalog_status:'not_needed',
  integrations_status:'not_needed',users_status:'not_needed',testing_status:'done',
  go_live_status:'pending'
},serviceLines:['marketing'],assistantActive:false,activeServices:0,
hasOperationalContact:true,hasCommercial:true};
assert.equal(evaluateGoLiveReadiness(base).ready,true);
console.log('PASS marketing-only onboarding can launch without unrelated assistant/catalog infrastructure');
const noTests=evaluateGoLiveReadiness({...base,steps:{...base.steps,testing_status:'not_needed'}});
assert.equal(noTests.ready,false);
assert.ok(noTests.reasons.some(x=>x.includes('pruebas finales')));
console.log('PASS tests cannot be skipped or silently marked not applicable');
const assistants=evaluateGoLiveReadiness({...base,serviceLines:['assistants']});
assert.equal(assistants.ready,false);
assert.ok(assistants.reasons.some(x=>x.includes('asistente')));
assert.ok(assistants.reasons.some(x=>x.includes('catálogo')));
console.log('PASS assistant package requires an approved agent and catalog');
const assistantReady=evaluateGoLiveReadiness({...base,serviceLines:['assistants'],
assistantActive:true,activeServices:1,steps:{...base.steps,assistant_status:'done',catalog_status:'done'}});
assert.equal(assistantReady.ready,true);
console.log('PASS verified assistant package is launch-ready');
assert.equal(evaluateGoLiveReadiness({...base,hasCommercial:false}).ready,false);
assert.equal(evaluateGoLiveReadiness({...base,hasOperationalContact:false}).ready,false);
assert.equal(evaluateGoLiveReadiness({...base,serviceLines:[]}).ready,false);
console.log('PASS no missing commercial setup, contact or service-line classification can be overlooked');
const existing=evaluateGoLiveReadiness({...base,steps:{...base.steps,go_live_status:'done'}});
assert.equal(existing.ready,false);
assert.equal(existing.alreadyLive,true);
console.log('PASS clients already LIVE are not activated again');
const quality=fs.readFileSync('qualityOnboarding.js','utf8');
assert.ok(quality.includes('onboarding-status-readonly'),'Go Live status must not be freely editable');
assert.ok(quality.includes('...editableSteps'),'Saved steps must exclude Go Live status');
assert.ok(quality.includes('readiness.ready?"":"disabled"'));
assert.ok(quality.includes('evaluateGoLiveReadiness({'));
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert.ok(app.includes('qualityOnboarding.js?v=20261016-ready1'));
assert.ok(html.includes('app.js?v=20261016-ready1'));
console.log('PASS dashboard integrates readiness, locks Go Live status and busts browser caches');
const migration=fs.readFileSync('supabase/migrations/20261016_go_live_readiness_guard.sql','utf8');
assert.ok(migration.includes("v_onboarding.testing_status<>'done'"));
assert.ok(migration.includes("v_onboarding.company_status<>'done'"));
assert.ok(migration.includes("array_length(v_org.service_lines,1)"));
assert.ok(migration.includes("v_assistant_required"));
assert.ok(migration.includes("NOT EXISTS("));
assert.ok(!migration.includes("testing_status=case"));
assert.ok(!migration.includes("values(new.id,'in_progress','done','pending')"));
assert.ok(migration.includes("CREATE OR REPLACE FUNCTION private.seed_organization_onboarding()"));
assert.ok(migration.includes('SECURITY DEFINER'),'Activation RPC must be able to make privileged state transition after admin check');
assert.ok(migration.includes('SECURITY INVOKER'),'Trigger must retain original caller role');
assert.ok(migration.includes("CURRENT_USER <> 'postgres'"),'Direct authenticated writes must be blocked');
assert.ok(migration.includes('BEFORE INSERT OR UPDATE ON public.organization_onboarding'));
assert.ok(migration.includes("NEW.go_live_status IS DISTINCT FROM OLD.go_live_status"));

console.log('PASS SQL Go Live RPC and new-client seeding require explicit approval, no artificial completion');
console.log('ONBOARDING SAFETY: 8 of 8 checks passed; no production data modified.');
