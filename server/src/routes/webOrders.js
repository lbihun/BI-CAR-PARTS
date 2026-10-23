const express=require('express');
const rateLimit=require('express-rate-limit');
const {pool,query}=require('../db');
const {notifyNewOrder}=require('../notifications');
const jwt=require('jsonwebtoken');
const router=express.Router();
const limiter=rateLimit({windowMs:60_000,limit:10,standardHeaders:true,legacyHeaders:false});
router.post('/',limiter,async(req,res,next)=>{const client=await pool.connect();try{
  let authCustomerId=null;const ah=req.headers.authorization||'';if(ah.startsWith('Bearer ')){try{const u=jwt.verify(ah.slice(7),process.env.JWT_SECRET);if(u.type==='customer')authCustomerId=Number(u.customerId)||null}catch{}}
  const b=req.body||{},name=String(b.name||'Клієнт').trim().slice(0,120),phone=String(b.phone||'').trim().slice(0,60),email=String(b.email||'').trim().toLowerCase().slice(0,160);
  const items=Array.isArray(b.items)?b.items.slice(0,50):[];if(phone.replace(/\D/g,'').length<9||!items.length)return res.status(400).json({error:'Телефон та хоча б один товар обов’язкові'});
  await client.query('BEGIN');
  let c;if(authCustomerId){const cr=await client.query('SELECT id FROM customers WHERE id=$1',[authCustomerId]);c=cr.rows[0];if(!c)throw Object.assign(new Error('Клієнта не знайдено'),{status:401});}else{c=(await client.query(`INSERT INTO customers(name,phone,email) VALUES($1,$2,NULLIF($3,'')) ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,email=COALESCE(NULLIF(EXCLUDED.email,''),customers.email),updated_at=now() RETURNING id`,[name,phone,email])).rows[0];}
  const number='WEB-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
  const o=(await client.query(`INSERT INTO orders(order_number,customer_id,channel,status,payment_method,payment_status,delivery_method,delivery_city,delivery_point,comment,total) VALUES($1,$2,'online','new',$3,'unpaid',$4,$5,$6,$7,0) RETURNING id,order_number`,[number,c.id,String(b.payment||'').slice(0,120),String(b.deliveryType||b.delivery||'').slice(0,160),String(b.city||'').slice(0,160),String(b.deliveryPoint||b.delivery||'').slice(0,240),String(b.comment||'').slice(0,1000)])).rows[0];
  let total=0,notifyItems=[];
  for(const it of items){
    const qty=Math.max(1,Math.min(999,Number(it.qty||1))), nameI=String(it.name||'Товар').slice(0,240),sku=String(it.sku||'').slice(0,120);let price=Math.max(0,Number(it.price||0)),productId=Number(it.product_id||it.id||0)||null;
    if(productId){const pr=await client.query('SELECT id,name,sku,sale_price FROM products WHERE id=$1 AND active=true',[productId]);if(pr.rows[0]){price=Number(pr.rows[0].sale_price||0);}else{productId=null;}}
    total+=qty*price;notifyItems.push({name:nameI,sku,qty});
    await client.query('INSERT INTO order_items(order_id,product_id,name,sku,qty,unit_price,total) VALUES($1,$2,$3,$4,$5,$6,$7)',[o.id,productId,nameI,sku,qty,price,qty*price]);
  }
  await client.query('UPDATE orders SET total=$2 WHERE id=$1',[o.id,total]);await client.query('COMMIT');
  const payload={id:o.order_number,order_number:o.order_number,name,phone,total,deliveryType:b.deliveryType||b.delivery||'',payment:b.payment||'',items:notifyItems};
  const results=await notifyNewOrder(payload);const io=req.app.get('io');if(io)io.to('admins').emit('order:new',payload);
  res.status(201).json({ok:true,id:o.id,order_number:o.order_number,total,notifications:results})
}catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}});
router.get('/',async(req,res,next)=>{try{res.status(405).json({error:'Method not allowed'})}catch(e){next(e)}});
module.exports=router;
