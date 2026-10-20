const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ammoDisplay = document.getElementById("ammo");
const livesDisplay = document.getElementById("lives");

// ===== CHARACTER COLORS =====
const characterColors = {
  red: { legStroke: "#e94560", body: "#e94560", head: "#ff6b6b" },
  blue: { legStroke: "#2f6fe6", body: "#1e90ff", head: "#6fb0ff" }
};
let playerColors = characterColors.red;

// ===== PLAYER =====
const player = {
  x: 300,
  y: 450,
  width: 40,
  height: 80,
  speed: 4,
  jumpPower: -15,
  gravity: 0.5,
  vy: 0,
  onGround: true,
  facing: 1, // 1 = right, -1 = left
  state: "standing", // standing | crouching | laying
  invincible: 0
};
let time = 0;

// ===== HEALTH =====
const maxLives = 3;
let lives = maxLives;
let gameOver = false;

// ===== GUN & AMMO =====
let ammo = 20;
const maxAmmo = 20;
let isReloading = false;
let reloadTimer = 0;
const reloadTime = 90;

// ===== BULLETS =====
const bullets = [];
const bulletSpeed = 14;

// ===== BOMBS & EXPLOSIONS =====
const bombs = [];
const bombGravity = 0.35;
const explosions = [];

// ===== AIMING =====
const mouse = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  active: false
};

window.addEventListener("mousemove", (event) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  mouse.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
  mouse.active = true;
});

window.addEventListener("mouseleave", () => {
  mouse.active = false;
});

function getAimTarget(p) {
  let target = { x: mouse.x, y: mouse.y };

  if (!mouse.active) {
    let nearestBird = null;
    let nearestDistance = Infinity;

    for (const bird of birds) {
      if (!bird.alive || bird.dying) continue;
      const distance = Math.hypot(bird.x - (p.x + p.width / 2), bird.y - (p.y + p.height / 2));
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestBird = bird;
      }
    }

    if (nearestBird) {
      target = { x: nearestBird.x, y: nearestBird.y };
    }
  }

  return target;
}

// Gun pivot point in world space (matches the translate() used when drawing the gun)
function getGunPivot(p) {
  const isCrouch = p.state === "crouching";
  const sway = Math.sin(time * 0.05) * 3;
  const bob = Math.sin(time * 0.08) * 2;
  const gunX = p.x + (p.facing === 1 ? (isCrouch ? 65 : 85) : -(isCrouch ? 65 : 85)) + sway;
  const gunY = p.y + (isCrouch ? 30 : 10) + bob;
  return { x: gunX, y: gunY };
}

// World-space position of the gun's muzzle, accounting for the current aim angle
function getMuzzlePosition(p, angle) {
  const pivot = getGunPivot(p);
  const barrelLength = 75; // matches the barrel rect's far edge in drawPlayer's gun
  const localOffsetY = 1; // vertical center of the gun body/barrel rects
  return {
    x: pivot.x + Math.cos(angle) * barrelLength - Math.sin(angle) * localOffsetY,
    y: pivot.y + Math.sin(angle) * barrelLength + Math.cos(angle) * localOffsetY
  };
}

function getAimAngle(p) {
  const target = getAimTarget(p);
  const dx = target.x - (p.x + p.width / 2);
  const dy = target.y - (p.y + p.height / 2);
  const angle = Math.atan2(dy, dx);

  if (dx >= 0) {
    p.facing = 1;
  } else {
    p.facing = -1;
  }

  return angle;
}

// ===== BIRDS =====
const birds = [];
const maxBirds = 7;
let birdSpawnTimer = 0;

function spawnBird() {
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? -40 : canvas.width + 40;
  const y = 50 + Math.random() * 180;
  const speed = 1.5 + Math.random() * 2.5;

  birds.push({
    x,
    y,
    width: 28,
    height: 16,
    vx: (fromLeft ? 1 : -1) * speed,
    phase: Math.random() * Math.PI * 2,
    alive: true,
    isExploding: Math.random() < 0.2,
    dying: false,
    fallVy: 0,
    rotation: 0
  });
}

