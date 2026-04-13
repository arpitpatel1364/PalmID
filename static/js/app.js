/**
 * app.js — PalmID v2.0 Application Controller
 * Features: Multi-user, lockout, peek pattern, export CSV, settings, dark/light theme
 */
// ── CONFIG (overridden by settings/backend) ──────────────────────────────
const CFG = {
  holdMs:       1500,
  maxFail:      5,
  lockoutSec:   30,
  minPatLen:    3,
  detectionConf:0.70,
  smoothing:    2,
  landmarkColor:'#7B61FF',
};

// ── API ───────────────────────────────────────────────────────────────────
const API_URL = '';
const API = {
  async get(path) {
    const r = await fetch(`${API_URL}${path}`);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async put(path, body) {
    const r = await fetch(`${API_URL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async delete(path) {
    const r = await fetch(`${API_URL}${path}`, { method: 'DELETE' });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
};

// ── STATE ─────────────────────────────────────────────────────────────────
const S = {
  users:        [],         // { id, name, avatar, pattern[], createdAt, loginCount, failCount }
  activeUserId: null,
  inputSeq:     [],
  failCount:    0,
  locked:       false,
  lockoutEnd:   0,
  lockoutTimer: null,
  auditLog:     [],
  sessionId:    randId(),
  loginEngine:  new GestureEngine(),
  enrollEngine: new GestureEngine(),
  loginCamOn:   false,
  enrollCamOn:  false,
  enrollPat:    [],
  enrollAvatar: '🧑',
  peekOn:       false,
  heldPct:      0,
  lockoutCount: 0,
  fpsTimer:     null,
  frameCount:   0,
  backendOnline:false,
};

// ── UTILS ─────────────────────────────────────────────────────────────────
function randId() { return Math.random().toString(36).slice(2,10).toUpperCase(); }
function ts() { return new Date(); }
function fmtTime(d) { return d.toLocaleTimeString('en-US',{hour12:false}); }
function fmtDate(d) { 
  if (typeof d === 'string') d = new Date(d);
  return d.toLocaleDateString()+' '+fmtTime(d); 
}

function showMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `status-msg show ${type}`;
  el.textContent = text;
}
function hideMsg(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}
function doFlash(type) {
  const el = document.getElementById('gesture-flash');
  if (!el) return;
  el.className = `gesture-flash ${type}`;
  setTimeout(() => el.className = 'gesture-flash', 500);
}

// ── PARTICLES ─────────────────────────────────────────────────────────────
(function initParticles() {
  const cv = document.getElementById('bg-canvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  let W, H, pts = [];
  let enabled = true;

  function resize() { W = cv.width = innerWidth; H = cv.height = innerHeight; }
  resize(); window.addEventListener('resize', resize);

  for (let i = 0; i < 70; i++) pts.push({
    x: Math.random() * 1400, y: Math.random() * 900,
    vx: (Math.random()-.5)*.25, vy: (Math.random()-.5)*.25,
    r: Math.random()*1.2+.4, a: Math.random()*.6+.1,
  });

  const col = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7B61FF';

  function draw() {
    ctx.clearRect(0,0,W,H);
    if (!enabled) { requestAnimationFrame(draw); return; }
    const c = col();
    pts.forEach(p => {
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=W; if(p.x>W)p.x=0;
      if(p.y<0)p.y=H; if(p.y>H)p.y=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle = c + Math.round(p.a*40).toString(16).padStart(2,'0');
      ctx.fill();
    });
    for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
      const dx=pts[i].x-pts[j].x,dy=pts[i].y-pts[j].y,d=Math.sqrt(dx*dx+dy*dy);
      if(d<110){ctx.strokeStyle=c+Math.round(.06*(1-d/110)*255).toString(16).padStart(2,'0');ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(pts[i].x,pts[i].y);ctx.lineTo(pts[j].x,pts[j].y);ctx.stroke();}
    }
    requestAnimationFrame(draw);
  }
  draw();

  document.getElementById('tog-particles').addEventListener('change', e => {
    enabled = e.target.checked;
  });
})();

// ── CLOCK ─────────────────────────────────────────────────────────────────
function updateClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleTimeString('en-US',{hour12:false});
}
setInterval(updateClock, 1000);
updateClock();

// ── BOOT ──────────────────────────────────────────────────────────────────
(function boot() {
  const bar = document.getElementById('boot-bar');
  const msg = document.getElementById('boot-msg');
  const msgs = [
    'INITIALIZING PALM DETECTION ENGINE...','LOADING GESTURE CLASSIFIER...','CONNECTING TO BACKEND VAULT...','CALIBRATING BIOMETRIC MODEL...','ESTABLISHING SECURE SESSION...','READY',
  ];
  let pct = 0, step = 0;
  const iv = setInterval(() => {
    pct += Math.random()*16+5;
    if (pct > 100) pct = 100;
    bar.style.width = pct + '%';
    if (step < msgs.length) msg.textContent = msgs[step++];
    if (pct >= 100) {
      clearInterval(iv);
      setTimeout(() => {
        const bs = document.getElementById('boot-screen');
        bs.classList.add('out');
        setTimeout(() => {
          bs.style.display = 'none';
          document.getElementById('main-app').classList.remove('hidden');
          initApp();
        }, 600);
      }, 500);
    }
  }, 130);
})();

// ── INIT APP ──────────────────────────────────────────────────────────────
async function initApp() {
  document.getElementById('si-session').textContent = S.sessionId;
  
  // Try to connect to backend
  try {
    await syncWithBackend();
    S.backendOnline = true;
    document.getElementById('sys-pill').className = 'sys-pill online';
    document.getElementById('sys-label').textContent = 'CONNECTED';
  } catch (e) {
    console.error("Backend offline", e);
    S.backendOnline = false;
    document.getElementById('sys-pill').className = 'sys-pill offline';
    document.getElementById('sys-label').textContent = 'OFFLINE';
    // Load demo users if backend is offline
    seedDemoUsers();
  }

  initTabs();
  initAuthPanel();
  initEnrollPanel();
  initSettings();
  renderUserSelect();
  renderUsers();
  renderAuditLog();
}

async function syncWithBackend() {
  // Sync Users
  S.users = await API.get('/users');
  
  // Sync Logs
  S.auditLog = await API.get('/logs');
  
  // Sync Settings
  const settings = await API.get('/settings');
  CFG.holdMs = settings.hold_ms;
  CFG.maxFail = settings.max_fail;
  CFG.lockoutSec = settings.lockout_sec;
  CFG.minPatLen = settings.min_pat_len;
  CFG.detectionConf = settings.detection_conf / 100;
  CFG.smoothing = settings.smoothing;
  CFG.landmarkColor = settings.landmark_color;
  
  updateSettingsUI();
}

function updateSettingsUI() {
  document.getElementById('hold-dur-slider').value = CFG.holdMs;
  document.getElementById('hold-dur-val').textContent = (CFG.holdMs/1000).toFixed(1)+'s';
  document.getElementById('conf-slider').value = CFG.detectionConf * 100;
  document.getElementById('conf-val').textContent = (CFG.detectionConf * 100)+'%';
  document.getElementById('smooth-slider').value = CFG.smoothing;
  const smLabels=['Off','Low','Medium','High','Very High','Max'];
  document.getElementById('smooth-val').textContent=smLabels[CFG.smoothing];
  document.getElementById('max-fail-slider').value = CFG.maxFail;
  document.getElementById('max-fail-val').textContent = CFG.maxFail;
  document.getElementById('lockout-dur-slider').value = CFG.lockoutSec;
  document.getElementById('lockout-dur-val').textContent = CFG.lockoutSec+'s';
  document.getElementById('min-pat-slider').value = CFG.minPatLen;
  document.getElementById('min-pat-val').textContent = CFG.minPatLen;
  document.getElementById('lm-color').value = CFG.landmarkColor;
}

function seedDemoUsers() {
  if (S.users.length > 0) return;
  const demoUsers = [
    { id: 'ALICE01', name: 'Alice', avatar: '🦊', pattern: ['peace','thumbs_up','fist'], createdAt: ts(), loginCount:0, failCount:0 },
    { id: 'BOB02',   name: 'Bob',   avatar: '🤖', pattern: ['open_hand','rock','ok'], createdAt: ts(), loginCount:0, failCount:0 }
  ];
  S.users = demoUsers;
}

// ── TABS ──────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('tab-' + btn.dataset.tab);
      if (panel) panel.classList.add('active');
      
      if (S.backendOnline) {
        if (btn.dataset.tab === 'users') S.users = await API.get('/users');
        if (btn.dataset.tab === 'log')   S.auditLog = await API.get('/logs');
      }
      
      if (btn.dataset.tab === 'users') renderUsers();
      if (btn.dataset.tab === 'log')   renderAuditLog();
    });
  });
}

// ── AUTH PANEL ────────────────────────────────────────────────────────────
function initAuthPanel() {
  document.getElementById('btn-cam').addEventListener('click', toggleLoginCam);
  document.getElementById('btn-reset').addEventListener('click', resetAuth);
  document.getElementById('btn-lock-again').addEventListener('click', lockAgain);
  document.getElementById('user-select').addEventListener('change', e => {
    S.activeUserId = e.target.value || null;
    resetAuth();
    renderPatternSlots();
    renderAttemptSlots();
    renderProgressSteps();
    renderFailDots();
    updateActiveUserPill();
  });
  document.getElementById('btn-peek').addEventListener('click', togglePeek);
}

async function toggleLoginCam() {
  if (S.loginCamOn) {
    S.loginEngine.stop();
    S.loginCamOn = false;
    document.getElementById('btn-cam').innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>START CAMERA`;
    document.getElementById('cam-overlay').classList.remove('hidden');
    document.getElementById('sys-pill').className = S.backendOnline ? 'sys-pill online' : 'sys-pill';
    document.getElementById('sys-label').textContent = S.backendOnline ? 'CONNECTED' : 'OFFLINE';
    document.getElementById('hud-fps').textContent = '—';
    document.getElementById('hold-arc-svg').style.display = 'none';
    document.getElementById('si-camera').textContent = 'Not started';
    if (S.fpsTimer) { clearInterval(S.fpsTimer); S.fpsTimer = null; }
    return;
  }

  const btn = document.getElementById('btn-cam');
  btn.textContent = 'STARTING...';

  try {
    await S.loginEngine.init(
      document.getElementById('video'),
      document.getElementById('canvas')
    );
    S.loginEngine.landmarkColor = CFG.landmarkColor;
    S.loginEngine.setHoldDuration(CFG.holdMs);

    S.loginEngine.onGesture = (g, conf) => {
      const meta = g ? (GESTURE_META[g] || { icon:'?', name:g }) : null;
      document.getElementById('cur-gesture-icon').textContent = meta ? meta.icon : '—';
      document.getElementById('cur-gesture-name').textContent = meta ? meta.name : 'No gesture';
      const arc = document.getElementById('conf-arc');
      const pct = conf * 100;
      const circ = 100.5;
      arc.style.strokeDashoffset = circ - (pct / 100) * circ;
      document.getElementById('conf-pct').textContent = Math.round(pct) + '%';
      S.frameCount++;
    };

    S.loginEngine._onHoldProgress = (pct, gest) => {
      const arcSvg = document.getElementById('hold-arc-svg');
      const arcCirc = document.getElementById('hold-arc-circle');
      if (pct > 0 && gest) {
        arcSvg.style.display = 'block';
        arcCirc.style.strokeDashoffset = 188.5 - pct * 188.5;
        arcCirc.style.stroke = pct > .7 ? '#22d97a' : '#7B61FF';
      } else {
        arcSvg.style.display = 'none';
        arcCirc.style.strokeDashoffset = 188.5;
      }
    };

    S.loginEngine._onCommit = commitGesture;

    S.loginCamOn = true;
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>STOP CAMERA`;
    document.getElementById('cam-overlay').classList.add('hidden');
    document.getElementById('sys-pill').className = 'sys-pill online blinking';
    document.getElementById('sys-label').textContent = 'LIVE';
    document.getElementById('si-camera').textContent = 'Active · 640×480';

    // FPS counter
    S.frameCount = 0;
    S.fpsTimer = setInterval(() => {
      document.getElementById('hud-fps').textContent = S.frameCount;
      S.frameCount = 0;
    }, 1000);

    if (S.loginEngine._demoMode) {
      showMsg('auth-msg', 'Demo mode — use keyboard keys to simulate gestures', 'info');
      enableDemoKeys();
    }
  } catch(e) {
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>START CAMERA`;
    showMsg('auth-msg', 'Camera error: ' + e.message, 'danger');
  }
}

function enableDemoKeys() {
  if (window._demoKeysEnabled) return;
  window._demoKeysEnabled = true;
  const map = { o:'open_hand',f:'fist',p:'peace',t:'thumbs_up',i:'point_up',k:'ok',r:'rock',c:'call' };
  window.addEventListener('keydown', e => {
    if (document.activeElement.tagName === 'INPUT') return;
    const g = map[e.key.toLowerCase()];
    if (g && S.loginCamOn) {
      document.getElementById('cur-gesture-icon').textContent = GESTURE_META[g]?.icon || '?';
      document.getElementById('cur-gesture-name').textContent = GESTURE_META[g]?.name || g;
      commitGesture(g);
    }
  });
}

async function commitGesture(gesture) {
  if (S.locked) { showMsg('auth-msg','System locked — wait for cooldown','danger'); return; }
  if (!S.activeUserId) { showMsg('auth-msg','Select a user first','warn'); return; }
  const user = S.users.find(u => u.id === S.activeUserId);
  if (!user) return;
  if (S.inputSeq.length >= user.pattern.length) return;

  S.inputSeq.push(gesture);
  doFlash('ok');
  renderAttemptSlots();
  renderProgressSteps();

  if (S.inputSeq.length === user.pattern.length) {
    await evaluateLogin(user);
  }
}

async function evaluateLogin(user) {
  const ok = S.inputSeq.every((g,i) => g === user.pattern[i]);

  if (ok) {
    S.failCount = 0;
    if (S.backendOnline) {
      await API.post(`/users/${user.id}/login?success=true`);
      await logEvent('LOGIN_ATTEMPT', user, [...S.inputSeq], 'GRANTED');
    } else {
      user.loginCount++;
    }
    showMsg('auth-msg', `✓ Welcome back, ${user.name}!`, 'success');
    doFlash('ok');
    setTimeout(() => {
      document.getElementById('unlock-user-name').textContent = user.name + ' ' + user.avatar;
      document.getElementById('unlock-overlay').classList.remove('hidden');
    }, 600);
  } else {
    S.failCount++;
    if (S.backendOnline) {
      await API.post(`/users/${user.id}/login?success=false`);
      await logEvent('LOGIN_ATTEMPT', user, [...S.inputSeq], 'FAILED');
    } else {
      user.failCount++;
    }
    doFlash('fail');
    showMsg('auth-msg', `✗ Wrong pattern (attempt ${S.failCount}/${CFG.maxFail})`, 'danger');
    renderFailDots();
    if (S.failCount >= CFG.maxFail) {
      await triggerLockout(user);
    } else {
      setTimeout(resetAuth, 1800);
    }
  }
  if (S.backendOnline) S.users = await API.get('/users');
  renderUsers();
}

async function triggerLockout(user) {
  S.locked = true;
  S.lockoutEnd = Date.now() + CFG.lockoutSec * 1000;
  S.lockoutCount++;
  if (S.backendOnline) await logEvent('LOCKOUT', user, [], 'LOCKOUT');

  const banner = document.getElementById('lockout-banner');
  banner.classList.remove('hidden');

  const iv = setInterval(() => {
    const rem = Math.max(0, Math.ceil((S.lockoutEnd - Date.now()) / 1000));
    document.getElementById('lockout-timer').textContent = `${rem}s remaining`;
    if (rem <= 0) {
      clearInterval(iv);
      S.locked = false;
      S.failCount = 0;
      banner.classList.add('hidden');
      resetAuth();
      showMsg('auth-msg','Lockout expired — you may try again','info');
    }
  }, 500);
}

function resetAuth() {
  S.inputSeq = [];
  hideMsg('auth-msg');
  renderAttemptSlots();
  renderProgressSteps();
  renderFailDots();
}

function lockAgain() {
  document.getElementById('unlock-overlay').classList.add('hidden');
  resetAuth();
}

function togglePeek() {
  S.peekOn = !S.peekOn;
  const btn = document.getElementById('btn-peek');
  btn.style.color = S.peekOn ? 'var(--accent)' : '';
  renderPatternSlots();
}

function updateActiveUserPill() {
  const pill = document.getElementById('active-user-pill');
  const user = S.users.find(u => u.id === S.activeUserId);
  if (user) {
    pill.classList.remove('hidden');
    document.getElementById('active-avatar').textContent = user.avatar;
    document.getElementById('active-username').textContent = user.name;
  } else {
    pill.classList.add('hidden');
  }
}

// ── RENDER AUTH ───────────────────────────────────────────────────────────
function renderUserSelect() {
  const sel = document.getElementById('user-select');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Select user —</option>';
  S.users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id; opt.textContent = u.avatar + ' ' + u.name;
    if (u.id === cur) opt.selected = true;
    sel.appendChild(opt);
  });
}

