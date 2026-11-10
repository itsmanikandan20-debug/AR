// UX Reviewer AR — a realistic 3D UX designer who reviews a website in your room.
// Body, face, gestures and lip-sync: TalkingHead (MIT). Rendering + AR: three.js WebXR.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TalkingHead } from './lib/talkinghead.mjs';

// ---------------------------------------------------------------------------
// Reviewers (free photo-based avatars shipped with TalkingHead, non-commercial use)
// ---------------------------------------------------------------------------
const REVIEWERS = {
  arjun: {
    name: 'Arjun',
    url: './avatars/avatarsdk.glb',
    body: 'M',
    pitch: 0.9,
    retarget: {
      Neck: { z: -0.01, rx: -0.15 }, Neck1: { z: -0.01, rx: -0.15 }, Neck2: { z: -0.01, rx: -0.15 },
      LeftShoulder: { rz: -0.3 }, RightShoulder: { rz: 0.3 },
      scaleToEyesLevel: 1.0, origin: { y: -0.1 }
    },
    baseline: { headRotateX: -0.04, eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 }
  },
  meera: {
    name: 'Meera',
    url: './avatars/avaturn.glb',
    body: 'F',
    pitch: 1.1,
    retarget: {
      Hips: { y: 0.03 }, Spine: { y: 0.02 }, Spine1: { y: 0.02, z: 0.01 },
      Spine2: { y: 0.02, z: 0.01 }, Neck: { z: 0.02, y: 0.01 }, Head: { z: 0.02 },
      LeftShoulder: { rx: -0.5 }, RightShoulder: { rx: -0.5 },
      scaleToHipsLevel: 1.0
    },
    baseline: { headRotateX: -0.05, eyeBlinkLeft: 0.15, eyeBlinkRight: 0.15 }
  }
};

// Sitting-on-a-chair pose (legs bent 90°, upright back). Hip height in metres.
const CHAIR_HIP_Y = 0.5;
const CHAIR_POSE = {
  sitting: true, lying: false,
  props: {
    'Hips.position': { x: 0, y: CHAIR_HIP_Y, z: 0 },
    'Hips.rotation': { x: 0.05, y: 0, z: 0 },
    'Spine.rotation': { x: 0.02, y: 0, z: 0 },
    'Spine1.rotation': { x: 0.05, y: 0, z: 0 },
    'Spine2.rotation': { x: 0.06, y: 0, z: 0 },
    'Neck.rotation': { x: 0.05, y: 0, z: 0 },
    'Head.rotation': { x: 0.05, y: 0, z: 0 },
    'LeftUpLeg.rotation': { x: -1.6, y: 0.1, z: -3.0 },
    'LeftLeg.rotation': { x: -1.55, y: 0, z: 0 },
    'LeftFoot.rotation': { x: 1.2, y: 0, z: 0 },
    'LeftToeBase.rotation': { x: 0.5, y: 0, z: 0 },
    'RightUpLeg.rotation': { x: -1.6, y: -0.1, z: 3.0 },
    'RightLeg.rotation': { x: -1.55, y: 0, z: 0 },
    'RightFoot.rotation': { x: 1.2, y: 0, z: 0 },
    'RightToeBase.rotation': { x: 0.5, y: 0, z: 0 }
  }
};

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), start: $('start'), guide: $('guide'), guideText: $('guideText'),
  card: $('card'), cardStep: $('cardStep'), cardSeverity: $('cardSeverity'), cardArea: $('cardArea'),
  cardFeeling: $('cardFeeling'), cardFix: $('cardFix'), cardShot: $('cardShot'),
  subtitle: $('subtitle'), controls: $('controls'), adjust: $('adjust'), summary: $('summary'),
  btnAR: $('btnAR'), btnScreen: $('btnScreen'), arHint: $('arHint'), loadStatus: $('loadStatus'),
  metaSite: $('metaSite'), metaTask: $('metaTask'), metaCount: $('metaCount'), sampleNote: $('sampleNote'),
  btnPrev: $('btnPrev'), btnPlay: $('btnPlay'), btnNext: $('btnNext'), btnAdjust: $('btnAdjust'), btnEnd: $('btnEnd'),
  adjUp: $('adjUp'), adjDown: $('adjDown'), adjLeft: $('adjLeft'), adjRight: $('adjRight'), adjMove: $('adjMove'),
  sumScore: $('sumScore'), sumText: $('sumText'), sumList: $('sumList'), sumTitle: $('sumTitle'),
  btnAgain: $('btnAgain'), btnClose: $('btnClose')
};

