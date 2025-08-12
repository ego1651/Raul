const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
let notes = [];
let speed = 2;
let score = 0;
let playing = false;

document.getElementById('start-btn').onclick = () => { 
  document.getElementById('overlay').style.display = 'none'; 
  playing = true; 
  spawn(); 
  loop(); 
};

function spawn(){
  setInterval(()=>{
    notes.push({x:Math.random()*canvas.width, y:0, r:20});
    if(speed<10) speed += 0.05; // aumenta gradualmente
  }, 1000);
}

function loop(){
  if(!playing) return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#ffdd57';
  notes.forEach(n=>{
    n.y += speed;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
    ctx.fill();
  });
  requestAnimationFrame(loop);
}

canvas.addEventListener('touchstart', e=>{
  const t = e.touches[0];
  notes = notes.filter(n => Math.hypot(n.x-t.clientX, n.y-t.clientY) > n.r);
});