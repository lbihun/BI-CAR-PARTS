const express = require('express');
const { query, pool } = require('../db');
const { authenticate, allowRoles } = require('../middleware/auth');
const router = express.Router();

router.post('/guest', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const b=req.body||{};
    if (!b.phone || !Array.isArray(b.items) || !b.items.length) return res.status(400).json({error:'Телефон та товари обов’язкові'});
    await client.query('BEGIN');
    const c=await client.query(`INSERT INTO customers(name,phone,email) VALUES($1,$2,$3)
      ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,email=COALESCE(EXCLUDED.email,customers.email),updated_at=now() RETURNING id`, [b.name||'Клієнт',b.phone,b.email||null]);
    const number='WEB-'+Date.now().toString().slice(-10);
    const o=await client.query(`INSERT INTO orders(order_number,customer_id,channel,status,payment_method,payment_status,delivery_method,delivery_city,delivery_point,comment,total)
      VALUES($1,$2,'online','new',$3,'unpaid',$4,$5,$6,$7,0) RETURNING id,order_number`, [number,c.rows[0].id,b.payment_method||'cod',b.delivery_method||'',b.delivery_city||'',b.delivery_point||'',b.comment||'']);
    let total=0;
    for (const item of b.items) {
      const p=await client.query('SELECT id,name,sku,sale_price FROM products WHERE id=$1 AND active=true', [item.product_id]);
      if(!p.rows[0]) throw new Error('Один із товарів не знайдено');
      const qty=Math.max(1,Number(item.qty||1));
      const price=Number(p.rows[0].sale_price||0);
      total += qty*price;
      await client.query('INSERT INTO order_items(order_id,product_id,name,sku,qty,unit_price,total) VALUES($1,$2,$3,$4,$5,$6,$7)', [o.rows[0].id,p.rows[0].id,p.rows[0].name,p.rows[0].sku,qty,price,qty*price]);
    }
    await client.query('UPDATE orders SET total=$2 WHERE id=$1', [o.rows[0].id,total]);
    await client.query('COMMIT');
    res.status(201).json({ id:o.rows[0].id, order_number:o.rows[0].order_number, total });
  } catch(e){ await client.query('ROLLBACK'); next(e); } finally { client.release(); }
});

router.get('/', authenticate, allowRoles('owner','manager','seller'), async (req,res,next)=>{
  try {
    const r=await query(`SELECT o.*,c.name customer_name,c.phone customer_phone FROM orders o LEFT JOIN customers c ON c.id=o.customer_id ORDER BY o.created_at DESC LIMIT 500`);
    res.json({items:r.rows});
  } catch(e){next(e);}
});

router.get('/:id', authenticate, allowRoles('owner','manager','seller'), async (req,res,next)=>{
  try {
    const o=await query(`SELECT o.*,c.name customer_name,c.phone customer_phone,c.email customer_email FROM orders o LEFT JOIN customers c ON c.id=o.customer_id WHERE o.id=$1`,[req.params.id]);
    if(!o.rows[0]) return res.status(404).json({error:'Замовлення не знайдено'});
    const items=await query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id',[req.params.id]);
    res.json({...o.rows[0],items:items.rows});
  } catch(e){next(e);}
});

router.patch('/:id/status', authenticate, allowRoles('owner','manager','seller'), async (req,res,next)=>{
  try {
    const status=String(req.body.status||'');
    const allowed=['new','confirmed','processing','shipped','done','cancelled'];
    if(!allowed.includes(status)) return res.status(400).json({error:'Невідомий статус'});
    const r=await query('UPDATE orders SET status=$2,updated_at=now() WHERE id=$1 RETURNING *',[req.params.id,status]);
    if(!r.rows[0]) return res.status(404).json({error:'Замовлення не знайдено'});
    res.json(r.rows[0]);
  }catch(e){next(e);}
});

module.exports=router;