const params = new URLSearchParams(location.search);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// three.js scene
// ---------------------------------------------------------------------------
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 50);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.9;
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(1.5, 3, 2);
scene.add(sun);

// Where the laptop screen is (the reviewer looks here while checking the design)
const laptopTarget = new THREE.Object3D();
scene.add(laptopTarget);

// The reviewer's root (position + turning)
const root = new THREE.Group();
scene.add(root);

// Soft contact shadow under the feet
function makeShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.9),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.003;
  return m;
}
const footShadow = makeShadow();
root.add(footShadow);

// Preview set (only when watching on screen): floor, desk, laptop, chair
const previewSet = new THREE.Group();
scene.add(previewSet);
const DESK = { x: -0.2, z: -0.6, top: 0.75 };
const AVATAR_PREVIEW = new THREE.Vector3(0.55, 0, -0.35); // chair spot
const STAND_PREVIEW = new THREE.Vector3(0.8, 0, -0.25);
const CHAIR_SEAT = 0.44;
const seatAnchor = new THREE.Vector3(); // chair seat point the hips stick to when sitting
let chairMesh = null;
(function buildPreviewSet() {
  const mat = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), mat(0x1b1d22, 1));
  floor.rotation.x = -Math.PI / 2;
  previewSet.add(floor);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.7), mat(0x8a6a4f, 0.6));
  top.position.set(DESK.x, DESK.top - 0.02, DESK.z);
  previewSet.add(top);
  for (const [dx, dz] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, DESK.top - 0.04, 0.04), mat(0x2b2d33));
    leg.position.set(DESK.x + dx, (DESK.top - 0.04) / 2, DESK.z + dz);
    previewSet.add(leg);
  }
  // Laptop: base + open screen with a glowing "website"
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.24), mat(0xb9bcc4, 0.35));
  base.position.set(DESK.x, DESK.top + 0.008, DESK.z + 0.05);
  previewSet.add(base);
  const lid = new THREE.Group();
  lid.position.set(DESK.x, DESK.top + 0.015, DESK.z - 0.07);
  lid.rotation.x = -0.25;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.23, 0.01), mat(0xb9bcc4, 0.35));
  back.position.y = 0.115;
  lid.add(back);
  const sc = document.createElement('canvas');
  sc.width = 340; sc.height = 220;
  const g = sc.getContext('2d');
  g.fillStyle = '#d7261e'; g.fillRect(0, 0, 340, 220);
  g.fillStyle = '#ffd400'; g.font = 'bold 30px sans-serif'; g.fillText('MEGA DEALS!!', 24, 60);
  g.fillStyle = '#fff'; g.fillRect(24, 90, 140, 90); g.fillRect(180, 90, 140, 90);
  g.fillStyle = '#ccc'; g.font = '9px sans-serif'; g.fillText('tiny grey description text', 30, 170);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc) }));
  screen.position.set(0, 0.115, 0.006);
  lid.add(screen);
  previewSet.add(lid);
  // Chair (shown only when sitting)
  chairMesh = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.46), mat(0x30333b));
  seat.position.y = CHAIR_SEAT - 0.025;
  chairMesh.add(seat);
  const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.45, 0.05), mat(0x30333b));
  backrest.position.set(0, CHAIR_SEAT + 0.25, -0.24);
  chairMesh.add(backrest);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, CHAIR_SEAT - 0.05), mat(0x55585f));
  post.position.y = (CHAIR_SEAT - 0.05) / 2;
  chairMesh.add(post);
  chairMesh.visible = false;
  previewSet.add(chairMesh);
})();

// AR reticle and laptop marker
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.07, 0.09, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff5a4e })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);
const laptopMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.03, 0.045, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
laptopMarker.visible = false;
scene.add(laptopMarker);

// Orbit controls for screen mode
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 1;
controls.maxDistance = 5;
controls.maxPolarAngle = Math.PI / 2 - 0.05;

function setPreviewCamera() {
  camera.position.set(1.35, 1.35, 2.75);
  controls.target.set(0.35, 0.95, -0.42);
  controls.update();
}
setPreviewCamera();

