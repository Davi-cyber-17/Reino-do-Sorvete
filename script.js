const W=15,H=13,T=40,$=s=>document.querySelector(s);
const DIRS=[[0,-1],[-1,0],[0,1],[1,0]]; // cima, esquerda, baixo, direita
const SP=[[1,1],[13,1],[1,11],[13,11]];
const COL=['#ffe14d','#ff4fd8','#39ff88','#4db8ff'];
const FR=['🍒','🍊','🍇','🍓','🍋','🍉'];
const MOVE=120,TIME=120000;
const PCFG={config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'},{urls:['turn:openrelay.metered.ca:80','turn:openrelay.metered.ca:443','turn:openrelay.metered.ca:443?transport=tcp'],username:'openrelayproject',credential:'openrelayproject'}]}};
const SCH=[
 {k:{KeyW:0,KeyA:1,KeyS:2,KeyD:3},a:'Space'},
 {k:{ArrowUp:0,ArrowLeft:1,ArrowDown:2,ArrowRight:3},a:'Enter'},
 {k:{KeyT:0,KeyF:1,KeyG:2,KeyH:3},a:'KeyR'},
 {k:{KeyI:0,KeyJ:1,KeyK:2,KeyL:3},a:'KeyU'}];
let mode=null,G=null,me=0,peer=null,conns=[],hostConn=null,stacks=[[],[],[],[]],lastSend=0;
const rnd=n=>Math.floor(Math.random()*n);
if('ontouchstart' in window||navigator.maxTouchPoints>0)document.body.classList.add('touch');
const show=id=>document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('on',s.id===id));

/* ---------- Áudio (sintetizado, sem arquivos) ---------- */
let AC=null,muted=false;
const unlock=()=>{try{AC=AC||new AudioContext();AC.resume();}catch(e){}};
addEventListener('pointerdown',unlock);addEventListener('keydown',unlock);
function sfx(f,d=.1,ty='square',v=.04,f2){
  if(!AC||muted)return;
  try{const t=AC.currentTime,o=AC.createOscillator(),g=AC.createGain();
    o.type=ty;o.frequency.setValueAtTime(f,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+d);
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+d);
    o.connect(g).connect(AC.destination);o.start(t);o.stop(t+d);}catch(e){}
}
$('#bMute').onclick=()=>{muted=!muted;$('#bMute').textContent=muted?'🔇':'🔊';};

