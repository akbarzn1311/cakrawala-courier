// Cakrawala Courier — the game itself: a courier pilot flying a low-poly
// plane over an Indonesian archipelago. Fly through the rings in order,
// then land on the runway to deliver the parcel. Fuel, damage and the clock
// all matter; a soft landing pays, a crash ends the run.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { createWorld, isOnApproach } from './terrain.js';
import { createAircraft, updateAircraft } from './aircraft.js';
import { createFlightState, stepFlight, forwardVector } from './physics.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createMission, updateMission, nextRoute } from './missions.js';
import { createHazards, HAZARD } from './hazards.js';
import { createAudio } from './audio.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 9000);

const world = createWorld(scene);
const aircraft = createAircraft();
scene.add(aircraft);
let flight = createFlightState();
let mission = createMission(scene, 0, world.getHeight);
let hazards = null;
let hazardWarn = null; // the nearest hazard ahead, for the HUD
let windNow = null; // the wind vector right now, for the HUD
// (Re)build the hazards for the current route's rings.
function rebuildHazards() {
  if (hazards) hazards.dispose();
  hazards = createHazards(scene, mission.rings.map((r) => r.center), CONFIG.runway);
}
rebuildHazards();
const input = createInput(canvas);
const hud = createHud();
const audio = createAudio();

let state = 'title'; // title | flying | paused | over
let autopilot = true; // the title screen and the shots fly themselves
let shotTarget = null;
let autopilotSpeed = CONFIG.cruiseSpeed;
let baseSpeed = CONFIG.cruiseSpeed; // the speed the autopilot holds flying straight
let bestScore = 0;
let routeTimer = 0; // counts down after a route is delivered
let camOrbitYaw = 0;
let camOrbitPitch = 0;
const camPos = new THREE.Vector3(0, 160, 500);
const camTarget = new THREE.Vector3();

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// The autopilot: bank toward the desired heading, hold altitude, hold
// cruise speed. It flies the title screen and the screenshot scenes, and
// it is the same steering a new player can watch and learn from. It steers
// by asking for a bank angle and a pitch angle, gently, instead of slamming
// the controls: a controller that asks for an angle converges, one that
// pushes a rate dives.
function autopilotInput(desiredYaw, desiredAlt) {
  const yawErr = wrapAngle(desiredYaw - flight.yaw);
  const desiredBank = Math.max(-0.9, Math.min(0.9, yawErr * 1.4));
  const desiredPitch = Math.max(-0.26, Math.min(0.26, (desiredAlt - flight.pos.y) * 0.01));
  return {
    pitch: Math.max(-1, Math.min(1, (desiredPitch - flight.pitch) * 2.0)),
    roll: Math.max(-1, Math.min(1, (desiredBank - flight.roll) * 2.0)),
    yaw: 0,
    throttleDelta: flight.speed < autopilotSpeed - 2 ? 1 : flight.speed > autopilotSpeed + 4 ? -1 : 0,
    yawErr,
  };
}

