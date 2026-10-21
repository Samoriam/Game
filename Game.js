const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const ammoDisplay = document.getElementById("ammo");
const maxAmmoDisplay = document.getElementById("maxAmmoDisplay");
const healthDisplay = document.getElementById("health");
const maxHealthDisplay = document.getElementById("maxHealthDisplay");
const scoreDisplay = document.getElementById("score");
const buffsDisplay = document.getElementById("buffs");
const highScoreDisplay = document.getElementById("highScore");
const selectHighScoreDisplay = document.getElementById("selectHighScore");
const p2ScoreLine = document.getElementById("p2ScoreLine");
const p2ScoreDisplay = document.getElementById("p2Score");

// ===== CHARACTER COLORS =====
const characterColors = {
  red: { legStroke: "#e94560", body: "#e94560", head: "#ff6b6b" },
  blue: { legStroke: "#2f6fe6", body: "#1e90ff", head: "#6fb0ff" }
};
let playerColors = characterColors.red;
let playerColorKey = "red";

// ===== MULTIPLAYER =====
// Host simulates birds/geese/power-ups and broadcasts them; the guest
// mirrors that broadcast instead of spawning its own. Each player always
// manages their own position/health/ammo/score locally and just shares it.
let remotePlayer = null; // last known state of the other player, or null if solo/not yet heard from
let nextEntityId = 1;
let mpBroadcastTimer = 0;
const mpBroadcastInterval = 3; // frames between network broadcasts (~20/sec)

function isGuestRole() {
  return Net.getRole() === "guest";
}

function simulatingWorld() {
  // True for the host and for solo play - false only for a connected guest,
  // who mirrors the host's broadcast instead.
  return !isGuestRole();
}

function otherPlayerAvailable() {
  return !!remotePlayer && !remotePlayer.gameOver;
}

// Picks whichever player (local or remote) is nearer to a bird, so a
// host-simulated attacking red bird can chase either one.
function getChaseTarget(bird) {
  const localTarget = { x: player.x + player.width / 2, y: player.y, isLocal: true };
  if (!otherPlayerAvailable()) return localTarget;

  const localDist = Math.hypot(localTarget.x - bird.x, localTarget.y - bird.y);
  const remoteX = remotePlayer.x + player.width / 2;
  const remoteDist = Math.hypot(remoteX - bird.x, remotePlayer.y - bird.y);

  if (remoteDist < localDist) {
    return { x: remoteX, y: remotePlayer.y, isLocal: false };
  }
  return localTarget;
}

function inMultiplayerMatch() {
  return !!remotePlayer || Net.isConnected();
}

// ===== 2-PLAYER MATCH: race to winScore, or whoever's ahead when both die =====
const winScore = 7000;
let matchOver = false;

// Called whenever the LOCAL player's health hits 0. In solo play this ends
// the game immediately, same as always. In multiplayer, dying doesn't end
// anything by itself - the player lies down and keeps spectating until
// checkMatchEnd() decides the match is actually over.
function killLocalPlayer() {
  if (gameOver) return;
  gameOver = true;
  player.state = "laying";
  checkHighScore();

  if (!inMultiplayerMatch()) {
    showGameOverOverlay();
  }
}

// "win" | "lose" | "tie" | null (null = not a multiplayer match)
function getMatchOutcome() {
  if (!remotePlayer) return null;

  const iReachedWinScore = score >= winScore;
  const theyReachedWinScore = remotePlayer.score >= winScore;

  if (iReachedWinScore && !theyReachedWinScore) return "win";
  if (theyReachedWinScore && !iReachedWinScore) return "lose";

  if (score > remotePlayer.score) return "win";
  if (score < remotePlayer.score) return "lose";
  return "tie";
}

function checkMatchEnd() {
  if (matchOver || !remotePlayer) return;

  const reachedWinScore = score >= winScore || remotePlayer.score >= winScore;
  const bothDown = gameOver && remotePlayer.gameOver;

  if (reachedWinScore || bothDown) {
    matchOver = true;
    showGameOverOverlay();
  }
}

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
const baseMaxHealth = 100;
let maxHealth = baseMaxHealth; // can grow permanently via the maxHealthBoost power-up
let health = maxHealth;