window.addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// The reviewer (TalkingHead in avatar-only mode inside our scene)
// ---------------------------------------------------------------------------
let head = null;
let reviewerKey = 'arjun';
let sitting = false;
let heightOffset = 0;
let hipsBone = null;
let yawOffset = 0;
let faceUser = 0; // 0 = face laptop, 1 = face the viewer
let yawNow = 0;

async function loadReviewer(key) {
  const cfg = REVIEWERS[key];
  ui.loadStatus.textContent = `Loading ${cfg.name}… 0%`;
  if (head) {
    root.remove(head.armature);
    head.dispose?.();
    head = null;
  }
  const h = new TalkingHead(stage, {
    avatarOnly: true,
    avatarOnlyScene: null,
    avatarOnlyCamera: camera,
    lipsyncModules: ['en'],
    lipsyncLang: 'en',
    modelFPS: 60,
    avatarMood: 'neutral',
    cameraView: 'full'
  });
  await h.showAvatar(
    {
      url: cfg.url, body: cfg.body, avatarMood: 'neutral', lipsyncLang: 'en',
      retarget: cfg.retarget, baseline: cfg.baseline
    },
    (ev) => {
      if (ev.lengthComputable) {
        ui.loadStatus.textContent = `Loading ${cfg.name}… ${Math.round((ev.loaded / ev.total) * 100)}%`;
      }
    }
  );
  h.poseTemplates.chair = CHAIR_POSE;
  // Remember each mood's standing pose list so we can switch between standing and sitting
  for (const mood of Object.values(h.animMoods)) {
    const p = mood.anims?.find((a) => a.name === 'pose');
    if (p && !p._standAlt) p._standAlt = p.alt;
  }
  root.add(h.armature);
  hipsBone = h.armature.getObjectByName('Hips');
  head = h;
  reviewerKey = key;
  applyPosition();
  ui.loadStatus.textContent = `${cfg.name} is ready.`;
}

function applyPosition() {
  if (!head) return;
  for (const mood of Object.values(head.animMoods)) {
    const p = mood.anims?.find((a) => a.name === 'pose');
    if (!p) continue;
    p.alt = sitting ? [{ delay: [5000, 30000], vs: { pose: ['chair'] } }] : p._standAlt;
  }
  head.setMood(head.getMood() || 'neutral');
  head.setPoseFromTemplate(sitting ? CHAIR_POSE : head.poseTemplates.straight, 600);
  footShadow.visible = !sitting;
  chairMesh.visible = sitting && !renderer.xr.isPresenting;
}

// ---------------------------------------------------------------------------
// Reactions: face + body for each emotion
// ---------------------------------------------------------------------------
const FIXED_KEYS = [
  'eyeSquintLeft', 'eyeSquintRight', 'browDownLeft', 'browDownRight', 'browInnerUp',
  'cheekSquintLeft', 'cheekSquintRight', 'eyeBlinkLeft', 'eyeBlinkRight', 'eyeWideLeft', 'eyeWideRight',
  'jawOpen', 'bodyRotateX', 'headRotateX', 'mouthFrownLeft', 'mouthFrownRight', 'noseSneerLeft', 'noseSneerRight'
];
function clearFace() {
  if (!head) return;
  for (const k of FIXED_KEYS) head.setFixedValue(k, null);
}
function fix(values) {
  for (const [k, v] of Object.entries(values)) head.setFixedValue(k, v);
}

// Look somewhere relative to the laptop for a moment (used for "searching" and "looking away")
const glanceTarget = new THREE.Object3D();
scene.add(glanceTarget);
function glance(dx, dy, ms) {
  glanceTarget.position.copy(laptopTarget.position).add(new THREE.Vector3(dx, dy, 0));
  head.speakTo = glanceTarget;
  head.lookAtCamera(ms);
}
function lookAtLaptop(ms = 2500) {
  head.speakTo = laptopTarget;
  head.lookAtCamera(ms);
}

