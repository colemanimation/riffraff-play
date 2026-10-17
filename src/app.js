import { CHARACTERS, ServerClock, PrivateStore, Outbox, newId, codepointLength, draftKey, totalTokens, validAllocation, acceptSnapshot } from './core.js';
import { controllerView, commandEnvelope, PROTOCOL } from './adapter.js';
import { RoomTransport, ServiceError } from './transport.js';
import { renderView, updateHeader } from './view.js';
import { ImageReview, imageReviewEnabled } from './image-review.js';

const $=selector=>document.querySelector(selector);
const imageReview=new ImageReview(imageReviewEnabled);
let storage;try{storage=sessionStorage;}catch{storage={getItem(){},setItem(){throw Error('denied')},removeItem(){}};}
const store=new PrivateStore(storage),outbox=new Outbox(store),clock=new ServerClock();
let session=store.get('session'),snapshot=null,connected=false,screen=session?'reconnect':'join',active=0,error='',busy=false,closedReason='';
let localName=store.get('name',''),localRoom=new URLSearchParams(location.search).get('room')||store.get('room','');
let selected=store.get('character',CHARACTERS[0][0]),drafts=store.get('drafts',{}),allocations=store.get('allocations',{}),acks=store.get('acks',{});
let sessions=store.get('sessions',{});
let lastSignature='',lastPhase='',lastAttempt=0,sending=new Set(),lastConnection=null;
let lastAnswerKey=null;
const announce=text=>{$('#announcement').textContent=text;};
const errors={HEARTH_UNREACHABLE:'Could not reach Hearth. Check the room code and keep the host’s Hearth app open.',CHARACTER_TAKEN:'That character was just chosen. Choose another.',NAME_TAKEN:'That name is already in the room. Choose another name.',INVALID_NAME:'Enter a name of up to 12 characters. Clank is reserved.',ROOM_FULL:'This room is full.',GAME_STARTED:'This game has already started.',UNAUTHORIZED:'Your room session is no longer available. Join again.',NOT_FOUND:'That room could not be found.',ROOM_NOT_FOUND:'That room could not be found.',STALE_PHASE:'That round has closed. The room did not accept this input.',WRONG_PHASE:'That action is no longer open.',INVALID_ANSWER:'Write an answer of 1–120 characters.',INELIGIBLE:'You cannot vote for that answer.',ANSWER_COMMITTED:'The room already has your answer.',VOTE_COMMITTED:'The room already has your vote.',TOKEN_BUDGET:'Use at most three tokens.',PROTOCOL_MISMATCH:'The room and controller versions do not match.'};
const explain=e=>errors[e.code||e.error||e.message]||'The room could not confirm that request. Reconnect and try again.';
const allocationKey=()=>snapshot?`${snapshot.room_id}/${snapshot.game_id}/${snapshot.phase_id}`:'';
const semanticKey=key=>`${snapshot.game_id}/${snapshot.phase_id}/${key}`;
function currentView(){
  if(!snapshot)return {kind:screen,reason:closedReason};
  try{return controllerView(snapshot,clock,connected);}catch(e){error=e.message;return {kind:'reconnect'};}
}
function localState(v){
  const currentDrafts={};for(const a of v.assignments||[])currentDrafts[a.id]=drafts[draftKey(snapshot,a.id)]||'';
  const pending={};if(snapshot)for(const key of Object.keys(outbox.items))if(key.startsWith(`${snapshot.game_id}/${snapshot.phase_id}/`))pending[key.slice(`${snapshot.game_id}/${snapshot.phase_id}/`.length)]=true;
  return {room:localRoom,name:localName,character:selected,busy,error,active,drafts:currentDrafts,pending,allocation:allocations[allocationKey()]||{},durable:store.saved,imageReview:imageReviewEnabled};
}
function render(force=false){
  const v=currentView(),local=localState(v);const signature=JSON.stringify([v,local]);
  if(!force&&signature===lastSignature){tick();return;}lastSignature=signature;
  const app=$('#app'),focused=document.activeElement;
  const assignment=v.assignments?.[active]||v.assignments?.[0];
  const answerKey=assignment&&snapshot?`${snapshot.room_id}/${snapshot.game_id}/${snapshot.phase_id}/${assignment.id}`:null;
  const oldAnswer=app.querySelector('#answer');
  const savedSelection=oldAnswer&&answerKey===lastAnswerKey?{value:oldAnswer.value,start:oldAnswer.selectionStart,end:oldAnswer.selectionEnd,direction:oldAnswer.selectionDirection}:null;
  const focus=app.contains(focused)?{id:focused.id,token:focused.dataset.token,delta:focused.dataset.delta,prompt:focused.dataset.prompt,character:focused.dataset.character,start:focused.selectionStart,end:focused.selectionEnd,scroll:window.scrollY}:null;
  updateHeader(v,local);app.innerHTML=renderView(v,local);
  lastAnswerKey=answerKey;const newAnswer=app.querySelector('#answer');
  if(savedSelection&&newAnswer?.value===savedSelection.value)newAnswer.setSelectionRange(savedSelection.start,savedSelection.end,savedSelection.direction);
  for(const img of app.querySelectorAll('[data-prompt-image]'))img.onerror=()=>{img.hidden=true;const notice=app.querySelector('[data-image-error]');if(notice)notice.hidden=false;};
  transport.hydrateImages(app);
  if(focus){
    const target=focus.id?document.getElementById(focus.id):Array.from(app.querySelectorAll('button')).find(b=>(focus.token!==undefined&&b.dataset.token===focus.token&&b.dataset.delta===focus.delta)||(focus.prompt!==undefined&&b.dataset.prompt===focus.prompt)||(focus.character!==undefined&&b.dataset.character===focus.character));
    if(target&&!target.disabled){target.focus({preventScroll:true});if(focus.start!==null&&typeof target.setSelectionRange==='function')target.setSelectionRange(focus.start,focus.end);window.scrollTo(0,focus.scroll);}
    else if(focus.token!==undefined){const other=Array.from(app.querySelectorAll('[data-token]')).find(b=>b.dataset.token===focus.token&&!b.disabled);other?.focus({preventScroll:true});}
  }
  tick();
}
function tick(){
  const v=currentView(),remaining=clock.remaining(v.deadline);const timer=$('.timer');
  const prompt=['write','royale-write'].includes(v.kind)?(v.assignments?.[active]||v.assignments?.[0])?.prompt:v.kind==='royale'?v.prompt:null;
  imageReview.sync(snapshot?`${snapshot.room_id}/${snapshot.game_id}/${snapshot.phase_id}`:null,remaining,connected,{kind:v.kind,prompt});
  if(timer)timer.textContent=remaining===null?'Waiting':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
  if(remaining===0)for(const b of $('#app').querySelectorAll('button[type=submit],[data-vote],[data-token],[data-action=tokens]'))b.disabled=true;
}
function connection(ok,e){
  connected=ok;
  if(e instanceof ServiceError && [401,404,410].includes(e.status)){
    if(session){delete sessions[session.room_id];store.set('sessions',sessions);store.set('session',null);}
    transport.stop();session=null;snapshot=null;screen='closed';closedReason=e.status===401?'Your session is no longer available. Join another room.':'This room is no longer available. Join another room.';error='';render(true);return;
  }
  $('#connection').replaceChildren();
  if(session&&!ok){$('#connection').textContent='Connection lost. Time continues in the room. ';const b=document.createElement('button');b.textContent='Reconnect';b.onclick=()=>transport.poll();$('#connection').append(b);}
  if(lastConnection!==ok){lastConnection=ok;render();}
}
function received(next){
  if(!session||next?.room_id!==session.room_id||next?.private?.player_id!==session.player_id)return;
  if(!acceptSnapshot(snapshot,next))return;
  if(next.protocol_version!==PROTOCOL||next.private?.role!=='player'){error='The room and controller versions do not match.';connected=false;render(true);return;}
  clock.sync(next.server_time_ms);
  const changed=snapshot&&next.phase_id!==snapshot.phase_id;
  snapshot=next;screen='';error=changed?'':error;
  let restoreScroll=null;
  if(lastPhase!==next.phase_id){
    lastPhase=next.phase_id;const saved=store.get('position');
    const restore=saved?.room===next.room_id&&saved?.game===next.game_id&&saved?.phase===next.phase_id;
    active=restore?saved.active:0;restoreScroll=restore?saved.scroll:null;
  }
  for(const [key,command] of Object.entries(outbox.items)){
    if(command.room_id!==next.room_id)continue;
    const ack=acks[command.command_id];
    if(ack&&next.revision>=ack.revision){outbox.remove(key);delete acks[command.command_id];}
  }
  store.set('acks',acks);
  render();
  if(restoreScroll!==null)window.scrollTo(0,restoreScroll);
  if(changed){$('#app').focus({preventScroll:true});window.scrollTo(0,0);announce(`The room moved to ${next.public.phase.toLowerCase().replaceAll('_',' ')}.`);}
  if(Date.now()-lastAttempt>2500)retryPending();
}
const transport=new RoomTransport(received,connection);
async function send(key,command){
  if(sending.has(command.command_id)||acks[command.command_id])return;
  const expectedSession=session;
  sending.add(command.command_id);lastAttempt=Date.now();render();
  try{
    const response=await transport.command(command),ack=response.ack;
    if(session!==expectedSession)return;
    if(ack.type!=='command_ack'||ack.command_id!==command.command_id||ack.protocol_version!==PROTOCOL||ack.room_id!==command.room_id)throw Error('Invalid acknowledgement');
    if(ack.status==='accepted'){
      acks[command.command_id]=ack;store.set('acks',acks);announce(command.type==='submit_answer'?'Answer received by the room.':'Vote received by the room.');
    }else if(ack.status==='rejected'){outbox.remove(key);error=explain(ack);announce(error);}
    else throw Error('Invalid acknowledgement');
    if(response.snapshot){connection(true);received(response.snapshot);}else await transport.poll();
  }catch(e){
    if(session!==expectedSession)return;
    if(e instanceof ServiceError&&e.status>=400&&e.status<500){outbox.remove(key);error=explain(e);}
    else{connected=false;connection(false);error='Delivery is uncertain. Reconnecting will retry the same request safely.';}
  }finally{sending.delete(command.command_id);render();}
}
function retryPending(){for(const [key,command]of Object.entries(outbox.items))if(command.room_id===session?.room_id&&!acks[command.command_id])send(key,command);}
function submit(type,key,fields){
  const v=currentView();if(!snapshot||!connected||!v.canAct){error='Wait for the room to reconnect or open this input.';render();return;}
  error='';const fullKey=semanticKey(key);const cmd=outbox.begin(fullKey,commandEnvelope(snapshot,type,fields));send(fullKey,cmd);
}
async function join(){
  if(busy)return;busy=true;error='';render();
  const bootstrap=store.get('joinIntent')||{room:localRoom,command_id:newId(),name:localName,character_id:selected};store.set('joinIntent',bootstrap);
  try{
    const result=await transport.join(bootstrap.room,{command_id:bootstrap.command_id,name:bootstrap.name,character_id:bootstrap.character_id});
    if(result.type!=='joined'||result.protocol_version!==PROTOCOL||!result.session_token||result.command_id!==bootstrap.command_id)throw Error('Invalid join receipt');
    session={room_id:result.room_id,session_token:result.session_token,player_id:result.player_id};sessions[session.room_id]=session;store.set('sessions',sessions);store.set('session',session);store.set('joinIntent',null);screen='reconnect';transport.start(session);if(result.snapshot){connection(true);received(result.snapshot);}
  }catch(e){
    if(e instanceof ServiceError && e.status>=400&&e.status<500)store.set('joinIntent',null);
    error=explain(e);if(store.get('joinIntent'))error='Joining is unconfirmed. Tap “That’s me” to retry the same join safely.';
  }finally{busy=false;render();}
}
function leave(){savePosition();transport.stop();store.set('session',null);session=null;snapshot=null;error='';closedReason='';connected=false;screen='join';lastPhase='';$('#connection').textContent='';render(true);$('#app').focus();}
function savePosition(){if(snapshot)store.set('position',{room:snapshot.room_id,game:snapshot.game_id,phase:snapshot.phase_id,active,scroll:window.scrollY});}

