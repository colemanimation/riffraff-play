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