// The heading the autopilot wants. For a ring, follow the approach line —
// the line through the ring's centre along its normal — instead of chasing
// the ring's centre as a point. Chasing a point makes the nose slide
// sideways as the aircraft closes in, so it spirals around the ring and
// never lines up; following the line pulls the aircraft onto the course
// and through the centre. The runway and the screenshot scenes aim straight
// at their target, which is a point.
function autopilotDesiredYaw() {
  if (mission.landingPhase) {
    if (shotTarget) {
      const target = shotTarget;
      return Math.atan2(-(target.x - flight.pos.x), -(target.z - flight.pos.z));
    }
    // Final approach: follow the runway centreline in, heading east. The
    // centreline is the flat approach corridor, so staying on it keeps the
    // aircraft clear of the hills either side of the strip.
    const lat = flight.pos.z - CONFIG.runway.z; // +ve = south of the line
    const corr = Math.min(1.2, Math.abs(lat) / 100);
    const toLine = lat > 0 ? -1 : 1;
    return Math.atan2(-1, -toLine * corr);
  }
  if (shotTarget) {
    const target = shotTarget;
    return Math.atan2(-(target.x - flight.pos.x), -(target.z - flight.pos.z));
  }
  const ring = mission.rings[mission.current];
  if (!ring) return flight.yaw;
  const nx = ring.normal.x;
  const nz = ring.normal.z;
  // How far the aircraft sits off the approach line (horizontal only).
  const rx = flight.pos.x - ring.center.x;
  const rz = flight.pos.z - ring.center.z;
  const along = rx * nx + rz * nz;
  const latX = rx - nx * along;
  const latZ = rz - nz * along;
  const latDist = Math.hypot(latX, latZ);
  // Fly along the normal, corrected toward the line; the correction grows
  // with the offset — a firm pull, because a gentle one leaves the aircraft
  // metres off the line at the small rings — and caps near 50 degrees, so
  // the aircraft never turns back on itself.
  const corr = Math.min(1.2, latDist / 40);
  const toLineX = latDist > 0.01 ? -latX / latDist : 0;
  const toLineZ = latDist > 0.01 ? -latZ / latDist : 0;
  const dirX = nx + toLineX * corr;
  const dirZ = nz + toLineZ * corr;
  return Math.atan2(-dirX, -dirZ);
}

function resetRun() {
  mission.group.clear();
  mission = createMission(scene, 0, world.getHeight);
  rebuildHazards();
  flight = createFlightState();
  state = 'title';
  autopilot = true;
  routeTimer = 0;
}

function startFlying() {
  audio.start();
  audio.click();
  flight = createFlightState();
  mission.group.clear();
  mission = createMission(scene, 0, world.getHeight);
  rebuildHazards();
  mission.objective = 'Terbang melewati ring 1 dari 6';
  flight.engineOn = true;
  state = 'flying';
  autopilot = false;
  hud.showScreen(null);
  hud.showMessage('Lepas landas — throttle penuh, lalu tarik hidung ke atas');
}

function gameOver() {
  state = 'over';
  autopilot = false;
  bestScore = Math.max(bestScore, mission.score);
  hud.setFinalScore(mission.score, bestScore);
  hud.showScreen('screen-over');
  audio.crash();
}

function projectTarget(target) {
  const v = target.clone().project(camera);
  const w = window.innerWidth;
  const h = window.innerHeight;
  let x = (v.x * 0.5 + 0.5) * w;
  let y = (-v.y * 0.5 + 0.5) * h;
  let visible = v.z < 1 && x >= 0 && x <= w && y >= 0 && y <= h;
  if (v.z >= 1) {
    // Behind the camera: mirror it to the opposite edge.
    x = w - x;
    y = h - y;
    visible = false;
  }
  return { x, y, visible, distance: flight.pos.distanceTo(target) };
}

function updateCamera(dt) {
  const mouse = input.takeMouse();
  camOrbitYaw -= mouse.dx * 0.004;
  camOrbitPitch = Math.max(-0.5, Math.min(0.6, camOrbitPitch + mouse.dy * 0.003));
  if (Math.abs(input.roll) > 0.1) camOrbitYaw *= 0.98; // flying re-centres the view

  const yaw = flight.yaw + camOrbitYaw;
  const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const desired = flight.pos
    .clone()
    .addScaledVector(back, CONFIG.camDistance)
    .add(new THREE.Vector3(0, CONFIG.camHeight + camOrbitPitch * 8, 0));
  // Never let the camera sink into the ground.
  const ground = world.getHeight(desired.x, desired.z);
  desired.y = Math.max(desired.y, ground + 3);
  camPos.lerp(desired, 1 - Math.exp(-CONFIG.camLerp * dt));
  camera.position.copy(camPos);
  const fwd = forwardVector(flight);
  camTarget.copy(flight.pos).addScaledVector(fwd, CONFIG.camLookAhead);
  camera.lookAt(camTarget);
}

