const express=require('express');
const {query}=require('../db');
const {authenticate,allowRoles}=require('../middleware/auth');
const router=express.Router();
router.use(authenticate,allowRoles('owner','manager','seller'));
router.get('/',async(req,res,next)=>{try{const q=String(req.query.q||''); const r=await query(`SELECT c.*,COALESCE(SUM(CASE WHEN o.status='done' THEN o.total ELSE 0 END),0) lifetime_sales,COUNT(o.id)::int orders_count FROM customers c LEFT JOIN orders o ON o.customer_id=c.id WHERE ($1='' OR c.name ILIKE '%'||$1||'%' OR c.phone ILIKE '%'||$1||'%') GROUP BY c.id ORDER BY c.updated_at DESC LIMIT 500`,[q]);res.json({items:r.rows});}catch(e){next(e)}});
router.get('/:id',async(req,res,next)=>{try{const c=await query('SELECT * FROM customers WHERE id=$1',[req.params.id]);if(!c.rows[0])return res.status(404).json({error:'Клієнта не знайдено'});const cars=await query('SELECT * FROM customer_cars WHERE customer_id=$1 ORDER BY id DESC',[req.params.id]);const orders=await query('SELECT * FROM orders WHERE customer_id=$1 ORDER BY created_at DESC',[req.params.id]);res.json({...c.rows[0],cars:cars.rows,orders:orders.rows});}catch(e){next(e)}});
module.exports=router;
