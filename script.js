const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let notes = [];
let score = 0;

function spawnNote() {
  notes.push({ x: Math.random() * canvas.width, y: canvas.height, speed: 2 + Math.random() * 3 });
}

function update() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.font = "24px Arial";
  ctx.fillText("Pontos: " + score, 10, 30);

  for (let i = notes.length - 1; i >= 0; i--) {
    let note = notes[i];
    note.y -= note.speed;
    ctx.beginPath();
    ctx.arc(note.x, note.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = "yellow";
    ctx.fill();
    if (note.y < -20) notes.splice(i, 1);
  }
}

function loop() {
  update();
  requestAnimationFrame(loop);
}

canvas.addEventListener("touchstart", e => {
  const touch = e.touches[0];
  for (let i = notes.length - 1; i >= 0; i--) {
    let note = notes[i];
    let dx = touch.clientX - note.x;
    let dy = touch.clientY - note.y;
    if (Math.sqrt(dx * dx + dy * dy) < 20) {
      score += 10;
      notes.splice(i, 1);
    }
  }
});

setInterval(spawnNote, 1000);
loop();
