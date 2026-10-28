/* Push contains navigation hints only. Acceptance always requires authenticated review. */
self.addEventListener("push", event => {
 let message;try {message=event.data.json();}catch{return;}
 if(!message || typeof message.title!=="string")return;
 event.waitUntil(self.registration.showNotification(message.title,{body:message.body,tag:message.tag,data:{url:message.url},icon:"/apple-touch-icon.png"}));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 let url;try {url=new URL(event.notification.data.url,self.location.origin);}catch{return;}
 if(url.origin!==self.location.origin||url.pathname.replace(/\/$/,"")!=="/account-transfers")return;
 event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async clients=>{
  const existing=clients.find(client=>new URL(client.url).origin===url.origin);
  if(existing){await existing.navigate(url.href);await existing.focus();return;}
  await self.clients.openWindow(url.href);
 }));
});