function drawBird(bird) {
  if (!bird.alive) return;

  const direction = bird.vx >= 0 ? 1 : -1;
  const wingLift = Math.sin(time * 0.18 + bird.phase) * 8;
  const bodyColor = bird.isExploding ? "#8b1a1a" : "#2d2d2d";
  const wingColor = bird.isExploding ? "#5c0f0f" : "#171717";

  ctx.save();
  ctx.translate(bird.x, bird.y);
  if (bird.dying) ctx.rotate(bird.rotation);
  ctx.scale(direction, 1);

  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = wingColor;
  ctx.beginPath();
  ctx.moveTo(-4, -1);
  ctx.lineTo(-16, -10 - wingLift);
  ctx.lineTo(-10, 0);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-4, -1);
  ctx.lineTo(-16, 10 + wingLift);
  ctx.lineTo(-10, 0);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(7, -2, 2.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(7, -2, 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// Setup reload button handler (if element exists)
const reloadBtn = document.getElementById("reload");
if (reloadBtn) {
  reloadBtn.addEventListener("click", () => {
    if (!isReloading && ammo < maxAmmo) {
      isReloading = true;
      reloadTimer = reloadTime;
    }
  });
}

// ===== KEYS & DOUBLE TAP =====
const keys = {};
let lastDownTime = 0;
let gameStarted = false;

// ===== EVENT LISTENERS =====
window.addEventListener("keydown", e => {
  if (!gameStarted) return;

  const key = e.key.toLowerCase();

  if (gameOver) {
    if (key === "r") resetGame();
    return;
  }

  keys[key] = true;

  // Prevent page scrolling with arrows & space
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
    e.preventDefault();
  }

  // Reload with Shift
  if (key === "shift" && !isReloading && ammo < maxAmmo) {
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
  if (player.state === "laying") return;
  if (isReloading || ammo <= 0) return;

  ammo--;
  ammoDisplay.textContent = ammo;

  const angle = getAimAngle(player);
  const muzzle = getMuzzlePosition(player, angle);

  bullets.push({
    x: muzzle.x,
    y: muzzle.y,
    vx: Math.cos(angle) * bulletSpeed,
    vy: Math.sin(angle) * bulletSpeed,
    life: 70
  });
}

// ===== UPDATE =====
function update() {
  if (gameOver) return;

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

  // Invincibility countdown after taking a hit
  if (player.invincible > 0) player.invincible--;

  // Update bullets
  for (let i = bullets.length - 1; i >= 0; i--) {
    bullets[i].x += bullets[i].vx;
    bullets[i].y += bullets[i].vy;
    bullets[i].life--;

    if (bullets[i].life <= 0 || bullets[i].x < 0 || bullets[i].x > canvas.width) {
      bullets.splice(i, 1);
      continue;
    }

    for (let j = birds.length - 1; j >= 0; j--) {
      const bird = birds[j];
      if (!bird.alive || bird.dying) continue;

      const hitBird =
        bullets[i].x > bird.x - bird.width / 2 &&
        bullets[i].x < bird.x + bird.width / 2 &&
        bullets[i].y > bird.y - bird.height / 2 &&
        bullets[i].y < bird.y + bird.height / 2;

      if (hitBird) {
        bird.dying = true;
        bird.fallVy = -3;

        if (bird.isExploding) {
          bombs.push({ x: bird.x, y: bird.y, vy: 0 });
        }

        bullets.splice(i, 1);
        break;
      }
    }
  }

  // Bird population and flight
  if (birdSpawnTimer > 0) {
    birdSpawnTimer--;
  }

  if (birds.length < maxBirds && birdSpawnTimer <= 0) {
    spawnBird();
    birdSpawnTimer = 60 + Math.random() * 90;
  }

  for (let i = birds.length - 1; i >= 0; i--) {
    const bird = birds[i];

    if (bird.dying) {
      bird.fallVy += player.gravity;
      bird.y += bird.fallVy;
      bird.x += bird.vx * 0.3;
      bird.rotation += (bird.vx >= 0 ? 1 : -1) * 0.15;

      if (bird.y > 520) {
        birds.splice(i, 1);
      }
      continue;
    }

    bird.x += bird.vx;
    bird.y += Math.sin((time * 0.08) + bird.phase) * 0.7;

    if (bird.x < -60 || bird.x > canvas.width + 60) {
      birds.splice(i, 1);
    }
  }

  // Update bombs dropped by exploding birds
  for (let i = bombs.length - 1; i >= 0; i--) {
    const bomb = bombs[i];
    bomb.vy += bombGravity;
    bomb.y += bomb.vy;

    const hitPlayer =
      player.invincible <= 0 &&
      bomb.x > player.x - 35 &&
      bomb.x < player.x + 35 &&
      bomb.y > player.y - 90 &&
      bomb.y < player.y + 110;

    if (hitPlayer) {
      explosions.push({ x: bomb.x, y: bomb.y, radius: 6, life: 20 });
      bombs.splice(i, 1);

      lives--;
      livesDisplay.textContent = lives;
      player.invincible = 90;

      if (lives <= 0) {
        gameOver = true;
      }
      continue;
    }

    if (bomb.y > 500) {
      explosions.push({ x: bomb.x, y: 500, radius: 6, life: 20 });
      bombs.splice(i, 1);
    }
  }

  // Update explosion visuals
  for (let i = explosions.length - 1; i >= 0; i--) {
    explosions[i].radius += 2;
    explosions[i].life--;
    if (explosions[i].life <= 0) {
      explosions.splice(i, 1);
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
function draw() {
  // Clear canvas
  ctx.fillStyle = "#87CEEB";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw ground
  ctx.fillStyle = "#228B22";
  ctx.fillRect(0, 500, canvas.width, canvas.height);

  // Helper to draw the player
  function drawPlayer(p, colors) {
    const sway = Math.sin(time * 0.05) * 3;
    const bob = Math.sin(time * 0.08) * 2;
    const aimAngle = getAimAngle(p);
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
    ctx.rotate(aimAngle);

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

  // Draw birds in the sky
  for (const bird of birds) {
    drawBird(bird);
  }

  // Draw the player (blink while invincible after taking a hit)
  if (player.invincible <= 0 || Math.floor(time / 4) % 2 === 0) {
    drawPlayer(player, playerColors);
  }

  // Draw bullets
  ctx.fillStyle = "#000000";
  for (let bullet of bullets) {
    ctx.fillRect(bullet.x - 3, bullet.y - 3, 6, 6);
  }

  // Draw bombs dropped by exploding birds
  ctx.fillStyle = "#111";
  for (const bomb of bombs) {
    ctx.beginPath();
    ctx.arc(bomb.x, bomb.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ff8c00";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bomb.x, bomb.y - 8);
    ctx.lineTo(bomb.x + 4, bomb.y - 14);
    ctx.stroke();
  }

  // Draw explosion bursts
  for (const explosion of explosions) {
    const alpha = Math.max(explosion.life / 20, 0);
    ctx.fillStyle = `rgba(255, 140, 0, ${alpha})`;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 60, 0, ${alpha * 0.7})`;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, explosion.radius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw reload indicator
  ctx.fillStyle = "#000";
  ctx.font = "16px Arial";
  if (isReloading) {
    ctx.fillText("Reloading...", 10, 30);
  }

  // Game over overlay
  if (gameOver) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = "48px Arial";
    ctx.fillText("GAME OVER", canvas.width / 2, canvas.height / 2 - 10);
    ctx.font = "20px Arial";
    ctx.fillText("Press R to Restart", canvas.width / 2, canvas.height / 2 + 30);
    ctx.textAlign = "left";
  }

  time++;
}

// ===== GAME LOOP =====
function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

// Called once the player picks a character on the selection screen
function startGame(character) {
  playerColors = characterColors[character] || characterColors.red;
  gameStarted = true;
  gameLoop();
}

// Reset all game state after a Game Over
function resetGame() {
  lives = maxLives;
  livesDisplay.textContent = lives;
  ammo = maxAmmo;
  ammoDisplay.textContent = ammo;
  isReloading = false;
  reloadTimer = 0;
  gameOver = false;

  player.x = 300;
  player.y = 450;
  player.vy = 0;
  player.onGround = true;
  player.state = "standing";
  player.invincible = 0;

  bullets.length = 0;
  birds.length = 0;
  bombs.length = 0;
  explosions.length = 0;
}