function updateHealthDisplay() {
  healthDisplay.textContent = health;
  if (maxHealthDisplay) maxHealthDisplay.textContent = maxHealth;
}

const redBirdDamage = 10; // flat health points lost per red bird attack
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

// ===== GUN UPGRADES =====
// Every gunUpgradeInterval points, the gun permanently gets a little
// better. Upgrades rotate through three kinds as the tiers climb:
// 1) faster fire rate, 2) faster bullets, 3) +1 extra bullet per shot.
const gunUpgradeInterval = 1500;
const fireRateStep = 1; // frames shaved off the base cooldown per tier
const minFireRate = 3;
const bulletSpeedStep = 2;
const bulletSpreadAngle = 0.12; // radians between adjacent bullets in a multi-shot

let gunUpgradeTier = 0;
let fireRateUpgrades = 0;
let bulletSpeedUpgrades = 0;
let extraBulletCount = 0;
let gunUpgradeMessage = "";
let gunUpgradeMessageTimer = 0;

function applyGunUpgradeTier(tier) {
  const kind = tier % 3;
  if (kind === 1) {
    fireRateUpgrades++;
    gunUpgradeMessage = "Fire Rate Up!";
  } else if (kind === 2) {
    bulletSpeedUpgrades++;
    gunUpgradeMessage = "Bullet Speed Up!";
  } else {
    extraBulletCount++;
    gunUpgradeMessage = "Multi-Shot Up!";
  }
  gunUpgradeMessageTimer = 90;
}

function syncGunUpgrades() {
  const tier = Math.floor(score / gunUpgradeInterval);
  while (gunUpgradeTier < tier) {
    gunUpgradeTier++;
    applyGunUpgradeTier(gunUpgradeTier);
  }
}

function currentBulletSpeed() {
  const base = bulletSpeed + bulletSpeedUpgrades * bulletSpeedStep;
  return isTouchDevice ? base * mobileBulletSpeedMultiplier : base;
}

// ===== EXPLOSIONS =====
const explosions = [];

// ===== POWER-UPS =====
// Two kinds, sharing one array/pickup system:
// - "buff": purple birds (rare, 2 hits to kill) drop one on death. Timed,
//   30s effect once picked up, disappears after 20s if left uncollected.
// - "instant": falls from the sky every skyDropScoreInterval points. A
//   one-time, permanent effect the moment it's picked up.
const powerUps = [];
const buffPowerUpTypes = ["bubble", "tripleAmmo", "rapidFire"];
const instantPowerUpTypes = ["healthRefill", "ammoBoost", "maxHealthBoost"];
const powerUpLifetime = 20 * 60; // 20s before an uncollected drop disappears
const powerUpDuration = 30 * 60; // 30s active effect once picked up
const powerUpPickupRadius = 36;
const powerUpGroundY = 490;
const skyDropFallSpeed = 2.5;
const skyDropScoreInterval = 1500;
const ammoBoostAmount = 10;
const maxHealthBoostAmount = 20;

let shieldTimer = 0;
let tripleAmmoTimer = 0;
let rapidFireTimer = 0;
let nextSkyDropScore = skyDropScoreInterval;

function spawnPowerUp(x) {
  const type = buffPowerUpTypes[Math.floor(Math.random() * buffPowerUpTypes.length)];
  powerUps.push({ id: nextEntityId++, x, y: powerUpGroundY, type, kind: "buff", falling: false, life: powerUpLifetime, bob: Math.random() * Math.PI * 2 });
}

