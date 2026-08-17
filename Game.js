const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ammoDisplay1 = document.getElementById("ammo1");
const ammoDisplay2 = document.getElementById("ammo2");

// ===== PLAYER =====
const player = {
  x: 450,
  y: 450,
  width: 40,
  height: 80,
  speed: 4,
  jumpPower: -15,
  gravity: 0.5,
  vy: 0,
  onGround: true,
  facing: 1, // 1 = right, -1 = left
  state: "standing" // standing | crouching | laying
};
// ===== BLUE PLAYER =====
const player2 = {
  x: 150,
  y: 450,
  width: 40,
  height: 80,
  speed: 4,
  jumpPower: -15,
  gravity: 0.5,
  vy: 0,
  onGround: true,
  facing: 1,
  state: "standing"
};
let time = 0;

// ===== GUN & AMMO (per-player) =====
let ammo1 = 20;
let ammo2 = 20;
const maxAmmo = 20;
let isReloading1 = false;
let isReloading2 = false;
let reloadTimer1 = 0;
let reloadTimer2 = 0;
const reloadTime = 90;

// ===== BULLETS =====
const bullets = [];
const bulletSpeed = 14;

// Setup reload button handlers (if elements exist)
const reloadBtn1 = document.getElementById("reload1");
const reloadBtn2 = document.getElementById("reload2");
if (reloadBtn1) {
  reloadBtn1.addEventListener("click", () => {
    if (!isReloading1 && ammo1 < maxAmmo) {
      isReloading1 = true;
      reloadTimer1 = reloadTime;
    }
  });
}
if (reloadBtn2) {
  reloadBtn2.addEventListener("click", () => {
    if (!isReloading2 && ammo2 < maxAmmo) {
      isReloading2 = true;
      reloadTimer2 = reloadTime;
    }
  });
}


// ===== KEYS & DOUBLE TAP =====
const keys = {};
let lastDownTime = 0;
let lastDownTime2 = 0;

// ===== EVENT LISTENERS =====
window.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();
  keys[key] = true;

  // Prevent page scrolling with arrows & space
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
    e.preventDefault();
  }

  // Reload with /
  if (key === "/" && !isReloading1 && ammo1 < maxAmmo) {
    isReloading1 = true;
    reloadTimer1 = reloadTime;
  }
  // Reload blue with F
  if (key === "f" && !isReloading2 && ammo2 < maxAmmo) {
    isReloading2 = true;
    reloadTimer2 = reloadTime;
  }

  // Shoot with Space
  if (key === " " || key === "spacebar") {
    shoot();
  }

  // Shoot with left/right Shift for player2/player1
  if (e.code === "ShiftLeft") {
    shootFrom(player2);
  }
  if (e.code === "ShiftRight") {
    shootFrom(player);
  }

  // Double tap Down to lay down
  if (key === "arrowdown") {
    const now = Date.now();
    if (now - lastDownTime < 300) {
      player.state = "laying";
    }
    lastDownTime = now;
  }

  // Double tap S to lay down for player2
  if (key === "s") {
    const now2 = Date.now();
    if (now2 - lastDownTime2 < 300) {
      player2.state = "laying";
    }
    lastDownTime2 = now2;
  }

  // Quick toggle crouch with C key (testing)
  if (key === "c") {
    player.state = player.state === "crouching" ? "standing" : "crouching";
  }
});

window.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});

// ===== SHOOT =====
function shoot() {
  shootFrom(player);
}

// Shoot from a specific player (supports player and player2)
function shootFrom(p) {
  if (p.state === "laying") return;

  const isPlayer1 = p === player;
  if (isPlayer1) {
    if (isReloading1 || ammo1 <= 0) return;
    ammo1--;
    ammoDisplay1.textContent = ammo1;
  } else {
    if (isReloading2 || ammo2 <= 0) return;
    ammo2--;
    ammoDisplay2.textContent = ammo2;
  }

  const direction = p.facing;
  bullets.push({
    x: p.x + (direction === 1 ? 145 : -150),
    y: p.y + (p.state === "crouching" ? -10 :  8),
    vx: direction * bulletSpeed,
    vy: 0,
    life: 70      
  });
}
                 
