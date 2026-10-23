const express=require('express');
const rateLimit=require('express-rate-limit');
const {query}=require('../db');
const {authenticate,allowRoles}=require('../middleware/auth');
const {telegramReady,emailReady,pushReady,notifyNewOrder}=require('../notifications');
const router=express.Router();

const publicOrderLimit=rateLimit({windowMs:60_000,limit:8,standardHeaders:true,legacyHeaders:false});

router.get('/status',authenticate,allowRoles('owner','manager','seller'),(req,res)=>{
  res.json({telegram:telegramReady(),email:emailReady(),webpush:pushReady(),vapidPublicKey:pushReady()?process.env.VAPID_PUBLIC_KEY:null});
});

router.post('/order',publicOrderLimit,async(req,res,next)=>{
  try{
    const b=req.body||{};
    const phone=String(b.phone||'').trim();
    if(phone.replace(/\D/g,'').length<9) return res.status(400).json({error:'Некоректний телефон'});
    const order={
      id:String(b.id||b.order_number||Date.now()),name:String(b.name||'Клієнт').slice(0,120),phone:phone.slice(0,60),
      total:Number(b.total||0),deliveryType:String(b.deliveryType||b.delivery||'').slice(0,200),payment:String(b.payment||'').slice(0,120),
      items:Array.isArray(b.items)?b.items.slice(0,30).map(x=>({name:String(x.name||x.sku||'Товар').slice(0,200),sku:String(x.sku||'').slice(0,100),qty:Math.max(1,Number(x.qty||1))})):[]
    };
    const results=await notifyNewOrder(order);
    const io=req.app.get('io');
    if(io) io.to('admins').emit('order:new',order);
    res.status(202).json({ok:true,results});
  }catch(e){next(e)}
});

router.post('/push/subscribe',authenticate,allowRoles('owner','manager','seller'),async(req,res,next)=>{
  try{
    const s=req.body||{};
    if(!s.endpoint||!s.keys?.p256dh||!s.keys?.auth)return res.status(400).json({error:'Некоректна push-підписка'});
    await query(`INSERT INTO push_subscriptions(endpoint,p256dh,auth,user_id) VALUES($1,$2,$3,$4)
      ON CONFLICT(endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,user_id=EXCLUDED.user_id,updated_at=now()`,
      [s.endpoint,s.keys.p256dh,s.keys.auth,req.user.id]);
    res.json({ok:true});
  }catch(e){next(e)}
});

router.post('/push/unsubscribe',authenticate,allowRoles('owner','manager','seller'),async(req,res,next)=>{
  try{await query('DELETE FROM push_subscriptions WHERE endpoint=$1',[String(req.body?.endpoint||'')]);res.json({ok:true})}catch(e){next(e)}
});

module.exports=router;