/* ---------- Lógica do jogo ---------- */
function mkGame(n,outs=[]){
  G={n,level:1,inp:[],players:[],enemies:[],fruits:[],grid:[],time:TIME,st:'ready',nt:0,eid:0};
  for(let i=0;i<n;i++){G.inp.push({d:-1,a:false,q:-1,qt:0});
    G.players.push({x:1,y:1,dir:2,lives:3,score:0,alive:true,mt:0,at:0,inv:1500,out:!!outs[i],cb:0,ct:0});}
  genLevel();
}
function genLevel(){
  const g=G;g.grid=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)g.grid.push(x==0||y==0||x==W-1||y==H-1?2:0);
  const far=(x,y)=>SP.every(s=>Math.abs(s[0]-x)+Math.abs(s[1]-y)>3);
  for(let k=0;k<16;k++){
    const h=rnd(2),len=2+rnd(4),x=1+rnd(W-2),y=1+rnd(H-2);
    for(let i=0;i<len;i++){const xx=x+(h?i:0),yy=y+(h?0:i);
      if(xx<W-1&&yy<H-1&&far(xx,yy))g.grid[yy*W+xx]=1;}
  }
  // pilares fixos (obstáculos que não quebram) para dar mais estratégia
  for(let k=0;k<5+g.level;k++){const x=2+rnd(W-4),y=2+rnd(H-4);if(far(x,y))g.grid[y*W+x]=3;}
  g.fruits=[];g.enemies=[];
  const empty=()=>{for(;;){const x=1+rnd(W-2),y=1+rnd(H-2);
    if(g.grid[y*W+x]===0&&far(x,y)&&!g.fruits.some(f=>f.x==x&&f.y==y)&&!g.enemies.some(e=>e.x==x&&e.y==y))return[x,y];}};
  for(let i=0;i<12+g.level*2;i++){const[x,y]=empty();g.fruits.push({x,y});}
  for(let i=0;i<Math.min(2+g.level,7);i++){const[x,y]=empty();g.enemies.push({x,y,mt:900,id:g.eid++,d:-1});}
  g.players.forEach((p,i)=>{
    p.x=SP[i][0];p.y=SP[i][1];p.inv=1500;p.mt=0;p.at=0;p.cb=0;p.ct=0;g.grid[p.y*W+p.x]=0;
    if(p.out){p.alive=false;return;}
    if(p.lives<=0)p.lives=1;p.alive=true;});
  g.time=TIME;g.st='ready';g.nt=2400;
}
const at=(x,y)=>x<0||y<0||x>=W||y>=H?2:G.grid[y*W+x];
const solid=v=>v!==0;
const pAt=(x,y)=>G.players.some(p=>p.alive&&p.x==x&&p.y==y);
// IA: caminho mais curto (BFS) até o jogador mais próximo
function bfs(e,al){
  const q=[[e.x,e.y,-1]],seen=new Set([e.y*W+e.x]);
  for(let i=0;i<q.length;i++){const[x,y,f]=q[i];
    if(i&&al.some(p=>p.x==x&&p.y==y))return f;
    for(let d=0;d<4;d++){const nx=x+DIRS[d][0],ny=y+DIRS[d][1],k=ny*W+nx;
      if(at(nx,ny)===0&&!seen.has(k)){seen.add(k);q.push([nx,ny,f<0?d:f]);}}}
  return -1;
}
function step(dt){
  const g=G;
  if(g.st!=='play'){
    g.nt-=dt;
    if(g.nt<=0){
      if(g.st==='ready')g.st='play';
      else if(g.st==='win'){g.level++;genLevel();}
      else mkGame(g.n,g.players.map(p=>p.out));}
    return;
  }
  g.time-=dt;if(g.time<=0){g.st='lose';g.nt=4000;return;}
  g.players.forEach((p,i)=>{
    if(!p.alive)return;
    const inp=g.inp[i];p.mt-=dt;p.at-=dt;p.inv-=dt;p.ct-=dt;inp.qt-=dt;
    const d=inp.d>=0?inp.d:(inp.qt>0?inp.q:-1); // toque rápido fica "guardado" por 160ms
    if(d>=0&&p.mt<=0){
      p.dir=d;const nx=p.x+DIRS[d][0],ny=p.y+DIRS[d][1];
      if(at(nx,ny)===0){p.x=nx;p.y=ny;p.mt=MOVE;inp.qt=0;
        const fi=g.fruits.findIndex(f=>f.x==nx&&f.y==ny);
        if(fi>=0){g.fruits.splice(fi,1);p.cb=p.ct>0?Math.min(p.cb+1,5):1;p.ct=1600;p.score+=50*p.cb;}}
    }
    if(inp.a){inp.a=false;
      if(p.at<=0){p.at=200;
        const[dx,dy]=DIRS[p.dir];let x=p.x+dx,y=p.y+dy;
        if(at(x,y)===1){while(at(x,y)===1){g.grid[y*W+x]=0;x+=dx;y+=dy;}}
        else while(at(x,y)===0&&!pAt(x,y)&&!g.fruits.some(f=>f.x==x&&f.y==y)){
          g.grid[y*W+x]=1;
          g.enemies=g.enemies.filter(e=>{if(e.x==x&&e.y==y){p.score+=100;return false;}return true;});
          x+=dx;y+=dy;}
      }
    }
  });
  const al=g.players.filter(p=>p.alive);
  g.enemies.forEach(e=>{
    e.mt-=dt;if(e.mt>0||!al.length)return;e.mt=Math.max(200,360-g.level*16);
    let d=bfs(e,al);
    const free=[0,1,2,3].filter(k=>at(e.x+DIRS[k][0],e.y+DIRS[k][1])===0);
    if(!free.length)return;
    if(d<0||Math.random()<.14){const nb=free.filter(k=>k!==(e.d+2)%4);const l=nb.length?nb:free;d=l[rnd(l.length)];}
    e.d=d;e.x+=DIRS[d][0];e.y+=DIRS[d][1];
  });
  g.players.forEach((p,i)=>{
    if(!p.alive||p.inv>0)return;
    if(g.enemies.some(e=>e.x==p.x&&e.y==p.y)){
      p.lives--;p.cb=0;
      if(p.lives>0){p.x=SP[i][0];p.y=SP[i][1];p.inv=2200;g.grid[p.y*W+p.x]=0;}
      else p.alive=false;
    }
  });
  if(!g.players.some(p=>p.alive)){g.st='lose';g.nt=4000;}
  else if(!g.fruits.length){g.st='win';g.nt=2800;
    const b=Math.ceil(g.time/1000)*2;g.bonus=b;g.players.forEach(p=>{if(p.alive)p.score+=b;});}
}

