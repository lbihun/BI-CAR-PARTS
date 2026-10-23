const express=require('express');
const rateLimit=require('express-rate-limit');
const crypto=require('crypto');
const path=require('path');
const fs=require('fs');
const multer=require('multer');
const {query,pool}=require('../db');
const {authenticate,allowRoles}=require('../middleware/auth');
const {notifyNewChat}=require('../notifications');

const router=express.Router();
const guestLimit=rateLimit({windowMs:60_000,limit:40,standardHeaders:true,legacyHeaders:false});

function validSession(s){return /^[a-zA-Z0-9_-]{16,100}$/.test(String(s||''));}
function cleanName(s){return String(s||'').replace(/[^\p{L}\p{N} ._()+\-@]/gu,'').slice(0,140);}
function uploadRoot(req){
  const configured=process.env.UPLOAD_DIR;
  const root=configured
    ? (path.isAbsolute(configured)?configured:path.resolve(process.cwd(),configured))
    : path.resolve(__dirname,'..','..','uploads');
  const dir=path.join(root,'chat');
  fs.mkdirSync(dir,{recursive:true});
  return dir;
}
const storage=multer.diskStorage({
  destination:(req,file,cb)=>cb(null,uploadRoot(req)),
  filename:(req,file,cb)=>{
    const ext=(path.extname(file.originalname||'')||'').toLowerCase().slice(0,12);
    cb(null,Date.now()+'-'+crypto.randomBytes(8).toString('hex')+ext);
  }
});
const allowedMime=/^(image\/(jpeg|png|webp|gif)|application\/pdf|text\/plain|application\/(msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet))$/i;
const upload=multer({
  storage,
  limits:{fileSize:Number(process.env.CHAT_MAX_FILE_MB||10)*1024*1024},
  fileFilter:(req,file,cb)=>allowedMime.test(file.mimetype||'')?cb(null,true):cb(new Error('Недозволений тип файла'))
});

async function ensureConversation(sessionId,name='',contact=''){
  const r=await query(`INSERT INTO chat_conversations(session_id,guest_name,guest_contact) VALUES($1,$2,$3)
    ON CONFLICT(session_id) DO UPDATE SET
      guest_name=COALESCE(NULLIF(EXCLUDED.guest_name,''),chat_conversations.guest_name),
      guest_contact=COALESCE(NULLIF(EXCLUDED.guest_contact,''),chat_conversations.guest_contact),
      updated_at=now()
    RETURNING *`,
    [sessionId,String(name||'').slice(0,120)||null,String(contact||'').slice(0,160)||null]);
  return r.rows[0];
}
function publicFile(req,file){
  return {
    attachment_url:'/uploads/chat/'+encodeURIComponent(file.filename),
    attachment_name:cleanName(file.originalname||'file')||'file',
    attachment_type:String(file.mimetype||'application/octet-stream').slice(0,120),
    attachment_size:Number(file.size||0)
  };
}
function emitMessage(req,c,payload){
  const io=req.app.get('io');
  if(io){
    io.to('admins').emit('chat:new',payload);
    io.to('guest:'+c.session_id).emit('chat:message',payload);
  }
}
async function maybeOfflineAutoReply(req,c){
  const online=Number(req.app.get('adminOnlineCount')||0)>0;
  if(online)return null;
  const fresh=await query('SELECT last_auto_offline_at FROM chat_conversations WHERE id=$1',[c.id]);
  const last=fresh.rows[0]?.last_auto_offline_at ? new Date(fresh.rows[0].last_auto_offline_at).getTime() : 0;
  if(last && Date.now()-last < 4*60*60*1000)return null;
  const text=String(process.env.CHAT_OFFLINE_MESSAGE||'Дякуємо за повідомлення! Зараз менеджер офлайн. Ми відповімо вам найближчим часом.');
  const m=(await query(`INSERT INTO chat_messages(conversation_id,sender,body,is_auto)
    VALUES($1,'admin',$2,true)
    RETURNING id,sender,body,attachment_url,attachment_name,attachment_type,attachment_size,is_auto,created_at`,
    [c.id,text])).rows[0];
  await query('UPDATE chat_conversations SET unread_guest=unread_guest+1,last_auto_offline_at=now(),last_message_at=now(),updated_at=now() WHERE id=$1',[c.id]);
  const payload={...m,sessionId:c.session_id,conversationId:c.id};
  const io=req.app.get('io'); if(io)io.to('guest:'+c.session_id).emit('chat:message',payload);
  return payload;
}

router.get('/presence',(req,res)=>res.json({managerOnline:Number(req.app.get('adminOnlineCount')||0)>0}));

