const express=require('express');
const {query}=require('../db');
const {authenticate,allowRoles}=require('../middleware/auth');
const router=express.Router();
async function syncStoreStock(productId,qty){if(qty===undefined||qty===null||qty==='')return;const q=Math.max(0,Math.floor(Number(qty)||0));const w=await query("SELECT id FROM warehouses WHERE code='store' LIMIT 1");if(!w.rows[0])return;await query('INSERT INTO stocks(product_id,warehouse_id,qty,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=EXCLUDED.qty,updated_at=now()',[productId,w.rows[0].id,q])}
function publicCols(){return `p.id,p.sku,p.brand,p.name,p.condition,p.category,p.subcategory,p.sale_price,p.description,p.oem,p.analogs,p.active,p.image_url,p.public_availability,p.public_delivery,COALESCE(SUM(s.qty),0)::int AS total_stock`}
router.get('/',async(req,res,next)=>{try{
  const q=String(req.query.q||'').trim(), inStock=req.query.in_stock==='1';
  const r=await query(`SELECT ${publicCols()} FROM products p LEFT JOIN stocks s ON s.product_id=p.id WHERE p.active=true AND ($1='' OR p.name ILIKE '%'||$1||'%' OR p.sku ILIKE '%'||$1||'%' OR p.brand ILIKE '%'||$1||'%' OR array_to_string(p.oem,',') ILIKE '%'||$1||'%') GROUP BY p.id HAVING ($2::boolean=false OR COALESCE(SUM(s.qty),0)>0) ORDER BY p.name LIMIT 1000`,[q,inStock]);
  res.json({items:r.rows})
}catch(e){next(e)}});
router.get('/admin/list',authenticate,allowRoles('owner','manager'),async(req,res,next)=>{try{
  const r=await query(`SELECT p.*,COALESCE(SUM(s.qty),0)::int total_stock FROM products p LEFT JOIN stocks s ON s.product_id=p.id GROUP BY p.id ORDER BY p.updated_at DESC LIMIT 2000`);res.json({items:r.rows})
}catch(e){next(e)}});
router.get('/:id',async(req,res,next)=>{try{
  const r=await query(`SELECT ${publicCols()} FROM products p LEFT JOIN stocks s ON s.product_id=p.id WHERE p.id=$1 AND p.active=true GROUP BY p.id`,[req.params.id]);
  if(!r.rows[0])return res.status(404).json({error:'Товар не знайдено'});res.json(r.rows[0])
}catch(e){next(e)}});
function vals(b){return [b.internal_code||null,b.barcode||null,String(b.sku||''),String(b.brand||''),String(b.name||''),b.condition||'new',b.category||'',b.subcategory||'',Number(b.purchase_price||0),Number(b.sale_price||0),b.description||'',Array.isArray(b.oem)?b.oem:[],Array.isArray(b.analogs)?b.analogs:[],b.supply_type||'stock',b.external_url||'',b.external_code||'',b.supplier_lead_time||'1–2 дні',b.procurement_note||'',b.image_url||'',b.public_availability||'Доступно для замовлення',b.public_delivery||'1–2 дні']}
router.post('/',authenticate,allowRoles('owner','manager'),async(req,res,next)=>{try{
  const b=req.body||{};if(!String(b.sku||'').trim()||!String(b.name||'').trim())return res.status(400).json({error:'Артикул і назва обов’язкові'});
  const a=vals(b);const r=await query(`INSERT INTO products(internal_code,barcode,sku,brand,name,condition,category,subcategory,purchase_price,sale_price,description,oem,analogs,supply_type,external_url,external_code,supplier_lead_time,procurement_note,image_url,public_availability,public_delivery,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,true) RETURNING *`,a);await syncStoreStock(r.rows[0].id,b.stock);res.status(201).json(r.rows[0])
}catch(e){next(e)}});
router.put('/:id',authenticate,allowRoles('owner','manager'),async(req,res,next)=>{try{
  const a=vals(req.body||{});const r=await query(`UPDATE products SET internal_code=$2,barcode=$3,sku=$4,brand=$5,name=$6,condition=$7,category=$8,subcategory=$9,purchase_price=$10,sale_price=$11,description=$12,oem=$13,analogs=$14,supply_type=$15,external_url=$16,external_code=$17,supplier_lead_time=$18,procurement_note=$19,image_url=$20,public_availability=$21,public_delivery=$22,updated_at=now() WHERE id=$1 RETURNING *`,[req.params.id,...a]);if(!r.rows[0])return res.status(404).json({error:'Товар не знайдено'});await syncStoreStock(r.rows[0].id,req.body?.stock);res.json(r.rows[0])
}catch(e){next(e)}});
router.delete('/:id',authenticate,allowRoles('owner','manager'),async(req,res,next)=>{try{const r=await query('UPDATE products SET active=false,updated_at=now() WHERE id=$1 RETURNING id',[req.params.id]);if(!r.rows[0])return res.status(404).json({error:'Товар не знайдено'});res.json({ok:true})}catch(e){next(e)}});
module.exports=router;
