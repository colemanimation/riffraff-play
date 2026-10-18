import {loadPhoneIceServers} from './relay.js';
export class ServiceError extends Error {
 constructor(code,status=503){super(code);this.code=code;this.status=status;}
}
// The static phone page has no local-server URL. Requests travel directly to
// the room's Hearth peer; the desktop adapter enforces player-only authority.
export class RoomTransport {
 constructor(onSnapshot,onConnection,{peerFactory=options=>new window.Peer(options),relayLoader=loadPhoneIceServers}={}){this.onSnapshot=onSnapshot;this.onConnection=onConnection;this.peerFactory=peerFactory;this.relayLoader=relayLoader;this.peerEpoch=0;this.generation=0;this.session=null;this.requests=new Map();this.images=new Map();}
 async connect(room){
  if(this.channel?.open&&this.room===room)return;
  if(this.connecting&&this.room===room)return this.connecting;
  if(Date.now()<(this.retryAt||0))throw new ServiceError('CONNECTION_BUSY');
  this.closePeer();this.room=room;
  const epoch=this.peerEpoch;
  const task=(async()=>{
   const iceServers=await this.relayLoader();
   if(this.peerEpoch!==epoch)throw new ServiceError('CONNECTION_CANCELLED');
   const peer=this.peer=this.peerFactory({debug:0,config:{iceServers}});
   return new Promise((resolve,reject)=>{
   let settled=false;
   const fail=()=>{if(!settled){settled=true;clearTimeout(timer);this.retryAt=Date.now()+60000;reject(new ServiceError('HEARTH_UNREACHABLE'));}};
   const timer=setTimeout(fail,25000);
   this.cancelConnect=()=>{if(!settled){settled=true;clearTimeout(timer);reject(new ServiceError('CONNECTION_CANCELLED'));}};
   peer.on('error',fail);
   peer.on('open',()=>{
    if(this.peer!==peer){fail();return;}
    const channel=this.channel=peer.connect('riffraff-alpha-'+room,{reliable:true,serialization:'json'});
    channel.on('open',()=>{if(!settled){settled=true;clearTimeout(timer);this.retryAt=0;resolve();}});
    channel.on('error',fail);
    channel.on('close',()=>{fail();if(this.channel===channel){this.channel=null;this.onConnection(false);}});
    channel.on('data',message=>this.reply(message));
   });
   });
  })().finally(()=>{if(this.peerEpoch===epoch){this.connecting=null;this.cancelConnect=null;}});
  this.connecting=task;
  return this.connecting;
 }
 reply(message){
  const pending=this.requests.get(message?.id);if(!pending)return;
  if(message.result){pending.finish(message.result);return;}
  if(!Number.isInteger(message.total)||message.total<1||message.total>500||!Number.isInteger(message.part)||message.part<0||message.part>=message.total||typeof message.data!=='string'||message.data.length>24000)return;
  if(pending.total&&pending.total!==message.total)return;
  pending.total=message.total;pending.parts.set(message.part,message.data);
  if(pending.parts.size===message.total){
   try{pending.finish(JSON.parse(Array.from({length:message.total},(_,i)=>pending.parts.get(i)).join('')));}catch{pending.finish({ok:false,error:'INVALID_RESPONSE'});}
  }
 }
 async rpc(request){
  await this.connect(request.room);
  const id=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.requests.delete(id);reject(new ServiceError('HEARTH_UNREACHABLE'));},request.action==='image'?20000:9000);
   const finish=result=>{clearTimeout(timer);this.requests.delete(id);if(result.ok)resolve(result.data);else reject(new ServiceError(result.error,result.status));};
   this.requests.set(id,{finish,parts:new Map()});
   try{this.channel.send({id,request});}catch{finish({ok:false,error:'HEARTH_UNREACHABLE'});}
  });
 }
 async join(room,body){return this.rpc({room,action:'join',body});}
 start(session){
  // Joining already opened a working channel. Keep it instead of registering
  // a second signaling peer for the same phone and room.
  this.generation++;clearInterval(this.timer);this.busy=false;this.session=session;
  const generation=this.generation;this.poll(generation);this.timer=setInterval(()=>this.poll(generation),650);
 }
 async poll(generation=this.generation){
  if(this.busy||!this.session)return;this.busy=true;
  try{const next=await this.rpc({room:this.session.room_id,token:this.session.session_token,action:'snapshot'});if(generation!==this.generation)return;this.onConnection(true);this.onSnapshot(next);}
  catch(e){if(generation===this.generation)this.onConnection(false,e);}
  finally{if(generation===this.generation)this.busy=false;}
 }
 async command(body){return this.rpc({room:this.session.room_id,token:this.session.session_token,action:'command',body});}
 hydrateImages(element){
  for(const img of element.querySelectorAll('[data-phone-image]')){
   const file=img.dataset.phoneImage;if(!this.session)continue;
   if(!this.images.has(file))this.images.set(file,this.rpc({room:this.session.room_id,token:this.session.session_token,action:'image',path:file}).then(({mime,base64})=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));return URL.createObjectURL(new Blob([bytes],{type:mime}));
   }).catch(e=>{this.images.delete(file);throw e;}));
   this.images.get(file).then(url=>{if(img.isConnected)img.src=url;}).catch(()=>{if(img.isConnected)img.onerror?.();});
  }
 }
 closePeer(){this.peerEpoch++;this.cancelConnect?.();this.cancelConnect=null;this.connecting=null;const channel=this.channel;this.channel=null;channel?.close();this.peer?.destroy();this.peer=null;for(const pending of this.requests.values())pending.finish({ok:false,error:'HEARTH_UNREACHABLE'});this.requests.clear();}
 stop(){this.generation++;clearInterval(this.timer);this.busy=false;this.session=null;this.closePeer();for(const value of this.images.values())value.then(url=>URL.revokeObjectURL(url)).catch(()=>{});this.images.clear();}
}