/* ---------- Entrada ---------- */
function setIn(s,d,a){
  const i=G&&G.inp[s];if(!i)return;
  i.d=d;if(d>=0){i.q=d;i.qt=160;}if(a)i.a=true;
}
function send(slot,a){
  const s=stacks[slot],d=s.length?s[s.length-1]:-1;
  if(mode==='guest'){hostConn&&hostConn.open&&hostConn.send({t:'in',d,a:!!a});}
  else setIn(slot,d,a);
}
function press(slot,d){const s=stacks[slot],i=s.indexOf(d);if(i>=0)s.splice(i,1);s.push(d);send(slot);}
function release(slot,d){const s=stacks[slot],i=s.indexOf(d);if(i>=0)s.splice(i,1);send(slot);}
const act=slot=>send(slot,true);
function key(e,down){
  if(!G||(down&&e.repeat))return;
  SCH.forEach((c,s)=>{
    if(mode!=='local'&&s>1)return;
    const slot=mode==='local'?s:me;
    if(mode==='local'&&slot>=G.n)return;
    if(e.code in c.k){down?press(slot,c.k[e.code]):release(slot,c.k[e.code]);e.preventDefault();}
    else if(e.code===c.a){if(down)act(slot);e.preventDefault();}
  });
}
addEventListener('keydown',e=>key(e,true));
addEventListener('keyup',e=>key(e,false));
document.querySelectorAll('#pad button').forEach(b=>{
  const slot=()=>mode==='local'?0:me,d=b.dataset.d;
  b.addEventListener('pointerdown',e=>{e.preventDefault();navigator.vibrate&&navigator.vibrate(8);d!==undefined?press(slot(),+d):act(slot());});
  if(d!==undefined)['pointerup','pointerleave','pointercancel'].forEach(ev=>b.addEventListener(ev,()=>release(slot(),+d)));
});

/* ---------- Menus ---------- */
function leave(){
  if(peer)peer.destroy();
  peer=null;conns=[];hostConn=null;G=null;mode=null;stacks=[[],[],[],[]];P={};
  $('#onMsg').textContent='';show('menu');
}
function startGame(n,m){mode=m;me=0;stacks=[[],[],[],[]];P={};mkGame(n);show('game');}
$('#bLocal').onclick=()=>show('local');
$('#bOnline').onclick=()=>show('online');
document.querySelectorAll('.back').forEach(b=>b.onclick=leave);
document.querySelectorAll('#local [data-n]').forEach(b=>b.onclick=()=>startGame(+b.dataset.n,'local'));