function renderPatternSlots() {
  const el = document.getElementById('pattern-slots');
  const user = S.users.find(u => u.id === S.activeUserId);
  if (!user) { el.innerHTML = '<div style="font-size:12px;color:var(--text3)">Select a user to see pattern</div>'; return; }
  el.innerHTML = user.pattern.map(g => {
    const m = GESTURE_META[g] || {icon:'?',name:g};
    if (!S.peekOn) {
      return `<div class="p-slot secret"><div class="ps-icon">🔒</div><div class="ps-name">hidden</div></div>`;
    }
    return `<div class="p-slot secret"><div class="ps-icon">${m.icon}</div><div class="ps-name">${m.name}</div></div>`;
  }).join('');
}

function renderAttemptSlots() {
  const el = document.getElementById('attempt-slots');
  const user = S.users.find(u => u.id === S.activeUserId);
  if (!user) { el.innerHTML = ''; return; }
  el.innerHTML = user.pattern.map((g,i) => {
    const inp = S.inputSeq[i];
    if (!inp) {
      return `<div class="p-slot waiting"><div class="ps-icon" style="opacity:.25">?</div><div class="ps-name">—</div></div>`;
    }
    const m = GESTURE_META[inp] || {icon:'?',name:inp};
    const cls = inp === g ? 'matched' : 'wrong';
    return `<div class="p-slot ${cls}"><div class="ps-icon">${m.icon}</div><div class="ps-name">${m.name}</div></div>`;
  }).join('');
}

