import { CHARACTERS, character, escapeHtml as esc, codepointLength, totalTokens } from './core.js';

const avatar = id => {
  const c = CHARACTERS.find(c=>c[0]===id);
  return c ? `<img src="assets/${c[0]}.png?art=frames-v02" alt="${c[1]} foam character">` : '<span aria-label="Clank">Clank</span>';
};
const logo = () => '<div class="waiting-logo"><img src="assets/logo-transparent-v1.png" width="1672" height="941" alt="RiffRaff"></div>';
const button = (text, action, disabled=false, kind='primary') => `<button class="${kind}" data-action="${action}" ${disabled?'disabled':''}>${esc(text)}</button>`;
const phase = label => `<div class="phase-header"><p class="kicker">${esc(label)}</p><span class="timer" aria-label="Time remaining" role="timer" aria-live="off">—</span></div>`;
function prompt(p, label='YOUR PROMPT', expand=false) {
  if(!p)return '';
  let media='';
  if(p.imageUrl){
    let safe=false;try { const u=new URL(p.imageUrl,location.origin);safe=u.origin===location.origin && /^\/media\/royale\/[A-Za-z0-9_.-]+$/.test(u.pathname); } catch {}
    media = safe ? `<img class="prompt-image" data-phone-image="${esc(p.imageUrl)}" alt="${esc(p.imageAlt||'Prompt image. Description not supplied.')}" data-prompt-image data-prompt-id="${esc(p.id)}" data-prompt-kind="${esc(p.kind)}">${expand?'<button class="secondary" id="open-prompt-image" aria-haspopup="dialog">View image</button>':''}<p class="image-description" hidden data-image-error>Prompt image could not load. Reconnect or ask the host for help.</p>` : '<p class="error">Prompt image is unavailable. Ask the host for help.</p>';
  }
  return `<div class="prompt-card"><span class="kicker">${label}</span><h2>${esc(p.text)}</h2>${media}${p.kind==='messaging'&&label==='YOUR PROMPT'?'<p class="hint">Write the next reply below. The supplied conversation stays unchanged.</p>':''}</div>`;
}
const pendingText = pending => pending ? '<p class="pending" role="status">Waiting for the room to confirm. Your input is not yet confirmed.</p>' : '';
const receipt = text => `<div class="receipt">${esc(text)}</div>`;

