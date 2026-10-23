require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { initDb, query } = require('./db');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const customerRoutes = require('./routes/customers');
const snapshotRoutes = require('./routes/snapshots');
const autopartsapiRoutes = require('./routes/autopartsapi');
const notificationRoutes = require('./routes/notifications');
const chatRoutes = require('./routes/chat');
const customerAuthRoutes = require('./routes/customerAuth');
const webOrderRoutes = require('./routes/webOrders');
const systemRoutes = require('./routes/system');
const customerPortalRoutes = require('./routes/customerPortal');
const serviceRequestRoutes = require('./routes/serviceRequests');

const app = express();
if(String(process.env.NODE_ENV||'').toLowerCase()==='production') app.set('trust proxy', 1);
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true } });
app.set('io', io);
const port = Number(process.env.PORT || 3000);
const frontendCandidates=[path.resolve(__dirname,'..','..','frontend'),path.resolve(__dirname,'..','frontend')];
const frontendDir=frontendCandidates.find(x=>fs.existsSync(path.join(x,'index.html')))||frontendCandidates[0];
const uploadDir = process.env.UPLOAD_DIR || path.resolve(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true, credentials: false }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));

app.get('/api/health/live',(req,res)=>res.json({ok:true,app:'BI-CAR PARTS',version:72}));
app.get('/api/health', async (req, res, next) => {
  try { const r = await query('SELECT now() server_time'); res.json({ ok: true, app: 'BI-CAR PARTS', version: 72, db_time: r.rows[0].server_time }); }
  catch (e) { next(e); }
});
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/admin/snapshots', snapshotRoutes);
app.use('/api/autoparts', autopartsapiRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/customer-auth', customerAuthRoutes);
app.use('/api/web-orders', webOrderRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/customer-portal', customerPortalRoutes);
app.use('/api/service-requests', serviceRequestRoutes);

app.use('/uploads', express.static(uploadDir, { fallthrough: true }));
app.use(express.static(frontendDir));
app.get('*', (req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.code==='LIMIT_FILE_SIZE'?413:(err.code==='23505'?409:(err.code==='23503'?400:(err.status || 500)));
  const message=err.code==='23505'?'Такий запис уже існує':(err.code==='23503'?'Пов’язаний запис не знайдено':(err.code==='LIMIT_FILE_SIZE'?'Файл завеликий':err.message));
  res.status(status).json({ error: status === 500 ? 'Внутрішня помилка сервера' : message });
});


function validateProductionEnv(){
  if(String(process.env.NODE_ENV||'').toLowerCase()!=='production')return;
  const bad=[];
  if(!process.env.DATABASE_URL)bad.push('DATABASE_URL');
  if(!process.env.JWT_SECRET||process.env.JWT_SECRET.includes('CHANGE_ME')||process.env.JWT_SECRET.length<32)bad.push('JWT_SECRET');
  if(!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.includes('CHANGE_ME')||process.env.ADMIN_PASSWORD==='admin123'||process.env.ADMIN_PASSWORD.length<10)bad.push('ADMIN_PASSWORD');
  if(!process.env.CORS_ORIGIN||process.env.CORS_ORIGIN.includes('localhost'))bad.push('CORS_ORIGIN');
  if(bad.length)throw new Error('Production configuration invalid: '+bad.join(', '));
}

async function ensureBootstrap() {
  await initDb();
  const login = process.env.ADMIN_LOGIN || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = await query('SELECT id FROM staff_users WHERE login=$1', [login]);
  if (!existing.rows[0]) {
    const hash = await bcrypt.hash(password, 12);
    await query('INSERT INTO staff_users(login,name,role,password_hash,active) VALUES($1,$2,$3,$4,true)', [login, process.env.ADMIN_NAME || 'Власник BI-CAR PARTS', 'owner', hash]);
    console.log(`Bootstrap admin created: ${login}. CHANGE THE PASSWORD IMMEDIATELY.`);
  }
}

const adminSockets=new Set();
const guestPresence=new Map();
app.set('adminOnlineCount',0);
app.set('guestPresence',guestPresence);

function broadcastManagerPresence(){
  const n=adminSockets.size;
  app.set('adminOnlineCount',n);
  io.emit('presence:manager',{online:n>0,count:n});
}

io.on('connection', socket => {
  socket.data.admin=false;
  socket.data.guestSession='';

  socket.on('join_guest', ({sessionId}={}) => {
    sessionId=String(sessionId||'');
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(sessionId)) return;
    socket.data.guestSession=sessionId;
    socket.join('guest:'+sessionId);
    if(!guestPresence.has(sessionId))guestPresence.set(sessionId,new Set());
    guestPresence.get(sessionId).add(socket.id);
    io.to('admins').emit('presence:guest',{sessionId,online:true});
    socket.emit('presence:manager',{online:adminSockets.size>0,count:adminSockets.size});
  });

  socket.on('join_admin', ({token}={}) => {
    try {
      const u=jwt.verify(String(token||''), process.env.JWT_SECRET);
      if (['owner','manager','seller'].includes(u.role)) {
        socket.data.admin=true;
        socket.join('admins');
        adminSockets.add(socket.id);
        broadcastManagerPresence();
      }
    } catch {}
  });

  socket.on('chat:typing', ({sessionId,sender,typing}={}) => {
    sessionId=String(sessionId||'');
    if(!/^[a-zA-Z0-9_-]{16,100}$/.test(sessionId))return;
    const isAdmin=socket.data.admin && sender==='admin';
    const isGuest=socket.data.guestSession===sessionId && sender==='guest';
    if(!isAdmin&&!isGuest)return;
    const payload={sessionId,sender:isAdmin?'admin':'guest',typing:!!typing};
    if(isAdmin)io.to('guest:'+sessionId).emit('chat:typing',payload);
    else io.to('admins').emit('chat:typing',payload);
  });

  socket.on('disconnect',()=>{
    if(socket.data.admin){
      adminSockets.delete(socket.id);
      broadcastManagerPresence();
    }
    const sid=socket.data.guestSession;
    if(sid&&guestPresence.has(sid)){
      guestPresence.get(sid).delete(socket.id);
      if(guestPresence.get(sid).size===0){
        guestPresence.delete(sid);
        io.to('admins').emit('presence:guest',{sessionId:sid,online:false});
      }
    }
  });
});

validateProductionEnv();
ensureBootstrap().then(() => {
  httpServer.listen(port, '0.0.0.0', () => console.log(`BI-CAR PARTS server listening on :${port}`));
}).catch(err => { console.error('Startup failed', err); process.exit(1); });

async function shutdown(signal){console.log(signal+' received, shutting down');httpServer.close(async()=>{try{const {pool}=require('./db');await pool.end()}catch{}process.exit(0)});setTimeout(()=>process.exit(1),10000).unref()}
process.on('SIGTERM',()=>shutdown('SIGTERM'));process.on('SIGINT',()=>shutdown('SIGINT'));
