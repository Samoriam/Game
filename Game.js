const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ammoDisplay = document.getElementById("ammo");

// ===== PLAYER =====
const player = {
  x: 450,
  y: 450,
  width: 40,
  height: 80,
  speed: 4,
  jumpPower: -12,
  gravity: 0.5,
  vy: 0,
  onGround: true,
  state: "standing" // standing | crouching | laying
};
let time = 0;

// ===== GUN & AMMO =====
let ammo = 12;
const maxAmmo = 12;
let isReloading = false;
let reloadTimer = 0;
const reloadTime = 90;

// ===== BULLETS =====
const bullets = [];
const bulletSpeed = 14;


// ===== KEYS & DOUBLE TAP =====
const keys = {};
let lastDownTime = 0;

// ===== EVENT LISTENERS =====
window.addEventListener("keydown", e => {
  const key = e.key.toLowerCase();
  keys[key] = true;

  // Prevent page scrolling with arrows & space
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
    e.preventDefault();
  }

  // Reload with Shift
  if ((key === "shift") && !isReloading && ammo < maxAmmo) {
    isReloading = true;
    reloadTimer = reloadTime;
  }

  // Shoot with Space
  if (key === " " || key === "spacebar") {
    shoot();
  }

  // Double tap Down to lay down
  if (key === "arrowdown") {
    const now = Date.now();
    if (now - lastDownTime < 300) {
      player.state = "laying";
    }
    lastDownTime = now;
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
  if (isReloading || ammo <= 0) return;
  if (player.state === "laying") return; // optional: can't shoot while laying

  ammo--;
  ammoDisplay.textContent = ammo;

  // Shoot to the right (you can change direction later)
  const direction = keys["arrowleft"] ? -1 : 1;

  bullets.push({
    x: player.x + (direction === 1 ? 150 : -30),
    y: player.y - (player.state === "crouching" ? 25 : -10),
    vx: direction * bulletSpeed,
    vy: 0,
    life: 70      
  });
}
                 
// ===== UPDATE =====
function update() {
  // Horizontal movement
  if (keys["arrowleft"]) {
    player.x -= player.speed;
  }
  if (keys["arrowright"]) {
    player.x += player.speed;
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

  // Gravity & jumping
  player.vy += player.gravity;
  player.y += player.vy;

  // Ground collision
  const groundY = 500;
  if (player.y >= groundY) {
    player.y = groundY;
    player.vy = 0;
    player.onGround = true;
  }

  // Boundary collision
  if (player.x < 0) player.x = 0;
  if (player.x + player.width > canvas.width) player.x = canvas.width - player.width;

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
  if (isReloading) {
    reloadTimer--;
    if (reloadTimer <= 0) {
      isReloading = false;
      ammo = maxAmmo;
      ammoDisplay.textContent = ammo;
    }
  }
}

// ===== DRAW =====
function draw(state = player.state) {
  // Clear canvas
  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // sway and bob for visual effect (optional)
  const sway = Math.sin(time * 0.05) * 3;
  const bob = Math.sin(time * 0.08) * 2;

  // state-specific offsets (standing vs crouching)
  const isCrouch = state === "crouching";
  const legStartY = player.y + (isCrouch ? 45 : 40) + bob;
  const legEndY = player.y + (isCrouch ? 80 : 110) + bob;
  const legEndX = isCrouch ? 15 : 25;
  const bodyY = player.y + (isCrouch ? -10 : -30) + bob;
  const bodyH = isCrouch ? 50 : 70;
  const headY = player.y + (isCrouch ? -40 : -55) + bob;
  const headR = isCrouch ? 24 : 28;
  const eyesY = player.y + (isCrouch ? -45 : -60) + bob;
  const rightUpperStartX = player.x + 25 + sway;
  const rightUpperStartY = player.y - 10 + bob;
  const rightUpperEndX = player.x + (isCrouch ? 45 : 55) + sway;
  const rightUpperEndY = player.y + (isCrouch ? 20 : 5) + bob;
  const rightLowerEndX = player.x + (isCrouch ? 65 : 85) + sway;
  const rightLowerEndY = player.y + (isCrouch ? 30 : 10) + bob;
  const leftUpperStartX = player.x - 25 + sway;
  const leftUpperStartY = player.y - 10 + bob;
  const leftUpperEndX = player.x - (isCrouch ? 45 : 55) + sway;
  const leftUpperEndY = player.y + (isCrouch ? 20 : 5) + bob;
  const leftLowerEndX = player.x - (isCrouch ? 65 : 85) + sway;
  const leftLowerEndY = player.y + (isCrouch ? 30 : 10) + bob;
  const gunX = player.x + (isCrouch ? 65 : 85) + sway;
  const gunY = player.y + (isCrouch ? 30 : 10) + bob;

  // Draw ground
  ctx.fillStyle = "#228B22";
  ctx.fillRect(0, 500, canvas.width, canvas.height);

  // ===== LEGS =====~
  ctx.strokeStyle = "#e94560";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";

  // Left leg
  ctx.beginPath();
  ctx.moveTo(player.x - 10 + sway, legStartY);
  ctx.lineTo(player.x - legEndX + sway, legEndY);
  ctx.stroke();

  // Right leg
  ctx.beginPath();
  ctx.moveTo(player.x + 10 + sway, legStartY);
  ctx.lineTo(player.x + legEndX + sway, legEndY);
  ctx.stroke();

// ===== BODY =====
  ctx.fillStyle = "#e94560";
  ctx.beginPath();
  ctx.roundRect(player.x - 25 + sway, bodyY, 50, bodyH, 8);
  ctx.fill();

  // ===== HEAD =====
  ctx.fillStyle = "#ff6b6b";
  ctx.beginPath();
  ctx.arc(player.x + sway, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(player.x - 10 + sway, eyesY, 5, 0, Math.PI * 2);
  ctx.arc(player.x + 10 + sway, eyesY, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(player.x - 10 + sway, eyesY, 2.5, 0, Math.PI * 2);
  ctx.arc(player.x + 10 + sway, eyesY, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // ===== RIGHT ARM (holding gun) =====
  ctx.strokeStyle = "#e94560";
  ctx.lineWidth = 7;

  // Upper arm
  ctx.beginPath();
  ctx.moveTo(rightUpperStartX, rightUpperStartY);
  ctx.lineTo(rightUpperEndX, rightUpperEndY);
  ctx.stroke();

  // Lower arm + hand
  ctx.beginPath();
  ctx.moveTo(rightUpperEndX, rightUpperEndY);
  ctx.lineTo(rightLowerEndX, rightLowerEndY);
  ctx.stroke();

  // ===== LEFT ARM =====
  ctx.strokeStyle = "#e94560";
  ctx.lineWidth = 7;

  // Upper arm
  ctx.beginPath();
  ctx.moveTo(leftUpperStartX, leftUpperStartY);
  ctx.lineTo(leftUpperEndX, leftUpperEndY);
  ctx.stroke();

  // Lower arm + hand
  ctx.beginPath();
  ctx.moveTo(leftUpperEndX, leftUpperEndY);
  ctx.lineTo(leftLowerEndX, leftLowerEndY);
  ctx.stroke();

   // ===== GUN =====
  // Gun position depends on state
  // (gunX/gunY were computed above)

  // Gun body
  ctx.fillStyle = "#333";
  ctx.fillRect(gunX, gunY - 6, 55, 14);

  // Barrel
  ctx.fillStyle = "#222";
  ctx.fillRect(gunX + 50, gunY - 3, 25, 8);

  // Grip
  ctx.fillStyle = "#444";
  ctx.fillRect(gunX + 5, gunY + 6, 14, 18);

  // Trigger guard
  ctx.strokeStyle = "#555";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(gunX + 18, gunY + 10, 6, 0, Math.PI);
  ctx.stroke();

  // Draw bullets
  ctx.fillStyle = "#FFD700";
  for (let bullet of bullets) {
    ctx.fillRect(bullet.x - 3, bullet.y - 3, 6, 6);
  }

  // Draw reload indicator
  if (isReloading) {
    ctx.fillStyle = "#000";
    ctx.font = "16px Arial";
    ctx.fillText("Reloading...", 10, 30);
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
