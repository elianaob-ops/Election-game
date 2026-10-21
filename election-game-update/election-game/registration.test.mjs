import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('registration, illustrated lobby, private guess recovery and persisted identity',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ballot-registration-'));
 let child;
 const start=async()=>{
  child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3200',DB_PATH:join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('Server exited before readiness')));});
 };
 const stop=async()=>{if(child&&child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill();await done;}};
 const call=async(path,body)=>{
  const r=await fetch('http://localhost:3200/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  return {status:r.status,data:await r.json()};
 };
 try{
  await start();
  const {data:lobby}=await call('lobby');
  const g=(await call('games/'+lobby.id)).data;
  assert.equal(g.parties.length,14);assert.equal(g.cards.filter(x=>x==='raam').length,1);
  assert.ok(g.parties.includes('הציבור החרדי'));assert.ok(g.parties.includes('ביחד'));assert.ok(g.parties.includes('הציונות הדתית'));
  assert.equal(g.parties.some(p=>p.includes('סגלוביץ')),false);
  assert.equal((await call('players',{name:' '})).status,400);
  const registered=await call('players',{name:'  נועה  '});
  assert.equal(registered.status,201);assert.equal(registered.data.name,'נועה');assert.match(registered.data.token,/^[a-f0-9]{48}$/);
  const renamed=await call('players',{name:'נועה כהן',token:registered.data.token});
  assert.equal(renamed.status,200);assert.equal(renamed.data.token,registered.data.token);
  const seats=g.parties.map(()=>0);seats[0]=120;
  const path='games/'+lobby.id;
  assert.equal((await call(path+'/guess',{name:renamed.data.name,token:renamed.data.token,seats:g.parties.map(()=>0)})).status,400);
  assert.equal((await call(path+'/guess',{name:renamed.data.name,token:renamed.data.token,seats})).status,200);
  const mine=await call(path+'/my-guess',{token:renamed.data.token});assert.deepEqual(mine.data.seats,seats);
  assert.equal((await call(path+'/my-guess',{token:'0'.repeat(48)})).status,404);
  const publicGame=(await call(path)).data;
  assert.equal(publicGame.count,1);assert.deepEqual(Object.keys(publicGame.leaderboard[0]).sort(),['name','score']);assert.equal(publicGame.secret,undefined);
  const custom=await call('games',{title:'תחרות פרטית',parties:['שם חדש לכרטיס','מפלגה נוספת'],cards:['raam',null],deadline:new Date(Date.now()+60000)});
  assert.equal(custom.status,201);
  const customGame=(await call('games/'+custom.data.id)).data;
  assert.deepEqual(customGame.cards,['raam',null]);assert.equal(customGame.parties[0],'שם חדש לכרטיס');
  assert.equal((await call('games',{title:'שגיאה',parties:['א','ב'],cards:['unknown',null],deadline:new Date(Date.now()+60000)})).status,400);
  await stop();await start();
  assert.equal((await call('lobby')).data.id,lobby.id);
  assert.equal((await call('players',{name:'נועה כהן',token:renamed.data.token})).status,200);
  assert.deepEqual((await call(path+'/my-guess',{token:renamed.data.token})).data.seats,seats);
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
