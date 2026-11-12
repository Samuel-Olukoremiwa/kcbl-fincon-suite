import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/viewer';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccess } from '@/lib/access';
import { notifyTransactionSubmitted, notifyTransactionDecision, shortRef } from '@/lib/transaction-notifications';

const jsonError = (message:string,status=400) => NextResponse.json({error:message},{status});
const validAmount = (value:unknown) => {
  const s = String(value ?? '').replace(/,/g,'').trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(s)) return null;
  const n=Number(s); return Number.isSafeInteger(Math.round(n*100)) && n>0 ? n : null;
};
const validDate=(value:unknown)=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const auth = (v:{roleName:string;department:string|null;userType:string},module:'variations'|'inhouse')=>canAccess(v as Parameters<typeof canAccess>[0],module);
const maker = (v:{roleName:string;department:string|null}) => v.roleName==='Super User' || (v.department==='Finance & Admin' && v.roleName==='Initiator');
const checker = (v:{roleName:string;department:string|null}) => v.roleName==='Super User' || (v.department==='Finance & Admin' && v.roleName==='Authorizer') || (v.department==='MD' && ['Authorizer','MD'].includes(v.roleName));

export async function GET(request:Request){
 const viewer=await getViewer(); const kind=new URL(request.url).searchParams.get('kind');
 if(kind!=='variations' && kind!=='inhouse') return jsonError('Invalid module');
 if(!auth(viewer,kind)) return jsonError('Access denied',403);
 const db=createAdminClient();
 let clientProjectIds:string[]|null=null;
 if(viewer.userType==='Client'){
   if(kind!=='variations')return jsonError('Access denied',403);
   const linked=await db.from('clients').select('clientid').eq('linkeduserid',viewer.userId).maybeSingle();
   if(linked.error || !linked.data)return NextResponse.json({projects:[],variations:[],payments:[],canMake:false,canApprove:false});
   const owned=await db.from('projects').select('projectid').eq('clientid',linked.data.clientid);
   if(owned.error)return jsonError('Could not load client projects',500);
   clientProjectIds=(owned.data??[]).map(x=>x.projectid);
   if(!clientProjectIds.length)return NextResponse.json({projects:[],variations:[],payments:[],canMake:false,canApprove:false});
 }
 let pq=db.from('projects').select('projectid,projecttitle').order('projecttitle');
 if(clientProjectIds)pq=pq.in('projectid',clientProjectIds);
 const projects=await pq;
 if(projects.error) return jsonError(projects.error.message,500);
 if(kind==='variations'){
  const [v,p]=await Promise.all([
   db.from('kcbl_variations').select('*').order('createdat',{ascending:false}).in('projectid',clientProjectIds??(projects.data??[]).map(p=>p.projectid)),
   db.from('kcbl_variation_payments').select('*').order('createdat',{ascending:false})
  ]);
  if(v.error||p.error) return jsonError(v.error?.message||p.error?.message||'Query error',500);
  const safeIds=new Set((v.data??[]).map(row=>row.id));
  return NextResponse.json({projects:projects.data,variations:v.data,payments:(p.data??[]).filter(row=>safeIds.has(row.variationid)),canMake:viewer.userType==='Client'?false:maker(viewer),canApprove:viewer.userType==='Client'?false:checker(viewer)});
 }
 const e=await db.from('kcbl_company_entries').select('*').order('entrydate',{ascending:false}).order('createdat',{ascending:false});
 if(e.error) return jsonError(e.error.message,500);
 return NextResponse.json({projects:projects.data,entries:e.data,canMake:maker(viewer),canApprove:checker(viewer)});
}