/* ---------- Online (salas via PeerJS) ---------- */
function lobbyUpd(){
  const n=1+conns.filter(Boolean).length;
  $('#lp').textContent=n+'/4 jogadores na sala';
  conns.forEach(c=>c&&c.open&&c.send({t:'lobby',n}));
}
function createRoom(){
  mode='host';conns=[null,null,null,null];
  const code=String(1000+rnd(9000));
  peer=new Peer('icecream-'+code,PCFG);
  peer.on('open',()=>{$('#rc').textContent=code;$('#bStart').style.display='';show('lobby');lobbyUpd();});
  peer.on('error',e=>{
    if(e.type==='unavailable-id'){peer.destroy();createRoom();}
    else $('#onMsg').textContent='Erro: '+e.type;});
  peer.on('connection',c=>{
    c.on('open',()=>{
      const s=conns.findIndex((x,i)=>i>0&&!x);
      if(s<0||G){c.send({t:'full'});setTimeout(()=>c.close(),300);return;}
      conns[s]=c;c.send({t:'welcome',slot:s});lobbyUpd();
    });
    c.on('data',m=>{
      const s=conns.indexOf(c);
      if(m.t==='in'&&G)setIn(s,m.d,m.a);
    });
    c.on('close',()=>{
      const s=conns.indexOf(c);if(s<0)return;
      conns[s]=null;
      if(G&&G.players[s]){G.players[s].alive=false;G.players[s].out=true;}
      else lobbyUpd();
    });
  });
}
$('#bCreate').onclick=createRoom;
$('#bStart').onclick=()=>{
  const n=Math.max(...conns.map((c,i)=>(c||i===0)?i+1:0));
  startGame(n,'host');
  G.players.forEach((p,i)=>{if(i&&!conns[i]){p.out=true;p.alive=false;}});
};
$('#bJoin').onclick=()=>{
  const code=$('#code').value.trim();if(code.length!==4)return;
  $('#onMsg').textContent='Conectando...';
  mode='guest';peer=new Peer(PCFG);
  setTimeout(()=>{if(mode==='guest'&&!G&&!$('#lobby').classList.contains('on'))$('#onMsg').textContent='Não foi possível conectar. Confira o código.';},12000);
  peer.on('open',()=>{
    hostConn=peer.connect('icecream-'+code,{reliable:true});
    hostConn.on('data',m=>{
      if(m.t==='welcome'){me=m.slot;$('#rc').textContent=code;$('#bStart').style.display='none';
        $('#lp').textContent='Aguardando o anfitrião iniciar...';show('lobby');}
      else if(m.t==='lobby')$('#lp').textContent=m.n+'/4 jogadores na sala';
      else if(m.t==='full')$('#onMsg').textContent='Sala cheia ou já iniciada.';
      else if(m.t==='s'){
        G={n:m.n,grid:[...m.g].map(Number),players:m.p,enemies:m.e,fruits:m.f,time:m.tm,level:m.l,st:m.st,nt:m.nt,bonus:m.b,inp:[]};
        if(!$('#game').classList.contains('on'))show('game');
      }
    });
    hostConn.on('close',()=>{if(mode==='guest'){alert('Conexão encerrada.');leave();}});
  });
  peer.on('error',e=>$('#onMsg').textContent=e.type==='peer-unavailable'?'Sala não encontrada.':'Erro: '+e.type);
};

