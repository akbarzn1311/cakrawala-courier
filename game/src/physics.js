// Cakrawala Courier — the flight model. An arcade model with enough truth
// in it that discipline matters: speed comes from the throttle, turning comes
// from banking, a slow wing stalls and drops, and the ground is unforgiving.
// The aircraft flies along its -Z (its nose), with yaw/pitch/roll in YXZ order.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

const G = CONFIG.gravity;

// A fresh flight state, parked on the runway with the engine off.
export function createFlightState() {
  const r = CONFIG.runway;
  return {
    pos: new THREE.Vector3(r.x - r.length / 2 + 30, r.y + 1.6, r.z),
    yaw: -Math.PI / 2, // facing east, down the strip
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: CONFIG.fuelMax,
    damage: 0,
    verticalSpeed: 0,
    onGround: true,
    engineOn: false,
    crashed: false,
    landed: false,
    time: 0,
  };
}

// The wind at time t (seconds): a slowly veering breeze with gusts. The
// direction turns over a couple of minutes and the strength swells and
// fades, so the pilot feels it come and go — and must correct for it on
// final. Deterministic in t, so every run meets the same sky.
export function windAt(t) {
  const dir = 0.8 + t * 0.02;
  const strength = 3.5 + 2.5 * Math.sin(t * 0.11) + 1.5 * Math.sin(t * 0.031 + 2.0);
  const s = Math.max(0, strength);
  return { x: Math.sin(dir) * s, z: Math.cos(dir) * s };
}
export function forwardVector(flight) {
  const cp = Math.cos(flight.pitch);
  return new THREE.Vector3(
    -Math.sin(flight.yaw) * cp,
    Math.sin(flight.pitch),
    -Math.cos(flight.yaw) * cp,
  );
}

