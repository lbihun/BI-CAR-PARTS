const express=require('express');
const rateLimit=require('express-rate-limit');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const {query}=require('../db');
const {authenticateCustomer}=require('../middleware/customerAuth');
const router=express.Router();
const authLimit=rateLimit({windowMs:10*60_000,limit:30,standardHeaders:true,legacyHeaders:false});
function normEmail(v){return String(v||'').trim().toLowerCase()}
function normPhone(v){return String(v||'').trim().slice(0,60)}
function tokenFor(c){return jwt.sign({type:'customer',customerId:c.id,email:c.email,name:c.name,role:'customer'},process.env.JWT_SECRET,{expiresIn:'30d'})}
router.post('/register',authLimit,async(req,res,next)=>{try{
  const name=String(req.body?.name||'').trim().slice(0,120),phone=normPhone(req.body?.phone),email=normEmail(req.body?.email),password=String(req.body?.password||'');
  if(name.length<2||phone.replace(/\D/g,'').length<9||!/^\S+@\S+\.\S+$/.test(email)||password.length<6)return res.status(400).json({error:'Заповніть ім’я, коректний телефон/email; пароль мінімум 6 символів'});
  const exists=await query('SELECT id,name,phone,email,password_hash FROM customers WHERE lower(email)=lower($1) OR phone=$2 LIMIT 1',[email,phone]);
  const hash=await bcrypt.hash(password,12);
  let r;
  if(exists.rows[0]){
    if(exists.rows[0].password_hash)return res.status(409).json({error:'Користувач з таким email або телефоном уже існує'});
    r=await query('UPDATE customers SET name=$1,phone=$2,email=$3,password_hash=$4,updated_at=now() WHERE id=$5 RETURNING id,name,phone,email',[name,phone,email,hash,exists.rows[0].id]);
  }else{
    r=await query('INSERT INTO customers(name,phone,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id,name,phone,email',[name,phone,email,hash]);
  }
  const c=r.rows[0];res.status(201).json({token:tokenFor(c),user:{role:'customer',id:c.id,name:c.name,phone:c.phone,email:c.email}})
}catch(e){next(e)}});
router.post('/login',authLimit,async(req,res,next)=>{try{
  const email=normEmail(req.body?.email),password=String(req.body?.password||'');
  const r=await query('SELECT id,name,phone,email,password_hash FROM customers WHERE lower(email)=lower($1) LIMIT 1',[email]); const c=r.rows[0];
  if(!c||!c.password_hash||!(await bcrypt.compare(password,c.password_hash)))return res.status(401).json({error:'Невірний email або пароль'});
  res.json({token:tokenFor(c),user:{role:'customer',id:c.id,name:c.name,phone:c.phone,email:c.email}})
}catch(e){next(e)}});
router.get('/me',authenticateCustomer,async(req,res,next)=>{try{const r=await query('SELECT id,name,phone,email FROM customers WHERE id=$1',[req.customer.customerId]);if(!r.rows[0])return res.status(404).json({error:'Клієнта не знайдено'});res.json({user:{role:'customer',...r.rows[0]}})}catch(e){next(e)}});
module.exports=router;
