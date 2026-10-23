const express=require('express');
const rateLimit=require('express-rate-limit');
const jwt=require('jsonwebtoken');
const {query}=require('../db');
const {authenticate,allowRoles}=require('../middleware/auth');
const {notifyNewOrder}=require('../notifications');
const router=express.Router();
const publicLimit=rateLimit({windowMs:10*60_000,limit:20,standardHeaders:true,legacyHeaders:false});

function maybeCustomer(req){
  const h=req.headers.authorization||'';
  if(!h.startsWith('Bearer '))return null;
  try{const u=jwt.verify(h.slice(7),process.env.JWT_SECRET);return u.type==='customer'?u:null}catch{return null}
}

router.post('/',publicLimit,async(req,res,next)=>{try{
  const b=req.body||{};
  const phone=String(b.phone||'').trim().slice(0,60),name=String(b.name||'Клієнт').trim().slice(0,120),vin=String(b.vin||'').trim().toUpperCase().slice(0,32),part=String(b.part_number||b.partNo||'').trim().slice(0,160),details=String(b.details||b.comment||'').trim().slice(0,2000);
  if(phone.replace(/\D/g,'').length<9||!part)return res.status(400).json({error:'Телефон і номер запчастини обов’язкові'});
  const cu=maybeCustomer(req); let customerId=cu?.customerId||null;
  if(!customerId){const cr=await query(`INSERT INTO customers(name,phone) VALUES($1,$2) ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,updated_at=now() RETURNING id`,[name,phone]);customerId=cr.rows[0]?.id||null;}
  const r=await query(`INSERT INTO service_requests(request_type,customer_id,phone,vin,part_number,reason,details,status) VALUES('parts_request',$1,$2,$3,$4,$5,$6,'new') RETURNING id,created_at`,[customerId,phone,vin,part,String(b.reason||'Підбір запчастини').slice(0,240),details]);
  const id='REQ-'+r.rows[0].id;
  await notifyNewOrder({id,name,phone,total:0,deliveryType:'Запит на підбір запчастини',payment:'—',items:[{name:String(b.product_name||'Запчастина').slice(0,200),sku:part,qty:1}]});
  const io=req.app.get('io');if(io)io.to('admins').emit('request:new',{id,name,phone,vin,partNo:part,details});
  res.status(201).json({ok:true,id,created_at:r.rows[0].created_at});
}catch(e){next(e)}});

router.get('/',authenticate,allowRoles('owner','manager','seller'),async(req,res,next)=>{try{
  const r=await query(`SELECT sr.*,c.name customer_name,c.email customer_email FROM service_requests sr LEFT JOIN customers c ON c.id=sr.customer_id WHERE sr.request_type='parts_request' ORDER BY sr.created_at DESC LIMIT 500`);res.json({items:r.rows})
}catch(e){next(e)}});

router.patch('/:id',authenticate,allowRoles('owner','manager','seller'),async(req,res,next)=>{try{
  const id=Number(req.params.id),status=String(req.body?.status||''),reply=String(req.body?.manager_reply||'').slice(0,2000);const allowed=['new','processing','done','cancelled'];if(!allowed.includes(status))return res.status(400).json({error:'Невідомий статус'});
  const r=await query('UPDATE service_requests SET status=$2,manager_reply=$3,updated_at=now() WHERE id=$1 AND request_type=\'parts_request\' RETURNING *',[id,status,reply]);if(!r.rows[0])return res.status(404).json({error:'Запит не знайдено'});res.json(r.rows[0])
}catch(e){next(e)}});
module.exports=router;