/* ---------- Visual: sprites pré-renderizados ---------- */
const cv=$('#c'),c=cv.getContext('2d'),VIS={},dpr=Math.min(devicePixelRatio||1,2);
cv.width=600*dpr;cv.height=520*dpr;
const spr=(w,h,fn)=>{const o=document.createElement('canvas');o.width=w*dpr;o.height=h*dpr;const x=o.getContext('2d');x.scale(dpr,dpr);fn(x);return o;};
const FLOOR=spr(600,520,x=>{
  x.fillStyle='#070b1f';x.fillRect(0,0,600,520);
  for(let y=0;y<H;y++)for(let i=0;i<W;i++)if((i+y)%2){x.fillStyle='rgba(0,229,255,.03)';x.fillRect(i*T,y*T,T,T);}
  x.strokeStyle='#12214a';x.lineWidth=1;
  for(let i=0;i<=W;i++){x.beginPath();x.moveTo(i*T+.5,0);x.lineTo(i*T+.5,520);x.stroke();}
  for(let i=0;i<=H;i++){x.beginPath();x.moveTo(0,i*T+.5);x.lineTo(600,i*T+.5);x.stroke();}
  x.fillStyle='#1d3a7a';for(let i=0;i<=W;i++)for(let j=0;j<=H;j++)x.fillRect(i*T-1,j*T-1,3,3);
});
const OVER=spr(600,520,x=>{
  const g=x.createRadialGradient(300,260,180,300,260,400);g.addColorStop(0,'#0000');g.addColorStop(1,'#000b');
  x.fillStyle=g;x.fillRect(0,0,600,520);
});
const WALL=spr(T,T,x=>{
  const g=x.createLinearGradient(0,0,T,T);g.addColorStop(0,'#212a70');g.addColorStop(1,'#0c1130');
  x.fillStyle=g;x.fillRect(2,2,T-4,T-4);
  x.shadowColor='#7b4dff';x.shadowBlur=8;x.strokeStyle='#7b4dff';x.lineWidth=2;x.strokeRect(3,3,T-6,T-6);x.shadowBlur=0;
  x.strokeStyle='#7b4dff99';x.lineWidth=1;x.beginPath();x.moveTo(8,T/2);x.lineTo(T/2-4,T/2);x.lineTo(T/2+2,T/2-8);x.lineTo(T-8,T/2-8);x.moveTo(T/2,T-8);x.lineTo(T/2,T/2+6);x.stroke();
  x.fillStyle='#c4adff';[[8,T/2],[T-8,T/2-8],[T/2,T-8]].forEach(([a,b])=>{x.beginPath();x.arc(a,b,2,0,7);x.fill();});
});
const PILL=spr(T,T,x=>{ // pilar indestrutível
  x.fillStyle='#1a1030';x.fillRect(4,4,T-8,T-8);
  x.shadowColor='#ff4fd8';x.shadowBlur=10;x.strokeStyle='#ff4fd8';x.lineWidth=2;x.strokeRect(5,5,T-10,T-10);x.shadowBlur=0;
  x.strokeStyle='#ff4fd8aa';x.lineWidth=2;x.beginPath();x.moveTo(11,11);x.lineTo(T-11,T-11);x.moveTo(T-11,11);x.lineTo(11,T-11);x.stroke();
});
const ICE=spr(T,T,x=>{
  const g=x.createLinearGradient(0,0,T,T);g.addColorStop(0,'#d6fdff');g.addColorStop(.5,'#4fe3ff');g.addColorStop(1,'#1b7fd6');
  x.shadowColor='#00e5ff';x.shadowBlur=10;x.fillStyle=g;x.globalAlpha=.55;x.fillRect(3,3,T-6,T-6);x.globalAlpha=1;
  x.strokeStyle='#e8ffff';x.lineWidth=2;x.strokeRect(3.5,3.5,T-7,T-7);x.shadowBlur=0;
  x.strokeStyle='#fffc';x.beginPath();x.moveTo(9,T-14);x.lineTo(T-14,9);x.moveTo(9,T-24);x.lineTo(T-24,9);x.stroke();
  x.fillStyle='#00e5ff44';x.fillRect(T-15,T-15,10,10);
});

