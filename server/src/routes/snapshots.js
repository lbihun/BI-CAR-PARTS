const express=require('express');
const {query}=require('../db');
const {authenticate,allowRoles}=require('../middleware/auth');
const router=express.Router();
router.use(authenticate,allowRoles('owner'));
router.post('/',async(req,res,next)=>{try{const name=String(req.body.name||'legacy-backup');const payload=req.body.payload;if(!payload||typeof payload!=='object')return res.status(400).json({error:'payload має бути JSON-об’єктом'});const r=await query('INSERT INTO app_snapshots(name,payload,created_by) VALUES($1,$2,$3) RETURNING id,name,created_at',[name,payload,req.user.id]);res.status(201).json(r.rows[0]);}catch(e){next(e)}});
router.get('/',async(req,res,next)=>{try{const r=await query('SELECT id,name,created_at FROM app_snapshots ORDER BY created_at DESC LIMIT 100');res.json({items:r.rows});}catch(e){next(e)}});
router.get('/:id',async(req,res,next)=>{try{const r=await query('SELECT id,name,payload,created_at FROM app_snapshots WHERE id=$1',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Копію не знайдено'});res.json(r.rows[0]);}catch(e){next(e)}});
module.exports=router;