router.post('/guest/session',guestLimit,async(req,res,next)=>{
  try{
    let sessionId=String(req.body?.sessionId||'');
    if(!validSession(sessionId))sessionId=crypto.randomBytes(24).toString('base64url');
    const c=await ensureConversation(sessionId,req.body?.name,req.body?.contact);
    res.json({sessionId:c.session_id,conversationId:c.id,managerOnline:Number(req.app.get('adminOnlineCount')||0)>0});
  }catch(e){next(e)}
});

router.get('/guest/:sessionId/messages',guestLimit,async(req,res,next)=>{
  try{
    if(!validSession(req.params.sessionId))return res.status(400).json({error:'Некоректна сесія'});
    const c=await query('SELECT id,unread_guest FROM chat_conversations WHERE session_id=$1',[req.params.sessionId]);
    if(!c.rows[0])return res.json({items:[],unread:0,managerOnline:Number(req.app.get('adminOnlineCount')||0)>0});
    const m=await query(`SELECT id,sender,body,attachment_url,attachment_name,attachment_type,attachment_size,is_auto,created_at
      FROM chat_messages WHERE conversation_id=$1 ORDER BY id ASC LIMIT 500`,[c.rows[0].id]);
    await query('UPDATE chat_conversations SET unread_guest=0,last_guest_seen_at=now() WHERE id=$1',[c.rows[0].id]);
    res.json({items:m.rows,unread:Number(c.rows[0].unread_guest||0),managerOnline:Number(req.app.get('adminOnlineCount')||0)>0});
  }catch(e){next(e)}
});

router.get('/guest/:sessionId/unread',guestLimit,async(req,res,next)=>{
  try{
    if(!validSession(req.params.sessionId))return res.status(400).json({error:'Некоректна сесія'});
    const r=await query('SELECT unread_guest FROM chat_conversations WHERE session_id=$1',[req.params.sessionId]);
    res.json({unread:Number(r.rows[0]?.unread_guest||0),managerOnline:Number(req.app.get('adminOnlineCount')||0)>0});
  }catch(e){next(e)}
});

router.post('/guest/:sessionId/messages',guestLimit,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    if(!validSession(req.params.sessionId))return res.status(400).json({error:'Некоректна сесія'});
    const body=String(req.body?.body||'').trim().slice(0,1500);
    if(!body)return res.status(400).json({error:'Порожнє повідомлення'});
    await client.query('BEGIN');
    const c=(await client.query(`INSERT INTO chat_conversations(session_id,guest_name,guest_contact) VALUES($1,$2,$3)
      ON CONFLICT(session_id) DO UPDATE SET guest_name=COALESCE(NULLIF(EXCLUDED.guest_name,''),chat_conversations.guest_name),
      guest_contact=COALESCE(NULLIF(EXCLUDED.guest_contact,''),chat_conversations.guest_contact),updated_at=now() RETURNING *`,
      [req.params.sessionId,String(req.body?.name||'').slice(0,120)||null,String(req.body?.contact||'').slice(0,160)||null])).rows[0];
    const m=(await client.query(`INSERT INTO chat_messages(conversation_id,sender,body)
      VALUES($1,'guest',$2)
      RETURNING id,sender,body,attachment_url,attachment_name,attachment_type,attachment_size,is_auto,created_at`,[c.id,body])).rows[0];
    await client.query('UPDATE chat_conversations SET unread_admin=unread_admin+1,last_message_at=now(),updated_at=now() WHERE id=$1',[c.id]);
    await client.query('COMMIT');
    const payload={...m,sessionId:c.session_id,conversationId:c.id,guestName:c.guest_name,guestContact:c.guest_contact};
    emitMessage(req,c,payload);
    notifyNewChat(payload).catch(()=>{});
    await maybeOfflineAutoReply(req,c);
    res.status(201).json(payload);
  }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}finally{client.release()}
});

router.post('/guest/:sessionId/upload',guestLimit,upload.single('file'),async(req,res,next)=>{
  try{
    if(!validSession(req.params.sessionId))return res.status(400).json({error:'Некоректна сесія'});
    if(!req.file)return res.status(400).json({error:'Файл не отримано'});
    const c=await ensureConversation(req.params.sessionId,req.body?.name,req.body?.contact);
    const f=publicFile(req,req.file);
    const body=String(req.body?.body||'').trim().slice(0,1500);
    const m=(await query(`INSERT INTO chat_messages(conversation_id,sender,body,attachment_url,attachment_name,attachment_type,attachment_size)
      VALUES($1,'guest',$2,$3,$4,$5,$6)
      RETURNING id,sender,body,attachment_url,attachment_name,attachment_type,attachment_size,is_auto,created_at`,
      [c.id,body,f.attachment_url,f.attachment_name,f.attachment_type,f.attachment_size])).rows[0];
    await query('UPDATE chat_conversations SET unread_admin=unread_admin+1,last_message_at=now(),updated_at=now() WHERE id=$1',[c.id]);
    const payload={...m,sessionId:c.session_id,conversationId:c.id,guestName:c.guest_name,guestContact:c.guest_contact};
    emitMessage(req,c,payload);
    notifyNewChat({...payload,body:body||`Файл: ${f.attachment_name}`}).catch(()=>{});
    await maybeOfflineAutoReply(req,c);
    res.status(201).json(payload);
  }catch(e){next(e)}
});