// Presentation-only model. The adapter fills every accepted/eligible/deadline value from authority.
export function renderView(v, local) {
  const error = local.error ? `<p class="error" role="alert">${esc(local.error)}</p>` : '';
  if(v.kind==='join')return `<div class="join-logo"><img src="assets/logo-transparent-v1.png" width="1672" height="941" alt="RiffRaff"></div><h1>Join the game</h1><form data-form="join"><label class="field-label" for="room">Room code</label><input type="text" class="room-input" id="room" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(local.room)}" aria-describedby="join-help"><label class="field-label" for="name">Your name</label><input type="text" id="name" autocomplete="nickname" value="${esc(local.name)}" aria-describedby="name-hint"><p class="tiny" id="name-hint">Up to 12 characters</p>${error}<button class="primary" type="submit">Play</button></form><p class="hint center" id="join-help">Enter the room code on the big screen.</p>`;
  if(v.kind==='identity')return `<p class="kicker center">ROOM ${esc(local.room)}</p><h1 class="center">Choose your character</h1><div class="character-grid">${CHARACTERS.map(([id,name])=>`<button class="character-choice" data-character="${id}" aria-label="Choose ${name} character" aria-pressed="${local.character===id}" ${local.busy?'disabled':''}>${avatar(id)}<span>${name}</span></button>`).join('')}</div><p class="center"><b>${esc(local.name)}</b> · ${character(local.character)[1]}</p>${error}${button(local.busy?'Joining…':'That’s me','join',local.busy)}${button('Back','back',local.busy,'secondary')}<p class="hint center">Choose a face.<br>It will be associated with your decisions.</p>`;
  if(v.kind==='reconnect')return `<div class="connection-symbol">↻</div><h1 class="center">Connection lost.</h1><p class="center waiting-copy">Your draft stays on this device.</p><div class="status-panel"><b>Waiting for the room</b>Accepted inputs and remaining time will be checked when you reconnect.</div>${error}${button('Reconnect now','reconnect',local.busy)}${button('Leave room','leave',false,'secondary')}`;
  if(v.kind==='closed')return `${logo()}<h1 class="center">This room<br>has closed.</h1><p class="center waiting-copy room-closed-reason">${esc(v.reason||'The host ended the session.')}</p><p class="flavor center">Your participation has been noted.<br>Its value remains under review.</p>${button('Join another room','leave')}`;
  if(v.kind==='lobby')return `<p class="kicker center">ROOM ${esc(v.room)}</p>${logo()}<h1 class="center">You're in!</h1><p class="center waiting-copy">Waiting for the host to start the game.</p><p class="flavor center">Enjoy this brief period of having done nothing wrong.</p><div class="lobby-list">${v.players.map(p=>`<div>${avatar(p.characterId)}${esc(p.name)}</div>`).join('')}</div>${error}`;
  if(v.kind==='write'||v.kind==='royale-write'){
    const a=v.assignments[local.active]||v.assignments[0];
    if(!a)return `${phase(v.label)}${logo()}<h1 class="center">Waiting for your prompt.</h1>`;
    const accepted=a.accepted;
    const draft=local.drafts[a.id]??'';
    const pending=local.pending[`answer:${a.id}`];
    return `${phase(v.label)}${v.assignments.length>1?`<div class="prompt-tabs">${v.assignments.map((p,i)=>`<button class="prompt-tab" data-prompt="${i}" aria-pressed="${a.id===p.id}">Answer ${i+1}${p.accepted!==null?' ✓':''}</button>`).join('')}</div>`:''}${prompt(a.prompt,v.kind==='royale-write'?'EVERYONE GETS THIS PROMPT':'YOUR PROMPT')}${accepted!==null?`<h2>Answer received!</h2>${receipt(accepted)}<p class="tiny">Confirmed by the room. This answer is locked.</p><p class="flavor center">Oh, you submitted that. Voluntarily.</p>${v.assignments.some(x=>x.accepted===null)?button('Write the other answer','next-answer',false,'secondary'):'<p class="hint center">Watch the big screen for what comes next.</p>'}`:`<form data-form="answer"><label class="field-label" for="answer">${a.prompt?.kind==='messaging'?'Your new reply':'Your answer'}</label><div class="entry-meta"><span id="draft-status">${local.durable?'Only you can see your draft':'Draft kept while this page is open'}</span><span id="counter">${codepointLength(draft)}/120</span></div><textarea id="answer" rows="3" autocomplete="off" placeholder="Write something funny…" aria-describedby="counter draft-status answer-policy">${esc(draft)}</textarea>${pendingText(pending)}${error}<button class="primary" type="submit" ${pending||!v.canAct?'disabled':''}>${pending?'Awaiting confirmation…':'Submit'}</button><p id="answer-policy" class="tiny">Final once the room accepts it.</p></form>`}<p class="hint center">${v.kind==='write'?'90 seconds total for both answers.<br>No bonus for being quick.':'One last answer. Make it count.'}</p>`;
  }
  if(v.kind==='own')return `${phase(v.label)}${prompt(v.prompt,'THE PROMPT')}${logo()}<h1 class="center">Sit this one out.</h1><p class="center waiting-copy">One of these answers is yours.<br>You can't vote in this matchup.</p><p class="hint center">Watch the big screen.<br>For once, doing nothing is the correct choice.</p>`;
  if(v.kind==='vote')return `${phase(v.label)}${prompt(v.prompt,'THE PROMPT')}<h1 class="vote-title">Pick the funniest</h1>${v.acceptedVote!==null?`<h2>Vote received!</h2>${receipt(v.choices.find(c=>c.id===v.acceptedVote)?.text||'Your vote is confirmed.')}<p class="hint center">Voting stays open until the timer ends.</p>`:v.choices.map((c,i)=>`<button class="vote-choice" data-vote="${esc(c.id)}" ${!v.canAct||local.pending.vote?'disabled':''}><span class="letter">${String.fromCharCode(65+i)}</span><span>${esc(c.text)}</span></button>`).join('')}${pendingText(local.pending.vote)}${error}<p class="hint center">Tap an answer to send your final vote.<br>The authors stay hidden until the reveal.</p>`;
  if(v.kind==='royale'){
    const accepted=v.acceptedAllocation!==null;
    const allocation=accepted?v.acceptedAllocation:local.allocation;
    const used=totalTokens(allocation);
    return `${phase(v.label)}${prompt(v.prompt,'SHARED PROMPT',local.imageReview)}<div class="token-summary" aria-live="polite" id="token-summary">${accepted?'Votes received!':`${v.budget-used} of ${v.budget} tokens left`}</div>${v.choices.map((c,i)=>`<div class="royale-answer ${c.own?'own-answer':''}"><p>${String.fromCharCode(65+i)}. ${esc(c.text)}</p>${c.own?'<p class="tiny">YOUR ANSWER · You can’t vote for yourself.</p>':`<div class="token-controls"><button data-token="${esc(c.id)}" data-delta="-1" aria-label="Remove token from answer ${String.fromCharCode(65+i)}" ${accepted||!v.canAct||local.pending.tokens||!allocation[c.id]?'disabled':''}>−</button><output aria-label="Tokens for answer ${String.fromCharCode(65+i)}">${allocation[c.id]||0}</output><button data-token="${esc(c.id)}" data-delta="1" aria-label="Add token to answer ${String.fromCharCode(65+i)}" ${accepted||!v.canAct||local.pending.tokens||used>=v.budget||!c.eligible?'disabled':''}>+</button></div>`}</div>`).join('')}${pendingText(local.pending.tokens)}${error}${accepted?'<p class="tiny center">Confirmed by the room. Your allocation is locked.</p>':button(`Submit ${used} tokens`,'tokens',!v.canAct||!!local.pending.tokens)}<p class="hint center">${accepted?'Watch the big screen for the results.':local.pending.tokens?'':!v.canAct?'Voting is closed. Waiting for the results.':'Stack or split up to 3 tokens across other players’ answers, then submit. Unused tokens expire.'}</p>`;
  }
  if(v.kind==='results')return `<p class="kicker center">${esc(v.label)}</p><h1 class="center">Results.<br>Brace your little ego.</h1><ol class="rank-list">${v.standings.map(p=>`<li class="${p.self?'self':''}"><span>${esc(p.rank)} &nbsp; ${esc(p.name)}</span><b>${esc(p.score)}</b></li>`).join('')}</ol><p class="hint center">${v.final?'Waiting for the host.':'Watch the big screen for the next round.'}</p>${error}`;
  return `${phase(v.label||'RIFFRAFF')}${v.prompt?prompt(v.prompt,'THE PROMPT'):logo()}<h1 class="center">${esc(v.title||'Watch the big screen.')}</h1><p class="center waiting-copy">${esc(v.message||'The next part of the game is on its way.')}</p>${error}`;
}

export function updateHeader(v,local) {
  const joined=!!v.player;const c=character(v.player?.characterId||local.character);
  document.body.dataset.screen=v.kind;document.body.style.setProperty('--player',c[2]);document.body.style.setProperty('--player-dark',c[3]);
  document.querySelector('.controller-top').classList.toggle('player-strip',joined);
  document.querySelector('.mini-brand').innerHTML=joined?`${avatar(c[0]).replace('<img','<img class="top-avatar"')}<span class="player-name">${esc(v.player.name)}</span>`:'<img src="assets/logo-transparent-v1.png" alt="RiffRaff" width="96" height="44">';
  document.querySelector('#room-label').textContent=v.room?`ROOM ${v.room}`:'RiffRaff';document.querySelector('#leave').hidden=!joined;
}