export async function POST(request:Request){
 const viewer=await getViewer();if(viewer.userType!=='Staff')return jsonError('Access denied',403);
 let body:Record<string,unknown>;
 try{body=await request.json()}catch{return jsonError('Invalid JSON')}
 const kind=body.kind;
 if(kind!=='variations'&&kind!=='inhouse')return jsonError('Invalid module');
 if(!auth(viewer,kind))return jsonError('Access denied',403);
 const action=String(body.action||'create');const db=createAdminClient();
 if(action==='create'){
  if(!maker(viewer))return jsonError('Only Finance Initiators or Super User can submit records',403);
  const amount=validAmount(body.amount);if(amount===null)return jsonError('Enter a valid positive amount');
  const description=String(body.description||'').trim();if(!description)return jsonError('Description is required');
  const projectid=String(body.projectid||'').trim();
  if(kind==='variations'){
   if(!projectid)return jsonError('Project is required');
   const project=await db.from('projects').select('projectid').eq('projectid',projectid).maybeSingle();
   if(!project.data)return jsonError('Project not found');
   const out=await db.from('kcbl_variations').insert({projectid,description,amount,createdbyuserid:viewer.userId,startdate:body.startdate||null,enddate:body.enddate||null,progresspct:body.progresspct===undefined||body.progresspct===''?null:Number(body.progresspct),workstatus:String(body.workstatus||'Not started')}).select('id').single();
   if(out.error)return jsonError(out.error.message);
   await notifyTransactionSubmitted({transactionType:'Variation',transactionId:shortRef('VAR',out.data.id),makerUserId:viewer.userId,amount,description,projectId:projectid});
   return NextResponse.json({ok:true,id:out.data.id});
  }
  if(!validDate(body.entrydate))return jsonError('Valid transaction date required');
  if(String(body.entrydate)>new Date().toISOString().slice(0,10))return jsonError('Future transactions not allowed');
  const direction=String(body.direction);if(!['Inflow','Outflow'].includes(direction))return jsonError('Invalid direction');
  const category=String(body.category||'').trim();if(!category)return jsonError('Category is required');
  if(projectid){const project=await db.from('projects').select('projectid').eq('projectid',projectid).maybeSingle();if(!project.data)return jsonError('Project not found')}
  const transferreference=String(body.transferreference||'').trim()||null;
  const out=await db.from('kcbl_company_entries').insert({entrydate:body.entrydate,direction,amount,category,description,projectid:projectid||null,transferreference,createdbyuserid:viewer.userId}).select('id').single();
  if(out.error)return jsonError(out.error.message);
  await notifyTransactionSubmitted({transactionType:direction==='Inflow'?'In-House Inflow':'In-House Outflow',transactionId:shortRef('IH',out.data.id),makerUserId:viewer.userId,amount,description,projectId:projectid||null});
  return NextResponse.json({ok:true,id:out.data.id});
 }
 if(action==='decide-payment' && kind==='variations'){
  if(!checker(viewer)) return jsonError('Only checkers may approve payments',403);
  const id=String(body.id||''); const decision=String(body.decision||''); const reason=String(body.reason||'').trim();
  if(!['Approved','Rejected'].includes(decision))return jsonError('Invalid decision');
  if(decision==='Rejected'&&!reason)return jsonError('Rejection reason required');
  const pay=await db.from('kcbl_variation_payments').select('createdbyuserid,amount').eq('id',id).maybeSingle();
  if(!pay.data)return jsonError('Payment not found',404);
  const res=await db.rpc('kcbl_decide_variation_payment',{p_id:id,p_decision:decision,p_reason:reason,p_userid:viewer.userId});
  if(res.error)return jsonError(res.error.message);
  await notifyTransactionDecision({transactionType:'Variation Payment',transactionId:shortRef('VPAY',id),makerUserId:pay.data.createdbyuserid,amount:pay.data.amount,status:decision as 'Approved'|'Rejected',reason:decision==='Rejected'?reason:null});
  return NextResponse.json({ok:true});
 }
 if(action==='decide'){
  if(!checker(viewer))return jsonError('Only authorized checkers may approve',403);
  const id=String(body.id||'');const decision=String(body.decision||'');const reason=String(body.reason||'').trim();
  if(!['Approved','Rejected'].includes(decision))return jsonError('Invalid decision');
  if(decision==='Rejected'&&!reason)return jsonError('A rejection reason is required');
  const table=kind==='variations'?'kcbl_variations':'kcbl_company_entries';
  const item=await db.from(table).select(kind==='inhouse'?'createdbyuserid,approvalstatus,amount,projectid,direction':'createdbyuserid,approvalstatus,amount,projectid').eq('id',id).maybeSingle();
  if(!item.data)return jsonError('Record not found',404);
  const record=item.data as unknown as {createdbyuserid:string;approvalstatus:string;amount:number|string;projectid:string|null;direction?:string};
  if(record.approvalstatus!=='Pending')return jsonError('Record has already been reviewed',409);
  if(record.createdbyuserid===viewer.userId)return jsonError('You cannot approve your own entry',403);
  const status=decision as 'Approved'|'Rejected';
  if(kind==='inhouse'){
   const res=await db.rpc('kcbl_decide_company_entry',{p_id:id,p_decision:decision,p_reason:reason,p_userid:viewer.userId});
   if(res.error)return jsonError(res.error.message);
   await notifyTransactionDecision({transactionType:record.direction==='Inflow'?'In-House Inflow':'In-House Outflow',transactionId:shortRef('IH',id),makerUserId:record.createdbyuserid,amount:record.amount,projectId:record.projectid,status,reason:status==='Rejected'?reason:null});
   return NextResponse.json({ok:true});
  }
  const out=await db.from(table).update({approvalstatus:decision,approvedbyuserid:viewer.userId,approvedat:new Date().toISOString(),rejectionreason:decision==='Rejected'?reason:null}).eq('id',id).eq('approvalstatus','Pending').select('id').maybeSingle();
  if(out.error)return jsonError(out.error.message);
  if(!out.data)return jsonError('Record already processed',409);
  await notifyTransactionDecision({transactionType:'Variation',transactionId:shortRef('VAR',id),makerUserId:record.createdbyuserid,amount:record.amount,projectId:record.projectid,status,reason:status==='Rejected'?reason:null});
  return NextResponse.json({ok:true});
 }
 if(action==='payment'&&kind==='variations'){
  if(!maker(viewer))return jsonError('Only Finance Initiators or Super User may log variation payments',403);
  const amount=validAmount(body.amount);
  if(amount===null||!validDate(body.paymentdate))return jsonError('Valid amount and payment date required');
  if(String(body.paymentdate)>new Date().toISOString().slice(0,10))return jsonError('Future payment dates not allowed');
  const res=await db.rpc('kcbl_submit_variation_payment',{p_variationid:body.variationid,p_date:body.paymentdate,p_amount:amount,p_reference:String(body.reference||'').trim()||null,p_notes:String(body.notes||'').trim()||null,p_userid:viewer.userId});
  if(res.error)return jsonError(res.error.message);
  await notifyTransactionSubmitted({transactionType:'Variation Payment',transactionId:shortRef('VPAY',String(res.data)),makerUserId:viewer.userId,amount,description:String(body.notes||'').trim()||null});
  return NextResponse.json({ok:true,id:res.data});
 }
 return jsonError('Invalid action');
}
