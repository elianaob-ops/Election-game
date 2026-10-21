import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('competition lifecycle, privacy, validation, locking and scoring',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mandates-'));
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3199',DB_PATH:join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe']});
 try{
 await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',()=>reject(Error('server exited')));});
 const call=async(path,body)=>{const r=await fetch('http://localhost:3199/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
 assert.equal((await call('games',{title:'x',parties:['a','a'],deadline:new Date(Date.now()+60000)})).status,400);
 const {data:g,status}=await call('games',{title:'בחירות',parties:['א','ב'],deadline:new Date(Date.now()+2200)});assert.equal(status,201);
 const path='games/'+g.id;
 assert.equal((await call(path+'/guess',{name:'דן',seats:[60,59]})).status,400);
 assert.equal((await call(path+'/guess',{name:'דן',seats:[60.5,59.5]})).status,400);
 const first=await call(path+'/guess',{name:'דן',seats:[60,60]});assert.equal(first.status,200);
 await call(path+'/guess',{name:'דן',seats:[70,50],token:first.data.token});
 await call(path+'/guess',{name:'נועה',seats:[60,60]});
 const publicGame=(await call(path)).data;assert.equal(publicGame.count,2);assert.equal(publicGame.secret,undefined);assert.equal(publicGame.leaderboard[0].seats,undefined);
 assert.equal((await call(path+'/results',{secret:'wrong',seats:[70,50]})).status,403);
 assert.equal((await call(path+'/results',{secret:g.secret,seats:[70,50]})).status,409);
 await new Promise(r=>setTimeout(r,2250));
 assert.equal((await call(path+'/guess',{name:'late',seats:[60,60]})).status,409);
 assert.equal((await call(path+'/results',{secret:g.secret,seats:[70,50]})).status,200);
 const final=(await call(path)).data;assert.deepEqual(final.leaderboard.map(r=>r.score),[120,110]);
 assert.equal((await fetch('http://localhost:3199/')).status,200);
 for(const file of ['characters-1.png','characters-2.png','characters-3.png','character-pairs.png','raam-pair.png','haredi-pair.png']){
 const image=await fetch('http://localhost:3199/assets/'+file);
 assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
 assert.deepEqual([...new Uint8Array(await image.arrayBuffer()).slice(0,8)],[137,80,78,71,13,10,26,10]);
 }
 assert.equal((await fetch('http://localhost:3199/characters')).status,200);
 for(const [path,type] of [['/app.js','text/javascript'],['/style.css','text/css'],['/parties.json','application/json']]){
  const response=await fetch('http://localhost:3199'+path);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').includes(type));
 }
 }finally{if(child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}rmSync(dir,{recursive:true,force:true});}
});
