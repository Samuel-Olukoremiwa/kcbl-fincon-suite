import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const api = readFileSync(new URL('app/api/finance-modules/route.ts',root),'utf8');
const sql = readFileSync(new URL('supabase/20261022_finance_controls.sql',root),'utf8');
const ui = readFileSync(new URL('app/dashboard/finance-module.tsx',root),'utf8');
test('production DB is never accessed by this test suite',()=>{
 assert.ok(!api.includes('SUPABASE_SERVICE_ROLE_KEY'));
 assert.ok(!sql.includes('INSERT INTO public.kcbl_company_entries'));
});
test('maker-checker guard exists on variations and company entries',()=>{
 assert.match(api,/createdbyuserid===viewer.userId/);
 assert.match(sql,/item.createdbyuserid=p_userid/);
 assert.match(sql,/pay.createdbyuserid=p_userid/);
});
test('company outflow authorization serializes cash balance decision',()=>{
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/Insufficient approved company cash balance/);
 assert.match(api,/kcbl_decide_company_entry/);
});
test('variation payment requires separate decision',()=>{
 assert.match(api,/kcbl_submit_variation_payment/);
 assert.match(api,/kcbl_decide_variation_payment/);
 assert.match(sql,/approvalstatus IN \('Pending','Approved'\)/);
 assert.match(ui,/decidePayment/);
 assert.match(ui,/p.approvalstatus==='Approved'/);
});
test('no automatic project cash ledger posting',()=>{
 assert.doesNotMatch(api,/from\(['"]cashinflowreceivables['"]\)/);
 assert.doesNotMatch(api,/from\(['"]cashoutflowexpenditure['"]\)/);
});