function renderProgressSteps() {
  const el = document.getElementById('ap-steps');
  const user = S.users.find(u => u.id === S.activeUserId);
  if (!user) { el.innerHTML = ''; return; }
  el.innerHTML = user.pattern.map((g,i) => {
    let cls = '';
    if (i < S.inputSeq.length) cls = S.inputSeq[i] === g ? 'done' : 'fail';
    else if (i === S.inputSeq.length && S.loginCamOn) cls = 'active';
    const div = `<div class="ap-step ${cls}">${i+1}</div>`;
    return i < user.pattern.length-1 ? div + '<div class="ap-divider"></div>' : div;
  }).join('');
}

function renderFailDots() {
  const el = document.getElementById('fail-dots');
  if (!el) return;
  const maxF = CFG.maxFail;
  el.innerHTML = Array.from({length:maxF},(_,i) =>
    `<div class="fail-dot${i < S.failCount ? ' used' : ''}"></div>`
  ).join('');
  document.getElementById('fail-count').textContent = `${S.failCount} / ${maxF}`;
}

// ── ENROLL PANEL ──────────────────────────────────────────────────────────
function initEnrollPanel() {
  document.getElementById('btn-enroll-cam').addEventListener('click', toggleEnrollCam);
  document.getElementById('btn-clear-enroll').addEventListener('click', clearEnroll);
  document.getElementById('btn-save-enroll').addEventListener('click', saveEnroll);

  document.querySelectorAll('#gesture-palette .gesture-card').forEach(card => {
    card.addEventListener('click', () => addToEnrollPat(card.dataset.g));
  });

  document.querySelectorAll('.av-option').forEach(av => {
    av.addEventListener('click', () => {
      document.querySelectorAll('.av-option').forEach(a => a.classList.remove('selected'));
      av.classList.add('selected');
      S.enrollAvatar = av.dataset.av;
    });
  });
}

