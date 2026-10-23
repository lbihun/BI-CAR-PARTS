const nodemailer = require('nodemailer');
const webpush = require('web-push');
const { query } = require('./db');

function truthy(v){ return String(v||'').toLowerCase()==='true'; }
function telegramReady(){ return truthy(process.env.TELEGRAM_ENABLED) && !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID; }
function emailReady(){ return truthy(process.env.EMAIL_ENABLED) && !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS && !!process.env.NOTIFY_EMAIL_TO; }
function pushReady(){ return truthy(process.env.WEBPUSH_ENABLED) && !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY; }

function escHtml(s=''){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function sendTelegram(text){
  if(!telegramReady()) return {skipped:true};
  const url=`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text,disable_web_page_preview:true}),signal:AbortSignal.timeout(8000)});
  if(!r.ok) throw new Error(`Telegram HTTP ${r.status}`);
  return r.json();
}

function mailer(){
  return nodemailer.createTransport({
    host:process.env.SMTP_HOST,
    port:Number(process.env.SMTP_PORT||587),
    secure:truthy(process.env.SMTP_SECURE),
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000
  });
}
async function sendEmail(subject,text,html){
  if(!emailReady()) return {skipped:true};
  return mailer().sendMail({
    from:process.env.NOTIFY_EMAIL_FROM || process.env.SMTP_USER,
    to:process.env.NOTIFY_EMAIL_TO,
    subject,text,html
  });
}

function initWebPush(){
  if(!pushReady()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:bicarparts2026@gmail.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
}

async function sendWebPush(payload){
  if(!initWebPush()) return {skipped:true,count:0};
  const r=await query('SELECT id,endpoint,p256dh,auth FROM push_subscriptions ORDER BY id DESC LIMIT 100');
  let ok=0;
  for(const s of r.rows){
    try{
      await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify(payload),{TTL:60,timeout:10000});
      ok++;
    }catch(e){
      if(e.statusCode===404||e.statusCode===410) await query('DELETE FROM push_subscriptions WHERE id=$1',[s.id]);
    }
  }
  return {count:ok};
}

function orderText(o={}){
  const items=(o.items||[]).slice(0,12).map(x=>`• ${x.name||x.sku||'Товар'} × ${Number(x.qty||1)}`).join('\n');
  return `🛒 НОВЕ ЗАМОВЛЕННЯ BI-CAR PARTS\n№ ${o.id||o.order_number||'—'}\nКлієнт: ${o.name||'—'}\nТелефон: ${o.phone||'—'}\nСума: ${Number(o.total||0).toLocaleString('uk-UA')} грн\nДоставка: ${o.deliveryType||o.delivery||'—'}\nОплата: ${o.payment||'—'}${items?`\n\n${items}`:''}`;
}

async function notifyNewOrder(order){
  const text=orderText(order);
  const html=`<h2>Нове замовлення BI-CAR PARTS</h2><pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${escHtml(text)}</pre>`;
  const jobs=[
    sendTelegram(text).catch(e=>({error:e.message})),
    sendEmail(`Нове замовлення BI-CAR PARTS №${order.id||order.order_number||''}`,text,html).catch(e=>({error:e.message})),
    sendWebPush({type:'order',title:'Нове замовлення BI-CAR PARTS',body:`№${order.id||'—'} · ${order.name||''} · ${Number(order.total||0).toLocaleString('uk-UA')} грн`,url:'/'}).catch(e=>({error:e.message}))
  ];
  return Promise.all(jobs);
}

async function notifyNewChat(msg){
  return sendWebPush({type:'chat',title:'Нове повідомлення в чаті',body:String(msg.body||'').slice(0,150),url:'/'}).catch(()=>null);
}

module.exports={telegramReady,emailReady,pushReady,notifyNewOrder,notifyNewChat,sendWebPush};
