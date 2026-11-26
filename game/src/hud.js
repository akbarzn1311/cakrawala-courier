// Cakrawala Courier — the heads-up display and the screens.
// The instruments are DOM and small canvases over the 3D view, so they stay
// crisp in a screenshot: speed, altitude, heading, throttle, fuel, damage,
// an attitude indicator, a compass tape and a pointer to the next ring.

import { CONFIG } from './config.js';

function $(id) {
  return document.getElementById(id);
}

function headingLabel(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return names[idx];
}

export function createHud() {
  const attitude = $('attitude');
  const actx = attitude.getContext('2d');
  const compass = $('compass');
  const cctx = compass.getContext('2d');
  let messageTimer = 0;

  function drawAttitude(roll, pitch) {
    const w = attitude.width;
    const h = attitude.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 4;
    actx.clearRect(0, 0, w, h);
    actx.save();
    actx.beginPath();
    actx.arc(cx, cy, r, 0, Math.PI * 2);
    actx.clip();
    // Sky and ground, rotated by bank and shifted by pitch.
    actx.translate(cx, cy);
    actx.rotate(-roll);
    const pitchPx = Math.max(-r, Math.min(r, pitch * r * 1.4));
    actx.translate(0, pitchPx);
    actx.fillStyle = '#2f7fc4';
    actx.fillRect(-r - 4, -r - 4, (r + 4) * 2, r + 4);
    actx.fillStyle = '#7a5230';
    actx.fillRect(-r - 4, 0, (r + 4) * 2, r + 4);
    actx.strokeStyle = 'rgba(255,255,255,0.9)';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.moveTo(-r, 0);
    actx.lineTo(r, 0);
    actx.stroke();
    actx.restore();
    // Fixed aircraft symbol: a small orange shape that never moves.
    actx.strokeStyle = '#ffb347';
    actx.lineWidth = 3;
    actx.beginPath();
    actx.moveTo(cx - 16, cy);
    actx.lineTo(cx + 16, cy);
    actx.moveTo(cx, cy - 2);
    actx.lineTo(cx, cy + 8);
    actx.stroke();
    actx.beginPath();
    actx.arc(cx, cy, r, 0, Math.PI * 2);
    actx.strokeStyle = 'rgba(255,255,255,0.65)';
    actx.lineWidth = 2;
    actx.stroke();
  }

  function drawCompass(headingDeg) {
    const w = compass.width;
    const h = compass.height;
    cctx.clearRect(0, 0, w, h);
    const pxPerDeg = w / 120; // 120 degrees across the tape
    const center = ((headingDeg % 360) + 360) % 360;
    cctx.fillStyle = 'rgba(10,18,26,0.72)';
    cctx.fillRect(0, 0, w, h);
    cctx.textAlign = 'center';
    cctx.font = 'bold 13px monospace';
    for (let d = -75; d <= 75; d += 5) {
      let deg = Math.round(center + d);
      deg = ((deg % 360) + 360) % 360;
      const x = w / 2 + d * pxPerDeg;
      const major = deg % 45 === 0;
      const minor = deg % 15 === 0;
      if (!minor && deg % 5 !== 0) continue;
      cctx.strokeStyle = major ? '#ffd27a' : 'rgba(255,255,255,0.55)';
      cctx.lineWidth = major ? 2 : 1;
      cctx.beginPath();
      cctx.moveTo(x, major ? 4 : 10);
      cctx.lineTo(x, major ? 14 : 16);
      cctx.stroke();
      if (major) {
        const label = deg % 90 === 0 ? headingLabel(deg) : String(deg).padStart(3, '0');
        cctx.fillStyle = '#ffd27a';
        cctx.fillText(label, x, h - 6);
      }
    }
    // Centre caret: the heading you are on.
    cctx.fillStyle = '#ff5a3c';
    cctx.beginPath();
    cctx.moveTo(w / 2 - 7, 0);
    cctx.lineTo(w / 2 + 7, 0);
    cctx.lineTo(w / 2, 9);
    cctx.closePath();
    cctx.fill();
  }

  function showMessage(text, seconds = 2.6) {
    const el = $('message');
    el.textContent = text;
    el.classList.add('show');
    messageTimer = seconds;
  }

  const hud = {
    update(state, mission, ringScreen, dt) {
      const f = state.flight;
      const kmh = Math.round(f.speed * 3.6);
      const alt = Math.max(0, Math.round(f.pos.y));
      const headingDeg = (((-f.yaw * 180) / Math.PI) % 360 + 360) % 360;

      $('speed').textContent = String(kmh);
      $('speed-unit').textContent = 'km/h';
      $('alt').textContent = String(alt);
      $('vs').textContent = `${f.verticalSpeed >= 0 ? '+' : ''}${f.verticalSpeed.toFixed(1)} m/s`;
      $('throttle-fill').style.width = `${Math.round(f.throttle * 100)}%`;
      $('throttle-pct').textContent = `${Math.round(f.throttle * 100)}%`;
      $('fuel-fill').style.width = `${Math.round(f.fuel)}%`;
      $('fuel-fill').classList.toggle('low', f.fuel < CONFIG.fuelLowWarn);
      $('fuel-pct').textContent = `${Math.round(f.fuel)}%`;
      $('damage-fill').style.width = `${Math.round(f.damage)}%`;
      $('damage-pct').textContent = `${Math.round(f.damage)}%`;
      $('heading').textContent = `${String(Math.round(headingDeg)).padStart(3, '0')}° ${headingLabel(headingDeg)}`;
      $('score').textContent = String(mission.score);
      $('objective').textContent = mission.objective;
      $('status-line').textContent = mission.statusLine;

      // Wind: an arrow pointing where the wind blows TO, and its speed.
      if (state.wind) {
        const w = state.wind;
        const spd = Math.hypot(w.x, w.z);
        if (spd < 0.5) {
          $('wind').textContent = 'tenang';
        } else {
          const deg = (((Math.atan2(w.x, -w.z) * 180) / Math.PI) % 360 + 360) % 360;
          const arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
          const ai = Math.round(deg / 45) % 8;
          $('wind').textContent = `${arrows[ai]} ${spd.toFixed(1)} m/s`;
        }
      }

      // Hazard ahead: a balloon or a storm on the nose, with its distance.
      const hw = $('hazard-warn');
      if (state.hazard) {
        const label = state.hazard.kind === 'balloon' ? 'Balon udara' : 'Badai';
        hw.textContent = `⚠ ${label} ${state.hazard.distance} m di depan`;
        hw.classList.add('show');
      } else {
        hw.classList.remove('show');
      }

      drawAttitude(f.roll, f.pitch);
      drawCompass(headingDeg);

      // The pointer to the next ring: an on-screen marker, or an arrow at
      // the edge of the view pointing the way when it is out of frame.
      const marker = $('ring-marker');
      if (ringScreen) {
        marker.style.display = 'block';
        const m = Math.min(window.innerWidth, window.innerHeight);
        if (ringScreen.visible) {
          marker.style.left = `${ringScreen.x}px`;
          marker.style.top = `${ringScreen.y}px`;
          marker.style.transform = 'translate(-50%, -50%) rotate(0deg)';
          marker.textContent = `◉ ${Math.round(ringScreen.distance)} m`;
        } else {
          const cx = window.innerWidth / 2;
          const cy = window.innerHeight / 2;
          const ang = Math.atan2(ringScreen.y - cy, ringScreen.x - cx);
          const rx = cx + Math.cos(ang) * (m * 0.32);
          const ry = cy + Math.sin(ang) * (m * 0.32);
          marker.style.left = `${rx}px`;
          marker.style.top = `${ry}px`;
          marker.style.transform = `translate(-50%, -50%) rotate(${ang}rad)`;
          marker.textContent = `➤ ${Math.round(ringScreen.distance)} m`;
        }
      } else {
        marker.style.display = 'none';
      }

      if (messageTimer > 0) {
        messageTimer -= dt;
        if (messageTimer <= 0) $('message').classList.remove('show');
      }
    },
    showMessage,
    showScreen(name) {
      for (const id of ['screen-title', 'screen-over', 'screen-pause']) {
        $(id).classList.toggle('hidden', id !== name);
      }
      $('hud').classList.toggle('dim', name !== null);
    },
    setFinalScore(score, best) {
      $('final-score').textContent = String(score);
      $('final-best').textContent = String(best);
    },
    setTitle(text) {
      $('title-name').textContent = text;
    },
  };
  return hud;
}
