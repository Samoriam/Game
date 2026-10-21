const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ammoDisplay = document.getElementById("ammo");
const maxAmmoDisplay = document.getElementById("maxAmmoDisplay");
const healthDisplay = document.getElementById("health");
const scoreDisplay = document.getElementById("score");
const buffsDisplay = document.getElementById("buffs");
const highScoreDisplay = document.getElementById("highScore");
const selectHighScoreDisplay = document.getElementById("selectHighScore");

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
  speed: 5.5,
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
const purpleBirdMaxHp = 2; // shots needed to kill a purple bird
let gameOver = false;

// ===== SCORE =====
let score = 0;
const birdPoints = 100;
const redBirdPoints = 200;
const redBirdKillBonus = 100;
const purpleBirdPoints = 150;

const highScoreKey = "birdShooterHighScore";
let highScore = Number(localStorage.getItem(highScoreKey)) || 0;
if (highScoreDisplay) highScoreDisplay.textContent = highScore;
if (selectHighScoreDisplay) selectHighScoreDisplay.textContent = highScore;

function checkHighScore() {
  if (score > highScore) {
    highScore = score;
    localStorage.setItem(highScoreKey, highScore);
    if (highScoreDisplay) highScoreDisplay.textContent = highScore;
  }
}

// ===== GUN & AMMO =====
let ammo = 40;
const maxAmmo = 40; // base cap - see effectiveMaxAmmo() for the triple-ammo buff
let isReloading = false;
let reloadTimer = 0;
const reloadTime = 90;

function updateAmmoDisplay() {
  ammoDisplay.textContent = ammo;
  if (maxAmmoDisplay) maxAmmoDisplay.textContent = effectiveMaxAmmo();
}

// ===== BULLETS =====
const bullets = [];
const bulletSpeed = 14;
const mobileBulletSpeedMultiplier = 1.6;

// ===== EXPLOSIONS =====
const explosions = [];

// ===== POWER-UPS =====
// Purple birds (rare, 2 hits to kill) drop one of these on death. Walk into
// a dropped power-up to activate it; uncollected drops disappear after
// powerUpLifetime, and an activated effect lasts powerUpDuration.
const powerUps = [];
const powerUpTypes = ["bubble", "tripleAmmo", "rapidFire"];
const powerUpLifetime = 20 * 60; // 20s before an uncollected drop disappears
const powerUpDuration = 30 * 60; // 30s active effect once picked up
const powerUpPickupRadius = 36;
const powerUpGroundY = 490;

let shieldTimer = 0;
let tripleAmmoTimer = 0;
let rapidFireTimer = 0;

function spawnPowerUp(x) {
  const type = powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
  powerUps.push({ x, y: powerUpGroundY, type, life: powerUpLifetime, bob: Math.random() * Math.PI * 2 });
}

function effectiveMaxAmmo() {
  return tripleAmmoTimer > 0 ? maxAmmo * 3 : maxAmmo;
}

function activatePowerUp(type) {
  if (type === "bubble") {
    shieldTimer = powerUpDuration;
  } else if (type === "tripleAmmo") {
    tripleAmmoTimer = powerUpDuration;
    ammo = effectiveMaxAmmo();
    updateAmmoDisplay();
  } else if (type === "rapidFire") {
    rapidFireTimer = powerUpDuration;
  }
}

function updateBuffsDisplay() {
  if (!buffsDisplay) return;
  const parts = [];
  if (shieldTimer > 0) parts.push(`Shield ${Math.ceil(shieldTimer / 60)}s`);
  if (tripleAmmoTimer > 0) parts.push(`3x Ammo ${Math.ceil(tripleAmmoTimer / 60)}s`);
  if (rapidFireTimer > 0) parts.push(`Rapid Fire ${Math.ceil(rapidFireTimer / 60)}s`);
  buffsDisplay.textContent = parts.join(" | ");
}

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

let manualAimDir = null; // unit vector set while the mobile aim stick is actively deflected

// Hold-to-fire, shared by desktop left-click and the mobile aim stick
let fireHeld = false;
let fireCooldown = 0;
const baseFireRate = 10; // frames between repeated shots while held

function currentFireRate() {
  return rapidFireTimer > 0 ? Math.max(3, Math.round(baseFireRate / 2)) : baseFireRate;
}