/* ---------- Efeitos (detectados por diferença de estado: funciona no host e no convidado) ---------- */
let P={},parts=[],pops=[],born={},shake=0,DT=16,hudKey='';
function burst(px,py,col,n,sp=140){
  for(let i=0;i<n;i++){const a=Math.random()*6.283,s=sp*(.3+Math.random());
    parts.push({x:px,y:py,vx:Math.cos(a)*s,vy:Math.sin(a)*s-40,l:500+Math.random()*300,m:800,c:col});}
}
function fx(now){
  const g=G,ps=g.players;
  if(!P.grid||P.grid.length!==g.grid.length||(P.st!=='ready'&&g.st==='ready')){
    P={grid:g.grid.slice(),fr:g.fruits.length,en:g.enemies.length,li:ps.map(p=>p.lives),sc:ps.map(p=>p.score),st:g.st,tk:0};born={};return;}
  let nb=0,nbr=0;
  for(let i=0;i<g.grid.length;i++){const a=P.grid[i],b=g.grid[i];if(a===b)continue;
    const x=i%W,y=i/W|0;
    if(b===1&&a===0){nb++;
      const d=Math.min(9,...ps.filter(p=>p.alive).map(p=>Math.abs(p.x-x)+Math.abs(p.y-y)));
      born[i]=now+d*22;burst(x*T+T/2,y*T+T/2,'#9ff4ff',3,70);}
    else if(a===1&&b===0){nbr++;delete born[i];burst(x*T+T/2,y*T+T/2,'#00e5ff',7);}}
  if(nb)sfx(260,.12,'square',.03,720);
  if(nbr)sfx(520,.1,'sawtooth',.03,150);
  if(g.fruits.length<P.fr)sfx(880,.09,'triangle',.07,1500);
  if(g.enemies.length<P.en){sfx(700,.18,'square',.05,1400);shake=Math.max(shake,5);}
  ps.forEach((p,i)=>{
    if(P.li[i]!==undefined&&p.lives<P.li[i]){
      burst(p.x*T+T/2,p.y*T+T/2,COL[i],26,220);shake=14;sfx(220,.35,'sawtooth',.08,50);navigator.vibrate&&navigator.vibrate(80);}
    const d=p.score-(P.sc[i]||0);
    if(d>0&&g.st==='play')pops.push({x:p.x*T+T/2,y:p.y*T,t:0,s:'+'+d+(p.cb>1&&d<100?' x'+p.cb:''),c:COL[i]});
  });
  if(P.st!==g.st){
    if(g.st==='win')[523,659,784,1047].forEach((f,k)=>setTimeout(()=>sfx(f,.18,'triangle',.07),k*110));
    if(g.st==='lose')sfx(300,.7,'sawtooth',.07,60);
    if(g.st==='play')sfx(1000,.25,'square',.05,1800);}
  if(g.st==='ready'){const k=Math.ceil(g.nt/800);if(k!==P.tk){P.tk=k;sfx(500,.1,'square',.04);}}
  P.grid=g.grid.slice();P.fr=g.fruits.length;P.en=g.enemies.length;P.li=ps.map(p=>p.lives);P.sc=ps.map(p=>p.score);P.st=g.st;
}