async function toggleEnrollCam() {
  const btn = document.getElementById('btn-enroll-cam');
  if (S.enrollCamOn) {
    S.enrollEngine.stop();
    S.enrollCamOn = false;
    btn.textContent = 'START CAMERA';
    document.getElementById('enroll-overlay').classList.remove('hidden');
    return;
  }
  btn.textContent = 'STARTING...';
  try {
    await S.enrollEngine.init(
      document.getElementById('enroll-video'),
      document.getElementById('enroll-canvas')
    );
    S.enrollEngine.landmarkColor = CFG.landmarkColor;
    S.enrollEngine.setHoldDuration(CFG.holdMs);
    S.enrollEngine.onGesture = (g) => {
      const m = g ? GESTURE_META[g] : null;
      document.getElementById('enroll-gest-icon').textContent = m ? m.icon : '—';
      document.getElementById('enroll-gest-name').textContent = m ? m.name : '—';
    };
    S.enrollEngine._onCommit = g => addToEnrollPat(g);
    S.enrollCamOn = true;
    btn.textContent = 'STOP CAMERA';
    document.getElementById('enroll-overlay').classList.add('hidden');
  } catch(e) {
    btn.textContent = 'START CAMERA';
  }
}

function addToEnrollPat(g) {
  if (S.enrollPat.length >= 5) { showMsg('enroll-msg','Maximum 5 gestures','warn'); return; }
  S.enrollPat.push(g);
  renderEnrollBuilder();
  updateStrength();
  hideMsg('enroll-msg');
}

