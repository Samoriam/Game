const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ammoDisplay = document.getElementById("ammo");
const healthDisplay = document.getElementById("health");
const scoreDisplay = document.getElementById("score");

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
const maxHealth = 100;
let health = maxHealth;
const redBirdDamage = 10; // % health lost per red bird attack
const redBirdChaseSpeed = 6;
const redBirdAttackRange = 40;
const redBirdAttackCooldown = 60; // frames of player invincibility between attacks
const redBirdMaxHp = 3; // shots needed to kill a red bird
const redBirdRetreatSpeed = 4;
const redBirdRetreatTime = 90; // frames the bird backs off after landing a hit, giving the player room to shoot back
let gameOver = false;

// ===== SCORE =====
let score = 0;
const birdPoints = 100;
const redBirdPoints = 200;
const redBirdKillBonus = 100;

// ===== GUN & AMMO =====
let ammo = 20;
const maxAmmo = 20;
let isReloading = false;
let reloadTimer = 0;
const reloadTime = 90;

// ===== BULLETS =====
const bullets = [];
const bulletSpeed = 14;

// ===== EXPLOSIONS =====
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
  const isExploding = Math.random() < 0.2;

  birds.push({
    x,
    y,
    width: 28,
    height: 16,
    vx: (fromLeft ? 1 : -1) * speed,
    phase: Math.random() * Math.PI * 2,
    alive: true,
    isExploding,
    dying: false,
    attacking: false,
    hp: isExploding ? redBirdMaxHp : 1,
    retreatTimer: 0,
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

  if (bird.isExploding && bird.attacking && !bird.dying) {
    const barWidth = 30;
    const barHeight = 5;
    const barX = bird.x - barWidth / 2;
    const barY = bird.y - 22;
    const hpFraction = Math.max(bird.hp, 0) / redBirdMaxHp;

    ctx.fillStyle = "#333";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = "#ff3b3b";
    ctx.fillRect(barX, barY, barWidth * hpFraction, barHeight);
  }
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
    registerDownPress();
  }

  // Quick toggle crouch with C key (testing)
  if (key === "c") {
    player.state = player.state === "crouching" ? "standing" : "crouching";
  }
});

window.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});

function registerDownPress() {
  const now = Date.now();
  if (now - lastDownTime < 300) {
    player.state = "laying";
  }
  lastDownTime = now;
}

// ===== TOUCH CONTROLS (mobile) =====
const isTouchDevice = ("ontouchstart" in window) || navigator.maxTouchPoints > 0;
if (isTouchDevice) {
  document.body.classList.add("touch-device");
}

// Virtual joystick: drag to move (left/right), jump (up) or crouch (down)
// Uses classic Touch Events (not Pointer Events) for reliable drag tracking
// across mobile browsers, iOS Safari in particular.
const joystickBase = document.getElementById("joystickBase");
const joystickThumb = document.getElementById("joystickThumb");
if (joystickBase && joystickThumb) {
  const joystickRadius = 45; // max thumb travel in px
  const deadzone = 15; // px before a direction registers
  let joystickTouchId = null;
  let joystickCenterX = 0;
  let joystickCenterY = 0;
  let joystickDown = false;

  function resetJoystickKeys() {
    keys["arrowleft"] = false;
    keys["arrowright"] = false;
    keys["arrowup"] = false;
    keys["arrowdown"] = false;
    joystickDown = false;
  }

  function updateJoystick(clientX, clientY) {
    let dx = clientX - joystickCenterX;
    let dy = clientY - joystickCenterY;
    const dist = Math.hypot(dx, dy);
    if (dist > joystickRadius) {
      dx = (dx / dist) * joystickRadius;
      dy = (dy / dist) * joystickRadius;
    }
    joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;

    keys["arrowleft"] = dx < -deadzone;
    keys["arrowright"] = dx > deadzone;
    keys["arrowup"] = dy < -deadzone;

    const isDown = dy > deadzone;
    if (isDown && !joystickDown) registerDownPress();
    joystickDown = isDown;
    keys["arrowdown"] = isDown;
  }

  function findTouch(touchList) {
    for (let i = 0; i < touchList.length; i++) {
      if (touchList[i].identifier === joystickTouchId) return touchList[i];
    }
    return null;
  }

  joystickBase.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (!gameStarted || gameOver || joystickTouchId !== null) return;

    const touch = e.changedTouches[0];
    const rect = joystickBase.getBoundingClientRect();
    joystickCenterX = rect.left + rect.width / 2;
    joystickCenterY = rect.top + rect.height / 2;
    joystickTouchId = touch.identifier;
    updateJoystick(touch.clientX, touch.clientY);
  }, { passive: false });

  joystickBase.addEventListener("touchmove", (e) => {
    if (joystickTouchId === null) return;
    const touch = findTouch(e.changedTouches);
    if (!touch) return;
    e.preventDefault();
    updateJoystick(touch.clientX, touch.clientY);
  }, { passive: false });

  const endJoystickTouch = (e) => {
    if (joystickTouchId === null) return;
    const touch = findTouch(e.changedTouches);
    if (!touch) return;
    e.preventDefault();
    joystickTouchId = null;
    joystickThumb.style.transform = "translate(0, 0)";
    resetJoystickKeys();
  };

  joystickBase.addEventListener("touchend", endJoystickTouch, { passive: false });
  joystickBase.addEventListener("touchcancel", endJoystickTouch, { passive: false });
}