// ===== UPDATE =====
function update() {
  // Horizontal movement
  if (keys["arrowleft"] && !keys["arrowright"]) {
    player.x -= player.speed;
    player.facing = -1;
  }
  if (keys["arrowright"] && !keys["arrowleft"]) {
    player.x += player.speed;
    player.facing = 1;
  }

  // Jump / Stand up
  if (keys["arrowup"]) {
    if (player.state === "crouching" || player.state === "laying") {
      player.state = "standing";
    } else if (player.onGround) {
      player.vy = player.jumpPower;
      player.onGround = false;
    }
  }

  // Crouch
  if (keys["arrowdown"] && player.onGround && player.state !== "laying") {
    player.state = "crouching";
  } else if (!keys["arrowdown"] && player.state === "crouching") {
    player.state = "standing";
  }

  // ===== PLAYER2 (WASD) =====
  if (keys["a"] && !keys["d"]) {
    player2.x -= player2.speed;
    player2.facing = -1;
  }
  if (keys["d"] && !keys["a"]) {
    player2.x += player2.speed;
    player2.facing = 1;
  }

  // Jump / Stand up for player2
  if (keys["w"]) {
    if (player2.state === "crouching" || player2.state === "laying") {
      player2.state = "standing";
    } else if (player2.onGround) {
      player2.vy = player2.jumpPower;
      player2.onGround = false;
    }
  }

  // Crouch for player2
  if (keys["s"] && player2.onGround && player2.state !== "laying") {
    player2.state = "crouching";
  } else if (!keys["s"] && player2.state === "crouching") {
    player2.state = "standing";
  }

  // Gravity & jumping
  player.vy += player.gravity;
  player.y += player.vy;

  // Gravity & jumping for player2
  player2.vy += player2.gravity;
  player2.y += player2.vy;

  // Ground collision
  const groundY = 500;
  if (player.y >= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
  }
  // Ground collision for player2
  if (player2.y >= groundY) {
    player2.y = groundY;
    player2.vy = 0;
    player2.onGround = true;
  }

  // Boundary collision
  if (player.x < 0) player.x = 0;
  if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

  // Boundary collision for player2
  if (player2.x < 0) player2.x = 0;
  if (player2.x + player2.width > canvas.width) player2.x = canvas.width - player2.width;

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += bullets[i].vx;
    bullets[i].y += bullets[i].vy;
    bullets[i].life--;

    if (bullets[i].life <= 0 || bullets[i].x < 0 || bullets[i].x > canvas.width) {
      bullets.splice(i, 1);
    }
  }

  // Reload
  // Reload for player1 (red)
  if (isReloading1) {
    reloadTimer1--;
    if (reloadTimer1 <= 0) {
      isReloading1 = false;
      ammo1 = maxAmmo;
      ammoDisplay1.textContent = ammo1;
    }
  }
  // Reload for player2 (blue)
  if (isReloading2) {
    reloadTimer2--;
    if (reloadTimer2 <= 0) {
      isReloading2 = false;
      ammo2 = maxAmmo;
      ammoDisplay2.textContent = ammo2;
    }
  }
}