function renderEnrollBuilder() {
  const el = document.getElementById('pattern-builder');
  if (!S.enrollPat.length) {
    el.innerHTML = '<div class="pb-empty">Click gestures above to build your secret pattern</div>';
    return;
  }
  el.innerHTML = S.enrollPat.map((g,i) => {
    const m = GESTURE_META[g] || {icon:'?',name:g};
    return (i>0?'<span class="pb-arrow">→</span>':'') +
      `<div class="pb-chip" onclick="removeEnrollGest(${i})" title="Click to remove">
        <span>${m.icon}</span><span>${m.name}</span><span style="opacity:.4;font-size:10px">✕</span>
      </div>`;
  }).join('');
}

window.removeEnrollGest = i => { S.enrollPat.splice(i,1); renderEnrollBuilder(); updateStrength(); };

function updateStrength() {
  const fill = document.getElementById('strength-fill');
  const label = document.getElementById('strength-label');
  const len = S.enrollPat.length;
  const unique = new Set(S.enrollPat).size;
  const score = len === 0 ? 0 : Math.min(100, len*15 + unique*10 + (len>=4?15:0) + (len>=5?15:0));
  fill.style.width = score + '%';
  if (score < 30)      { fill.style.background='var(--red)';   label.textContent='Weak';   label.style.color='var(--red)'; }
  else if (score < 60) { fill.style.background='var(--amber)'; label.textContent='Fair';   label.style.color='var(--amber)'; }
  else if (score < 85) { fill.style.background='var(--accent)';label.textContent='Good';   label.style.color='var(--accent)'; }
  else                 { fill.style.background='var(--green)'; label.textContent='Strong'; label.style.color='var(--green)'; }
}

