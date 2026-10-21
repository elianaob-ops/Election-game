import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {JSDOM}=await import(process.env.BALLOT_JSDOM_MODULE||'jsdom');

test('name registration, clickable party art, 1–120 picker, totals, saving and recovery',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ballot-ui-'));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3201',DB_PATH:join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe']});
 const windows=[];
 const base='http://localhost:3201';
 const html=readFileSync('public/index.html','utf8'),script=readFileSync('public/app.js','utf8');
 const until=async fn=>{const end=Date.now()+5000;while(!fn()){if(Date.now()>end)throw Error('UI condition timed out');await new Promise(r=>setTimeout(r,10));}};
 const page=(path='/',saved={})=>{
  const dom=new JSDOM(html,{url:base+path,runScripts:'outside-only'});const w=dom.window;windows.push(w);
  w.fetch=(url,options)=>fetch(new URL(url,base),options);w.scrollTo=()=>{};w.setInterval=()=>0;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  for(const [key,value] of Object.entries(saved))w.localStorage.setItem(key,value);
  w.eval(script);return w;
 };
 const submit=(w,form,button)=>form.dispatchEvent(new w.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button||form.querySelector('button.primary')}));
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('Server exited')));});
  const w=page(),d=w.document;
  await until(()=>d.querySelector('#register'));
  assert.equal(d.querySelectorAll('[data-party]').length,0);
  d.querySelector('#player-name').value='שירה';submit(w,d.querySelector('#register'));
  await until(()=>d.querySelectorAll('[data-party]').length===14);
  const labels=[...d.querySelectorAll('.party-name')].map(e=>e.textContent);
  assert.ok(labels.includes('רע״ם'));assert.ok(labels.includes('הציבור החרדי'));assert.ok(labels.includes('הציונות הדתית'));
  assert.equal(labels.some(name=>/סגלוביץ|עבאס|לייטנר|נחומי/.test(name)),false);
  d.querySelector('[data-party="0"]').click();
  const choice=d.querySelector('#seat-choice');assert.equal(choice.options.length,120);assert.equal(choice.options[0].value,'1');assert.equal(choice.options[119].value,'120');
  choice.value='120';submit(w,d.querySelector('#seat-form'),d.querySelector('#confirm-seat'));
  assert.equal(d.querySelector('#sum').textContent,'120 / 120');assert.equal(d.querySelector('#submit-guesses').disabled,false);
  d.querySelector('[data-party="1"]').click();d.querySelector('#seat-choice').value='1';submit(w,d.querySelector('#seat-form'),d.querySelector('#confirm-seat'));
  assert.equal(d.querySelector('#sum').textContent,'121 / 120');assert.equal(d.querySelector('#submit-guesses').disabled,true);
  d.querySelector('[data-party="1"]').click();d.querySelector('#remove-seat').click();
  assert.equal(d.querySelector('#sum').textContent,'120 / 120');
  d.querySelector('#submit-guesses').click();
  await until(()=>d.querySelector('#message').textContent.includes('נשמר בהצלחה')&&!d.querySelector('#submit-guesses').disabled);
  const id=new URL(w.location.href).searchParams.get('game');
  let g=await (await fetch(base+'/api/games/'+id)).json();assert.equal(g.count,1);
  const profile=JSON.parse(w.localStorage.getItem('ballot-player'));
  const saved={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);saved[k]=w.localStorage.getItem(k);}
  const restored=page('/?game='+id,saved),rd=restored.document;
  await until(()=>rd.querySelector('#register'));assert.equal(rd.querySelector('#player-name').value,'שירה');
  submit(restored,rd.querySelector('#register'));await until(()=>rd.querySelectorAll('[data-party]').length===14);
  assert.equal(rd.querySelector('#sum').textContent,'120 / 120');
  rd.querySelector('[data-party="0"]').click();rd.querySelector('#seat-choice').value='119';submit(restored,rd.querySelector('#seat-form'),rd.querySelector('#confirm-seat'));
  rd.querySelector('[data-party="2"]').click();rd.querySelector('#seat-choice').value='1';submit(restored,rd.querySelector('#seat-form'),rd.querySelector('#confirm-seat'));
  rd.querySelector('#edit-name').click();rd.querySelector('#player-name').value='שירה כהן';submit(restored,rd.querySelector('#register'));
  await until(()=>rd.querySelectorAll('[data-party]').length===14);
  assert.equal(rd.querySelector('#sum').textContent,'120 / 120');
  assert.ok(rd.querySelector('[data-party="0"]').textContent.includes('119'));
  rd.querySelector('#submit-guesses').click();await until(()=>rd.querySelector('#message').textContent.includes('נשמר בהצלחה'));
  g=await (await fetch(base+'/api/games/'+id)).json();assert.equal(g.count,1);assert.equal(g.leaderboard[0].name,'שירה כהן');
  const mine=await (await fetch(base+'/api/games/'+id+'/my-guess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:profile.token})})).json();
  assert.equal(mine.seats[0],119);assert.equal(mine.seats[2],1);
 }finally{
  for(const w of windows)w.close();
  if(child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
  rmSync(dir,{recursive:true,force:true});
 }
});