// Phase 1: he looks at the design and reacts (no words yet)
async function react(step, alive) {
  const e = step.emotion || 'neutral';
  faceUser = 0;
  lookAtLaptop(3200);
  switch (e) {
    case 'squint':
      head.setMood('neutral');
      fix({ bodyRotateX: 0.22, headRotateX: 0.1, eyeSquintLeft: 0.9, eyeSquintRight: 0.9, browDownLeft: 0.7, browDownRight: 0.7, cheekSquintLeft: 0.5, cheekSquintRight: 0.5 });
      break;
    case 'bright':
      head.setMood('disgust');
      fix({ eyeBlinkLeft: 0.75, eyeBlinkRight: 0.75, browDownLeft: 0.8, browDownRight: 0.8, noseSneerLeft: 0.5, noseSneerRight: 0.5 });
      head.playGesture('handup', 2.4, true);
      await wait(700); if (!alive()) return;
      glance(0.9, 0.2, 1400);
      break;
    case 'confused':
      head.setMood('neutral');
      head.playGesture('🤔', 3);
      fix({ browInnerUp: 0.8, headRotateX: 0.05 });
      await wait(900); if (!alive()) return;
      glance(-0.25, -0.12, 700);
      await wait(800); if (!alive()) return;
      glance(0.25, 0.05, 700);
      await wait(800); if (!alive()) return;
      lookAtLaptop(1200);
      break;
    case 'frustrated':
      head.setMood('angry');
      head.playGesture('😒', 2.5);
      fix({ browDownLeft: 0.6, browDownRight: 0.6, mouthFrownLeft: 0.5, mouthFrownRight: 0.5 });
      break;
    case 'surprised':
      head.setMood('fear');
      head.playGesture('😳', 2.5);
      fix({ eyeWideLeft: 0.8, eyeWideRight: 0.8, browInnerUp: 0.9, jawOpen: 0.25, bodyRotateX: -0.08 });
      break;
    case 'happy':
      head.setMood('happy');
      head.playGesture('😊', 2.5);
      break;
    case 'impressed':
      head.setMood('happy');
      head.playGesture('🤩', 2.5);
      break;
    case 'annoyed':
      head.setMood('sad');
      head.playGesture('🙄', 2.5);
      break;
    case 'thinking':
      head.setMood('neutral');
      head.playGesture('🤔', 2.5);
      break;
    default:
      head.setMood('neutral');
  }
  await wait(2600);
}

// Phase 2: he turns to you and explains
const TALK_GESTURE = {
  thumbup: ['thumbup', false], thumbdown: ['thumbdown', false], shrug: ['shrug', false],
  index: ['index', false], wave: ['handup', true], ok: ['ok', false]
};

// ---------------------------------------------------------------------------
// Voice (free browser voice) + lip-sync driven by word timing
// ---------------------------------------------------------------------------
let voices = [];
function refreshVoices() { voices = window.speechSynthesis?.getVoices?.() || []; }
refreshVoices();
window.speechSynthesis?.addEventListener?.('voiceschanged', refreshVoices);
function pickVoice() {
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const want = reviewerKey === 'arjun' ? /male|man|ravi|rishi|guy|daniel|david|google uk english male/i : /female|woman|veena|heera|samantha|zira|google uk english female/i;
  return en.find((v) => /en[-_]IN/i.test(v.lang) && want.test(v.name)) ||
    en.find((v) => want.test(v.name)) ||
    en.find((v) => /en[-_]IN/i.test(v.lang)) ||
    en[0] || null;
}

function wordMs(w) {
  const syll = Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) || []).length);
  let ms = 110 + syll * 130;
  if (/[,;:]$/.test(w)) ms += 220;
  if (/[.!?]$/.test(w)) ms += 380;
  return ms;
}
function silent(ms) {
  const ctx = head.audioCtx;
  return ctx.createBuffer(1, Math.max(1, Math.ceil((ctx.sampleRate * ms) / 1000)), ctx.sampleRate);
}
// Animate the lips for a list of words with estimated timing
function lipsFor(words, startScale = 1) {
  const wtimes = [], wdur = [];
  let t = 0;
  for (const w of words) {
    const d = wordMs(w) * startScale;
    wtimes.push(t);
    wdur.push(d * 0.85);
    t += d;
  }
  head.speakAudio({ audio: silent(t + 200), words, wtimes, wdurations: wdur }, { isRaw: true });
}