function clearEnroll() {
  S.enrollPat = [];
  renderEnrollBuilder();
  updateStrength();
  document.getElementById('enroll-name').value = '';
  hideMsg('enroll-msg');
}

async function saveEnroll() {
  const name = document.getElementById('enroll-name').value.trim();
  if (!name) { showMsg('enroll-msg','Enter a display name','warn'); return; }
  if (S.enrollPat.length < CFG.minPatLen) { showMsg('enroll-msg',`Minimum ${CFG.minPatLen} gestures required`,'warn'); return; }

  const newUser = { id: randId(), name, avatar: S.enrollAvatar, pattern: [...S.enrollPat] };
  
  if (S.backendOnline) {
    try {
      await API.post('/users', newUser);
      await logEvent('PATTERN_ENROLLED', {name, avatar:S.enrollAvatar}, [...S.enrollPat], 'ENROLLED');
      S.users = await API.get('/users');
    } catch(e) {
      showMsg('enroll-msg', 'Error saving to backend: ' + e.message, 'danger');
      return;
    }
  } else {
    S.users.push({ ...newUser, createdAt: ts(), loginCount:0, failCount:0 });
  }

  showMsg('enroll-msg',`✓ ${name} enrolled with ${S.enrollPat.length}-gesture pattern`,'success');

  renderUserSelect();
  renderUsers();
  renderAuditLog();
  document.getElementById('si-users').textContent = S.users.length;

  clearEnroll();
  setTimeout(() => {
    document.querySelector('[data-tab="auth"]').click();
    const sel = document.getElementById('user-select');
    sel.value = newUser.id;
    sel.dispatchEvent(new Event('change'));
  }, 1500);
}

// ── USERS TAB ─────────────────────────────────────────────────────────────
function renderUsers() {
  const el = document.getElementById('user-cards');
  document.getElementById('stat-users').textContent = S.users.length;
  const totalLogins = S.users.reduce((a,u)=>a+u.loginCount,0);
  const totalFails  = S.users.reduce((a,u)=>a+u.failCount,0);
  document.getElementById('stat-total-logins').textContent = totalLogins;
  document.getElementById('stat-total-fails').textContent  = totalFails;
  document.getElementById('si-users').textContent = S.users.length;

  if (!S.users.length) {
    el.innerHTML = '<div class="no-users-msg">No users enrolled — go to Enroll tab</div>';
    return;
  }
  el.innerHTML = S.users.map(u => `
    <div class="user-card">
      <div class="uc-top">
        <div class="uc-avatar">${u.avatar}</div>
        <div>
          <div class="uc-name">${u.name}</div>
          <div class="uc-created">${fmtDate(u.created_at || u.createdAt)}</div>
        </div>
      </div>
      <div class="uc-pattern">
        ${u.pattern.map(g=>`<span class="uc-gest" title="${GESTURE_META[g]?.name||g}">${GESTURE_META[g]?.icon||'?'}</span>`).join(' → ')}
      </div>
      <div class="uc-stats">
        <div class="uc-stat"><div class="uc-stat-val" style="color:var(--green)">${u.loginCount}</div><div class="uc-stat-key">LOGINS</div></div>
        <div class="uc-stat"><div class="uc-stat-val" style="color:var(--red)">${u.failCount}</div><div class="uc-stat-key">FAILED</div></div>
        <div class="uc-stat"><div class="uc-stat-val">${u.pattern.length}</div><div class="uc-stat-key">PATTERN</div></div>
      </div>
      <div class="uc-actions">
        <button class="ghost-btn sm" onclick="selectAndAuth('${u.id}')">AUTH AS</button>
        <button class="ghost-btn sm danger-btn" onclick="deleteUser('${u.id}')">DELETE</button>
      </div>
    </div>
  `).join('');
}