function handleMissionEvent(ev) {
  if (!ev) return;
  if (ev === 'ring') {
    hud.showMessage(`Ring ${mission.current} dari ${mission.rings.length} — bagus!`);
    audio.ring();
  } else if (ev === 'all-rings') {
    hud.showMessage('Semua ring dilewati — kembali dan mendarat di landasan!');
    audio.ring();
  } else if (ev === 'route-complete') {
    hud.showMessage(`Paket diantar! Skor +${CONFIG.landingPoints} — rute berikutnya disiapkan`);
    audio.land();
    flight.fuel = CONFIG.fuelMax;
    routeTimer = 3;
  } else if (ev === 'crashed') {
    gameOver();
  }
}

let lastTime = performance.now();
let framesRendered = 0;
const pageLoadedAt = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;

  // Pause and the title screen freeze the flight model, not the render.
  if (state !== 'paused') {
    let control;
    if (autopilot) {
      const desiredYaw = autopilotDesiredYaw();
      const target = shotTarget || mission.target();
      const terrainBelow = world.getHeight(flight.pos.x, flight.pos.z);
      let desiredAlt;
      let approachSpeed = null;
      if (mission.landingPhase && !shotTarget) {
        // Final approach: descend on a glide slope to the strip and slow
        // to an approach speed. The slope aims at a touchdown point on the
        // west half of the strip and stays there once past it, so the
        // aircraft settles instead of climbing away over the runway. Over
        // the flat approach corridor the aircraft may settle onto the
        // strip; over the hills it must stay clear, so the floor only
        // relaxes on the flat ground.
        const touchdownX = CONFIG.runway.x - 150;
        const distAlong = Math.max(0, touchdownX - flight.pos.x);
        // Aim a little below the strip on final: the autopilot's pitch is
        // gentle, so it needs a firm target to settle the last few metres
        // instead of floating over the runway. Touchdown is detected at
        // the gear, above this target, so it lands rather than digging in.
        const settleAlt = CONFIG.runway.y - 5;
        const slopeAlt = settleAlt + distAlong * 0.10;
        const floor = isOnApproach(flight.pos.x, flight.pos.z)
          ? settleAlt
          : terrainBelow + 12;
        desiredAlt = Math.max(floor, slopeAlt);
        approachSpeed = 38;
      } else {
        // Stay above the ground beneath the aircraft, and at the target's
        // height — aim through the ring's centre, not above it, or the
        // altitude alone eats the ring's radius. Never ask for a dive into a
        // hillside.
        desiredAlt = Math.max(terrainBelow + 45, Math.min(220, target.y));
      }
      // Slow for turns: a fast wing turns wide, so ease off the throttle
      // when the nose is well off the desired heading — the tighter turn at
      // lower speed is what lines the aircraft up with the next ring
      // instead of circling past it. Never below a safe margin above the
      // stall.
      const yawErr = Math.abs(wrapAngle(desiredYaw - flight.yaw));
      const turnSlow = 1 - 0.65 * Math.min(1, yawErr / 1.0);
      // A small ring deserves a slow approach: at full cruise speed the
      // turn onto the ring's line is wide and the aircraft crosses the
      // plane still metres off it. Ease off for rings of 14 m or less, so
      // the turn is tighter and the line has time to settle.
      const curRing = mission.landingPhase ? null : mission.rings[mission.current];
      const ringBase = curRing && curRing.radius <= 14 ? Math.min(baseSpeed, 45) : baseSpeed;
      const effBase = approachSpeed ?? ringBase;
      autopilotSpeed = Math.max(36, effBase * turnSlow);
      control = autopilotInput(desiredYaw, desiredAlt);
    } else {
      control = {
        pitch: input.pitch,
        roll: input.roll,
        yaw: input.yaw,
        throttleDelta: input.throttleDelta,
      };
    }
    // Hazards: a storm shakes the controls, a balloon pops on contact.
    // The turbulence is added to the control before the flight step, so
    // the aircraft actually feels it; the pop is checked on the position
    // the aircraft is leaving, which is a frame behind at most.
    const hz = hazards.update(dt, flight, flight.time);
    hazardWarn = hz.nearest;
    if (hz.balloonHit) {
      flight.damage += HAZARD.BALLOON_DAMAGE;
      hud.showMessage(`Balon udara! Kerusakan ${Math.round(flight.damage)}%`);
      audio.warn();
      if (flight.damage >= CONFIG.damageMax) {
        flight.crashed = true;
        handleMissionEvent('crashed');
      }
    }
    if (hz.turbulence.pitch || hz.turbulence.roll) {
      control.pitch = Math.max(-1, Math.min(1, control.pitch + hz.turbulence.pitch));
      control.roll = Math.max(-1, Math.min(1, control.roll + hz.turbulence.roll));
    }
    const event = stepFlight(flight, control, dt, world);
    windNow = flight.wind || null;
    if (event === 'takeoff') hud.showMessage('Lepas landas!');
    if (event === 'landed') {
      hud.showMessage('Mendarat dengan mulus — bahan bakar terisi penuh');
      audio.land();
      flight.fuel = CONFIG.fuelMax;
    }
    if (event === 'hard-landing') {
      hud.showMessage(`Mendarat keras! Kerusakan ${Math.round(flight.damage)}%`);
      audio.land();
    }
    const missionEvent = updateMission(mission, flight, event, dt);
    handleMissionEvent(missionEvent);

    // A new route after the delivery pause, while the aircraft sits on the strip.
    if (routeTimer > 0) {
      routeTimer -= dt;
      if (routeTimer <= 0) {
        mission = nextRoute(mission);
        rebuildHazards();
        hud.showMessage(`Rute ${mission.route + 1} — ring pertama menunggumu`);
      }
    }

    if (flight.fuel < CONFIG.fuelLowWarn && flight.engineOn) audio.warn();
    audio.update(flight);
    world.update(dt);
    updateAircraft(aircraft, flight, dt);
  }

  updateCamera(dt);
  const ringScreen = state === 'flying' || autopilot ? projectTarget(mission.target()) : null;
  hud.update({ flight, hazard: hazardWarn, wind: windNow }, mission, ringScreen, dt);
  renderer.render(scene, camera);

  // The screenshot signal: the scene has rendered and the autopilot has had
  // a few seconds to settle into the frame.
  framesRendered += 1;
  if (!window.__shotReady && framesRendered >= 30 && now - pageLoadedAt > 3000) {
    window.__shotReady = true;
  }
}

