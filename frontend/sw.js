self.addEventListener('push',event=>{
  let d={};try{d=event.data?event.data.json():{}}catch{d={body:event.data?.text()||''}}
  event.waitUntil(self.registration.showNotification(d.title||'BI-CAR PARTS',{body:d.body||'',icon:'/logo.png',badge:'/logo.png',tag:d.type||'bicar',data:{url:d.url||'/'},renotify:true}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus'in c)return c.focus()}return clients.openWindow(event.notification.data?.url||'/')}));
});