window.selectAndAuth = id => {
  document.querySelector('[data-tab="auth"]').click();
  const sel = document.getElementById('user-select');
  sel.value = id;
  sel.dispatchEvent(new Event('change'));
};

window.deleteUser = async id => {
  if (!confirm('Delete this user?')) return;
  
  if (S.backendOnline) {
    await API.delete(`/users/${id}`);
    S.users = await API.get('/users');
  } else {
    S.users = S.users.filter(u => u.id !== id);
  }

  if (S.activeUserId === id) {
    S.activeUserId = null;
    document.getElementById('user-select').value = '';
    resetAuth();
    renderPatternSlots();
    renderAttemptSlots();
    renderProgressSteps();
  }
  renderUserSelect();
  renderUsers();
};

// ── AUDIT LOG ─────────────────────────────────────────────────────────────
async function logEvent(event, user, gestures, result) {
  const e = {
    event,
    user_name: user?.name || '—',
    user_avatar: user?.avatar || '',
    gestures,
    result,
    session_id: S.sessionId,
  };

  if (S.backendOnline) {
    await API.post('/logs', e);
    S.auditLog = await API.get('/logs');
  } else {
    S.auditLog.unshift({
      id: S.auditLog.length + 1,
      ts: ts(),
      ...e,
      userName: e.user_name,
      userAvatar: e.user_avatar,
      session: e.session_id
    });
  }
}

function renderAuditLog() {
  const body = document.getElementById('log-body');
  const total   = S.auditLog.length;
  const granted = S.auditLog.filter(e=>e.result==='GRANTED').length;
  const failed  = S.auditLog.filter(e=>e.result==='FAILED').length;
  const lockout = S.auditLog.filter(e=>e.result==='LOCKOUT').length;

  document.getElementById('log-stat-total').textContent   = total;
  document.getElementById('log-stat-ok').textContent      = granted;
  document.getElementById('log-stat-fail').textContent    = failed;
  document.getElementById('log-stat-lock').textContent    = lockout;

  if (!total) {
    body.innerHTML = '<tr class="log-empty"><td colspan="7">No entries yet</td></tr>';
    return;
  }
  const badge = r => {
    const map = {GRANTED:'granted',FAILED:'failed',ENROLLED:'enrolled',LOCKOUT:'lockout'};
    return `<span class="log-badge ${map[r]||''}">${r}</span>`;
  };
  body.innerHTML = S.auditLog.map(e => `
    <tr>
      <td style="color:var(--text3)">${String(e.id).padStart(4,'0')}</td>
      <td style="color:var(--text2);font-size:11px">${fmtDate(e.timestamp || e.ts)}</td>
      <td>${e.user_avatar || e.userAvatar} ${e.user_name || e.userName}</td>
      <td style="font-size:10px;color:var(--text3);letter-spacing:.08em;font-family:'Rajdhani',monospace;font-weight:600">${e.event}</td>
      <td class="log-gest">${e.gestures.map(g=>GESTURE_META[g]?.icon||g).join(' → ')||'—'}</td>
      <td>${badge(e.result)}</td>
      <td style="font-size:10px;color:var(--text3)">${e.session_id || e.session}</td>
    </tr>
  `).join('');
}