/* ---------- Desenho ---------- */
function vis(k,x,y){
  const v=VIS[k]||(VIS[k]={x,y});
  if(Math.abs(x-v.x)>2.5||Math.abs(y-v.y)>2.5){v.x=x;v.y=y;}
  const f=1-Math.exp(-DT/48);v.x+=(x-v.x)*f;v.y+=(y-v.y)*f;return v;
}
function glow(px,py,r,col){
  const g=c.createRadialGradient(px,py,1,px,py,r);g.addColorStop(0,col+'aa');g.addColorStop(1,col+'00');
  c.fillStyle=g;c.beginPath();c.arc(px,py,r,0,7);c.fill();
}
function draw(now){
  c.setTransform(dpr,0,0,dpr,0,0);c.globalAlpha=1;
  c.drawImage(FLOOR,0,0,600,520);
  c.save();
  if(shake>.4){c.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);}
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    const v=G.grid[y*W+x],px=x*T,py=y*T;
    if(v===2)c.drawImage(WALL,px,py,T,T);
    else if(v===3)c.drawImage(PILL,px,py,T,T);
    else if(v===1){
      const b=born[y*W+x],k=b===undefined?1:Math.min(1,(now-b)/180);if(k<=0)continue;
      const s=.55+.45*k+(k<1?.14*Math.sin(k*3.14):0);
      c.globalAlpha=Math.min(1,k*1.3);c.drawImage(ICE,px+T/2*(1-s),py+T/2*(1-s),T*s,T*s);c.globalAlpha=1;
    }
  }
  const fi=FR[(G.level-1)%FR.length];
  c.font='22px serif';c.textAlign='center';c.textBaseline='middle';
  G.fruits.forEach(f=>{
    const px=f.x*T+T/2,py=f.y*T+T/2+Math.sin(now/300+f.x*2+f.y)*2;
    glow(px,py,20,'#ffd200');c.fillText(fi,px,py+1);
  });
  G.enemies.forEach(e=>{
    const v=vis('e'+e.id,e.x,e.y),px=v.x*T+T/2,py=v.y*T+T/2+Math.sin(now/180+e.id)*2,r=13+Math.sin(now/120+e.id)*1;
    glow(px,py,r+12,'#ff2e63');
    c.strokeStyle='#ff2e63';c.lineWidth=2;
    for(let k=0;k<8;k++){const a=now/600*(e.id%2?1:-1)+k*Math.PI/4;
      c.beginPath();c.moveTo(px+Math.cos(a)*r,py+Math.sin(a)*r);c.lineTo(px+Math.cos(a)*(r+5),py+Math.sin(a)*(r+5));c.stroke();}
    c.fillStyle='#2a0b1f';c.beginPath();c.arc(px,py,r,0,7);c.fill();c.stroke();
    const ox=Math.max(-4,Math.min(4,(e.x-v.x)*8)),oy=Math.max(-3,Math.min(3,(e.y-v.y)*8));
    c.fillStyle='#ff9bb5';c.fillRect(px-9+ox,py-4+oy,18,8);
    c.fillStyle='#fff';c.fillRect(px-2+ox+Math.sin(now/200)*5,py-4+oy,4,8);
  });
  G.players.forEach((p,i)=>{
    if(!p.alive)return;
    const v=vis('p'+i,p.x,p.y),mv=Math.min(1,Math.hypot(p.x-v.x,p.y-v.y)),px=v.x*T+T/2,py=v.y*T+T/2,bob=Math.sin(now/140+i)*1.5;
    glow(px,py+6,24,COL[i]);
    c.globalAlpha=p.inv>0&&Math.floor(p.inv/100)%2?.4:1;
    c.save();c.translate(px,py+bob);c.scale(1-mv*.1,1+mv*.1);
    const cg=c.createLinearGradient(-10,0,10,16);cg.addColorStop(0,'#f0c27a');cg.addColorStop(1,'#a8702f');
    c.fillStyle=cg;c.beginPath();c.moveTo(-10,-1);c.lineTo(10,-1);c.lineTo(0,18);c.fill();
    c.strokeStyle='#7a4a1c';c.lineWidth=1;c.beginPath();c.moveTo(-5,1);c.lineTo(3,12);c.moveTo(5,1);c.lineTo(-3,12);c.stroke();
    const sg=c.createRadialGradient(-4,-14,1,0,-9,15);sg.addColorStop(0,'#fff');sg.addColorStop(.35,COL[i]);sg.addColorStop(1,COL[i]);
    c.fillStyle=sg;c.beginPath();c.arc(0,-9,13,0,7);c.fill();
    c.beginPath();c.arc(-8,-1,4,0,7);c.arc(7,0,3,0,7);c.fill();
    const d=DIRS[p.dir];
    [-5,5].forEach(ex=>{c.fillStyle='#fff';c.beginPath();c.arc(ex,-10,3.8,0,7);c.fill();
      c.fillStyle='#050816';c.beginPath();c.arc(ex+d[0]*1.8,-10+d[1]*1.8,1.9,0,7);c.fill();});
    c.restore();c.globalAlpha=1;
    c.font='bold 9px Orbitron,sans-serif';c.fillStyle=COL[i];c.fillText('J'+(i+1),px,py-27);
  });
  parts=parts.filter(q=>(q.l-=DT)>0);
  parts.forEach(q=>{q.x+=q.vx*DT/1000;q.y+=q.vy*DT/1000;q.vy+=320*DT/1000;
    c.globalAlpha=Math.min(1,q.l/q.m*1.6);c.fillStyle=q.c;c.fillRect(q.x-2,q.y-2,4,4);});
  c.globalAlpha=1;c.font='bold 13px Orbitron,sans-serif';
  pops=pops.filter(q=>(q.t+=DT)<900);
  pops.forEach(q=>{c.globalAlpha=1-q.t/900;c.fillStyle=q.c;c.fillText(q.s,q.x,q.y-q.t/22);});
  c.globalAlpha=1;c.restore();
  // barra de tempo
  const tr=Math.max(0,G.time/TIME);c.fillStyle=G.time<15000?'#ff2e63':'#00e5ff';c.fillRect(0,516,600*tr,4);
  // varredura + vinheta
  const sy=(now/14)%700-90,sg2=c.createLinearGradient(0,sy,0,sy+90);
  sg2.addColorStop(0,'#00e5ff00');sg2.addColorStop(.5,'#00e5ff0d');sg2.addColorStop(1,'#00e5ff00');c.fillStyle=sg2;c.fillRect(0,sy,600,90);
  c.drawImage(OVER,0,0,600,520);
  if(G.st!=='play')banner(now);
  shake*=Math.exp(-DT/110);
}
function banner(now){
  const s=G.st,col=s==='win'?'#39ff88':s==='lose'?'#ff2e63':'#00e5ff';
  c.fillStyle='#050816e6';c.fillRect(0,185,600,150);
  c.fillStyle=col;c.fillRect(0,185,600,2);c.fillRect(0,333,600,2);
  c.shadowColor=col;c.shadowBlur=18;c.fillStyle='#fff';c.textAlign='center';c.textBaseline='alphabetic';
  c.font='bold 34px Orbitron,sans-serif';
  if(s==='ready'){
    c.fillText('FASE '+G.level,300,245);c.fillStyle=col;c.font='bold 44px Orbitron,sans-serif';
    c.fillText(String(Math.max(1,Math.ceil(G.nt/800))),300,305);
  }else{
    c.fillText(s==='win'?'FASE COMPLETA':'FIM DE JOGO',300,250);
    c.shadowBlur=0;c.font='14px Orbitron,sans-serif';c.fillStyle=col;
    c.fillText(s==='win'?'Bônus de tempo +'+(G.bonus||0)+' pts':'Reiniciando...',300,290);
    if(s==='lose'){c.fillStyle='#8fb4d9';c.fillText('Pontuação: '+G.players.filter(p=>!p.out).map((p,i)=>p.score).join(' · '),300,315);}
  }
  c.shadowBlur=0;
}
function hud(){
  const s=Math.max(0,Math.ceil(G.time/1000)),t=$('#hT');
  const tx='⏱ '+Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  if(t.textContent!==tx){t.textContent=tx;t.classList.toggle('low',s<=15);}
  const k=G.level+'|'+G.fruits.length+'|'+G.players.map(p=>p.out?'':p.score+'.'+p.lives+'.'+p.cb).join(',');
  if(k===hudKey)return;hudKey=k;
  $('#hL').textContent='Fase '+G.level+' · '+FR[(G.level-1)%FR.length]+' '+G.fruits.length;
  $('#hS').innerHTML=G.players.map((p,i)=>p.out?'':`<b style="--k:${COL[i]}">J${i+1} ${p.score}${p.cb>1?' ⚡x'+p.cb:''}<u>${'♥'.repeat(Math.max(0,p.lives))}</u></b>`).join('');
}

/* ---------- Loop ---------- */
function snap(){
  const g=G;
  return{t:'s',g:g.grid.join(''),p:g.players,e:g.enemies,f:g.fruits,tm:g.time,l:g.level,st:g.st,n:g.n,nt:g.nt,b:g.bonus};
}
let last=0;
function loop(t){
  requestAnimationFrame(loop);
  DT=Math.min(t-last,100);last=t;
  if(!G||!$('#game').classList.contains('on'))return;
  if(mode!=='guest')step(DT);
  if(mode==='host'&&t-lastSend>33){
    lastSend=t;const m=snap();
    conns.forEach(cn=>cn&&cn.open&&cn.send(m));
  }
  fx(t);draw(t);hud();
}
requestAnimationFrame(loop);