function spawnSkyDrop() {
  const type = instantPowerUpTypes[Math.floor(Math.random() * instantPowerUpTypes.length)];
  const x = 60 + Math.random() * (canvas.width - 120);
  powerUps.push({ id: nextEntityId++, x, y: 20, type, kind: "instant", falling: true, vy: skyDropFallSpeed, life: powerUpLifetime, bob: Math.random() * Math.PI * 2 });
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

function applyInstantPowerUp(type) {
  if (type === "healthRefill") {
    health = maxHealth;
    updateHealthDisplay();
  } else if (type === "ammoBoost") {
    ammo = Math.min(ammo + ammoBoostAmount, effectiveMaxAmmo());
    updateAmmoDisplay();
  } else if (type === "maxHealthBoost") {
    maxHealth += maxHealthBoostAmount;
    health = maxHealth;
    updateHealthDisplay();
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
  const upgraded = Math.max(minFireRate, baseFireRate - fireRateUpgrades * fireRateStep);
  return rapidFireTimer > 0 ? Math.max(minFireRate, Math.round(upgraded / 2)) : upgraded;
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

const purpleBirdSpawnChance = 0.12;
const redBirdSpawnChance = 0.2;

// Birds fly a little faster for every birdSpeedUpInterval points scored
const birdSpeedUpInterval = 500;
const birdSpeedUpAmount = 0.15; // +15% flight speed per tier

function birdSpeedMultiplier() {
  return 1 + Math.floor(score / birdSpeedUpInterval) * birdSpeedUpAmount;
}

// Past this score, some red birds start the fight already enraged instead
// of waiting for a first hit to come after the player.
const autoAttackScoreThreshold = 6000;
const autoAttackChance = 0.5;

function spawnBird() {
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? -40 : canvas.width + 40;
  const y = 50 + Math.random() * 180;
  const speed = (1.5 + Math.random() * 2.5) * birdSpeedMultiplier();

  const typeRoll = Math.random();
  const isPurple = typeRoll < purpleBirdSpawnChance;
  const isExploding = !isPurple && typeRoll < purpleBirdSpawnChance + redBirdSpawnChance;
  const startsAttacking = isExploding && score >= autoAttackScoreThreshold && Math.random() < autoAttackChance;

  birds.push({
    id: nextEntityId++,
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
    attacking: startsAttacking,
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

// ===== GEESE =====
// Ground-level hazards that start appearing once the player has scored
// enough. Walking geese have to be jumped over; low-flying geese have to
// be ducked under (crouch or lay down) - or the player can just shoot one
// down instead, in 2 hits.
const geese = [];
const maxGeese = 2;
let gooseSpawnTimer = 0;
const gooseStartScore = 3000;
const gooseDamage = 10;
const gooseHitCooldown = 60;
const gooseCollisionRangeX = 26;
const gooseWalkingY = 495;
const gooseFlyingY = 430;
const gooseMaxHp = 2;
const goosePoints = 100;
const gooseHitboxWidth = 36;
const gooseHitboxHeight = 22;

function spawnGoose() {
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? -30 : canvas.width + 30;
  const flying = Math.random() < 0.5;
  const speed = (0.6 + Math.random() * 0.6) * birdSpeedMultiplier();

  geese.push({
    id: nextEntityId++,
    x,
    y: flying ? gooseFlyingY : gooseWalkingY,
    flying,
    vx: (fromLeft ? 1 : -1) * speed,
    phase: Math.random() * Math.PI * 2,
    hp: gooseMaxHp
  });
}

function drawGoose(goose) {
  const direction = goose.vx >= 0 ? 1 : -1;

  ctx.save();
  ctx.translate(goose.x, goose.y);
  ctx.scale(direction, 1);

  // Body
  ctx.fillStyle = "#e8e8e8";
  ctx.beginPath();
  ctx.ellipse(0, 0, 20, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Neck
  ctx.beginPath();
  ctx.ellipse(16, -14, 6, 10, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.ellipse(18, -20, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Beak
  ctx.fillStyle = "#f2a900";
  ctx.beginPath();
  ctx.moveTo(22, -20);
  ctx.lineTo(29, -19);
  ctx.lineTo(22, -17);
  ctx.closePath();
  ctx.fill();

  if (goose.flying) {
    const flap = Math.sin(time * 0.3 + goose.phase) * 6;
    ctx.fillStyle = "#cfcfcf";
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(-20, -8 - flap);
    ctx.lineTo(-14, 2);
    ctx.closePath();
    ctx.fill();
  } else {
    const waddle = Math.sin(time * 0.3 + goose.phase) * 3;
    ctx.strokeStyle = "#f2a900";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, 9);
    ctx.lineTo(-4 + waddle, 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4, 9);
    ctx.lineTo(4 - waddle, 18);
    ctx.stroke();
  }

  ctx.restore();

  if (goose.hp < gooseMaxHp) {
    const barWidth = 28;
    const barHeight = 5;
    const barX = goose.x - barWidth / 2;
    const barY = goose.y - 34;
    const hpFraction = Math.max(goose.hp, 0) / gooseMaxHp;

    ctx.fillStyle = "#333";
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = "#ff3b3b";
    ctx.fillRect(barX, barY, barWidth * hpFraction, barHeight);
  }
}

// Shared by a local bullet hit and an incoming network "hit" message, so a
// kill resolves the same way regardless of which player's shot did it.
// awardScore is false when applying a hit the OTHER player already scored.
function applyBirdHit(bird, awardScore) {
  bird.hp--;

  if (bird.isExploding && !bird.attacking) {
    bird.attacking = true;
    if (awardScore) score += redBirdPoints;
  }

  if (bird.hp <= 0) {
    bird.dying = true;
    bird.attacking = false;
    bird.fallVy = -3;

    if (bird.isExploding) {
      if (awardScore) score += redBirdKillBonus;
    } else if (bird.isPurple) {
      if (awardScore) score += purpleBirdPoints;
      if (simulatingWorld()) spawnPowerUp(bird.x);
    } else if (awardScore) {
      score += birdPoints;
    }
  }

  if (awardScore) scoreDisplay.textContent = score;
}

function applyGooseHit(goose, awardScore) {
  goose.hp--;
  const died = goose.hp <= 0;

  if (died && awardScore) {
    score += goosePoints;
    scoreDisplay.textContent = score;
  }

  return died;
}

// ===== MULTIPLAYER MESSAGE HANDLERS =====
Net.on("player", (data) => {
  remotePlayer = data;
  if (p2ScoreLine && p2ScoreDisplay) {
    p2ScoreDisplay.textContent = data.score;
    p2ScoreLine.classList.remove("hidden");
  }
});

Net.on("world", (data) => {
  if (!isGuestRole()) return; // only a guest mirrors the host's broadcast

  birds.length = 0;
  for (const b of data.birds) birds.push(b);

  geese.length = 0;
  for (const g of data.geese) geese.push(g);

  powerUps.length = 0;
  for (const p of data.powerUps) powerUps.push(p);
});

Net.on("hit", (data) => {
  if (!simulatingWorld()) return; // host applies hits reported by the guest

  if (data.kind === "bird") {
    const bird = birds.find((b) => b.id === data.id);
    if (bird && !bird.dying) applyBirdHit(bird, false);
  } else if (data.kind === "goose") {
    const index = geese.findIndex((g) => g.id === data.id);
    if (index !== -1) {
      const died = applyGooseHit(geese[index], false);
      if (died) {
        explosions.push({ x: geese[index].x, y: geese[index].y, radius: 4, life: 15 });
        geese.splice(index, 1);
      }
    }
  }
});

Net.on("retreat", (data) => {
  if (!simulatingWorld()) return;
  const bird = birds.find((b) => b.id === data.id);
  if (bird) bird.retreatTimer = redBirdRetreatTime;
});

Net.on("pickup", (data) => {
  if (!simulatingWorld()) return;
  const index = powerUps.findIndex((p) => p.id === data.id);
  if (index !== -1) powerUps.splice(index, 1);
});

Net.on("rematch", () => resetGame());

Net.on("disconnected", () => {
  const wasSpectating = gameOver && !matchOver;
  remotePlayer = null;
  if (p2ScoreLine) p2ScoreLine.classList.add("hidden");
  // A guest who loses the host's feed falls back to simulating its own
  // world from here (simulatingWorld() becomes true once the role clears).
  Net.disconnect();

  // Nothing left to spectate - let a dead/spectating player see the
  // end screen instead of staying stuck watching an empty game
  if (wasSpectating) {
    matchOver = true;
    showGameOverOverlay();
  }
});

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
  const speed = currentBulletSpeed();

  const shotCount = 1 + extraBulletCount;
  const spreadStart = -((shotCount - 1) / 2) * bulletSpreadAngle;

  for (let i = 0; i < shotCount; i++) {
    const shotAngle = angle + spreadStart + i * bulletSpreadAngle;
    bullets.push({
      x: muzzle.x,
      y: muzzle.y,
      vx: Math.cos(shotAngle) * speed,
      vy: Math.sin(shotAngle) * speed,
      life: 70
    });
  }

  // Auto-reload once the magazine is empty
  if (ammo <= 0 && !isReloading) {
    isReloading = true;
    reloadTimer = reloadTime;
  }
}

// ===== UPDATE =====
function update() {
  // In multiplayer, dying doesn't stop the world: a dead player keeps
  // spectating (world simulation and the other player keep going) until
  // the match actually concludes. Solo death still stops everything.
  if (matchOver) return;
  if (gameOver && !inMultiplayerMatch()) return;
  const amAlive = !gameOver;

  // Hold-to-fire: desktop left-click or the mobile aim stick
  if (amAlive) {
    if (fireCooldown > 0) fireCooldown--;
    if (fireHeld && fireCooldown <= 0) {
      shoot();
      fireCooldown = currentFireRate();
    }
  }

  // Power-up buff timers
  if (shieldTimer > 0) shieldTimer--;
  if (tripleAmmoTimer > 0) tripleAmmoTimer--;
  if (rapidFireTimer > 0) rapidFireTimer--;
  updateBuffsDisplay();

  // A one-time instant power-up falls from the sky at each score milestone
  // (world-simulating side only - a connected guest mirrors the host's drops)
  if (simulatingWorld() && score >= nextSkyDropScore) {
    spawnSkyDrop();
    nextSkyDropScore += skyDropScoreInterval;
  }

  // The gun permanently upgrades at every gunUpgradeInterval points - purely
  // local to each player's own score, no networking involved
  syncGunUpgrades();
  if (gunUpgradeMessageTimer > 0) gunUpgradeMessageTimer--;

  // Power-up pickups on the ground (or still falling, for sky drops).
  // Falling/despawn timing is world state (host/solo only); picking one up
  // is always a local check against this player's own position.
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];

    if (simulatingWorld()) {
      if (pu.falling) {
        pu.y += pu.vy;
        if (pu.y >= powerUpGroundY) {
          pu.y = powerUpGroundY;
          pu.falling = false;
        }
      } else {
        pu.life--;
        if (pu.life <= 0) {
          powerUps.splice(i, 1);
          continue;
        }
      }
    }

    const dist = amAlive ? Math.hypot((player.x + player.width / 2) - pu.x, player.y - pu.y) : Infinity;
    if (dist < powerUpPickupRadius) {
      if (pu.kind === "buff") {
        activatePowerUp(pu.type);
      } else {
        applyInstantPowerUp(pu.type);
      }
      if (isGuestRole()) Net.send("pickup", { id: pu.id });
      powerUps.splice(i, 1);
    }
  }

  // Movement, bullets and bullet collision only run for a living local
  // player - a dead/spectating player stays frozen where they fell
  if (amAlive) {
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

    let bulletConsumed = false;

    for (let j = birds.length - 1; j >= 0; j--) {
      const bird = birds[j];
      if (!bird.alive || bird.dying) continue;

      const hitBird =
        bullets[i].x > bird.x - bird.width / 2 &&
        bullets[i].x < bird.x + bird.width / 2 &&
        bullets[i].y > bird.y - bird.height / 2 &&
        bullets[i].y < bird.y + bird.height / 2;

      if (hitBird) {
        applyBirdHit(bird, true);
        if (Net.isConnected()) Net.send("hit", { kind: "bird", id: bird.id });

        bullets.splice(i, 1);
        bulletConsumed = true;
        break;
      }
    }

    if (bulletConsumed) continue;

    for (let j = geese.length - 1; j >= 0; j--) {
      const goose = geese[j];

      const hitGoose =
        bullets[i].x > goose.x - gooseHitboxWidth / 2 &&
        bullets[i].x < goose.x + gooseHitboxWidth / 2 &&
        bullets[i].y > goose.y - gooseHitboxHeight / 2 &&
        bullets[i].y < goose.y + gooseHitboxHeight / 2;

      if (hitGoose) {
        const died = applyGooseHit(goose, true);
        if (Net.isConnected()) Net.send("hit", { kind: "goose", id: goose.id });

        if (died) {
          explosions.push({ x: goose.x, y: goose.y, radius: 4, life: 15 });
          geese.splice(j, 1);
        }

        bullets.splice(i, 1);
        break;
      }
    }
  }
  } // end amAlive (movement/bullets)

  // Bird population and flight (world-simulating side only - a connected
  // guest mirrors the host's bird positions instead of spawning/moving its
  // own, but still independently checks whether an attacking bird that's
  // currently in range has hit ITS OWN local player)
  if (simulatingWorld()) {
    if (birdSpawnTimer > 0) {
      birdSpawnTimer--;
    }

    if (birds.length < maxBirds && birdSpawnTimer <= 0) {
      spawnBird();
      birdSpawnTimer = 60 + Math.random() * 90;
    }
  }

  for (let i = birds.length - 1; i >= 0; i--) {
    const bird = birds[i];

    if (bird.dying) {
      if (simulatingWorld()) {
        bird.fallVy += player.gravity;
        bird.y += bird.fallVy;
        bird.x += bird.vx * 0.3;
        bird.rotation += (bird.vx >= 0 ? 1 : -1) * 0.15;

        if (bird.y > 520) {
          birds.splice(i, 1);
        }
      }
      continue;
    }

    if (bird.attacking) {
      if (bird.retreatTimer > 0) {
        // Back off after landing a hit so the player has room to shoot back
        if (simulatingWorld()) {
          const chase = getChaseTarget(bird);
          const dx = chase.x - bird.x;
          const dy = chase.y - bird.y;
          const dist = Math.hypot(dx, dy) || 1;
          bird.retreatTimer--;
          bird.vx = (-dx / dist) * redBirdRetreatSpeed;
          bird.x += bird.vx;
          bird.y += (-dy / dist) * redBirdRetreatSpeed;
        }
        continue;
      }

      if (simulatingWorld()) {
        const chase = getChaseTarget(bird);
        const dx = chase.x - bird.x;
        const dy = chase.y - bird.y;
        const dist = Math.hypot(dx, dy) || 1;
        bird.vx = (dx / dist) * redBirdChaseSpeed;
        bird.x += bird.vx;
        bird.y += (dy / dist) * redBirdChaseSpeed;
      }

      // Every client checks this attacking bird against its OWN local player
      // (only while that player is alive)
      const localDist = amAlive
        ? Math.hypot((player.x + player.width / 2) - bird.x, player.y - bird.y)
        : Infinity;
      if (localDist < redBirdAttackRange && player.invincible <= 0) {
        player.invincible = redBirdAttackCooldown;
        explosions.push({ x: player.x, y: player.y - 30, radius: 6, life: 20 });

        if (simulatingWorld()) {
          bird.retreatTimer = redBirdRetreatTime;
        } else {
          Net.send("retreat", { id: bird.id });
        }

        if (shieldTimer <= 0) {
          health -= redBirdDamage;
          if (health < 0) health = 0;
          updateHealthDisplay();

          if (health <= 0) {
            killLocalPlayer();
          }
        }
      }
      continue;
    }

    if (simulatingWorld()) {
      bird.x += bird.vx;
      bird.y += Math.sin((time * 0.08) + bird.phase) * 0.7;

      if (bird.x < -60 || bird.x > canvas.width + 60) {
        birds.splice(i, 1);
      }
    }
  }

  // Geese: ground-level hazards once the score is high enough
  // (world-simulating side only spawns/moves them; every client still
  // checks its own player against the current positions)
  if (simulatingWorld() && score >= gooseStartScore) {
    if (gooseSpawnTimer > 0) gooseSpawnTimer--;
    if (geese.length < maxGeese && gooseSpawnTimer <= 0) {
      spawnGoose();
      gooseSpawnTimer = 120 + Math.random() * 120;
    }
  }

  for (let i = geese.length - 1; i >= 0; i--) {
    const goose = geese[i];

    if (simulatingWorld()) {
      goose.x += goose.vx;

      if (goose.x < -60 || goose.x > canvas.width + 60) {
        geese.splice(i, 1);
        continue;
      }
    }

    const withinX = amAlive && Math.abs((player.x + player.width / 2) - goose.x) < gooseCollisionRangeX;
    if (withinX && player.invincible <= 0) {
      const avoided = goose.flying
        ? (player.state === "crouching" || player.state === "laying")
        : !player.onGround;

      if (!avoided) {
        player.invincible = gooseHitCooldown;
        explosions.push({ x: player.x, y: player.y - 30, radius: 6, life: 20 });

        if (shieldTimer <= 0) {
          health -= gooseDamage;
          if (health < 0) health = 0;
          updateHealthDisplay();

          if (health <= 0) {
            killLocalPlayer();
          }
        }
      }
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
  if (amAlive && isReloading) {
    reloadTimer--;
    if (reloadTimer <= 0) {
      isReloading = false;
      ammo = effectiveMaxAmmo();
      updateAmmoDisplay();
    }
  }

  // Multiplayer: broadcast this player's state, and the shared world if
  // this side is the one simulating it
  if (Net.isConnected()) {
    mpBroadcastTimer++;
    if (mpBroadcastTimer >= mpBroadcastInterval) {
      mpBroadcastTimer = 0;

      Net.send("player", {
        x: player.x,
        y: player.y,
        state: player.state,
        facing: player.facing,
        aimAngle: getAimAngle(player),
        health,
        maxHealth,
        ammo,
        maxAmmo: effectiveMaxAmmo(),
        score,
        color: playerColorKey,
        gameOver
      });

      if (simulatingWorld()) {
        Net.send("world", { birds, geese, powerUps });
      }
    }
  }

  checkMatchEnd();
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
  function drawPlayer(p, colors, overrideAimAngle, isDown) {
    const sway = Math.sin(time * 0.05) * 3;
    const bob = Math.sin(time * 0.08) * 2;
    // A remote player's aim comes from the network instead of local
    // mouse/aim-stick input, so getAimAngle() (which reads local input and
    // would also overwrite p.facing) is skipped when an angle is supplied.
    const aimAngle = overrideAimAngle !== undefined ? overrideAimAngle : getAimAngle(p);
    const facing = p.facing;

    // A downed player (health hit 0) lies flat on the grass instead of
    // standing - rotate the whole figure onto its side around its feet.
    if (isDown) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((facing >= 0 ? 1 : -1) * Math.PI / 2);
      ctx.translate(-p.x, -p.y);
    }

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

    if (isDown) {
      ctx.restore();
    }
  }

  // Draw birds in the sky
  for (const bird of birds) {
    drawBird(bird);
  }

  // Draw geese at ground level
  for (const goose of geese) {
    drawGoose(goose);
  }

  // Draw power-up pickups on the ground (or falling in from the sky)
  const powerUpColors = {
    bubble: "#4fc3f7", tripleAmmo: "#ffb300", rapidFire: "#ffee58",
    healthRefill: "#66bb6a", ammoBoost: "#8d6e63", maxHealthBoost: "#ef5350"
  };
  const powerUpLabels = {
    bubble: "SH", tripleAmmo: "x3", rapidFire: "RF",
    healthRefill: "HP", ammoBoost: "+A", maxHealthBoost: "MX"
  };
  for (const pu of powerUps) {
    const bobY = pu.falling ? pu.y : pu.y + Math.sin(time * 0.1 + pu.bob) * 4;
    ctx.globalAlpha = (!pu.falling && pu.life < 180) ? Math.max(pu.life / 180, 0.2) : 1;

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

  // Draw the player (blink while invincible after taking a hit; a downed
  // player stays fully visible, lying on the grass, instead of blinking)
  if (gameOver || player.invincible <= 0 || Math.floor(time / 4) % 2 === 0) {
    drawPlayer(player, playerColors, undefined, gameOver);
  }

  // Draw the other player, if connected - including while they're down, so
  // a spectating player can still see them lying on the grass
  if (remotePlayer) {
    const remoteColors = characterColors[remotePlayer.color] || characterColors.blue;
    drawPlayer(remotePlayer, remoteColors, remotePlayer.aimAngle, remotePlayer.gameOver);

    ctx.fillStyle = "#fff";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(remotePlayer.gameOver ? "P2 (down)" : "P2", remotePlayer.x, remotePlayer.y - 95);
    ctx.textAlign = "left";
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

  // Gun upgrade announcement
  if (gunUpgradeMessageTimer > 0) {
    const alpha = Math.min(gunUpgradeMessageTimer / 20, 1);
    ctx.fillStyle = `rgba(255, 215, 64, ${alpha})`;
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText(gunUpgradeMessage, canvas.width / 2, 60);
    ctx.textAlign = "left";
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
const finalVsLine = document.getElementById("finalVsLine");
const gameOverHeading = document.getElementById("gameOverHeading");
const replayBtn = document.getElementById("replayBtn");
const exitBtn = document.getElementById("exitBtn");
const characterSelectEl = document.getElementById("characterSelect");
const gameAreaEl = document.getElementById("gameArea");

function showGameOverOverlay() {
  if (finalScoreDisplay) finalScoreDisplay.textContent = score;
  if (finalHighScoreDisplay) finalHighScoreDisplay.textContent = highScore;

  const outcome = getMatchOutcome();

  if (gameOverHeading) {
    gameOverHeading.classList.remove("winning", "losing");
    if (outcome === "win") {
      gameOverHeading.textContent = "You Win!";
      gameOverHeading.classList.add("winning");
    } else if (outcome === "lose") {
      gameOverHeading.textContent = "You Lose";
      gameOverHeading.classList.add("losing");
    } else if (outcome === "tie") {
      gameOverHeading.textContent = "Tie Game!";
    } else {
      gameOverHeading.textContent = "Game Over";
    }
  }

  if (finalVsLine) {
    if (remotePlayer) {
      finalVsLine.classList.remove("hidden", "winning", "losing");
      finalVsLine.textContent = `Final: You ${score} - P2 ${remotePlayer.score}`;
      if (outcome === "win") finalVsLine.classList.add("winning");
      else if (outcome === "lose") finalVsLine.classList.add("losing");
    } else {
      finalVsLine.classList.add("hidden");
    }
  }

  if (gameOverOverlay) gameOverOverlay.classList.remove("hidden");
}

if (replayBtn) {
  replayBtn.addEventListener("click", () => {
    if (Net.isConnected()) Net.send("rematch", {});
    resetGame();
  });
}

if (exitBtn) {
  exitBtn.addEventListener("click", () => {
    stopGameLoop();
    resetGame();
    gameStarted = false;
    Net.disconnect();
    remotePlayer = null;
    if (p2ScoreLine) p2ScoreLine.classList.add("hidden");
    if (gameAreaEl) gameAreaEl.classList.add("hidden");
    if (characterSelectEl) characterSelectEl.classList.remove("hidden");

    // Reset the online-lobby UI back to its starting state
    const mpModeButtonsEl = document.getElementById("mpModeButtons");
    const mpHostBoxEl = document.getElementById("mpHostBox");
    const mpJoinBoxEl = document.getElementById("mpJoinBox");
    const mpStatusMsgEl = document.getElementById("mpStatusMsg");
    if (mpHostBoxEl) mpHostBoxEl.classList.add("hidden");
    if (mpJoinBoxEl) mpJoinBoxEl.classList.add("hidden");
    if (mpModeButtonsEl) mpModeButtonsEl.classList.remove("hidden");
    if (mpStatusMsgEl) {
      mpStatusMsgEl.textContent = "";
      mpStatusMsgEl.classList.remove("mpConnected");
    }
  });
}

// Called once the player picks a character on the selection screen
function startGame(character) {
  playerColorKey = characterColors[character] ? character : "red";
  playerColors = characterColors[playerColorKey];
  resetGame();
  gameStarted = true;
  stopGameLoop();
  gameLoop();
}

// Reset all game state after a Game Over
function resetGame() {
  maxHealth = baseMaxHealth;
  health = maxHealth;
  updateHealthDisplay();
  score = 0;
  scoreDisplay.textContent = score;
  nextSkyDropScore = skyDropScoreInterval;
  isReloading = false;
  reloadTimer = 0;
  gameOver = false;
  matchOver = false;
  if (gameOverOverlay) gameOverOverlay.classList.add("hidden");

  gunUpgradeTier = 0;
  fireRateUpgrades = 0;
  bulletSpeedUpgrades = 0;
  extraBulletCount = 0;
  gunUpgradeMessage = "";
  gunUpgradeMessageTimer = 0;

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
  geese.length = 0;
  gooseSpawnTimer = 0;
  explosions.length = 0;
  powerUps.length = 0;
}
