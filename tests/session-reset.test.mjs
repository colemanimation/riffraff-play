import test from 'node:test';
import assert from 'node:assert/strict';
import {PrivateStore} from '../src/core.js';
import {clearRoomInputs,clearRoomSession} from '../src/session-reset.js';
function fixture(){
 const storage={value:null,getItem(){return this.value;},setItem(_,v){this.value=v;}};
 const store=new PrivateStore(storage),session={room_id:'ROOMAA',session_token:'old-token',player_id:'me'};
 const data={session,sessions:{ROOMAA:session,OTHERB:{room_id:'OTHERB',session_token:'other'}},joinIntent:{room:'ROOMAA',command_id:'old-join'},position:{room:'ROOMAA',game:'old'},name:'Alex',character:'01-orange',drafts:{'ROOMAA/old/phase/a':'private','OTHERB/g/p/b':'keep'},allocations:{'ROOMAA/old/p':{a:3},'OTHERB/g/p':{b:2}},outbox:{old:{room_id:'ROOMAA'},other:{room_id:'OTHERB'}},acks:{old:{room_id:'ROOMAA'},other:{room_id:'OTHERB'}}};
 for(const [k,v]of Object.entries(data))store.set(k,v);
 return {store,storage,session};
}
test('same-player replay clears private input without losing seats or other rooms',()=>{
 const {store,storage,session}=fixture();clearRoomInputs(store,'ROOMAA');const saved=new PrivateStore(storage);
 assert.deepEqual(saved.get('session'),session);assert.deepEqual(saved.get('drafts'),{'OTHERB/g/p/b':'keep'});assert.deepEqual(saved.get('allocations'),{'OTHERB/g/p':{b:2}});
 assert.deepEqual(saved.get('outbox'),{other:{room_id:'OTHERB'}});assert.deepEqual(saved.get('acks'),{other:{room_id:'OTHERB'}});assert.equal(saved.get('position'),null);
});
test('new-player reset removes credentials and bootstrap retry, preserving preferences',()=>{
 const {store,storage}=fixture();clearRoomSession(store,'ROOMAA');const saved=new PrivateStore(storage);
 assert.equal(saved.get('session'),null);assert.equal(saved.get('joinIntent'),null);assert.deepEqual(Object.keys(saved.get('sessions')),['OTHERB']);
 assert.equal(saved.get('name'),'Alex');assert.equal(saved.get('character'),'01-orange');assert(!storage.value.includes('old-token'));assert(!storage.value.includes('private'));
 clearRoomSession(saved,'ROOMAA');assert.deepEqual(Object.keys(saved.get('sessions')),['OTHERB']);
});