// ===== DRAW =====
function draw() {
  // Clear canvas
  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw ground
  ctx.fillStyle = "#228B22";
  ctx.fillRect(0, 500, canvas.width, canvas.height);

  // Helper to draw a player (shared logic)
  function drawPlayer(p, colors) {
    const sway = Math.sin(time * 0.05) * 3;
    const bob = Math.sin(time * 0.08) * 2;
    const facing = p.facing;

    const isCrouch = p.state === "crouching";
    const legStartY = p.y + (isCrouch ? 45 : 40) + bob;
    const legEndY = p.y + (isCrouch ? 80 : 110) + bob;
    const legEndX = isCrouch ? 15 : 25;
    const bodyY = p.y + (isCrouch ? -10 : -30) + bob;
    const bodyH = isCrouch ? 50 : 70;
    const headY = p.y + (isCrouch ? -40 : -55) + bob;
    const headR = isCrouch ? 24 : 28;
    const eyesY = p.y + (isCrouch ? -45 : -60) + bob;
    const rightUpperStartX = p.x + 25 + sway;
    const rightUpperStartY = p.y - 10 + bob;
    const rightUpperEndX = p.x + (isCrouch ? 45 : 55) + sway;
    const rightUpperEndY = p.y + (isCrouch ? 20 : 5) + bob;
    const rightLowerEndX = p.x + (isCrouch ? 65 : 85) + sway;
    const rightLowerEndY = p.y + (isCrouch ? 30 : 10) + bob;
    const leftUpperStartX = p.x - 25 + sway;
    const leftUpperStartY = p.y - 10 + bob;
    const leftUpperEndX = p.x - (isCrouch ? 45 : 55) + sway;
    const leftUpperEndY = p.y + (isCrouch ? 20 : 5) + bob;
    const leftLowerEndX = p.x - (isCrouch ? 65 : 85) + sway;
    const leftLowerEndY = p.y + (isCrouch ? 30 : 10) + bob;
    const gunX = p.x + (facing === 1 ? (isCrouch ? 65 : 85) : -(isCrouch ? 65 : 85)) + sway;
    const gunY = p.y + (isCrouch ? 30 : 10) + bob;

    // Legs
    ctx.strokeStyle = colors.legStroke;
    ctx.lineWidth = 8;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(p.x - 10 + sway, legStartY);
    ctx.lineTo(p.x - legEndX + sway, legEndY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p.x + 10 + sway, legStartY);
    ctx.lineTo(p.x + legEndX + sway, legEndY);
    ctx.stroke();

    // Body
    ctx.fillStyle = colors.body;
    ctx.beginPath();
    ctx.roundRect(p.x - 25 + sway, bodyY, 50, bodyH, 8);
    ctx.fill();

    // Head
    ctx.fillStyle = colors.head;
    ctx.beginPath();
    ctx.arc(p.x + sway, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(p.x - 10 + sway, eyesY, 5, 0, Math.PI * 2);
    ctx.arc(p.x + 10 + sway, eyesY, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(p.x - 10 + sway, eyesY, 2.5, 0, Math.PI * 2);
    ctx.arc(p.x + 10 + sway, eyesY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Arms
    ctx.strokeStyle = colors.body;
    ctx.lineWidth = 7;

    const gunArm = facing === 1 ? "right" : "left";
    const offHand = gunArm === "right" ? "left" : "right";

    const gunUpperStartX = gunArm === "right" ? rightUpperStartX : leftUpperStartX;
    const gunUpperStartY = gunArm === "right" ? rightUpperStartY : leftUpperStartY;
    const gunUpperEndX = gunArm === "right" ? rightUpperEndX : leftUpperEndX;
    const gunUpperEndY = gunArm === "right" ? rightUpperEndY : leftUpperEndY;
    const gunLowerEndX = gunArm === "right" ? rightLowerEndX : leftLowerEndX;
    const gunLowerEndY = gunArm === "right" ? rightLowerEndY : leftLowerEndY;

    const offHandUpperStartX = offHand === "right" ? rightUpperStartX : leftUpperStartX;
    const offHandUpperStartY = offHand === "right" ? rightUpperStartY : leftUpperStartY;
    const offHandUpperEndX = offHand === "right" ? rightUpperEndX : leftUpperEndX;
    const offHandUpperEndY = offHand === "right" ? rightUpperEndY : leftUpperEndY;
    const offHandLowerEndX = offHand === "right" ? rightLowerEndX : leftLowerEndX;
    const offHandLowerEndY = offHand === "right" ? rightLowerEndY : leftLowerEndY;

    ctx.beginPath();
    ctx.moveTo(gunUpperStartX, gunUpperStartY);
    ctx.lineTo(gunUpperEndX, gunUpperEndY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(gunUpperEndX, gunUpperEndY);
    ctx.lineTo(gunLowerEndX, gunLowerEndY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(offHandUpperStartX, offHandUpperStartY);
    ctx.lineTo(offHandUpperEndX, offHandUpperEndY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(offHandUpperEndX, offHandUpperEndY);
    ctx.lineTo(offHandLowerEndX, offHandLowerEndY);
    ctx.stroke();

    // Gun
    ctx.save();
    ctx.translate(gunX, gunY);
    ctx.scale(facing, 1);

    ctx.fillStyle = "#333";
    ctx.fillRect(0, -6, 55, 14);
    ctx.fillStyle = "#222";
    ctx.fillRect(50, -3, 25, 8);
    ctx.fillStyle = "#444";
    ctx.fillRect(5, 6, 14, 18);
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(18, 10, 6, 0, Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  // Draw both players (player is red, player2 is blue)
  drawPlayer(player, { legStroke: "#e94560", body: "#e94560", head: "#ff6b6b" });
  drawPlayer(player2, { legStroke: "#2f6fe6", body: "#1e90ff", head: "#6fb0ff" });

  // Draw bullets
  ctx.fillStyle = "#FFD700";
  for (let bullet of bullets) {
    ctx.fillRect(bullet.x - 3, bullet.y - 3, 6, 6);
  }

  // Draw reload indicator
  // Draw reload indicators per player
  ctx.fillStyle = "#000";
  ctx.font = "16px Arial";
  if (isReloading1) {
    ctx.fillText("Reloading Red...", 10, 30);
  }
  if (isReloading2) {
    ctx.fillText("Reloading Blue...", 10, 50);
  }
  time++;
}

// ===== GAME LOOP =====
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