function speak(text, alive) {
  return new Promise((resolve) => {
    const words = text.split(/\s+/).filter(Boolean);
    const synth = window.speechSynthesis;
    const done = () => { resolve(); };
    if (!synth || !window.SpeechSynthesisUtterance) {
      lipsFor(words);
      setTimeout(done, words.reduce((s, w) => s + wordMs(w), 400));
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = 1;
    u.pitch = REVIEWERS[reviewerKey].pitch;
    let gotBoundary = false;
    let fallbackTimer = null;
    u.onstart = () => {
      // If the voice does not report words, play the whole lip timeline at once
      fallbackTimer = setTimeout(() => { if (!gotBoundary && alive()) lipsFor(words); }, 350);
    };
    u.onboundary = (ev) => {
      if (ev.name && ev.name !== 'word') return;
      if (!alive()) return;
      if (!gotBoundary) { gotBoundary = true; clearTimeout(fallbackTimer); }
      const rest = text.slice(ev.charIndex);
      const w = rest.split(/\s+/)[0];
      if (!w) return;
      const d = wordMs(w) * 0.8;
      head.speakAudio({ audio: silent(d), words: [w], wtimes: [0], wdurations: [d * 0.9] }, { isRaw: true });
    };
    u.onend = () => { clearTimeout(fallbackTimer); done(); };
    u.onerror = () => { clearTimeout(fallbackTimer); done(); };
    synth.speak(u);
    // Safety: some engines never fire onend
    setTimeout(done, words.reduce((s, w) => s + wordMs(w), 0) * 1.8 + 3000);
  });
}

function stopVoice() {
  window.speechSynthesis?.cancel();
  head?.stopSpeaking();
}

// ---------------------------------------------------------------------------
// Review runner
// ---------------------------------------------------------------------------
let review = null;
let idx = 0;
let playing = true;
let runId = 0;
let resumeGate = null;

async function loadReview() {
  const file = params.get('review') || 'latest';
  const safe = /^[a-z0-9-]+$/i.test(file) ? file : 'latest';
  try {
    const res = await fetch(`./reviews/${safe}.json`, { cache: 'no-store' });
    review = await res.json();
  } catch {
    review = { site: 'Could not load the review', task: '', steps: [], score: 0, summary: '' };
  }
  ui.metaSite.textContent = review.site || '–';
  ui.metaTask.textContent = review.task || '–';
  const issues = review.steps.filter((s) => ['critical', 'major', 'minor'].includes(s.severity)).length;
  ui.metaCount.textContent = `${issues} problems · score ${review.score ?? '–'}/100`;
  ui.sampleNote.hidden = !review.sample;
}

const SEV_LABEL = { critical: 'Critical', major: 'Major', minor: 'Minor', good: 'Good', none: 'Note' };
function showCard(i) {
  const s = review.steps[i];
  ui.card.hidden = false;
  ui.cardStep.textContent = `${i + 1} / ${review.steps.length}`;
  ui.cardSeverity.textContent = SEV_LABEL[s.severity] || 'Note';
  ui.cardSeverity.className = `chip ${s.severity || 'minor'}`;
  ui.cardArea.textContent = s.area || '';
  ui.cardFeeling.textContent = s.feeling || '';
  ui.cardFix.textContent = s.fix || '';
  if (s.shot) { ui.cardShot.src = s.shot; ui.cardShot.alt = `Screenshot: ${s.area}`; ui.cardShot.hidden = false; }
  else { ui.cardShot.hidden = true; ui.cardShot.removeAttribute('src'); }
}

async function gate(alive) {
  while (!playing && alive()) {
    await new Promise((r) => { resumeGate = r; });
  }
}

async function runFrom(i) {
  const my = ++runId;
  const alive = () => my === runId;
  stopVoice();
  clearFace();
  for (idx = i; idx < review.steps.length; idx++) {
    if (!alive()) return;
    const s = review.steps[idx];
    showCard(idx);
    ui.subtitle.hidden = true;
    await gate(alive); if (!alive()) return;

    await react(s, alive); if (!alive()) return;
    await gate(alive); if (!alive()) return;

    // Turn to the viewer and explain
    faceUser = 0.75;
    head.speakTo = null;
    head.lookAtCamera(1500);
    const tg = TALK_GESTURE[s.gesture];
    if (tg) setTimeout(() => alive() && head.playGesture(tg[0], 2.8, tg[1]), 600);
    if (s.emotion !== 'squint') fix({ bodyRotateX: null, headRotateX: null });
    const line = (s.line || '').replaceAll('{me}', REVIEWERS[reviewerKey].name);
    ui.subtitle.textContent = line;
    ui.subtitle.hidden = false;
    await speak(line, alive); if (!alive()) return;
    clearFace();
    head.setMood(s.emotion === 'happy' || s.emotion === 'impressed' ? 'happy' : 'neutral');
    await wait(700); if (!alive()) return;
  }
  if (alive()) showSummary();
}

function showSummary() {
  faceUser = 0.9;
  head.speakTo = null;
  head.setMood('neutral');
  ui.card.hidden = true;
  ui.subtitle.hidden = true;
  ui.controls.hidden = true;
  ui.adjust.hidden = true;
  ui.summary.hidden = false;
  ui.hud.classList.remove('running');
  ui.sumTitle.textContent = review.site || 'Review';
  ui.sumScore.textContent = String(review.score ?? '–');
  ui.sumText.textContent = review.summary || '';
  ui.sumList.replaceChildren(...review.steps
    .filter((s) => ['critical', 'major', 'minor'].includes(s.severity))
    .map((s) => {
      const li = document.createElement('li');
      li.textContent = `${s.area}: ${s.fix} `;
      const sev = document.createElement('span');
      sev.className = 'sev';
      sev.textContent = `(${SEV_LABEL[s.severity]})`;
      li.append(sev);
      return li;
    }));
}

function setPlaying(p) {
  playing = p;
  ui.btnPlay.textContent = p ? 'Pause' : 'Play';
  ui.btnPlay.setAttribute('aria-label', p ? 'Pause' : 'Play');
  if (p) { resumeGate?.(); resumeGate = null; }
  else { stopVoice(); }
}

function beginReview() {
  ui.start.hidden = true;
  ui.summary.hidden = true;
  ui.controls.hidden = false;
  ui.hud.classList.add('running');
  setPlaying(true);
  runFrom(0);
}

// ---------------------------------------------------------------------------
// Screen mode
// ---------------------------------------------------------------------------
function placeForPreview() {
  laptopTarget.position.set(DESK.x, DESK.top + 0.14, DESK.z - 0.05);
  root.position.copy(sitting ? AVATAR_PREVIEW : STAND_PREVIEW);
  root.position.y = heightOffset;
  chairMesh.position.copy(AVATAR_PREVIEW);
  chairMesh.rotation.y = yawTo(laptopTarget.position);
  if (sitting) seatAnchor.set(AVATAR_PREVIEW.x, CHAIR_SEAT, AVATAR_PREVIEW.z);
  else seatAnchor.set(STAND_PREVIEW.x, 0, STAND_PREVIEW.z);
  previewSet.visible = true;
  applyPosition();
}

async function startScreen() {
  await unlockAudio();
  document.body.classList.remove('in-ar');
  placeForPreview();
  beginReview();
}

// ---------------------------------------------------------------------------
// AR mode (WebXR, Android Chrome)
// ---------------------------------------------------------------------------
let xrSession = null;
let hitSource = null;
let placing = null; // 'laptop' | 'reviewer' | null
let lastHit = null;

async function checkAR() {
  let ok = false;
  try { ok = !!(navigator.xr && await navigator.xr.isSessionSupported('immersive-ar')); } catch { ok = false; }
  ui.btnAR.disabled = !ok || !head;
  ui.btnAR.textContent = ok ? 'Start in my room (AR)' : 'AR not available here';
  ui.arHint.textContent = ok
    ? 'You will tap your laptop first, then where he should stand or sit.'
    : 'Open this link on an Android phone in Chrome to see him in your room. You can still watch on this screen.';
  return ok;
}

async function startAR() {
  await unlockAudio();
  const session = await navigator.xr.requestSession('immersive-ar', {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'local-floor'],
    domOverlay: { root: ui.hud }
  });
  xrSession = session;
  document.body.classList.add('in-ar');
  previewSet.visible = false;
  chairMesh.visible = false;
  root.visible = false;
  renderer.xr.setReferenceSpaceType('local');
  await renderer.xr.setSession(session);
  const viewer = await session.requestReferenceSpace('viewer');
  hitSource = await session.requestHitTestSource({ space: viewer });
  session.addEventListener('select', onSelect);
  session.addEventListener('end', onAREnd);
  ui.start.hidden = true;
  setPlacing('laptop');
}

