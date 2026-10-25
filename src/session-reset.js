// Clear only this room's private input. Other rooms and display preferences stay.
export function clearRoomInputs(store,room){
 for(const key of ['drafts','allocations']){
  const entries=store.get(key,{});
  for(const id of Object.keys(entries))if(id.startsWith(room+'/'))delete entries[id];
  store.set(key,entries);
 }
 for(const key of ['outbox','acks']){
  const entries=store.get(key,{});
  for(const [id,value]of Object.entries(entries))if(value?.room_id===room)delete entries[id];
  store.set(key,entries);
 }
 if(store.get('position')?.room===room)store.set('position',null);
}

export function clearRoomSession(store,room){
 clearRoomInputs(store,room);
 const sessions=store.get('sessions',{});delete sessions[room];store.set('sessions',sessions);
 if(store.get('session')?.room_id===room)store.set('session',null);
 if(store.get('joinIntent')?.room===room)store.set('joinIntent',null);
}
