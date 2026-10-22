import { createAdminClient } from "@/lib/supabase/admin";
export type VariationSummary = {value:number; received:number; outstanding:number; progress:number|null; startDate:string|null; endDate:string|null; status:string; expenditure:number};
export async function variationSummaries(projectIds?:string[]):Promise<Record<string,VariationSummary>>{
 const db=createAdminClient();
 if(projectIds && !projectIds.length) return {};
 let vq=db.from('kcbl_variations').select('id,projectid,amount,progresspct,startdate,enddate,workstatus').eq('approvalstatus','Approved');
 if(projectIds) vq=vq.in('projectid',projectIds);
 const {data:vs,error:ve}=await vq;
 if(ve) throw new Error('Cannot load approved variations: '+ve.message);
 const variations=vs??[];
 if(!variations.length) return {};
 const ids=variations.map(v=>v.id);
 const {data:payments,error:pe}=await db.from('kcbl_variation_payments').select('variationid,amount').in('variationid',ids).eq('approvalstatus','Approved');
 if(pe) throw new Error('Cannot load approved variation receipts: '+pe.message);
 const byId=new Map(variations.map(v=>[v.id,v.projectid]));
 const out:Record<string,VariationSummary>={};
 for(const v of variations){
  const r=out[v.projectid]??{value:0,received:0,outstanding:0,progress:null,startDate:null,endDate:null,status:'—',expenditure:0};
  r.value+=Number(v.amount);if(v.startdate && (!r.startDate || v.startdate<r.startDate)) r.startDate=v.startdate;
  if(v.enddate && (!r.endDate || v.enddate>r.endDate)) r.endDate=v.enddate;
  r.status=v.workstatus??'Not specified';
  if(v.progresspct!==null && v.progresspct!==undefined)r.progress=v.progresspct===null?r.progress:Number(v.progresspct);
  out[v.projectid]=r;
 }
 for(const p of payments??[]){const project=byId.get(p.variationid);if(project&&out[project])out[project].received+=Number(p.amount)}
 const {data:expenses,error:ee}=await db.from('cashoutflowexpenditure').select('variationid,amount').in('variationid',ids).eq('approvalstatus','Approved');
 if(ee)throw new Error('Cannot load variation-linked expenditure: '+ee.message);
 for(const e of expenses??[]){const project=byId.get(e.variationid);if(project&&out[project])out[project].expenditure+=Number(e.amount)}
 for(const r of Object.values(out))r.outstanding=Math.max(0,r.value-r.received);
 return out;
}
