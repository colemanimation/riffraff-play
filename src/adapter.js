export const PROTOCOL = '0.2';

export function conversationView(value) {
  if(!value||typeof value.contact!=='string'||!value.contact.length||!Array.isArray(value.messages)||!value.messages.length||Object.keys(value).some(k=>!['contact','messages'].includes(k)))return null;
  if(!value.messages.every(m=>m&&['IN','OUT'].includes(m.direction)&&typeof m.text==='string'&&m.text.length&&Object.keys(m).every(k=>['direction','text'].includes(k))))return null;
  return {contact:value.contact,messages:value.messages.map(({direction,text})=>({direction,text}))};
}
export function promptView(prompt,allowConversation=false) {
  if(!prompt)return null;
  return {id:prompt.prompt_id,text:prompt.text,kind:prompt.kind==='message'?'messaging':prompt.kind,
    imageUrl:prompt.image?.url,imageAlt:prompt.image?.description,
    conversation:allowConversation&&prompt.kind==='message'?conversationView(prompt.conversation):null};
}
export function allocationCounts(ids) { return (ids||[]).reduce((counts,id)=>{counts[id]=(counts[id]||0)+1;return counts;},{}); }

// Explicit mapping of the Room Service v0.2 filtered wire schema; no local phase progression.
export function controllerView(snapshot, clock, connected) {
  if(snapshot.protocol_version!==PROTOCOL)throw Error('This controller needs a matching room version.');
  if(snapshot.type!=='room_snapshot'||snapshot.private?.role!=='player'||!snapshot.public)throw Error('The room did not send a private player snapshot.');
  const p=snapshot.public, own=snapshot.private;
  const player=p.players.find(x=>x.player_id===own.player_id);
  const base={room:snapshot.room_id,label:p.round===4?'RIFF RAFF ROYALE':`ROUND ${p.round}`,
    player:player?{name:player.name,characterId:player.character_id}:null,
    draftSupport:p.capabilities?.answer_drafts===true,deadline:p.deadline_ms,canAct:connected && clock.remaining(p.deadline_ms)>0};
  if(p.phase==='CLOSED')return {...base,kind:'closed',reason:p.reason};
  if(p.phase==='LOBBY')return {...base,kind:'lobby',players:p.players.map(x=>({name:x.name,characterId:x.character_id}))};
  if(['WRITING','ROYALE_WRITING'].includes(p.phase))return {...base,kind:p.phase==='WRITING'?'write':'royale-write',assignments:(own.assignments||[]).map(a=>({id:a.assignment_id,prompt:promptView(a.prompt,p.phase==='ROYALE_WRITING'&&p.round===4),accepted:a.committed?a.text:null}))};
  if(p.phase==='VOTING')return {...base,kind:own.eligible_answer_ids.length?'vote':'own',label:base.label+' · VOTE',prompt:promptView(p.prompt),acceptedVote:own.vote??null,choices:(p.answers||[]).filter(a=>a.text!==null).map(a=>({id:a.answer_id,text:a.text,eligible:own.eligible_answer_ids.includes(a.answer_id)}))};
  if(p.phase==='ROYALE_VOTING')return {...base,kind:'royale',label:base.label+' · VOTE',prompt:promptView(p.prompt,p.round===4),budget:own.token_budget,acceptedAllocation:own.tokens===null?null:allocationCounts(own.tokens),choices:(p.answers||[]).filter(a=>a.text!==null).map(a=>({id:a.answer_id,text:a.text,eligible:own.eligible_answer_ids.includes(a.answer_id),own:!own.eligible_answer_ids.includes(a.answer_id)}))};
  if(['STANDINGS','FINAL_STANDINGS','RESULT','ROYALE_RESULT'].includes(p.phase)){
    let lastScore=null,rank=0;
    return {...base,kind:'results',label:p.phase==='FINAL_STANDINGS'?'FINAL STANDINGS':base.label+' · RESULTS',final:p.phase==='FINAL_STANDINGS',standings:p.standings.map((x,i)=>{if(x.score!==lastScore)rank=i+1;lastScore=x.score;return {rank,name:x.name,score:x.score,self:x.player_id===own.player_id};})};
  }
  return {...base,kind:'wait',prompt:promptView(p.prompt),title:p.presentation_stalled?'Waiting for the host to reconnect.':'Watch the big screen.',message:p.presentation_stalled?'Your room is waiting. The host can resume this presentation.':'The next part of the game is on its way.'};
}

export function commandEnvelope(snapshot,type,fields) {
  return {type,protocol_version:PROTOCOL,room_id:snapshot.room_id,game_id:snapshot.game_id,phase_id:snapshot.phase_id,revision:snapshot.revision,...fields};
}
