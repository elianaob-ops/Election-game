'use strict';
const $=s=>document.querySelector(s);
const app=$('#app'),dialog=$('#seat-dialog');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={catalog:[],game:null,id:new URLSearchParams(location.search).get('game'),secret:new URLSearchParams(location.hash.slice(1)).get('admin'),player:null,stage:'register',tab:'guess',seats:[],results:[],mine:null,busy:false,dirty:false,activeIndex:null};
function read(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}}
function tell(message,bad=false){$('#message').textContent=message;$('#message').className=bad?'error':'';}
async function api(path,body){const r=await fetch('/api/'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok){const e=Error(data.error||'לא ניתן להשלים את הבקשה');e.status=r.status;throw e;}return data;}
const normalize=s=>String(s).replace(/[\s"'״׳־–-]/g,'').toLowerCase();
function artwork(index){const g=state.game;return state.catalog.find(p=>p.id===g.cards?.[index])||state.catalog.find(p=>[p.name,...p.aliases].some(n=>normalize(n)===normalize(g.parties[index])));}
function artStyle(c){return c?`background-image:url('/assets/${c.image}');background-size:${c.size};background-position:${c.x}% ${c.y}%`:'';}
function portrait(c,name,extra=''){return `<div class="portrait ${c?'':'fallback-card'} ${extra}" role="img" aria-label="${esc('איור של '+name)}" style="${artStyle(c)}">${c?'':'✓'}</div>`;}
function steps(current){return `<div class="steps" aria-label="שלבי המשחק"><span class="step ${current===1?'current':''}" ${current===1?'aria-current="step"':''}>01 · הרשמה</span><span class="step ${current===2?'current':''}" ${current===2?'aria-current="step"':''}>02 · בחירת מנדטים</span></div>`;}
function locked(){return !!state.game.results||Date.now()>=state.game.deadline;}
function renderRegistration(){
 state.stage='register';
 const profile=state.player||read('ballot-player');
 app.innerHTML=`<div class="welcome"><section class="welcome-copy">${steps(1)}<div class="eyebrow">משחק הבחירות של החבר׳ה</div><h1>120 מנדטים.\nמי יפגע בול?</h1><p>החבורה כבר בחליפות. עכשיו תורכם לחלק את המנדטים ולנחש איך תיראה הכנסת הבאה.</p><form id="register" class="signup"><h2>נכנסים לקלפי</h2><label for="player-name">איך קוראים לכם?</label><input id="player-name" name="name" autocomplete="name" minlength="2" maxlength="40" required placeholder="השם שלכם" value="${esc(profile?.name||'')}"><p class="muted">הרשמה קצרה בשם בלבד. השם יופיע בטבלת הדירוג של התחרות.</p><button class="primary">ממשיכים לבחירת המנדטים ←</button><p class="trustline">נקודות בלבד · בלי כסף · אפשר לעדכן עד הנעילה</p></form><div class="welcome-stats"><div><strong>120</strong><span>מנדטים לחלוקה</span></div><div><strong>${state.game.parties.length}</strong><span>מפלגות על הלוח</span></div><div><strong>1</strong><span>ניחוש שינצח</span></div></div></section><div class="hero-art" role="img" aria-label="הדמויות המצוירות של משחק הבחירות"></div></div>`;
 $('#register').onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  try{
   state.player=await api('players',{name:$('#player-name').value,token:state.player?.token||profile?.token});
   const saved=write('ballot-player',state.player);
   state.mine=read('guess-'+state.id);
   const token=state.mine?.token||state.player.token;
   try{const mine=await api('games/'+state.id+'/my-guess',{token});state.mine={...mine,token};}catch(err){if(err.status!==404)throw err;}
   if(!validArray(state.seats))state.seats=validArray(state.mine?.seats)?[...state.mine.seats]:state.game.parties.map(()=>0);
   state.results=state.game.results?[...state.game.results]:state.game.parties.map(()=>0);
   if(state.mine&&state.mine.name!==state.player.name)state.dirty=true;
   tell(saved?'':'ההרשמה הצליחה. הדפדפן אינו מאפשר לשמור את הזיהוי לעדכון בביקור הבא.');
   state.stage='play';renderPlay();window.scrollTo(0,0);
  }catch(err){tell(err.message,true);button.disabled=false;}
 };
}
function validArray(a){return Array.isArray(a)&&a.length===state.game.parties.length&&a.every(n=>Number.isInteger(n)&&n>=0&&n<=120);}
function heading(title,subtitle){return `<div class="page-heading"><div><div class="eyebrow">${esc(state.game?.title||'בול בקלפי')}</div><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${state.player?`<div class="user-pill">שלום, ${esc(state.player.name)} <button class="text-button edit-name" id="edit-name">שינוי שם</button></div>`:''}</div>`;}
function links(){
 if(!state.secret)return '';
 const share=location.origin+'/?game='+state.id;
 return `<section class="links"><h2>מזמינים את החבר׳ה</h2><div class="copy-row"><input id="share" readonly aria-label="קישור להשתתפות" value="${esc(share)}"><button class="secondary" id="copy-share">העתקת הקישור</button></div><details><summary>קישור הניהול הפרטי שלכם</summary><input readonly aria-label="קישור ניהול" value="${esc(share+'#admin='+state.secret)}"><p class="muted">שמרו את הקישור הזה אצלכם. הוא מאפשר פרסום ותיקון תוצאות.</p></details></section>`;
}
function renderPlay(){
 state.stage='play';
 const admin=state.tab==='admin',closed=locked();
 const values=admin?state.results:state.seats;
 app.innerHTML=steps(2)+heading(state.tab==='board'?'מי יפגע הכי קרוב?':admin?'התוצאות האמיתיות':'אז איך תיראה הכנסת?','לוחצים על הדמויות ובוחרים מספר מנדטים לכל מפלגה.')+links()+`<div class="toolbar"><div class="tabs"><button data-tab="guess" class="${state.tab==='guess'?'active':''}">הניחוש שלי</button><button data-tab="board" class="${state.tab==='board'?'active':''}">טבלת דירוג</button>${state.secret?`<button data-tab="admin" class="${admin?'active':''}">הזנת תוצאות</button>`:''}</div><p class="muted"><span id="count">${state.game.count}</span> משתתפים · נעילה: ${esc(new Date(state.game.deadline).toLocaleString('he-IL'))}</p></div><div id="play-content"></div>`;
 $('#edit-name').onclick=renderRegistration;
 document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;renderPlay();});
 if($('#copy-share'))$('#copy-share').onclick=async()=>{try{await navigator.clipboard.writeText($('#share').value);tell('הקישור הועתק');}catch{$('#share').select();tell('אפשר להעתיק את הקישור המסומן');}};
 const content=$('#play-content');
 if(state.tab==='board')return renderBoard(content);
 const editable=admin?Date.now()>=state.game.deadline:!closed;
 const note=admin?(editable?'הזינו תוצאות סופיות. הסכום הכולל חייב להיות 120.':'ניתן להזין תוצאות אחרי מועד נעילת הניחושים.'):closed?'הניחושים נעולים. אפשר לצפות בניחוש ובטבלת הדירוג.':state.dirty?'יש בחירות שעדיין לא נשמרו. בסיום החלוקה לחצו על שמירת הניחוש.':state.mine?'הניחוש שלכם שמור. אפשר לשנות ולשמור מחדש עד הנעילה.':'בחרו בין 1 ל־120 מנדטים למפלגה. מפלגה שלא נבחרה תישאר עם 0.';
 content.innerHTML=`<p class="notice">${esc(note)}</p><div class="party-grid">${state.game.parties.map((name,i)=>`<button class="party-card ${values[i]?'selected':''}" data-party="${i}" ${!editable||state.busy?'disabled':''} aria-label="${esc(name)}: ${values[i]} מנדטים, לחצו לבחירה" aria-haspopup="dialog">${portrait(artwork(i),name)}<span class="party-name">${esc(name)}</span><span class="party-value">${values[i]?`<strong>${values[i]}</strong>מנדטים`:'לחצו לבחירת מנדטים'}</span></button>`).join('')}</div><section class="allocation-bar" aria-label="סיכום המנדטים"><div><strong id="sum"></strong><p>מתוך 120 מנדטים</p><div class="progress"><span id="progress"></span></div></div><span class="hint" id="allocation-hint" aria-live="polite"></span><button id="submit-guesses" class="primary">${state.busy?'שומרים…':admin?'פרסום תוצאות':'שמירת הניחוש שלי ←'}</button></section>`;
 document.querySelectorAll('[data-party]').forEach(b=>b.onclick=()=>openPicker(Number(b.dataset.party)));
 $('#submit-guesses').onclick=submit;
 updateTotal();
}
function renderBoard(content){
 const g=state.game;
 content.innerHTML=`<section class="panel"><h2>${g.results?'התוצאות על הלוח 🏆':'מי כבר נכנס לקלפי?'}</h2><p class="muted">${g.results?'יותר נקודות = ניחוש קרוב יותר. ניחוש מושלם מקבל 120 נקודות.':'הניקוד יופיע לאחר שמנהל התחרות יפרסם את התוצאות.'}</p>${g.count?g.leaderboard.map(r=>`<div class="board-row"><span>${g.results?g.leaderboard.findIndex(x=>x.score===r.score)+1+'. ':''}${esc(r.name)}</span><strong>${r.score===null?'ממתין לתוצאות':r.score+' נק׳'}</strong></div>`).join(''):'<div class="empty">היו הראשונים לשמור ניחוש</div>'}</section>`;
}
function updateTotal(){
 const admin=state.tab==='admin',values=admin?state.results:state.seats;
 const sum=values.reduce((a,b)=>a+b,0);
 $('#sum').textContent=sum+' / 120';$('#progress').style.width=Math.min(100,sum/120*100)+'%';
 $('.allocation-bar').classList.toggle('over',sum>120);
 $('#allocation-hint').textContent=sum<120?'נשארו '+(120-sum)+' מנדטים לחלוקה':sum>120?'יש להוריד '+(sum-120)+' מנדטים':'כל המנדטים חולקו ✓';
 $('#submit-guesses').disabled=state.busy||sum!==120||(admin?Date.now()<state.game.deadline:locked());
}
function openPicker(index){
 const admin=state.tab==='admin';if(state.busy||(admin?Date.now()<state.game.deadline:locked()))return;
 state.activeIndex=index;const values=admin?state.results:state.seats,name=state.game.parties[index],c=artwork(index);
 $('#dialog-title').textContent=name;$('#dialog-portrait').setAttribute('style',artStyle(c));$('#dialog-portrait').setAttribute('aria-label','איור של '+name);$('#dialog-portrait').textContent=c?'':'✓';
 $('#seat-choice').innerHTML=Array.from({length:120},(_,i)=>`<option value="${i+1}">${i+1} מנדטים</option>`).join('');
 $('#seat-choice').value=String(values[index]||1);
 const other=values.reduce((a,b)=>a+b,0)-values[index];
 $('#dialog-hint').textContent='לשאר המפלגות חולקו '+other+' מנדטים. אפשר להסיר בחירה כדי להשאיר מפלגה עם 0.';
 $('#remove-seat').hidden=!values[index];
 dialog.showModal();$('#seat-choice').focus();
}
function chooseSeat(value){
 const admin=state.tab==='admin';if(state.activeIndex===null||(admin?Date.now()<state.game.deadline:locked())){dialog.close();return;}
 if(!Number.isInteger(value)||value<0||value>120)return;
 const values=admin?state.results:state.seats;values[state.activeIndex]=value;if(!admin)state.dirty=true;
 dialog.close();renderPlay();document.querySelector(`[data-party="${state.activeIndex}"]`)?.focus();
}
$('#close-dialog').onclick=()=>dialog.close();
$('#seat-form').onsubmit=e=>{e.preventDefault();const n=Number($('#seat-choice').value);if(n>=1&&n<=120)chooseSeat(n);};
$('#remove-seat').onclick=()=>chooseSeat(0);
dialog.addEventListener('click',e=>{if(e.target===dialog){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
async function submit(){
 const admin=state.tab==='admin',values=admin?state.results:state.seats;
 if(state.busy||values.reduce((a,b)=>a+b,0)!==120)return;
 state.busy=true;renderPlay();
 try{
  if(admin){await api('games/'+state.id+'/results',{secret:state.secret,seats:values});state.tab='board';tell('התוצאות פורסמו והדירוג עודכן');}
  else{
   const r=await api('games/'+state.id+'/guess',{name:state.player.name,seats:values,token:state.mine?.token||state.player.token});
   state.mine={name:state.player.name,seats:[...values],token:r.token};
   write('guess-'+state.id,state.mine);state.dirty=false;tell('הניחוש נשמר בהצלחה! אפשר לעדכן עד הנעילה.');
  }
  state.game=await api('games/'+state.id);
 }catch(e){tell(e.message,true);}
 finally{state.busy=false;renderPlay();}
}
function renderGallery(){
 app.innerHTML=`<div class="page-heading"><div><div class="eyebrow">החבורה של הקלפי</div><h1>כל מפלגה, והאופי שלה.</h1><p>הכירו את הדמויות. כדי לנחש כמה מנדטים כל מפלגה תקבל, נכנסים למשחק.</p></div><a class="button" href="/">הרשמה למשחק ←</a></div><div class="party-grid">${state.catalog.map(c=>`<figure class="gallery-card">${portrait(c,c.name)}<figcaption>${esc(c.name)}</figcaption></figure>`).join('')}</div><p class="muted" style="margin-top:25px">האיורים סאטיריים ונוצרו באמצעות בינה מלאכותית.</p>`;
}
function renderManage(){
 app.innerHTML=`<section class="manage-heading"><div class="eyebrow">מסך המנהל</div><h1>פותחים תחרות משלכם.</h1><p>מגדירים את המפלגות ואת מועד הנעילה, ומשתפים קישור שמתחיל בהרשמה ובבחירת מנדטים.</p></section><form id="create" class="panel"><label for="title">שם התחרות</label><input id="title" maxlength="100" required placeholder="הקלפי של החבר׳ה"><label for="deadline">מתי נועלים את הניחושים?</label><input id="deadline" type="datetime-local" required><p class="inline-heading">המפלגות בתחרות</p><p class="muted">אפשר לשנות את שם המפלגה שמופיע על הכרטיס, או להסיר אותה מהתחרות.</p><div class="manage-grid">${state.catalog.map(c=>`<div class="manage-party"><input type="checkbox" checked data-enabled="${c.id}" aria-label="הכללת ${esc(c.name)}">${portrait(c,c.name,'manage-portrait')}<input type="text" maxlength="60" required data-label="${c.id}" aria-label="שם המפלגה עבור ${esc(c.name)}" value="${esc(c.name)}"></div>`).join('')}</div><label for="extra">מפלגות נוספות, אם צריך — אחת בכל שורה</label><textarea id="extra" placeholder="שם מפלגה נוספת"></textarea><button class="primary">יצירת התחרות וקישור ההשתתפות ←</button></form>`;
 const d=new Date(Date.now()+7*86400000);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());$('#deadline').value=d.toISOString().slice(0,16);
 document.querySelectorAll('[data-enabled]').forEach(box=>box.onchange=()=>{document.querySelector(`[data-label="${box.dataset.enabled}"]`).disabled=!box.checked;});
 $('#create').onsubmit=async e=>{
  e.preventDefault();const button=e.submitter;button.disabled=true;
  const chosen=state.catalog.filter(c=>document.querySelector(`[data-enabled="${c.id}"]`).checked);
  const extra=$('#extra').value.split('\n').map(x=>x.trim()).filter(Boolean);
  try{
   const g=await api('games',{title:$('#title').value,deadline:new Date($('#deadline').value).toISOString(),parties:[...chosen.map(c=>document.querySelector(`[data-label="${c.id}"]`).value.trim()),...extra],cards:[...chosen.map(c=>c.id),...extra.map(()=>null)]});
   location.href='/?game='+g.id+'#admin='+g.secret;
  }catch(e){tell(e.message,true);button.disabled=false;}
 };
}
async function refresh(){
 if(!state.id||state.busy)return;
 try{const wasLocked=locked();state.game=await api('games/'+state.id);if(state.stage!=='play')return;if($('#count'))$('#count').textContent=state.game.count;if(state.tab==='board'||(!wasLocked&&locked())){if(dialog.open)dialog.close();renderPlay();}else if($('#submit-guesses'))updateTotal();}catch{}
}
async function init(){
 try{
  const r=await fetch('/parties.json');if(!r.ok)throw Error('לא ניתן לטעון את המפלגות');state.catalog=await r.json();
  if(location.pathname==='/characters')return renderGallery();
  if(location.pathname==='/manage')return renderManage();
  if(!state.id){const lobby=await api('lobby');state.id=lobby.id;history.replaceState(null,'','/?game='+state.id+location.hash);}
  state.game=await api('games/'+state.id);state.player=read('ballot-player');
  renderRegistration();setInterval(refresh,15000);
 }catch(e){app.innerHTML=`<section class="panel"><h2>לא הצלחנו לפתוח את הקלפי</h2><p>${esc(e.message)}</p><a class="button" href="/">חזרה לעמוד הראשי</a></section>`;}
}
init();
