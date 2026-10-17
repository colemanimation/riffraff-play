// Isolated additive conversation candidate. Plain text only, current authorized prompt only.
// No network, submission, durable prompt storage, or timer-authority state lives here.
export const imageReviewEnabled=true;
export class ImageReview {
  constructor(enabled){
    this.enabled=enabled;this.key=null;this.memory={};this.returnPosition=null;this.sequence=0;this.mode=null;
    if(!enabled)return;
    this.bar=document.createElement('aside');this.bar.id='image-access';this.bar.hidden=true;this.bar.setAttribute('aria-label','Prompt and input status');
    this.bar.innerHTML='<button id="view-voting-image" class="secondary" aria-haspopup="dialog">View image</button><div><span id="image-access-timer" role="timer" aria-label="Time remaining" aria-live="off"></span><span id="image-access-tokens"></span></div>';
    document.body.append(this.bar);
    this.dialog=document.createElement('dialog');this.dialog.id='prompt-image-review';this.dialog.setAttribute('aria-labelledby','image-review-title');
    this.dialog.innerHTML='<div class="image-review-head"><h2 id="image-review-title">Prompt</h2><span id="image-review-timer" role="timer" aria-label="Time remaining" aria-live="off"></span><button id="image-review-close" class="secondary">Back to votes</button></div><p id="image-review-connection" role="status" hidden></p><nav id="prompt-view-switch" aria-label="Prompt views"><button id="conversation-read" aria-pressed="false">Read conversation</button><button id="conversation-image" aria-pressed="false">View image</button></nav><div class="image-review-tools"><button id="image-review-out">Zoom out</button><button id="image-review-in">Zoom in</button><button id="image-review-fit">Show whole image</button></div><p class="tiny" id="image-review-help">Swipe or scroll to explore. Arrow keys also move the image.</p><div id="image-review-region" tabindex="0" role="region" aria-label="Scrollable original prompt image" aria-describedby="image-review-help"><img id="image-review-image" draggable="false"></div><section id="conversation-region" tabindex="0" aria-label="Conversation in original order" hidden></section>';
    document.body.append(this.dialog);this.img=this.$('#image-review-image');this.region=this.$('#image-review-region');this.textRegion=this.$('#conversation-region');
    this.$('#image-review-close').onclick=()=>{this.remember();this.dialog.close();};this.dialog.addEventListener('cancel',()=>this.remember());
    this.$('#conversation-read').onclick=()=>this.show('text');this.$('#conversation-image').onclick=()=>this.show('image');
    this.$('#image-review-in').onclick=()=>this.size(this.width*1.35);this.$('#image-review-out').onclick=()=>this.size(this.width/1.35);
    this.$('#image-review-fit').onclick=()=>{this.size(this.fitWidth(),false);this.region.scrollTo(0,0);};
    this.dialog.addEventListener('keydown',event=>{
      if(event.key!=='Tab')return;
      const targets=[...this.dialog.querySelectorAll('button:not(:disabled),[tabindex="0"]')].filter(e=>!e.closest('[hidden]'));
      const first=targets[0],last=targets.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    this.dialog.addEventListener('close',()=>{
      document.body.style.overflow=this.previousOverflow||'';
      const p=this.returnPosition;if(p){const input=document.querySelector('#answer');if(p.selection&&input)input.setSelectionRange(...p.selection);document.getElementById(p.id)?.focus({preventScroll:true});window.scrollTo(p.x,p.y);}this.returnPosition=null;
    });
    document.addEventListener('click',event=>{
      const button=event.target.closest('#open-prompt-image,#view-voting-image');
      if(button)this.open(button,button.id==='open-prompt-image'?'image':this.conversation?'text':'image');
    });
  }
  $(selector){return this.dialog.querySelector(selector);}
  remember(){
    if(!this.dialog.open||this.openedKey!==this.key)return;
    if(this.mode==='text')this.memory.text=this.textRegion.scrollTop;
    if(this.mode==='image'&&this.img.naturalWidth)this.memory.image={scale:this.width/this.img.naturalWidth,x:this.region.scrollLeft,y:this.region.scrollTop};
  }
  open(button,mode){
    if(!this.key||this.dialog.open||mode==='text'&&!this.conversation||mode==='image'&&!this.imageAvailable)return;
    const input=document.querySelector('#answer');
    this.returnPosition={id:button.id,x:window.scrollX,y:window.scrollY,selection:input?[input.selectionStart,input.selectionEnd,input.selectionDirection]:null};this.previousOverflow=document.body.style.overflow;this.openedKey=this.key;
    this.dialog.showModal();document.body.style.overflow='hidden';this.show(mode,false);
  }
  show(mode,save=true){
    if(mode==='text'&&!this.conversation||mode==='image'&&!this.imageAvailable)return;
    if(save)this.remember();this.mode=mode;const sequence=++this.sequence;
    const text=mode==='text';this.textRegion.hidden=!text;this.region.hidden=text;this.$('.image-review-tools').hidden=text;this.$('#image-review-help').hidden=text;
    this.$('#image-review-title').textContent=text?'Conversation':'Prompt image';this.$('#conversation-read').setAttribute('aria-pressed',String(text));this.$('#conversation-image').setAttribute('aria-pressed',String(!text));
    if(text){this.textRegion.scrollTop=this.memory.text||0;return;}
    const source=document.querySelector('[data-prompt-image]');if(!source)return;
    this.img.src=source.src;this.img.alt=source.alt;this.$('#image-review-help').textContent='Swipe or scroll to explore. Arrow keys also move the image.';
    this.img.decode().then(()=>{
      if(!this.dialog.open||this.mode!=='image'||sequence!==this.sequence||this.openedKey!==this.key)return;
      if(this.memory.image){this.size(this.img.naturalWidth*this.memory.image.scale,false);this.region.scrollTo(this.memory.image.x,this.memory.image.y);}
      else{const fullHeight=this.region.clientHeight*this.img.naturalWidth/this.img.naturalHeight;this.size(Math.min(this.img.naturalWidth,this.prompt.kind==='comic'?fullHeight:Math.min(fullHeight,this.region.clientWidth*1.45)),false);this.region.scrollTo(0,0);}
    }).catch(()=>{if(sequence===this.sequence)this.$('#image-review-help').textContent='Image could not load. Reconnect or ask the host for help.';});
  }
  fitWidth(){return Math.min(this.region.clientWidth,this.region.clientHeight*this.img.naturalWidth/this.img.naturalHeight);}
  size(width,center=true){
    const r=this.region,old=this.width||width,x=(r.scrollLeft+r.clientWidth/2)/old,y=(r.scrollTop+r.clientHeight/2)/old;
    this.width=Math.max(this.fitWidth(),Math.min(width,this.img.naturalWidth*2));this.img.style.width=`${this.width}px`;
    if(center)r.scrollTo(x*this.width-r.clientWidth/2,y*this.width-r.clientHeight/2);
    this.$('#image-review-out').disabled=this.width<=this.fitWidth()+.5;this.$('#image-review-in').disabled=this.width>=this.img.naturalWidth*2;
  }
  setConversation(value){
    this.textRegion.replaceChildren();if(!value)return;
    const title=document.createElement('h3');title.textContent=value.contact;const list=document.createElement('ol');
    for(const message of value.messages){const item=document.createElement('li'),label=document.createElement('b'),body=document.createElement('p');label.textContent=message.direction==='IN'?value.contact:'You';body.textContent=message.text;body.dir='auto';item.dataset.direction=message.direction;item.append(label,body);list.append(item);}
    this.textRegion.append(title,list);
  }
  sync(phase,remaining,connected,{kind,prompt}={}){
    if(!this.enabled)return;
    const allowed=['write','royale-write','royale'].includes(kind),source=allowed?document.querySelector('[data-prompt-image]'):null;
    const imageAvailable=!!(source&&!source.hidden),conversation=allowed&&prompt?.kind==='messaging'?prompt.conversation:null;
    const next=allowed&&prompt&&(imageAvailable||conversation)?`${phase}|${prompt.id}|${prompt.imageUrl||''}`:null;
    if(this.key!==next){
      this.key=next;this.memory={};this.mode=null;this.sequence++;this.conversationSignature=undefined;this.textRegion.replaceChildren();this.img.removeAttribute('src');
      if(this.dialog.open){this.returnPosition=null;this.dialog.close();document.querySelector('#app').focus({preventScroll:true});}
    }
    const signature=JSON.stringify(conversation);
    if(signature!==this.conversationSignature){this.memory.text=0;this.setConversation(conversation);this.conversationSignature=signature;}
    this.prompt=prompt;this.conversation=conversation;this.imageAvailable=imageAvailable;
    this.$('#conversation-read').hidden=!conversation;this.$('#conversation-image').hidden=!imageAvailable;this.$('#prompt-view-switch').hidden=!conversation;
    if(this.dialog.open&&this.mode==='text'&&!conversation){if(imageAvailable)this.show('image',false);else this.dialog.close();}
    this.$('#image-review-close').textContent=kind==='royale'?'Back to votes':'Back to answer';
    this.bar.hidden=!next;document.body.classList.toggle('has-image-access',!!next);this.bar.querySelector('button').textContent=conversation?'Read conversation':'View image';
    const time=remaining===null?'Waiting':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;
    this.$('#image-review-timer').textContent=time;this.bar.querySelector('#image-access-timer').textContent=time;
    this.bar.querySelector('#image-access-tokens').textContent=kind==='royale'?(document.querySelector('#token-summary')?.textContent||''):'Your answer';
    const notice=this.$('#image-review-connection');notice.hidden=connected;notice.textContent=connected?'':'Connection lost. Time continues in the room.';
  }
}