const touchFireBtn = document.getElementById("touchFire");
if (touchFireBtn) {
  let fireInterval = null;
  let fireTouchId = null;

  const stopFire = () => {
    if (fireInterval) {
      clearInterval(fireInterval);
      fireInterval = null;
    }
    fireTouchId = null;
  };

  touchFireBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (fireTouchId !== null) return;
    fireTouchId = e.changedTouches[0].identifier;

    if (!gameStarted) return;
    if (gameOver) {
      resetGame();
      return;
    }
    shoot();
    fireInterval = setInterval(shoot, 120);
  }, { passive: false });

  touchFireBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    stopFire();
  }, { passive: false });
  touchFireBtn.addEventListener("touchcancel", (e) => {
    e.preventDefault();
    stopFire();
  }, { passive: false });
}

canvas.addEventListener("click", () => {
  if (gameStarted && gameOver) resetGame();
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

  // Auto-reload once the magazine is empty
  if (ammo <= 0 && !isReloading) {
    isReloading = true;
    reloadTimer = reloadTime;
  }
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
        bird.hp--;

        if (bird.isExploding && !bird.attacking) {
          // First hit enrages the red bird instead of killing it
          bird.attacking = true;
          score += redBirdPoints;
        }

        if (bird.hp <= 0) {
          bird.dying = true;
          bird.attacking = false;
          bird.fallVy = -3;
          score += bird.isExploding ? redBirdKillBonus : birdPoints;
        }
        scoreDisplay.textContent = score;

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

    if (bird.attacking) {
      const targetX = player.x + player.width / 2;
      const targetY = player.y;
      const dx = targetX - bird.x;
      const dy = targetY - bird.y;
      const dist = Math.hypot(dx, dy) || 1;

      if (bird.retreatTimer > 0) {
        // Back off after landing a hit so the player has room to shoot back
        bird.retreatTimer--;
        bird.vx = (-dx / dist) * redBirdRetreatSpeed;
        bird.x += bird.vx;
        bird.y += (-dy / dist) * redBirdRetreatSpeed;
        continue;
      }

      bird.vx = (dx / dist) * redBirdChaseSpeed;
      bird.x += bird.vx;
      bird.y += (dy / dist) * redBirdChaseSpeed;

      if (dist < redBirdAttackRange && player.invincible <= 0) {
        health -= redBirdDamage;
        if (health < 0) health = 0;
        healthDisplay.textContent = health;
        player.invincible = redBirdAttackCooldown;
        bird.retreatTimer = redBirdRetreatTime;
        explosions.push({ x: player.x, y: player.y - 30, radius: 6, life: 20 });

        if (health <= 0) {
          gameOver = true;
        }
      }
      continue;
    }

    bird.x += bird.vx;
    bird.y += Math.sin((time * 0.08) + bird.phase) * 0.7;

    if (bird.x < -60 || bird.x > canvas.width + 60) {
      birds.splice(i, 1);
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

  // Draw explosion bursts (red bird attack impacts)
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
    ctx.fillText(`Score: ${score}`, canvas.width / 2, canvas.height / 2 + 20);
    ctx.fillText("Press R to Restart", canvas.width / 2, canvas.height / 2 + 50);
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
  health = maxHealth;
  healthDisplay.textContent = health;
  score = 0;
  scoreDisplay.textContent = score;
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
  explosions.length = 0;
}