// Export CSV
document.getElementById('btn-export-log').addEventListener('click', () => {
  const header = 'ID,Timestamp,User,Event,Gestures,Result,Session\n';
  const rows = S.auditLog.map(e =>
    [e.id,fmtDate(e.timestamp || e.ts),e.user_name || e.userName,e.event,e.gestures.join('→'),e.result,e.session_id || e.session].join(',')
  ).join('\n');
  const blob = new Blob([header+rows], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `palmid-audit-${Date.now()}.csv`;
  a.click();
});

document.getElementById('btn-clear-log').addEventListener('click', async () => {
  if (confirm('Clear all audit records?')) { 
    if (S.backendOnline) {
      await API.delete('/logs');
      S.auditLog = [];
    } else {
      S.auditLog = [];
    }
    renderAuditLog(); 
  }
});

// ── SETTINGS ──────────────────────────────────────────────────────────────
async function updateBackendSettings() {
  if (!S.backendOnline) return;
  try {
    const s = {
      hold_ms: CFG.holdMs,
      max_fail: CFG.maxFail,
      lockout_sec: CFG.lockoutSec,
      min_pat_len: CFG.minPatLen,
      detection_conf: Math.round(CFG.detectionConf * 100),
      smoothing: CFG.smoothing,
      landmark_color: CFG.landmarkColor,
    };
    await API.put('/settings', s);
  } catch(e) { console.error("Setting sync fail", e); }
}

function initSettings() {
  // Hold duration
  const hd = document.getElementById('hold-dur-slider');
  const hdv = document.getElementById('hold-dur-val');
  hd.addEventListener('change', () => {
    CFG.holdMs = +hd.value;
    hdv.textContent = (CFG.holdMs/1000).toFixed(1)+'s';
    S.loginEngine.setHoldDuration(CFG.holdMs);
    S.enrollEngine.setHoldDuration(CFG.holdMs);
    updateBackendSettings();
  });

  // Confidence
  const cs = document.getElementById('conf-slider');
  const csv = document.getElementById('conf-val');
  cs.addEventListener('change', () => { 
    CFG.detectionConf=+cs.value/100; 
    csv.textContent=cs.value+'%'; 
    updateBackendSettings();
  });

  // Smoothing
  const sm = document.getElementById('smooth-slider');
  const smv = document.getElementById('smooth-val');
  const smLabels=['Off','Low','Medium','High','Very High','Max'];
  sm.addEventListener('change', () => { 
    CFG.smoothing=+sm.value; 
    smv.textContent=smLabels[+sm.value]; 
    updateBackendSettings();
  });

  // Max fail
  const mf = document.getElementById('max-fail-slider');
  const mfv = document.getElementById('max-fail-val');
  mf.addEventListener('change', () => { 
    CFG.maxFail=+mf.value; 
    mfv.textContent=mf.value; 
    renderFailDots(); 
    updateBackendSettings();
  });

  // Lockout
  const ld = document.getElementById('lockout-dur-slider');
  const ldv = document.getElementById('lockout-dur-val');
  ld.addEventListener('change', () => { 
    CFG.lockoutSec=+ld.value; 
    ldv.textContent=ld.value+'s'; 
    updateBackendSettings();
  });

  // Min pattern
  const mp = document.getElementById('min-pat-slider');
  const mpv = document.getElementById('min-pat-val');
  mp.addEventListener('change', () => { 
    CFG.minPatLen=+mp.value; 
    mpv.textContent=mp.value; 
    updateBackendSettings();
  });

  // Theme toggle
  document.getElementById('btn-theme').addEventListener('click', () => {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    document.getElementById('tog-dark').classList.toggle('active', !isDark);
    document.getElementById('tog-light').classList.toggle('active', isDark);
  });
  document.getElementById('tog-dark').addEventListener('click', () => {
    document.documentElement.setAttribute('data-theme','dark');
    document.getElementById('tog-dark').classList.add('active');
    document.getElementById('tog-light').classList.remove('active');
  });
  document.getElementById('tog-light').addEventListener('click', () => {
    document.documentElement.setAttribute('data-theme','light');
    document.getElementById('tog-light').classList.add('active');
    document.getElementById('tog-dark').classList.remove('active');
  });

  // Scanlines
  document.getElementById('tog-scanlines').addEventListener('change', e => {
    document.querySelector('.scanlines').style.opacity = e.target.checked ? '1' : '0';
  });

  // Landmark color
  document.getElementById('lm-color').addEventListener('change', e => {
    CFG.landmarkColor = e.target.value;
    S.loginEngine.landmarkColor = e.target.value;
    S.enrollEngine.landmarkColor = e.target.value;
    updateBackendSettings();
  });

  // Factory reset
  document.getElementById('btn-reset-all').addEventListener('click', async () => {
    if (!confirm('Factory reset — this clears all users and logs. Continue?')) return;
    
    if (S.backendOnline) {
      await API.post('/reset');
      await syncWithBackend();
    } else {
      S.users = []; S.auditLog = []; S.activeUserId = null;
      S.inputSeq = []; S.failCount = 0; S.enrollPat = [];
    }
    
    renderUserSelect(); renderUsers(); renderAuditLog();
    renderPatternSlots(); renderAttemptSlots(); renderProgressSteps();
    updateActiveUserPill();
    showMsg('auth-msg','Factory reset complete','info');
  });
}

// Initial renders
setTimeout(() => { renderFailDots(); }, 100);

 