function setPlacing(what) {
  placing = what;
  ui.guide.hidden = !what;
  if (what === 'laptop') ui.guideText.textContent = 'Point at your laptop and tap on it.';
  if (what === 'reviewer') ui.guideText.textContent = sitting
    ? 'Now tap the seat of a chair next to the laptop.'
    : 'Now tap the floor where he should stand.';
}

function onSelect() {
  if (!placing || !lastHit) return;
  const p = new THREE.Vector3().setFromMatrixPosition(reticle.matrix);
  if (placing === 'laptop') {
    laptopTarget.position.set(p.x, p.y + 0.15, p.z);
    laptopMarker.position.copy(p);
    laptopMarker.visible = true;
    setPlacing('reviewer');
    return;
  }
  if (placing === 'reviewer') {
    root.position.set(p.x, p.y + heightOffset, p.z);
    seatAnchor.copy(p);
    root.visible = true;
    applyPosition();
    yawNow = targetYaw();
    setPlacing(null);
    reticle.visible = false;
    laptopMarker.visible = false;
    if (ui.controls.hidden && ui.summary.hidden) beginReview();
  }
}

function onAREnd() {
  xrSession = null;
  hitSource = null;
  placing = null;
  ui.guide.hidden = true;
  reticle.visible = false;
  document.body.classList.remove('in-ar');
  runId++;
  stopVoice();
  resetToStart();
}