router.get('/admin/conversations',authenticate,allowRoles('owner','manager','seller'),async(req,res,next)=>{
  try{
    const r=await query(`SELECT c.*,
      (SELECT COALESCE(NULLIF(m.body,''),m.attachment_name,'') FROM chat_messages m WHERE m.conversation_id=c.id ORDER BY id DESC LIMIT 1) last_message
      FROM chat_conversations c ORDER BY c.last_message_at DESC LIMIT 200`);
    res.json({items:r.rows,managerOnline:Number(req.app.get('adminOnlineCount')||0)>0});
  }catch(e){next(e)}
});

router.get('/admin/:sessionId/messages',authenticate,allowRoles('owner','manager','seller'),async(req,res,next)=>{
  try{
    const c=await query('SELECT * FROM chat_conversations WHERE session_id=$1',[req.params.sessionId]);
    if(!c.rows[0])return res.status(404).json({error:'Чат не знайдено'});
    const m=await query(`SELECT id,sender,body,attachment_url,attachment_name,attachment_type,attachment_size,is_auto,created_at
      FROM chat_messages WHERE conversation_id=$1 ORDER BY id ASC LIMIT 800`,[c.rows[0].id]);
    await query('UPDATE chat_conversations SET unread_admin=0 WHERE id=$1',[c.rows[0].id]);
    res.json({conversation:c.rows[0],items:m.rows,guestOnline:!!req.app.get('guestPresence')?.has(String(req.params.sessionId))});
  }catch(e){next(e)}
});

router.post('/admin/:sessionId/messages',authenticate,allowRoles('owner','manager','seller'),async(req,res,next)=>{
  try{
    const body=String(req.body?.body||'').trim().slice(0,1500);
    if(!body)return res.status(400).json({error:'Порожнє повідомлення'});
    const c=await query('SELECT * FROM chat_conversations WHERE session_id=$1',[req.params.sessionId]);
    if(!c.rows[0])return res.status(404).json({error:'Чат не знайдено'});
    const m=(await query(`INSERT INTO chat_messages(conversation_id,sender,body)
      VALUES($1,'admin',$2)
      RETURNING id,sender,body,attachment_url,attachment_name,attachment_type,attachment_size,is_auto,created_at`,[c.rows[0].id,body])).rows[0];
    await query('UPDATE chat_conversations SET unread_guest=unread_guest+1,last_message_at=now(),updated_at=now() WHERE id=$1',[c.rows[0].id]);
    const payload={...m,sessionId:c.rows[0].session_id,conversationId:c.rows[0].id};
    const io=req.app.get('io');if(io)io.to('guest:'+c.rows[0].session_id).emit('chat:message',payload);
    res.status(201).json(payload);
  }catch(e){next(e)}
});

router.post('/admin/:sessionId/upload',authenticate,allowRoles('owner','manager','seller'),upload.single('file'),async(req,res,next)=>{
  try{
    if(!req.file)return res.status(400).json({error:'Файл не отримано'});
    const c=await query('SELECT * FROM chat_conversations WHERE session_id=$1',[req.params.sessionId]);
    if(!c.rows[0])return res.status(404).json({error:'Чат не знайдено'});
    const f=publicFile(req,req.file);
    const body=String(req.body?.body||'').trim().slice(0,1500);
    const m=(await query(`INSERT INTO chat_messages(conversation_id,sender,body,attachment_url,attachment_name,attachment_type,attachment_size)
      VALUES($1,'admin',$2,$3,$4,$5,$6)
      RETURNING id,sender,body,attachment_url,attachment_name,attachment_type,attachment_size,is_auto,created_at`,
      [c.rows[0].id,body,f.attachment_url,f.attachment_name,f.attachment_type,f.attachment_size])).rows[0];
    await query('UPDATE chat_conversations SET unread_guest=unread_guest+1,last_message_at=now(),updated_at=now() WHERE id=$1',[c.rows[0].id]);
    const payload={...m,sessionId:c.rows[0].session_id,conversationId:c.rows[0].id};
    const io=req.app.get('io');if(io)io.to('guest:'+c.rows[0].session_id).emit('chat:message',payload);
    res.status(201).json(payload);
  }catch(e){next(e)}
});

module.exports=router;
