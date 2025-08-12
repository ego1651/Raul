/* script.js - Notas Psicodélicas (PWA-ready)
   Personagem fictício: 'Rei do Som' (estética psicodélica).
   Funcionalidades: swipe slicing, combo, pontos, vidas, som sintetizado, mute, offline-capable.
*/

(() => {
  // ---- Config ----
  const CONFIG = {
    gravity: 0.42,
    spawnIntervalMs: 800,
    baseSpeedMultiplier: 1,
    initialLives: 3,
    comboTimeout: 1200, // ms para combo reset
    maxTrail: 18
  };

  // ---- DOM ----
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  const scoreEl = document.getElementById('score');
  const comboEl = document.getElementById('combo');
  const livesEl = document.getElementById('lives');
  const overlay = document.getElementById('overlay');
  const menu = document.getElementById('menu');
  const how = document.getElementById('how');
  const howBtn = document.getElementById('howBtn');
  const backBtn = document.getElementById('backBtn');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const gameOverEl = document.getElementById('gameOver');
  const finalScoreEl = document.getElementById('finalScore');
  const bestComboEl = document.getElementById('bestCombo');
  const noteImg = document.getElementById('noteImg');
  const muteBtn = document.getElementById('muteBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const howSection = document.getElementById('how');

  let audioCtx = null;
  let muted = false;
  let notes = [];
  let particles = [];
  let score = 0;
  let combo = 0;
  let bestCombo = 0;
  let lives = CONFIG.initialLives;
  let running = false;
  let spawnTimer = null;
  let trail = [];
  let lastSliceTime = 0;
  let lastComboTime = 0;
  let dpr = Math.max(1, window.devicePixelRatio || 1);

  // fit canvas
  function fit() {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize', fit);
  fit();

  // ---- Audio ----
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  function playPluck(frequency=440) {
    if (muted) return;
    ensureAudio();
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.value = frequency;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    const f = audioCtx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = frequency * 1.8;
    f.Q.value = 4;
    o.connect(f);
    f.connect(g);
    g.connect(audioCtx.destination);
    o.start(now); o.stop(now + 0.5);
  }

  function playMiss() {
    if (muted) return;
    ensureAudio();
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    o.type = 'square';
    o.frequency.value = 120;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(now); o.stop(now + 0.6);
  }

  // ---- Entities ----
  class Note {
    constructor(x,y,vx,vy,size,color) {
      this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.size=size; this.color=color; this.sliced=false; this.id=Math.random().toString(36).slice(2,9);
      this.rotation = Math.random()*Math.PI*2;
      this.rotationSpeed = (Math.random()-0.5)*0.06;
    }
    update(dt) {
      this.vy += CONFIG.gravity * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rotation += this.rotationSpeed * dt;
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rotation);
      // desenha a nota (usar noteImg se disponível)
      try {
        ctx.drawImage(noteImg, -this.size, -this.size, this.size*2, this.size*2);
      } catch(e) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0,0,this.size,0,Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }
    intersectsSegment(x1,y1,x2,y2) {
      const cx=this.x, cy=this.y, r=this.size;
      const vx = x2-x1, vy=y2-y1;
      const wx = cx-x1, wy=cy-y1;
      const c1 = vx*wx + vy*wy;
      if (c1 <= 0) {
        const d2=(cx-x1)*(cx-x1)+(cy-y1)*(cy-y1); return d2 <= r*r;
      }
      const c2 = vx*vx+vy*vy;
      if (c2 <= c1) {
        const d2=(cx-x2)*(cx-x2)+(cy-y2)*(cy-y2); return d2 <= r*r;
      }
      const b = c1 / c2;
      const px = x1 + b * vx, py = y1 + b * vy;
      const d2 = (cx-px)*(cx-px)+(cy-py)*(cy-py); return d2 <= r*r;
    }
  }

  // ---- Particles ----
  function spawnParticles(x,y,color,count=12) {
    for (let i=0;i<count;i++) {
      particles.push({
        x,y,
        vx:(Math.random()-0.5)*6,
        vy:(Math.random()-1.5)*6,
        life:400+Math.random()*500,
        born:Date.now(),
        size:2+Math.random()*4,
        color
      });
    }
  }

  // ---- Spawning notes ----
  function spawnNote() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const x = Math.random()*(w*0.8)+w*0.1;
    const y = h + 30;
    const vx = (Math.random()-0.5)*6 * (1 + score/400);
    const vy = - (8 + Math.random()*8) * (1 + score/600);
    const size = 16 + Math.random()*22;
    const colors = ['#FF6B6B','#FFD93D','#6BCB77','#4D96FF','#B27EFF'];
    const color = colors[Math.floor(Math.random()*colors.length)];
    notes.push(new Note(x,y,vx,vy,size,color));
  }

  function startSpawning() {
    stopSpawning();
    spawnTimer = setInterval(()=> {
      spawnNote();
      if (Math.random() < 0.35 + Math.min(0.4, score/1200)) spawnNote();
    }, Math.max(220, CONFIG.spawnIntervalMs - Math.min(400, score/6)));
  }
  function stopSpawning() { if (spawnTimer) { clearInterval(spawnTimer); spawnTimer=null; } }

  // ---- Input (mouse/touch) ----
  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches[0]) {
      return { x: (e.touches[0].clientX-rect.left), y: (e.touches[0].clientY-rect.top) };
    } else if (e.changedTouches && e.changedTouches[0]) {
      return { x: (e.changedTouches[0].clientX-rect.left), y: (e.changedTouches[0].clientY-rect.top) };
    } else {
      return { x: e.clientX-rect.left, y: e.clientY-rect.top };
    }
  }

  function pointerDown(x,y) { trail.push({x,y,t:Date.now()}); lastSliceTime = Date.now(); }
  function pointerMove(x,y) {
    const last = trail[trail.length-1];
    const dx = last ? x-last.x : 0, dy = last ? y-last.y : 0;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if (!last || dist > 4) {
      trail.push({x,y,t:Date.now()});
      if (trail.length > CONFIG.maxTrail) trail.shift();
      if (trail.length >= 2) {
        const a = trail[trail.length-2], b = trail[trail.length-1];
        checkSlice(a.x,a.y,b.x,b.y);
      }
    }
  }
  function pointerUp() { trail = []; }

  // event listeners
  canvas.addEventListener('mousedown', e => { const p=getPointerPos(e); pointerDown(p.x,p.y); });
  window.addEventListener('mousemove', e => { if (trail.length) { const p=getPointerPos(e); pointerMove(p.x,p.y); } });
  window.addEventListener('mouseup', () => pointerUp());

  canvas.addEventListener('touchstart', e => { e.preventDefault(); const p=getPointerPos(e); pointerDown(p.x,p.y); }, {passive:false});
  canvas.addEventListener('touchmove', e => { e.preventDefault(); const p=getPointerPos(e); pointerMove(p.x,p.y); }, {passive:false});
  canvas.addEventListener('touchend', e => { e.preventDefault(); pointerUp(); }, {passive:false});

  // ---- Slice detection ----
  function checkSlice(x1,y1,x2,y2) {
    for (let i=notes.length-1;i>=0;i--) {
      const n = notes[i];
      if (!n.sliced && n.intersectsSegment(x1,y1,x2,y2)) {
        n.sliced=true;
        handleSlice(n);
      }
    }
  }

  // ---- Handling slice ----
  function handleSlice(note) {
    // pontos base + bônus por combo
    const base = Math.round(10 + (30 - note.size)/2);
    const gained = Math.round(base * (1 + combo*0.12));
    score += gained;
    combo++;
    lastComboTime = Date.now();
    bestCombo = Math.max(bestCombo, combo);
    scoreEl.textContent = 'Pontos: ' + score;
    comboEl.textContent = 'Combo: ' + combo;
    playPluck(220 + (note.x / canvas.clientWidth) * 880);
    spawnParticles(note.x, note.y, note.color, 12);
    // remover nota visualmente
    setTimeout(()=> {
      const idx = notes.findIndex(n=>n.id===note.id);
      if (idx!==-1) notes.splice(idx,1);
    }, 10);
  }

  // ---- Update loop ----
  let lastTime = performance.now();
  function loop(now) {
    const dtMs = now - lastTime;
    const dt = Math.min(40, dtMs);
    lastTime = now;
    update(dt/16);
    draw();
    if (running) requestAnimationFrame(loop);
  }

  function update(dt) {
    // atualizar notas
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (let i=notes.length-1;i>=0;i--) {
      const n = notes[i];
      n.update(dt);
      // se caiu (e não foi cortada)
      if (!n.sliced && n.y - n.size > h + 40) {
        notes.splice(i,1);
        lives--;
        combo = 0;
        playMiss();
        livesEl.textContent = 'Vidas: ' + '♥'.repeat(lives) + (lives<=0 ? '':'');
        comboEl.textContent = 'Combo: ' + combo;
        spawnParticles(Math.random()*w, h-20, '#FF4D6D', 12);
        if (lives <= 0) endGame();
      }
    }

    // particles
    const now = Date.now();
    for (let i=particles.length-1;i>=0;i--) {
      const p = particles[i];
      const age = now - p.born;
      if (age > p.life) { particles.splice(i,1); continue; }
      p.vy += 0.12 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }

    // combo timeout
    if (combo > 0 && Date.now() - lastComboTime > CONFIG.comboTimeout) {
      combo = 0;
      comboEl.textContent = 'Combo: ' + combo;
    }
  }

  // ---- Draw ----
  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.clearRect(0,0,w,h);

    // fundo psicodélico simples (gradientes e círculos)
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#2b0036'); g.addColorStop(1,'#11021a');
    ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

    // decorativos
    for (let i=0;i<3;i++) {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.02 + i*0.01) + ')';
      ctx.arc(w*0.18 + i*70, h*0.12 + i*40, 160 + i*120, 0, Math.PI*2);
      ctx.fill();
    }

    // notas
    for (const n of notes) n.draw(ctx);

    // partículas
    for (const p of particles) {
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - (Date.now()-p.born)/p.life);
      ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // trail
    if (trail.length >= 2) {
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      for (let i=0;i<trail.length-1;i++) {
        const a=trail[i], b=trail[i+1];
        const alpha = (i+1)/trail.length;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.08 + 0.6*alpha) + ')';
        ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }
    }
  }

  // ---- Game control ----
  function startGame() {
    notes = []; particles = []; trail = [];
    score = 0; combo = 0; bestCombo = 0; lives = CONFIG.initialLives;
    scoreEl.textContent = 'Pontos: ' + score;
    comboEl.textContent = 'Combo: ' + combo;
    livesEl.textContent = 'Vidas: ' + '♥'.repeat(lives);
    running = true;
    overlay.style.display = 'none';
    menu.style.display = 'none';
    gameOverEl.style.display = 'none';
    lastTime = performance.now();
    startSpawning();
    requestAnimationFrame(loop);
    // reset audio context on first interaction for some browsers
    try { ensureAudio(); } catch(e) {}
  }

  function endGame() {
    running = false;
    stopSpawning();
    overlay.style.display = 'flex';
    menu.style.display = 'none';
    gameOverEl.style.display = 'block';
    finalScoreEl.textContent = score;
    bestComboEl.textContent = bestCombo;
  }

  // ---- UI bindings ----
  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);
  howBtn.addEventListener('click', ()=> { menu.style.display='none'; how.style.display='block'; });
  backBtn.addEventListener('click', ()=> { how.style.display='none'; menu.style.display='block'; });

  muteBtn.addEventListener('click', ()=> { muted = !muted; muteBtn.textContent = muted ? '🔇' : '🔊'; });
  fullscreenBtn.addEventListener('click', ()=> {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(e=>{});
    else document.exitFullscreen();
  });

  // ---- keyboard (for desktop testing) ----
  window.addEventListener('keydown', e => {
    if (e.key === 'm') { muted = !muted; muteBtn.textContent = muted ? '🔇' : '🔊'; }
    if (e.key === 'f') { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
  });

  // ---- init ----
  fit();
  // start overlay shown by default (menu visible)
  overlay.style.display = 'flex';
  menu.style.display = 'block';
  how.style.display = 'none';
  gameOverEl.style.display = 'none';

  // events to ensure touch context primes audio on iOS
  document.addEventListener('touchstart', function _prime(){ try{ ensureAudio(); } catch(e){} document.removeEventListener('touchstart', _prime); }, {once:true});

})();