function resetToStart() {
  ui.controls.hidden = true;
  ui.adjust.hidden = true;
  ui.card.hidden = true;
  ui.subtitle.hidden = true;
  ui.summary.hidden = true;
  ui.start.hidden = false;
  ui.hud.classList.remove('running');
  root.visible = true;
  placeForPreview();
  setPreviewCamera();
}

// Taps on buttons and cards must not place things in AR
ui.hud.addEventListener('beforexrselect', (e) => {
  if (e.target.closest?.('button, .card, .panel, .controls, .adjust, input, label')) e.preventDefault();
});

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
const tmpH = new THREE.Vector3();

function yawTo(v) {
  tmpV.copy(v).sub(root.position);
  return Math.atan2(tmpV.x, tmpV.z);
}
function targetYaw() {
  const toLaptop = yawTo(laptopTarget.position);
  const camPos = new THREE.Vector3();
  (renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldPosition(camPos);
  const toUser = yawTo(camPos);
  let d = toUser - toLaptop;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return toLaptop + d * faceUser * (sitting ? 0.6 : 1) + yawOffset;
}

renderer.setAnimationLoop((t, frame) => {
  const dt = Math.min(clock.getDelta(), params.has('debug') ? 1 : 0.1);
  if (frame && hitSource && placing) {
    const hits = frame.getHitTestResults(hitSource);
    if (hits.length) {
      const pose = hits[0].getPose(renderer.xr.getReferenceSpace());
      reticle.matrix.fromArray(pose.transform.matrix);
      reticle.visible = true;
      lastHit = pose;
    } else {
      reticle.visible = false;
      lastHit = null;
    }
  }
  if (head) {
    let d = targetYaw() - yawNow;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    yawNow += d * Math.min(1, dt * 3);
    root.rotation.y = yawNow;
    head.animate(dt * 1000);
    if (hipsBone) {
      // Keep his hips over the spot you chose (chair seat or floor), whatever the pose or turn
      hipsBone.getWorldPosition(tmpH);
      const k = Math.min(1, dt * 6);
      root.position.x += (seatAnchor.x - tmpH.x) * k;
      root.position.z += (seatAnchor.z - tmpH.z) * k;
      if (sitting) root.position.y += (seatAnchor.y + 0.07 + heightOffset - tmpH.y) * k;
      else root.position.y = seatAnchor.y + heightOffset;
      // Shadow stays under the body
      tmpH.y = root.position.y;
      root.worldToLocal(tmpH);
      footShadow.position.set(tmpH.x, 0.003, tmpH.z);
    }
  }
  if (!renderer.xr.isPresenting) controls.update();
  renderer.render(scene, camera);
});

// ---------------------------------------------------------------------------
// Audio unlock (needs a tap)
// ---------------------------------------------------------------------------
async function unlockAudio() {
  try { await head?.audioCtx?.resume(); } catch {}
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis?.speak(u);
  } catch {}
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
ui.btnScreen.addEventListener('click', startScreen);
ui.btnAR.addEventListener('click', () => startAR().catch((e) => {
  ui.loadStatus.textContent = `Could not start AR: ${e.message}. Try "Watch on this screen".`;
}));
ui.btnPlay.addEventListener('click', () => setPlaying(!playing));
ui.btnNext.addEventListener('click', () => {
  if (!review) return;
  if (idx + 1 >= review.steps.length) { runId++; stopVoice(); showSummary(); return; }
  setPlaying(true); runFrom(idx + 1);
});
ui.btnPrev.addEventListener('click', () => { setPlaying(true); runFrom(Math.max(0, idx - 1)); });
ui.btnEnd.addEventListener('click', () => {
  runId++; stopVoice();
  if (xrSession) xrSession.end(); else resetToStart();
});
ui.btnAdjust.addEventListener('click', () => { ui.adjust.hidden = !ui.adjust.hidden; });
ui.adjUp.addEventListener('click', () => { heightOffset += 0.03; });
ui.adjDown.addEventListener('click', () => { heightOffset -= 0.03; });
ui.adjLeft.addEventListener('click', () => { yawOffset += Math.PI / 12; });
ui.adjRight.addEventListener('click', () => { yawOffset -= Math.PI / 12; });
ui.adjMove.addEventListener('click', () => {
  if (xrSession) { setPlaying(false); setPlacing('reviewer'); }
});
ui.btnAgain.addEventListener('click', () => beginReview());
ui.btnClose.addEventListener('click', () => { if (xrSession) xrSession.end(); else resetToStart(); });

for (const r of document.querySelectorAll('input[name="who"]')) {
  r.addEventListener('change', async () => {
    ui.btnAR.disabled = true;
    ui.btnScreen.disabled = true;
    await loadReviewer(r.value);
    ui.btnScreen.disabled = false;
    checkAR();
  });
}
for (const r of document.querySelectorAll('input[name="pose"]')) {
  r.addEventListener('change', () => {
    sitting = r.value === 'sit' && r.checked;
    placeForPreview();
  });
}

// Boot
(async () => {
  ui.btnScreen.disabled = true;
  if (params.get('chair')) Object.assign(CHAIR_POSE.props, JSON.parse(params.get('chair')));
  await loadReview();
  placeForPreview();
  try {
    await loadReviewer('arjun');
  } catch (e) {
    ui.loadStatus.textContent = `Could not load the reviewer: ${e.message}`;
    return;
  }
  ui.btnScreen.disabled = false;
  await checkAR();
  // Test hooks: ?sit=1, ?who=meera, ?shot=react|talk to freeze a frame for screenshots
  if (params.get('who') === 'meera') { $('whoMeera').checked = true; await loadReviewer('meera'); }
  if (params.get('sit') === '1') { $('poseSit').checked = true; sitting = true; placeForPreview(); }
  if (params.has('debug')) {
    setTimeout(() => {
      const out = {};
      for (const b of ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'Head']) {
        const o = head.armature.getObjectByName(b);
        if (!o) continue;
        const v = new THREE.Vector3();
        o.getWorldPosition(v);
        root.worldToLocal(v);
        out[b] = [v.x, v.y, v.z].map((n) => +n.toFixed(2));
      }
      out.tpl = head.poseCurrentTemplate === CHAIR_POSE ? 'chair' : Object.keys(head.poseTemplates).find((k) => head.poseTemplates[k] === head.poseCurrentTemplate);
      const pre = document.createElement('pre');
      pre.id = 'dbg';
      pre.textContent = JSON.stringify(out);
      document.body.append(pre);
    }, 12000);
  }
  if (params.has('shot')) {
    ui.start.hidden = true;
    const s = review.steps[Number(params.get('step') || 2)];
    showCard(review.steps.indexOf(s));
    if (params.get('shot') === 'react') react(s, () => true);
    else { faceUser = 0.75; ui.subtitle.textContent = s.line.replaceAll('{me}', REVIEWERS[reviewerKey].name); ui.subtitle.hidden = false; }
    document.title = 'READY';
  }
})();