$('#app').addEventListener('submit',event=>{
  event.preventDefault();const form=event.target.dataset.form;error='';
  if(form==='join'){
    localRoom=$('#room').value.trim().toUpperCase();localName=$('#name').value.trim();
    if(!/^[A-Z0-9]{4,8}$/.test(localRoom)){error='Enter the room code shown on the big screen.';render();return;}
    if(sessions[localRoom]){session=sessions[localRoom];store.set('session',session);screen='reconnect';transport.start(session);render(true);return;}
    if(!localName||codepointLength(localName)>12){error='Enter a name of 1–12 characters.';render();return;}
    store.set('room',localRoom);store.set('name',localName);screen='identity';render(true);$('#app').focus();return;
  }
  if(form==='answer'){
    const v=currentView(),a=v.assignments?.[active]||v.assignments?.[0];if(!a)return;
    const text=$('#answer').value.trim();
    if(!text||codepointLength(text)>120){error='Write an answer of 1–120 characters.';render();$('#answer')?.focus();return;}
    submit('submit_answer',`answer:${a.id}`,{assignment_id:a.id,text});
  }
});
$('#app').addEventListener('input',event=>{
  if(event.target.id==='name')localName=event.target.value;
  if(event.target.id==='room')localRoom=event.target.value;
  if(event.target.id==='answer'){
    const v=currentView(),a=v.assignments?.[active]||v.assignments?.[0];if(!a)return;
    drafts[draftKey(snapshot,a.id)]=event.target.value;store.set('drafts',drafts);
    $('#counter').textContent=`${codepointLength(event.target.value)}/120`;
    $('#draft-status').textContent=store.saved?'Draft saved on this device':'Draft kept while this page is open';
    error='';const alert=$('#app .error');if(alert)alert.textContent='';
  }
});
$('#app').addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  const v=currentView();
  if(b.dataset.character){if(store.get('joinIntent')){error='Retry your unconfirmed join before changing character.';}else{selected=b.dataset.character;store.set('character',selected);}render();return;}
  if(b.dataset.prompt!==undefined){active=Number(b.dataset.prompt);savePosition();error='';render(true);return;}
  if(b.dataset.vote){if(!v.choices?.some(c=>c.id===b.dataset.vote&&c.eligible))return;submit('cast_vote','vote',{answer_id:b.dataset.vote});return;}
  if(b.dataset.token){
    const allocation={...(allocations[allocationKey()]||{})},id=b.dataset.token;allocation[id]=(allocation[id]||0)+Number(b.dataset.delta);
    if(!validAllocation(allocation,v.choices.filter(c=>c.eligible).map(c=>c.id),v.budget))return;
    allocations[allocationKey()]=allocation;store.set('allocations',allocations);render(true);announce(`${v.budget-totalTokens(allocation)} tokens left`);return;
  }
  const action=b.dataset.action;
  if(action==='join')join();
  if(action==='back'){if(store.get('joinIntent')){error='Retry your unconfirmed join before changing rooms.';render();}else{screen='join';render(true);}}
  if(action==='next-answer'){active=v.assignments.findIndex(a=>a.accepted===null);savePosition();render(true);$('#answer')?.focus();}
  if(action==='tokens'){
    const allocation=allocations[allocationKey()]||{};
    if(!validAllocation(allocation,v.choices.filter(c=>c.eligible).map(c=>c.id),v.budget))return;
    submit('allocate_royale_tokens','tokens',{answer_ids:Object.entries(allocation).flatMap(([id,count])=>Array(count).fill(id))});
  }
  if(action==='reconnect'){error='';if(session)transport.start(session);else{screen='join';render();}}
  if(action==='leave')leave();
});
$('#leave').onclick=leave;
let preferences=store.get('preferences',{large:false,reduce:matchMedia('(prefers-reduced-motion: reduce)').matches});
function applyPreferences(){document.body.classList.toggle('large',!!preferences.large);document.body.classList.toggle('reduce',!!preferences.reduce);$('#large-text').checked=!!preferences.large;$('#reduce-motion').checked=!!preferences.reduce;store.set('preferences',preferences);}
$('#comfort-open').onclick=()=>$('#comfort').showModal();$('#large-text').onchange=e=>{preferences.large=e.target.checked;applyPreferences();};$('#reduce-motion').onchange=e=>{preferences.reduce=e.target.checked;applyPreferences();};
function resume(){tick();if(session){connected=false;render();transport.poll();}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume();else savePosition();});window.addEventListener('pagehide',savePosition);window.addEventListener('pageshow',resume);window.addEventListener('online',resume);window.addEventListener('offline',()=>connection(false));
window.visualViewport?.addEventListener('resize',()=>{if(document.activeElement?.tagName==='TEXTAREA')document.activeElement.scrollIntoView({block:'nearest',behavior:'instant'});});
applyPreferences();render(true);setInterval(tick,250);if(session)transport.start(session);
