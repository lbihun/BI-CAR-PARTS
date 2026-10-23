const express=require('express');
const {authenticate,allowRoles}=require('../middleware/auth');
const {telegramReady,emailReady,pushReady}=require('../notifications');
const router=express.Router();
router.get('/status',authenticate,allowRoles('owner','manager'),(req,res)=>res.json({
  app:'BI-CAR PARTS',version:72,node:process.version,environment:process.env.NODE_ENV||'development',
  autoparts:{enabled:String(process.env.AUTOPARTSAPI_ENABLED||'').toLowerCase()==='true',keyConfigured:!!process.env.AUTOPARTSAPI_KEY},
  telegram:telegramReady(),email:emailReady(),webpush:pushReady(),uploads:process.env.UPLOAD_DIR||'',cors:process.env.CORS_ORIGIN||''
}));
module.exports=router;
