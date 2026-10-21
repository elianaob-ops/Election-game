import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
const db = new DatabaseSync(process.env.DB_PATH || 'game.sqlite');
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, secret TEXT, title TEXT, parties TEXT, deadline INTEGER, results TEXT); CREATE TABLE IF NOT EXISTS guesses(game TEXT, token TEXT, name TEXT, seats TEXT, created INTEGER, PRIMARY KEY(game,token));`);
const key=()=>randomBytes(24).toString('hex');
db.exec('CREATE TABLE IF NOT EXISTS players(token TEXT PRIMARY KEY,name TEXT NOT NULL,created INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS game_cards(game TEXT PRIMARY KEY,cards TEXT NOT NULL); CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);');
const catalog=JSON.parse(readFileSync(new URL('./public/parties.json',import.meta.url)));
const normalize=s=>s.replace(/[\s"\u0027״׳־–-]/g,'').toLowerCase();
const cardFor=name=>catalog.find(p=>[p.name,...p.aliases].some(n=>normalize(n)===normalize(name)))?.id||null;
const isToken=t=>typeof t==='string'&&/^[a-f0-9]{48}$/.test(t);
let lobbyId=db.prepare('SELECT value FROM app_settings WHERE key=?').get('lobby')?.value;
if(!lobbyId){lobbyId=key();db.prepare('INSERT INTO games VALUES(?,?,?,?,?,NULL)').run(lobbyId,key(),'הקלפי של בול בקלפי',JSON.stringify(catalog.map(p=>p.name)),Date.now()+7*86400000);db.prepare('INSERT INTO game_cards VALUES(?,?)').run(lobbyId,JSON.stringify(catalog.map(p=>p.id)));db.prepare('INSERT INTO app_settings VALUES(?,?)').run('lobby',lobbyId);}
export function validSeats(a,n){return Array.isArray(a)&&a.length===n&&a.every(x=>Number.isInteger(x)&&x>=0&&x<=120)&&a.reduce((s,x)=>s+x,0)===120;}
export function score(a,b){return 120-a.reduce((s,x,i)=>s+Math.abs(x-b[i]),0)/2;}
const page=readFileSync(new URL('./public/index.html',import.meta.url));
const server=http.createServer(async(req,res)=>{
 const reply=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 try{
 const url=new URL(req.url,'http://localhost');
 const asset=url.pathname.match(/^\/assets\/((?:characters-[123]|character-pairs|raam-pair|haredi-pair)\.png)$/);
 if(asset&&req.method==='GET'){res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'});return res.end(readFileSync(new URL('./public/assets/'+asset[1],import.meta.url)));}
 if(url.pathname==='/api/health'&&req.method==='GET')return reply(200,{ok:true});
 if(url.pathname==='/api/lobby'&&req.method==='GET')return reply(200,{id:lobbyId});
 const staticFiles={'/app.js':'text/javascript; charset=utf-8','/style.css':'text/css; charset=utf-8','/parties.json':'application/json; charset=utf-8'};
 if(Object.hasOwn(staticFiles,url.pathname)&&req.method==='GET'){const data=readFileSync(new URL('./public'+url.pathname,import.meta.url));res.writeHead(200,{'Content-Type':staticFiles[url.pathname],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});return res.end(data);}
 if(!url.pathname.startsWith('/api/')){if(req.method!=='GET')return reply(405,{});res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});return res.end(page);}
 let body={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16000)return reply(413,{error:'הבקשה גדולה מדי'});}body=JSON.parse(raw);}
 if(url.pathname==='/api/players'&&req.method==='POST'){
 const name=typeof body.name==='string'?body.name.trim():'';
 if(name.length<2||name.length>40)return reply(400,{error:'יש להזין שם באורך 2 עד 40 תווים'});
 const existing=isToken(body.token)&&db.prepare('SELECT token FROM players WHERE token=?').get(body.token);
 const token=existing?body.token:key();db.prepare('INSERT INTO players VALUES(?,?,?) ON CONFLICT(token) DO UPDATE SET name=excluded.name').run(token,name,Date.now());return reply(existing?200:201,{token,name});
 }
 if(url.pathname==='/api/games'&&req.method==='POST'){
 const {title,parties,deadline}=body;const end=Date.parse(deadline);
 if(typeof title!=='string'||!title.trim()||title.length>100||!Array.isArray(parties)||parties.length<2||parties.length>40||parties.some(p=>typeof p!=='string'||!p.trim()||p.length>60)||new Set(parties.map(p=>p.trim())).size!==parties.length||!Number.isFinite(end)||end<=Date.now())return reply(400,{error:'יש להזין שם תחרות, לפחות שתי מפלגות שונות ומועד נעילה עתידי'});
 const cards=body.cards??parties.map(cardFor);if(!Array.isArray(cards)||cards.length!==parties.length||cards.some(c=>c!==null&&!catalog.some(p=>p.id===c)))return reply(400,{error:'איורי המפלגות אינם תקינים'});
 const id=key(),secret=key();db.prepare('INSERT INTO games VALUES(?,?,?,?,?,NULL)').run(id,secret,title.trim(),JSON.stringify(parties.map(p=>p.trim())),end);db.prepare('INSERT INTO game_cards VALUES(?,?)').run(id,JSON.stringify(cards));return reply(201,{id,secret});
 }
 const match=url.pathname.match(/^\/api\/games\/([a-f0-9]{48})(?:\/(guess|results|my-guess))?$/);if(!match)return reply(404,{error:'לא נמצא'});
 const game=db.prepare('SELECT * FROM games WHERE id=?').get(match[1]);if(!game)return reply(404,{error:'התחרות לא נמצאה'});
 const parties=JSON.parse(game.parties),results=game.results?JSON.parse(game.results):null;
 if(req.method==='GET'&&!match[2]){
 const rows=db.prepare('SELECT name,seats,created FROM guesses WHERE game=? ORDER BY created').all(game.id);
 const leaderboard=rows.map(r=>({name:r.name,score:results?score(JSON.parse(r.seats),results):null}));if(results)leaderboard.sort((a,b)=>b.score-a.score);
 const savedCards=db.prepare('SELECT cards FROM game_cards WHERE game=?').get(game.id);
 return reply(200,{id:game.id,title:game.title,parties,cards:savedCards?JSON.parse(savedCards.cards):parties.map(cardFor),deadline:game.deadline,results,count:rows.length,leaderboard});
 }
 if(req.method==='POST'&&match[2]==='my-guess'){
 if(!isToken(body.token))return reply(400,{error:'מזהה השתתפות לא תקין'});
 const mine=db.prepare('SELECT name,seats FROM guesses WHERE game=? AND token=?').get(game.id,body.token);
 return mine?reply(200,{name:mine.name,seats:JSON.parse(mine.seats)}):reply(404,{error:'עדיין לא נשמר ניחוש'});
 }
 if(req.method==='POST'&&match[2]==='guess'){
 if(Date.now()>=game.deadline||results)return reply(409,{error:'התחרות נעולה לניחושים'});
 if(typeof body.name!=='string'||!body.name.trim()||body.name.length>40||!validSeats(body.seats,parties.length))return reply(400,{error:'יש להזין שם ומנדטים שלמים שסכומם 120'});
 const token=typeof body.token==='string'&&/^[a-f0-9]{48}$/.test(body.token)?body.token:key();
 db.prepare('INSERT INTO guesses VALUES(?,?,?,?,?) ON CONFLICT(game,token) DO UPDATE SET name=excluded.name,seats=excluded.seats').run(game.id,token,body.name.trim(),JSON.stringify(body.seats),Date.now());return reply(200,{token});
 }
 if(req.method==='POST'&&match[2]==='results'){
 const supplied=Buffer.from(typeof body.secret==='string'?body.secret:'');const expected=Buffer.from(game.secret);
 if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply(403,{error:'קישור הניהול אינו תקין'});
 if(Date.now()<game.deadline)return reply(409,{error:'ניתן לפרסם תוצאות רק אחרי מועד הנעילה'});
 if(!validSeats(body.seats,parties.length))return reply(400,{error:'סך התוצאות חייב להיות 120 מנדטים'});
 db.prepare('UPDATE games SET results=? WHERE id=?').run(JSON.stringify(body.seats),game.id);return reply(200,{ok:true});
 }return reply(405,{error:'פעולה לא נתמכת'});
 }catch(e){reply(400,{error:'לא ניתן להשלים את הבקשה'});}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Election game listening'));
