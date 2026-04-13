/**
 * gesture.js — PalmID Gesture Engine
 * MediaPipe Hands wrapper with 8-gesture classifier + hold-to-commit
 */

class GestureEngine {
  constructor() {
    this.hands = null;
    this.camera = null;
    this._demoMode = false;
    this.videoEl = null;
    this.canvasEl = null;
    this.ctx = null;

    // Callbacks
    this.onGesture = null;      // (gesture|null, confidence)
    this._onHoldProgress = null;// (pct 0-1, gesture|null)
    this._onCommit = null;      // (gesture)

    // Hold state
    this._pending = null;
    this._gestureStart = 0;
    this.HOLD_MS = 1500;
    this._holdTimer = null;

    // Config
    this.landmarkColor = '#7B61FF';
    this.minConf = 0.7;
  }

  async init(videoEl, canvasEl) {
    this.videoEl = videoEl;
    this.canvasEl = canvasEl;
    this.ctx = canvasEl.getContext('2d');

    if (typeof Hands === 'undefined') {
      console.warn('[PalmID] MediaPipe not loaded → demo mode');
      this._demoMode = true;
      return;
    }

    this.hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
    });
    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: this.minConf,
      minTrackingConfidence: 0.6,
    });
    this.hands.onResults(r => this._onResults(r));

    this.camera = new Camera(videoEl, {
      onFrame: async () => { await this.hands.send({ image: videoEl }); },
      width: 640, height: 480,
    });
    await this.camera.start();
    this._demoMode = false;
  }

  stop() {
    if (this.camera) { try { this.camera.stop(); } catch(e){} this.camera = null; }
    if (this.hands)  { try { this.hands.close(); } catch(e){} this.hands = null; }
    this._resetHold();
  }

  setHoldDuration(ms) { this.HOLD_MS = ms; }

  _onResults(results) {
    const canvas = this.canvasEl;
    const ctx = this.ctx;
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
      if (this.onGesture) this.onGesture(null, 0);
      this._resetHold();
      return;
    }

    const lm = results.multiHandLandmarks[0];
    this._drawHand(ctx, lm, canvas.width, canvas.height);

    const { gesture, confidence } = this._classify(lm);
    if (this.onGesture) this.onGesture(gesture, confidence);
    this._tickHold(gesture);
  }

  _drawHand(ctx, lm, W, H) {
    const toX = l => (1 - l.x) * W;
    const toY = l => l.y * H;
    const col = this.landmarkColor;

    const CONNECTIONS = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],
      [9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],[0,17]
    ];

    // Shadow glow
    ctx.shadowBlur = 8;
    ctx.shadowColor = col + '66';

    // Connections
    ctx.strokeStyle = col + '99';
    ctx.lineWidth = 1.5;
    CONNECTIONS.forEach(([a,b]) => {
      ctx.beginPath();
      ctx.moveTo(toX(lm[a]), toY(lm[a]));
      ctx.lineTo(toX(lm[b]), toY(lm[b]));
      ctx.stroke();
    });

    // Joints
    const TIPS = [4,8,12,16,20];
    lm.forEach((p,i) => {
      const x = toX(p), y = toY(p);
      const isTip = TIPS.includes(i);
      ctx.beginPath();
      ctx.arc(x, y, isTip ? 5 : 3, 0, Math.PI*2);
      ctx.fillStyle = isTip ? col : col + '88';
      ctx.fill();
      if (isTip) {
        ctx.strokeStyle = col + '44';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI*2);
        ctx.stroke();
      }
    });

    ctx.shadowBlur = 0;

    // Label at wrist
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = col + '80';
    ctx.fillText('HAND', toX(lm[0]) + 10, toY(lm[0]) + 4);
  }

  _classify(lm) {
    const up = (tip, pip) => lm[tip].y < lm[pip].y - 0.02;
    const dn = (tip, pip) => lm[tip].y > lm[pip].y + 0.01;

    const index  = up(8, 6);
    const middle = up(12, 10);
    const ring   = up(16, 14);
    const pinky  = up(20, 18);
    const thumbUp = lm[4].x < lm[3].x - 0.04;

    if (index && middle && ring && pinky)
      return { gesture: 'open_hand', confidence: 0.92 };
    if (!index && !middle && !ring && !pinky)
      return { gesture: 'fist', confidence: 0.90 };
    if (index && middle && !ring && !pinky)
      return { gesture: 'peace', confidence: 0.88 };
    if (index && !middle && !ring && !pinky)
      return { gesture: 'point_up', confidence: 0.90 };
    if (thumbUp && !index && !middle && !ring && !pinky)
      return { gesture: 'thumbs_up', confidence: 0.87 };
    if (index && !middle && !ring && pinky)
      return { gesture: 'rock', confidence: 0.88 };
    if (!index && !middle && !ring && pinky && thumbUp)
      return { gesture: 'call', confidence: 0.85 };
    const dist = Math.hypot(lm[4].x-lm[8].x, lm[4].y-lm[8].y);
    if (dist < 0.06 && middle && ring && pinky)
      return { gesture: 'ok', confidence: 0.86 };

    return { gesture: null, confidence: 0 };
  }

  _tickHold(gesture) {
    if (!gesture) { this._resetHold(); return; }
    if (gesture !== this._pending) {
      this._pending = gesture;
      this._gestureStart = Date.now();
      if (this._holdTimer) clearInterval(this._holdTimer);
      this._holdTimer = setInterval(() => {
        const pct = Math.min((Date.now() - this._gestureStart) / this.HOLD_MS, 1);
        if (this._onHoldProgress) this._onHoldProgress(pct, this._pending);
        if (pct >= 1) {
          clearInterval(this._holdTimer); this._holdTimer = null;
          const committed = this._pending;
          this._pending = null; this._gestureStart = 0;
          if (this._onCommit) this._onCommit(committed);
        }
      }, 50);
    }
  }

  _resetHold() {
    this._pending = null; this._gestureStart = 0;
    if (this._holdTimer) { clearInterval(this._holdTimer); this._holdTimer = null; }
    if (this._onHoldProgress) this._onHoldProgress(0, null);
  }
}

const GESTURE_META = {
  open_hand: { icon:'🖐', name:'Open Hand' },
  fist:      { icon:'✊', name:'Fist'      },
  peace:     { icon:'✌️', name:'Peace'    },
  thumbs_up: { icon:'👍', name:'Thumbs Up' },
  point_up:  { icon:'☝️', name:'Point Up' },
  ok:        { icon:'👌', name:'OK'        },
  rock:      { icon:'🤘', name:'Rock'      },
  call:      { icon:'🤙', name:'Call'      },
};