// Buttons and keys for the screens.
document.getElementById('start-btn').addEventListener('click', startFlying);
document.getElementById('again-btn').addEventListener('click', () => {
  resetRun();
  startFlying();
});
document.getElementById('resume-btn').addEventListener('click', () => {
  state = 'flying';
  hud.showScreen(null);
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && state === 'title') startFlying();
  if (e.code === 'KeyR' && state === 'over') {
    resetRun();
    startFlying();
  }
  if ((e.code === 'KeyP' || e.code === 'Escape') && (state === 'flying' || state === 'paused')) {
    state = state === 'flying' ? 'paused' : 'flying';
    hud.showScreen(state === 'paused' ? 'screen-pause' : null);
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// A screenshot scene: skip the title, fly the chosen moment on autopilot.
if (shotName) {
  const shot = applyShot({ flight, mission, world }, shotName);
  shotTarget = shot.target;
  autopilotSpeed = shot.speed;
  baseSpeed = shot.speed;
  state = 'flying';
  autopilot = true;
  flight.engineOn = true;
  hud.showScreen(null);
} else {
  // The title screen flies itself: the chase scene on autopilot behind it.
  const shot = applyShot({ flight, mission, world }, 'chase');
  shotTarget = shot.target;
  autopilotSpeed = shot.speed;
  baseSpeed = shot.speed;
  flight.engineOn = true;
  hud.showScreen('screen-title');
}

requestAnimationFrame(frame);
