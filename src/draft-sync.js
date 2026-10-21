import {draftKey,newId,codepointLength} from './core.js';
import {commandEnvelope} from './adapter.js?controller=phone-drafts-v01';

// A single in-flight save, with coalesced edits and stable IDs on uncertain
// delivery. Network acknowledgements never write into the text field.
export class DraftSync {
 constructor({send,onStatus=()=>{},onSnapshot=()=>{},setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}){
  Object.assign(this,{send,onStatus,onSnapshot,setTimer,clearTimer});this.entries=new Map();this.epoch=0;
 }
 sync(snapshot){
  const scope=snapshot?`${snapshot.room_id}/${snapshot.game_id}/${snapshot.phase_id}`:null;
  if(scope!==this.scope){this.epoch++;this.entries.clear();this.clearTimer(this.timer);this.timer=null;this.scope=scope;}
  this.snapshot=snapshot;
  for(const a of snapshot?.private?.assignments||[]){
   const entry=this.entries.get(draftKey(snapshot,a.assignment_id));
   if(entry){entry.seq=Math.max(entry.seq,a.draft?.seq||0);if(a.committed){entry.dirty=false;entry.pending=null;}}
  }
 }
 update(snapshot,assignment,text){
  this.sync(snapshot);if(!snapshot.public.capabilities?.answer_drafts)return;
  const key=draftKey(snapshot,assignment),own=snapshot.private.assignments?.find(a=>a.assignment_id===assignment);
  if(!own||own.committed)return;
  let entry=this.entries.get(key);
  if(!entry){entry={key,assignment,seq:own.draft?.seq||0,text:own.draft?.text??'',dirty:false};this.entries.set(key,entry);}
  if(entry.text===text)return;
  entry.text=text;entry.seq++;entry.dirty=true;
  this.onStatus(key,codepointLength(text)>120?'too-long':'saving');this.schedule();
 }
 schedule(delay=500){if(!this.timer)this.timer=this.setTimer(()=>{this.timer=null;void this.flush();},delay);}
 async flush(){
  if(this.inflight||!this.snapshot?.public.capabilities?.answer_drafts)return;
  const entry=[...this.entries.values()].find(e=>e.dirty&&codepointLength(e.text)<=120);
  if(!entry)return;
  const epoch=this.epoch;
  entry.pending??={...commandEnvelope(this.snapshot,'save_draft',{assignment_id:entry.assignment,draft_seq:entry.seq,text:entry.text}),command_id:newId()};
  const command=entry.pending;this.inflight=true;
  let delay=500;
  try{
   const response=await this.send(command);if(epoch!==this.epoch)return;
   const ack=response?.ack;
   if(ack?.type!=='command_ack'||ack.command_id!==command.command_id||ack.room_id!==command.room_id)throw Error('Invalid draft acknowledgement');
   if(ack.status==='accepted'){
    if(ack.protocol_version!==command.protocol_version||ack.assignment_id!==command.assignment_id||ack.draft_seq!==command.draft_seq)throw Error('Invalid draft receipt');
    entry.pending=null;entry.dirty=entry.text!==command.text;
    this.onStatus(entry.key,entry.dirty?'saving':'saved');
   }else if(ack.status==='rejected'){
    entry.pending=null;
    if(['STALE_PHASE','WRONG_PHASE','ANSWER_COMMITTED'].includes(ack.error))entry.dirty=false;
    else if(['STALE_DRAFT','DRAFT_SEQUENCE_REUSED'].includes(ack.error)){
     const own=response.snapshot?.private?.assignments?.find(a=>a.assignment_id===entry.assignment);
     entry.seq=Math.max(entry.seq,own?.draft?.seq||0)+1;
    }else if(ack.error==='RATE_LIMIT')delay=1200;
    else {entry.dirty=false;this.onStatus(entry.key,'local');}
   }else throw Error('Invalid draft acknowledgement');
   if(response.snapshot)this.onSnapshot(response.snapshot);
  }catch{
   if(epoch===this.epoch){this.onStatus(entry.key,'local');delay=1200;}
  }finally{
   this.inflight=false;
   if([...this.entries.values()].some(e=>e.dirty&&codepointLength(e.text)<=120))this.schedule(delay);
  }
 }
 stop(){this.sync(null);}
}