function getAimTarget(p) {
  if (manualAimDir) {
    return {
      x: p.x + p.width / 2 + manualAimDir.x * 1000,
      y: p.y + manualAimDir.y * 1000
    };
  }

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

const purpleBirdSpawnChance = 0.05; // rare
const redBirdSpawnChance = 0.2;

// Birds fly a little faster for every birdSpeedUpInterval points scored
const birdSpeedUpInterval = 500;
const birdSpeedUpAmount = 0.15; // +15% flight speed per tier

function birdSpeedMultiplier() {
  return 1 + Math.floor(score / birdSpeedUpInterval) * birdSpeedUpAmount;
}

function spawnBird() {
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? -40 : canvas.width + 40;
  const y = 50 + Math.random() * 180;
  const speed = (1.5 + Math.random() * 2.5) * birdSpeedMultiplier();

  const typeRoll = Math.random();
  const isPurple = typeRoll < purpleBirdSpawnChance;
  const isExploding = !isPurple && typeRoll < purpleBirdSpawnChance + redBirdSpawnChance;

  birds.push({
    x,
    y,
    width: 28,
    height: 16,
    vx: (fromLeft ? 1 : -1) * speed,
    phase: Math.random() * Math.PI * 2,
    alive: true,
    isExploding,
    isPurple,
    dying: false,
    attacking: false,
    hp: isExploding ? redBirdMaxHp : (isPurple ? purpleBirdMaxHp : 1),
    retreatTimer: 0,
    fallVy: 0,
    rotation: 0
  });
}

function drawBird(bird) {
  if (!bird.alive) return;

  const direction = bird.vx >= 0 ? 1 : -1;
  const wingLift = Math.sin(time * 0.18 + bird.phase) * 8;
  const bodyColor = bird.isExploding ? "#8b1a1a" : bird.isPurple ? "#6a1b9a" : "#2d2d2d";
  const wingColor = bird.isExploding ? "#5c0f0f" : bird.isPurple ? "#4a0f72" : "#171717";

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

  const maxHpForBird = bird.isExploding ? redBirdMaxHp : (bird.isPurple ? purpleBirdMaxHp : 1);
  if (!bird.dying && maxHpForBird > 1 && bird.hp < maxHpForBird) {
    const barWidth = 30;
    const barHeight = 5;
    const barX = bird.x - barWidth / 2;
    const barY = bird.y - 22;
    const hpFraction = Math.max(bird.hp, 0) / maxHpForBird;

    ctx.fillStyle = "#333";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = bird.isPurple ? "#b266ff" : "#ff3b3b";
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
  if (key === "shift" && !isReloading && ammo < effectiveMaxAmmo()) {
    isReloading = true;
    reloadTimer = reloadTime;
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

// ===== DESKTOP: left-click (hold) to shoot =====
canvas.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  if (!gameStarted) return;

  if (gameOver) {
    resetGame();
    return;
  }

  fireHeld = true;
  shoot();
  fireCooldown = currentFireRate();
});

window.addEventListener("mouseup", (e) => {
  if (e.button !== 0) return;
  fireHeld = false;
});

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

  function resetJoystickKeys() {
    keys["arrowleft"] = false;
    keys["arrowright"] = false;
    keys["arrowup"] = false;
    keys["arrowdown"] = false;
  }

  function updateJoystick(clientX, clientY) {
    const rawDx = clientX - joystickCenterX;
    const rawDy = clientY - joystickCenterY;
    const dist = Math.hypot(rawDx, rawDy) || 1;
    const clampedDist = Math.min(dist, joystickRadius);
    const dx = (rawDx / dist) * clampedDist;
    const dy = (rawDy / dist) * clampedDist;
    joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;

    keys["arrowleft"] = dx < -deadzone;
    keys["arrowright"] = dx > deadzone;
    keys["arrowup"] = dy < -deadzone;
    keys["arrowdown"] = dy > deadzone;
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

// Aim stick: drag to aim, hold it down to fire continuously in that
// direction (shares the fireHeld hold-to-fire logic in update() with
// desktop's left-click). No separate fire button.
const aimStickBase = document.getElementById("aimStickBase");
const aimStickThumb = document.getElementById("aimStickThumb");
if (aimStickBase && aimStickThumb) {
  const aimRadius = 45;
  const aimDeadzone = 10;
  let aimTouchId = null;
  let aimCenterX = 0;
  let aimCenterY = 0;

  function findAimTouch(touchList) {
    for (let i = 0; i < touchList.length; i++) {
      if (touchList[i].identifier === aimTouchId) return touchList[i];
    }
    return null;
  }

  function updateAimStick(clientX, clientY) {
    const rawDx = clientX - aimCenterX;
    const rawDy = clientY - aimCenterY;
    const dist = Math.hypot(rawDx, rawDy) || 1;
    const clampedDist = Math.min(dist, aimRadius);

    aimStickThumb.style.transform = `translate(${(rawDx / dist) * clampedDist}px, ${(rawDy / dist) * clampedDist}px)`;

    manualAimDir = dist > aimDeadzone ? { x: rawDx / dist, y: rawDy / dist } : null;
  }

  aimStickBase.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (!gameStarted || aimTouchId !== null) return;

    if (gameOver) {
      resetGame();
      return;
    }

    const rect = aimStickBase.getBoundingClientRect();
    aimCenterX = rect.left + rect.width / 2;
    aimCenterY = rect.top + rect.height / 2;
    aimTouchId = e.changedTouches[0].identifier;
    updateAimStick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);

    fireHeld = true;
    shoot();
    fireCooldown = currentFireRate();
  }, { passive: false });

  aimStickBase.addEventListener("touchmove", (e) => {
    if (aimTouchId === null) return;
    const touch = findAimTouch(e.changedTouches);
    if (!touch) return;
    e.preventDefault();
    updateAimStick(touch.clientX, touch.clientY);
  }, { passive: false });

  const endAimTouch = (e) => {
    if (aimTouchId === null) return;
    const touch = findAimTouch(e.changedTouches);
    if (!touch) return;
    e.preventDefault();

    aimTouchId = null;
    fireHeld = false;
    aimStickThumb.style.transform = "translate(0, 0)";
    manualAimDir = null;
  };

  aimStickBase.addEventListener("touchend", endAimTouch, { passive: false });
  aimStickBase.addEventListener("touchcancel", endAimTouch, { passive: false });
}

