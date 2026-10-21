// Keep native editing nodes alive across room snapshots. Replacing a focused
// textarea interrupts mobile keyboard repeat, selection and IME composition.
const key=node=>node.nodeType===1?`${node.tagName}:${node.id||node.dataset.editKey||node.dataset.form||node.dataset.prompt||node.dataset.character||''}`:`#${node.nodeType}`;
export function patchView(root,html){
 const template=document.createElement('template');template.innerHTML=html;
 const patch=(old,next)=>{
  if(old.nodeType!==1){if(old.nodeValue!==next.nodeValue)old.nodeValue=next.nodeValue;return;}
  const editing=old.matches('textarea,input')&&document.activeElement===old;
  for(const attr of [...old.attributes])if(!next.hasAttribute(attr.name)&&!(editing&&attr.name==='value'))old.removeAttribute(attr.name);
  for(const attr of next.attributes)if(!(editing&&attr.name==='value')&&old.getAttribute(attr.name)!==attr.value)old.setAttribute(attr.name,attr.value);
  if(old.tagName==='TEXTAREA')return;
  if(old.tagName==='INPUT'){if(!editing&&old.value!==next.value)old.value=next.value;return;}
  children(old,next);
 };
 const children=(parent,next)=>{
  let cursor=parent.firstChild;
  for(const desired of [...next.childNodes]){
   let match=cursor;
   while(match&&key(match)!==key(desired))match=match.nextSibling;
   if(!match){match=desired.cloneNode(true);parent.insertBefore(match,cursor);}
   else{if(match!==cursor)parent.insertBefore(match,cursor);patch(match,desired);}
   cursor=match.nextSibling;
  }
  while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
 };
 children(root,template.content);
}
