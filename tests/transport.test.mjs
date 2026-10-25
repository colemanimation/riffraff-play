import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {RoomTransport} from '../src/transport.js';
const servers=[{urls:['turns:relay.example.test:443?transport=tcp'],username:'user',credential:'credential'}];
function peer(options,record){
 record.push(options);const p=new EventEmitter();p.destroy=()=>{};
 p.connect=()=>{const c=new EventEmitter();c.close=()=>c.emit('close');queueMicrotask(()=>{c.open=true;c.emit('open');});return c;};queueMicrotask(()=>p.emit('open'));return p;
}
test('concurrent phone requests share one relay load and one signaling peer',async t=>{
 let release,loads=0;const record=[];
 const transport=new RoomTransport(()=>{},()=>{},{relayLoader:()=>{loads++;return new Promise(r=>release=r);},peerFactory:o=>peer(o,record)});t.after(()=>transport.stop());
 const a=transport.connect('ABCDEF'),b=transport.connect('ABCDEF');assert.equal(loads,1);release(servers);await Promise.all([a,b]);assert.equal(record.length,1);assert.deepEqual(record[0].config.iceServers,servers);await transport.connect('ABCDEF');assert.equal(record.length,1);
});
test('leaving during relay fetch cancels stale connection without registering a peer',async()=>{
 let release,created=0;const transport=new RoomTransport(()=>{},()=>{},{relayLoader:()=>new Promise(r=>release=r),peerFactory:()=>{created++;}});
 const pending=transport.connect('ABCDEF');transport.stop();release(servers);await assert.rejects(pending,e=>e.code==='CONNECTION_CANCELLED');assert.equal(created,0);
});
test('leaving during signaling settles the pending request and removes the timer',async()=>{
 const transport=new RoomTransport(()=>{},()=>{},{relayLoader:async()=>servers,peerFactory:()=>{const p=new EventEmitter();p.destroy=()=>{};return p;}});
 const pending=transport.connect('ABCDEF');await new Promise(r=>setImmediate(r));transport.stop();await assert.rejects(pending,e=>e.code==='CONNECTION_CANCELLED');assert.equal(transport.peer,null);
});

test('a late snapshot or authorization error from a retired session cannot replace a fresh session',async t=>{
 const snapshots=[],connections=[],pending=[];
 const transport=new RoomTransport(s=>snapshots.push(s),(ok,e)=>connections.push({ok,error:e?.code}));t.after(()=>transport.stop());
 transport.rpc=request=>new Promise((resolve,reject)=>pending.push({request,resolve,reject}));
 const old={room_id:'ABCDEF',session_token:'old'},fresh={room_id:'ABCDEF',session_token:'new'};
 transport.start(old);transport.stop();transport.start(fresh);
 pending[0].resolve({player:'old'});pending[1].resolve({player:'new'});await new Promise(r=>setImmediate(r));
 assert.deepEqual(snapshots,[{player:'new'}]);assert.deepEqual(connections,[{ok:true,error:undefined}]);
 const poll=transport.poll();transport.stop();transport.start(fresh);pending[2].reject(Object.assign(Error('UNAUTHORIZED'),{code:'UNAUTHORIZED',status:401}));pending[3].resolve({player:'new again'});await poll;await new Promise(r=>setImmediate(r));
 assert.equal(snapshots.at(-1).player,'new again');assert(connections.every(c=>c.ok));assert.equal(transport.session,fresh);
});