// One step of the model. `input` is { pitch, roll, yaw, throttleDelta } in
// [-1, 1] (throttleDelta is -1, 0 or 1). `world` is the terrain handle.
// Returns an event string when something notable happened, else null.
export function stepFlight(flight, input, dt, world) {
  if (flight.crashed) return null;
  flight.time += dt;

  // --- Throttle and fuel ---
  flight.throttle = Math.min(1, Math.max(0, flight.throttle + input.throttleDelta * dt * 0.55));
  const drain = (CONFIG.fuelDrainIdle + CONFIG.fuelDrainFull * flight.throttle) * dt;
  if (flight.engineOn && flight.fuel > 0) {
    flight.fuel = Math.max(0, flight.fuel - drain);
  }
  if (flight.fuel <= 0) flight.engineOn = false;
  if (!flight.engineOn) flight.throttle = Math.max(0, flight.throttle - dt * 0.3);

  // --- Speed: the engine pulls it toward throttle * maxSpeed, drag pulls back ---
  const targetSpeed = flight.engineOn ? flight.throttle * CONFIG.maxSpeed : 0;
  const k = 1 - Math.exp(-dt / CONFIG.accelTime);
  flight.speed += (targetSpeed - flight.speed) * k;
  // Climbing bleeds speed, diving gains it.
  flight.speed -= G * Math.sin(flight.pitch) * dt * 0.45;
  flight.speed = Math.max(0, flight.speed);

  // --- Attitude ---
  const stalled = flight.speed < CONFIG.stallSpeed && !flight.onGround;
  flight.pitch += input.pitch * CONFIG.pitchRate * dt * (stalled ? 0.45 : 1);
  flight.roll += input.roll * CONFIG.rollRate * dt;
  // Gentle self-levelling: the wings want to come back, the nose less so.
  if (Math.abs(input.roll) < 0.05) {
    flight.roll -= Math.sign(flight.roll) * Math.min(Math.abs(flight.roll), CONFIG.rollLevelRate * dt);
  }
  if (Math.abs(input.pitch) < 0.05 && !flight.onGround) {
    flight.pitch -= Math.sign(flight.pitch) * Math.min(Math.abs(flight.pitch), CONFIG.pitchLevelRate * dt);
  }
  flight.pitch = Math.max(-CONFIG.maxPitch, Math.min(CONFIG.maxPitch, flight.pitch));
  flight.roll = Math.max(-CONFIG.maxRoll, Math.min(CONFIG.maxRoll, flight.roll));

  // A stalled wing drops the nose.
  if (stalled) flight.pitch -= dt * 0.25;

  // --- Turning: a banked wing turns the aircraft (coordinated turn) ---
  // Positive roll banks left (right wing rises), and a left bank turns the
  // nose left, which is a positive yaw when facing -Z.
  const speedFactor = Math.min(1, flight.speed / 45);
  const yawRate = (G * Math.tan(flight.roll) / Math.max(flight.speed, 12)) * speedFactor;
  flight.yaw += yawRate * dt;
  flight.yaw += input.yaw * 0.22 * dt * speedFactor;

  // --- Position ---
  const fwd = forwardVector(flight);
  const prevY = flight.pos.y;
  flight.pos.addScaledVector(fwd, flight.speed * dt);
  // The wind pushes an airborne aircraft sideways; on the ground it does not.
  const wind = windAt(flight.time);
  flight.wind = wind;
  if (!flight.onGround) {
    flight.pos.x += wind.x * dt;
    flight.pos.z += wind.z * dt;
  }
  // A slow wing cannot hold altitude: sink.
  if (stalled) flight.pos.y -= dt * (CONFIG.stallSpeed - flight.speed) * 0.55;
  flight.verticalSpeed = (flight.pos.y - prevY) / Math.max(dt, 1e-6);

  // --- Ground ---
  const ground = world.getHeight(flight.pos.x, flight.pos.z);
  const r = CONFIG.runway;
  const onStrip =
    Math.abs(flight.pos.x - r.x) <= r.length / 2 + 6 &&
    Math.abs(flight.pos.z - r.z) <= r.width / 2 + 6;
  const gearY = ground + 1.6;

  if (flight.pos.y <= gearY) {
    if (flight.onGround) {
      // Rolling along the ground: stay on it, bleed a little speed to
      // rolling resistance (light — the engine must win a takeoff roll).
      flight.pos.y = gearY;
      flight.speed = Math.max(0, flight.speed - dt * 2.5);
      if (flight.speed < 2) flight.pitch = 0;
    } else if (onStrip && Math.abs(flight.roll) < 0.25 && Math.abs(flight.pitch) < 0.3) {
      // Touchdown on the strip.
      const vs = -flight.verticalSpeed;
      flight.pos.y = gearY;
      flight.onGround = true;
      flight.landed = true;
      if (vs > CONFIG.crashVs) {
        flight.crashed = true;
        return 'crashed';
      }
      if (vs > CONFIG.hardLandingVs) {
        flight.damage = Math.min(CONFIG.damageMax, flight.damage + (vs - CONFIG.hardLandingVs) * 9);
        flight.pitch = 0;
        flight.roll = 0;
        return 'hard-landing';
      }
      flight.pitch = 0;
      flight.roll = 0;
      return 'landed';
    } else {
      // Into terrain or water, or a wild touchdown: a crash.
      flight.crashed = true;
      return 'crashed';
    }
  } else if (flight.onGround && flight.speed > CONFIG.stallSpeed + 6 && flight.pitch > 0.08) {
    // Rotation: the wing has enough speed and the nose is up — we fly.
    flight.onGround = false;
    flight.landed = false;
    return 'takeoff';
  } else if (flight.onGround && flight.pos.y > gearY + 0.5) {
    // A bump that lifts the wheels is not a takeoff: the wing only flies
    // past rotation speed. Below it, stay on the strip; above it, the
    // aircraft is fast enough to fly even with the nose level.
    if (flight.speed > CONFIG.stallSpeed + 6) {
      flight.onGround = false;
    } else {
      flight.pos.y = gearY;
    }
  }

  // Damage: a battered airframe is unflyable.
  if (flight.damage >= CONFIG.damageMax) {
    flight.crashed = true;
    return 'crashed';
  }
  return null;
}
