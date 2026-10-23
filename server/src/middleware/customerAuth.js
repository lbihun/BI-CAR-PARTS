const jwt=require('jsonwebtoken');
function authenticateCustomer(req,res,next){
  const h=req.headers.authorization||'';
  const token=h.startsWith('Bearer ')?h.slice(7):'';
  if(!token)return res.status(401).json({error:'Потрібна авторизація клієнта'});
  try{
    const u=jwt.verify(token,process.env.JWT_SECRET);
    if(u.type!=='customer'||!u.customerId)return res.status(401).json({error:'Недійсний токен клієнта'});
    req.customer=u; next();
  }catch{return res.status(401).json({error:'Недійсний або прострочений токен клієнта'})}
}
module.exports={authenticateCustomer};
