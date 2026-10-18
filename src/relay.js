// This is a client-only key for one capped TURN credential, not an account key.
// It can retrieve relay addresses only; Metered supports its use in public clients.
const endpoint='https://hearth-riffraff-colemanimation.metered.live/api/v1/turn/credentials?apiKey=fe59f2c99a236a0604b72f2450e17b91c974';
const fallback=[{urls:'stun:stun.l.google.com:19302'}];

export function validatePhoneIceServers(value){
 if(!Array.isArray(value)||!value.length||value.length>12)throw Error('Invalid relay configuration');
 let hasRelay=false;
 const result=value.map(server=>{
  if(!server||typeof server!=='object')throw Error('Invalid relay configuration');
  const urls=Array.isArray(server.urls)?server.urls:[server.urls];
  if(!urls.length||urls.length>6||urls.some(url=>typeof url!=='string'||url.length>300||!/^stuns?:[a-z0-9.-]+:\d+(?:\?transport=(?:tcp|udp))?$|^turns?:[a-z0-9.-]+:\d+(?:\?transport=(?:tcp|udp))?$/i.test(url)))throw Error('Invalid relay configuration');
  const relay=urls.some(url=>/^turns?:/i.test(url));hasRelay ||= relay;
  if(relay&&[server.username,server.credential].some(v=>typeof v!=='string'||!v.length||v.length>256))throw Error('Invalid relay configuration');
  return {urls:[...urls],...(relay?{username:server.username,credential:server.credential}:{})};
 });
 if(!hasRelay)throw Error('Relay configuration has no relay');
 return result;
}

export function makePhoneRelayLoader({fetcher=(...args)=>fetch(...args),now=()=>Date.now(),timeoutMs=5000}={}){
 let cached,expires=0,pending;
 return async()=>{
  if(cached&&now()<expires)return structuredClone(cached);
  if(!pending)pending=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
   let result;
   try{
    const response=await fetcher(endpoint,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
    if(!response.ok||Number(response.headers.get('content-length'))>16384)throw Error('Relay unavailable');
    const text=await response.text();if(text.length>16384)throw Error('Relay response too large');
    result=validatePhoneIceServers(JSON.parse(text));expires=now()+15*60*1000;
   }catch{result=structuredClone(fallback);expires=now()+30000;}
   finally{clearTimeout(timer);}
   cached=result;return result;
  })().finally(()=>{pending=null;});
  return structuredClone(await pending);
 };
}

export const loadPhoneIceServers=makePhoneRelayLoader();