canvas.addEventListener("click", () => {
  if (gameStarted && gameOver) resetGame();
});

// ===== SHOOT =====
function shoot() {
  if (player.state === "laying") return;
  if (isReloading || ammo <= 0) return;

  ammo--;
  updateAmmoDisplay();

  const angle = getAimAngle(player);
  const muzzle = getMuzzlePosition(player, angle);
  const speed = isTouchDevice ? bulletSpeed * mobileBulletSpeedMultiplier : bulletSpeed;

  bullets.push({
    x: muzzle.x,
    y: muzzle.y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
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

  // Hold-to-fire: desktop left-click or the mobile aim stick
  if (fireCooldown > 0) fireCooldown--;
  if (fireHeld && fireCooldown <= 0) {
    shoot();
    fireCooldown = currentFireRate();
  }

  // Power-up buff timers
  if (shieldTimer > 0) shieldTimer--;
  if (tripleAmmoTimer > 0) tripleAmmoTimer--;
  if (rapidFireTimer > 0) rapidFireTimer--;
  updateBuffsDisplay();

  // Power-up pickups on the ground
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    pu.life--;
    if (pu.life <= 0) {
      powerUps.splice(i, 1);
      continue;
    }

    const dist = Math.hypot((player.x + player.width / 2) - pu.x, player.y - pu.y);
    if (dist < powerUpPickupRadius) {
      activatePowerUp(pu.type);
      powerUps.splice(i, 1);
    }
  }

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

          if (bird.isExploding) {
            score += redBirdKillBonus;
          } else if (bird.isPurple) {
            score += purpleBirdPoints;
            spawnPowerUp(bird.x);
          } else {
            score += birdPoints;
          }
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
        player.invincible = redBirdAttackCooldown;
        bird.retreatTimer = redBirdRetreatTime;
        explosions.push({ x: player.x, y: player.y - 30, radius: 6, life: 20 });

        if (shieldTimer <= 0) {
          health -= redBirdDamage;
          if (health < 0) health = 0;
          healthDisplay.textContent = health;

          if (health <= 0) {
            gameOver = true;
            checkHighScore();
            showGameOverOverlay();
          }
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
      ammo = effectiveMaxAmmo();
      updateAmmoDisplay();
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
    if (facing === -1) {
      // Mirror instead of rotating straight through 180deg, so the grip/
      // trigger guard stay below the barrel instead of flipping on top of it.
      ctx.rotate(aimAngle + Math.PI);
      ctx.scale(-1, 1);
    } else {
      ctx.rotate(aimAngle);
    }

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

  // Draw power-up pickups on the ground
  const powerUpColors = { bubble: "#4fc3f7", tripleAmmo: "#ffb300", rapidFire: "#ffee58" };
  const powerUpLabels = { bubble: "SH", tripleAmmo: "x3", rapidFire: "RF" };
  for (const pu of powerUps) {
    const bobY = pu.y + Math.sin(time * 0.1 + pu.bob) * 4;
    ctx.globalAlpha = pu.life < 180 ? Math.max(pu.life / 180, 0.2) : 1;

    ctx.fillStyle = powerUpColors[pu.type];
    ctx.beginPath();
    ctx.arc(pu.x, bobY, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#000";
    ctx.font = "bold 10px Arial";
    ctx.textAlign = "center";
    ctx.fillText(powerUpLabels[pu.type], pu.x, bobY + 3);
    ctx.textAlign = "left";

    ctx.globalAlpha = 1;
  }

  // Draw the player (blink while invincible after taking a hit)
  if (player.invincible <= 0 || Math.floor(time / 4) % 2 === 0) {
    drawPlayer(player, playerColors);
  }

  // Draw the protective bubble shield
  if (shieldTimer > 0) {
    ctx.strokeStyle = "rgba(79, 195, 247, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y - 20, 55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 195, 247, 0.12)";
    ctx.fill();
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

  time++;
}

// ===== GAME LOOP =====
let animationFrameId = null;

function gameLoop() {
  update();
  draw();
  animationFrameId = requestAnimationFrame(gameLoop);
}

function stopGameLoop() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// ===== GAME OVER OVERLAY (Replay / Exit) =====
const gameOverOverlay = document.getElementById("gameOverOverlay");
const finalScoreDisplay = document.getElementById("finalScore");
const finalHighScoreDisplay = document.getElementById("finalHighScore");
const replayBtn = document.getElementById("replayBtn");
const exitBtn = document.getElementById("exitBtn");
const characterSelectEl = document.getElementById("characterSelect");
const gameAreaEl = document.getElementById("gameArea");

function showGameOverOverlay() {
  if (finalScoreDisplay) finalScoreDisplay.textContent = score;
  if (finalHighScoreDisplay) finalHighScoreDisplay.textContent = highScore;
  if (gameOverOverlay) gameOverOverlay.classList.remove("hidden");
}

if (replayBtn) {
  replayBtn.addEventListener("click", () => resetGame());
}

if (exitBtn) {
  exitBtn.addEventListener("click", () => {
    stopGameLoop();
    resetGame();
    gameStarted = false;
    if (gameAreaEl) gameAreaEl.classList.add("hidden");
    if (characterSelectEl) characterSelectEl.classList.remove("hidden");
  });
}

// Called once the player picks a character on the selection screen
function startGame(character) {
  playerColors = characterColors[character] || characterColors.red;
  resetGame();
  gameStarted = true;
  stopGameLoop();
  gameLoop();
}

// Reset all game state after a Game Over
function resetGame() {
  health = maxHealth;
  healthDisplay.textContent = health;
  score = 0;
  scoreDisplay.textContent = score;
  isReloading = false;
  reloadTimer = 0;
  gameOver = false;
  if (gameOverOverlay) gameOverOverlay.classList.add("hidden");

  shieldTimer = 0;
  tripleAmmoTimer = 0;
  rapidFireTimer = 0;
  updateBuffsDisplay();

  ammo = effectiveMaxAmmo();
  updateAmmoDisplay();

  player.x = 300;
  player.y = 450;
  player.vy = 0;
  player.onGround = true;
  player.state = "standing";
  player.invincible = 0;

  bullets.length = 0;
  birds.length = 0;
  explosions.length = 0;
  powerUps.length = 0;
}
