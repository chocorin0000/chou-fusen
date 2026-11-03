// 超！付箋電卓 Web 版。Android 版（com.lifeu.fusencalc v3）と同じ動き。
// データはこのブラウザの localStorage（"fusen.data"）に、Android 版の fusen.json と同じ形で保存する。
'use strict';

const $ = id => document.getElementById(id);
const COLORS = ['#FFE680', '#FFC4D6', '#C8EFB0', '#BFE3FF', '#FFD3A1'];
const COLOR_NAMES = ['黄色', 'ピンク', '緑', '水色', 'オレンジ'];
const KEY = 'fusen.data';
const NAVY = '#24324A', CORAL = '#E86A4A', INK = '#24324A';

// ================= 保存 =================
const st = {
  boards: [], cur: 0, history: [], rateA: 10, rateB: 8, rateSel: 0, round: 0, vibrate: true,
  newColor: 0, nextId: 1, usdJpy: 0, usdEur: 0, rateTime: 0, rateFetched: 0,
};

function newBoard(name) { return { name, notes: [], panX: 0, panY: 0, zoom: 1 }; }
function board() { return st.boards[st.cur]; }
function rate() { return st.rateSel === 1 ? st.rateB : st.rateA; }
function newNote(v, x, y) { return { id: st.nextId++, v, memo: '', unit: '', x, y, color: st.newColor, sel: false, hidden: false }; }
function addHistory(s) { st.history.unshift(s); if (st.history.length > 300) st.history.length = 300; }

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) {}
  if (raw) {
    try {
      const o = JSON.parse(raw);
      for (const k of ['cur', 'rateA', 'rateB', 'rateSel', 'round', 'vibrate', 'newColor', 'nextId', 'usdJpy', 'usdEur', 'rateTime', 'rateFetched'])
        if (o[k] !== undefined) st[k] = o[k];
      st.history = Array.isArray(o.history) ? o.history : [];
      for (const bo of o.boards || []) {
        const b = newBoard(bo.name || 'キャンバス');
        b.panX = bo.panX || 0; b.panY = bo.panY || 0; b.zoom = bo.zoom || 1;
        for (const no of bo.notes || []) {
          const v = Dec.parse(no.v);
          if (!v) continue;
          b.notes.push({ id: no.id || st.nextId++, v, memo: no.memo || '', unit: no.u || '', x: no.x || 0, y: no.y || 0, color: no.c || 0, sel: !!no.sel, hidden: false });
        }
        st.boards.push(b);
      }
    } catch (e) {
      // 読めないときは、元のデータを別の名前で残しておく（上書きで消さない）
      try { localStorage.setItem('fusen.broken.' + Date.now(), raw); } catch (e2) {}
    }
  }
  if (!st.boards.length) st.boards.push(newBoard('キャンバス 1'));
  if (st.cur < 0 || st.cur >= st.boards.length) st.cur = 0;
}

function save() {
  const o = {};
  for (const k of ['cur', 'rateA', 'rateB', 'rateSel', 'round', 'vibrate', 'newColor', 'nextId', 'usdJpy', 'usdEur', 'rateTime', 'rateFetched']) o[k] = st[k];
  o.history = st.history;
  o.boards = st.boards.map(b => ({
    name: b.name, panX: b.panX, panY: b.panY, zoom: b.zoom,
    notes: b.notes.map(n => ({ id: n.id, v: Dec.plain(n.v), memo: n.memo, u: n.unit, x: n.x, y: n.y, c: n.color, sel: n.sel })),
  }));
  try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { toast('保存できませんでした（ブラウザの保存の場所がいっぱいかもしれません）'); }
}

// ================= 電卓（押した順に計算する） =================
const Calc = {
  acc: null, op: '', entry: null, lastOp: '', lastArg: null, error: false, line: '',
  MAX: 15,
  parse(s) { return Dec.parse(s) || Dec.ZERO; },
  value() {
    if (this.error) return Dec.ZERO;
    if (this.entry !== null) return this.parse(this.entry);
    return this.acc || Dec.ZERO;
  },
  text() {
    if (this.error) return 'エラー';
    if (this.entry !== null) return Fmt.group(this.entry === '' || this.entry === '-' ? '0' : this.entry);
    return Fmt.fmt(this.value());
  },
  pending() {
    if (this.error || !this.op || !this.acc) return '';
    return Fmt.fmt(this.acc) + ' ' + this.op;
  },
  digit(d) {
    if (this.error) this.clear();
    if (this.entry === null) this.entry = '';
    const n = (this.entry.match(/\d/g) || []).length;
    if (n + d.length > this.MAX) return;
    if (this.entry === '0') this.entry = '';
    if (this.entry === '-0') this.entry = '-';
    if (this.entry === '' && d === '00') { this.entry = '0'; return; }
    this.entry += d;
  },
  dot() {
    if (this.error) this.clear();
    if (this.entry === null || this.entry === '') this.entry = '0';
    if (this.entry === '-') this.entry = '-0';
    if (!this.entry.includes('.')) this.entry += '.';
  },
  back() {
    if (this.error) { this.clear(); return; }
    if (this.entry === null) return;
    this.entry = this.entry.slice(0, -1);
    if (this.entry === '-') this.entry = '';
  },
  clear() { this.acc = null; this.op = ''; this.entry = null; this.lastOp = ''; this.lastArg = null; this.error = false; this.line = ''; },
  negate() {
    if (this.error) return;
    if (this.entry !== null) this.entry = this.entry.startsWith('-') ? this.entry.slice(1) : '-' + this.entry;
    else if (this.acc) this.acc = Dec.neg(this.acc);
  },
  setOp(c) {
    if (this.error) return;
    if (this.entry !== null) {
      const v = this.parse(this.entry);
      this.line += Fmt.fmt(v);
      if (this.op && this.acc) { if (!this.apply(this.acc, this.op, v)) return; }
      else this.acc = v;
      this.entry = null;
      this.line += ' ' + c + ' ';
    } else {
      if (!this.acc) this.acc = Dec.ZERO;
      if (this.op && this.line.length >= 3) this.line = this.line.slice(0, -2) + c + ' ';
      else this.line = Fmt.fmt(this.acc) + ' ' + c + ' ';
    }
    this.op = c;
  },
  equals() {
    if (this.error) return;
    if (this.op) {
      const arg = this.entry !== null ? this.parse(this.entry) : this.acc;
      this.line += Fmt.fmt(arg);
      if (!this.apply(this.acc, this.op, arg)) return;
      this.record(this.line + ' = ' + Fmt.fmt(this.acc));
      this.lastOp = this.op; this.lastArg = arg;
      this.op = ''; this.entry = null; this.line = '';
    } else if (this.lastOp) {
      const base = this.entry !== null ? this.parse(this.entry) : this.value();
      const s = Fmt.fmt(base) + ' ' + this.lastOp + ' ' + Fmt.fmt(this.lastArg);
      if (!this.apply(base, this.lastOp, this.lastArg)) return;
      this.record(s + ' = ' + Fmt.fmt(this.acc));
      this.entry = null;
    } else if (this.entry !== null) {
      this.acc = this.parse(this.entry); this.entry = null;
    }
  },
  /** ％: 「a ＋ b ％」は a に a の b％ を足す、「a × b ％」は a の b％ */
  percent() {
    if (this.error) return;
    const v = this.entry !== null ? this.parse(this.entry) : this.value();
    const H = Dec.HUND;
    if (!this.op || !this.acc) {
      const r = Dec.div(v, H);
      this.record(Fmt.fmt(v) + '% = ' + Fmt.fmt(r));
      this.acc = r; this.entry = null; this.op = ''; this.line = '';
      return;
    }
    let r;
    switch (this.op) {
      case '+': r = Dec.add(this.acc, Dec.div(Dec.mul(this.acc, v), H)); break;
      case '-': r = Dec.sub(this.acc, Dec.div(Dec.mul(this.acc, v), H)); break;
      case '×': r = Dec.div(Dec.mul(this.acc, v), H); break;
      default:
        if (Dec.sign(v) === 0) { this.error = true; return; }
        r = Dec.mul(Dec.div(this.acc, v), H);
    }
    this.line += Fmt.fmt(v) + '%';
    this.record(this.line + ' = ' + Fmt.fmt(r));
    this.acc = r; this.op = ''; this.entry = null; this.line = '';
  },
  /** 消費税: include=true 税込に、false 税抜に。round: 0 切り捨て 1 四捨五入 2 切り上げ 3 そのまま */
  tax(rt, include, round) {
    if (this.error) return;
    const v = this.value();
    const k = Dec.add(Dec.ONE, Dec.div(Dec.fromNumber(rt), Dec.HUND));
    let r = include ? Dec.mul(v, k) : Dec.div(v, k);
    if (round === 0) r = Dec.setScale(r, 0, 'DOWN');
    else if (round === 1) r = Dec.setScale(r, 0, 'HALF_UP');
    else if (round === 2) r = Dec.setScale(r, 0, 'UP');
    else r = Dec.roundSig(r, 15);
    this.record(Fmt.fmt(v) + (include ? ' の税込（' : ' の税抜（') + Fmt.rate(rt) + '%） = ' + Fmt.fmt(r));
    this.setValue(r);
  },
  setValue(v) { if (this.error) this.clear(); this.entry = Fmt.plain(v); },
  apply(a, o, b) {
    try {
      switch (o) {
        case '+': this.acc = Dec.roundSig(Dec.add(a, b), 24); break;
        case '-': this.acc = Dec.roundSig(Dec.sub(a, b), 24); break;
        case '×': this.acc = Dec.roundSig(Dec.mul(a, b), 24); break;
        case '÷':
          if (Dec.sign(b) === 0) { this.error = true; this.line = ''; this.op = ''; this.entry = null; return false; }
          this.acc = Dec.div(a, b); break;
      }
      return true;
    } catch (e) { this.error = true; return false; }
  },
  record(s) { addHistory(s); save(); },
};

// ================= 付箋の大きさと描き方（単位は CSS の px） =================
const ND = {
  NUM: 24, MEMO: 12, PADX: 12, H: 44, H_MEMO: 62, MINW: 52,
  ctx: document.createElement('canvas').getContext('2d'),
  numFont: '500 24px ' + getComputedStyle(document.body).fontFamily,
  memoFont: '12px ' + getComputedStyle(document.body).fontFamily,
  unitFont: '15px ' + getComputedStyle(document.body).fontFamily,
  memoShown(m) { m = (m || '').replace(/\n/g, ' '); return [...m].length > 18 ? [...m].slice(0, 17).join('') + '…' : m; },
  numText(n) {
    if (n.unit === 'ドル' || n.unit === 'ユーロ') return Fmt.group(Dec.plain(Dec.setScale(n.v, 2)));
    return Fmt.fmt(n.v);
  },
  measure(font, t) { this.ctx.font = font; return this.ctx.measureText(t).width; },
  unitW(n) { return n.unit ? this.measure(this.unitFont, n.unit) + 4 : 0; },
  width(n) {
    let w = this.measure(this.numFont, this.numText(n)) + this.unitW(n);
    if (n.memo) w = Math.max(w, this.measure(this.memoFont, this.memoShown(n.memo)));
    return Math.max(this.MINW, w + this.PADX * 2);
  },
  height(n) { return n.memo ? this.H_MEMO : this.H; },
  rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); },
  draw(c, n, x, y, lifted) {
    const w = this.width(n), h = this.height(n);
    const col = COLORS[Math.max(0, Math.min(COLORS.length - 1, n.color))];
    // 影
    c.fillStyle = lifted ? 'rgba(0,0,0,.33)' : 'rgba(0,0,0,.19)';
    const o = lifted ? 4 : 1.6;
    this.rr(c, x + o * 0.6, y + o, w, h, 5); c.fill();
    // 本体
    c.fillStyle = col; this.rr(c, x, y, w, h, 5); c.fill();
    // 上の帯（のりの部分）
    c.fillStyle = darker(col);
    c.save(); this.rr(c, x, y, w, h, 5); c.clip(); c.fillRect(x, y, w, 5); c.restore();
    // 選んでいる印
    if (n.sel) {
      c.strokeStyle = CORAL; c.lineWidth = 3;
      this.rr(c, x + 1.5, y + 1.5, w - 3, h - 3, 5); c.stroke();
      c.fillStyle = CORAL; c.beginPath(); c.arc(x + 2, y + 2, 6.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath();
      c.moveTo(x - 1, y + 2); c.lineTo(x + 1.2, y + 4.3); c.lineTo(x + 5, y - 0.5); c.stroke();
    }
    // 文字
    c.textBaseline = 'alphabetic';
    if (n.memo) {
      c.font = this.memoFont; c.fillStyle = 'rgba(36,50,74,.8)'; c.textAlign = 'left';
      c.fillText(this.memoShown(n.memo), x + this.PADX - 2, y + 19);
    }
    const base = n.memo ? y + h - 10 : y + 32;
    const uw = this.unitW(n);
    c.fillStyle = INK; c.textAlign = 'right';
    if (uw > 0) { c.font = this.unitFont; c.fillText(n.unit, x + w - this.PADX, base); }
    c.font = this.numFont; c.fillText(this.numText(n), x + w - this.PADX - uw, base);
  },
};

function darker(hex) {
  const v = parseInt(hex.slice(1), 16);
  const r = Math.floor(((v >> 16) & 255) * 0.86), g = Math.floor(((v >> 8) & 255) * 0.86), b = Math.floor((v & 255) * 0.86);
  return `rgb(${r},${g},${b})`;
}

// ================= キャンバス =================
const cv = $('board'), gc = $('ghost');
let dpr = 1;
const B = {
  dropHere: false,
  bx(sx) { return sx / board().zoom + board().panX; },
  by(sy) { return sy / board().zoom + board().panY; },
  rect() { return cv.getBoundingClientRect(); },
  hit(sx, sy) {
    const x = this.bx(sx), y = this.by(sy), ns = board().notes;
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      if (x >= n.x && x <= n.x + ND.width(n) && y >= n.y && y <= n.y + ND.height(n)) return n;
    }
    return null;
  },
  contains(cx, cy) { const r = this.rect(); return cx >= r.left && cx < r.right && cy >= r.top && cy < r.bottom; },
  pointFromClient(cx, cy) { const r = this.rect(); return [this.bx(cx - r.left), this.by(cy - r.top)]; },
};

function resize() {
  dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  gc.width = Math.round(innerWidth * dpr); gc.height = Math.round(innerHeight * dpr);
  drawBoard(); drawGhost();
}

function drawBoard() {
  const c = cv.getContext('2d'), b = board();
  const W = cv.width / dpr, H = cv.height / dpr, z = b.zoom;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  // 方眼の点
  const step = 24, x0 = Math.floor(b.panX / step) * step, y0 = Math.floor(b.panY / step) * step;
  const rr = Math.max(0.8, 1.3 * Math.min(1, z));
  c.fillStyle = 'rgba(0,0,0,.13)';
  for (let y = y0; y < b.panY + H / z + step; y += step)
    for (let x = x0; x < b.panX + W / z + step; x += step) {
      c.beginPath(); c.arc((x - b.panX) * z, (y - b.panY) * z, rr, 0, Math.PI * 2); c.fill();
    }
  if (!b.notes.length) {
    c.fillStyle = 'rgba(36,50,74,.4)'; c.font = '15px ' + getComputedStyle(document.body).fontFamily; c.textAlign = 'center';
    c.fillText('計算した数字の欄を上に引っぱると、', W / 2, H / 2 - 12);
    c.fillText('ここに付箋になって貼られます', W / 2, H / 2 + 14);
  }
  c.save();
  c.scale(z, z); c.translate(-b.panX, -b.panY);
  for (const n of b.notes) if (!n.hidden) ND.draw(c, n, n.x, n.y, false);
  c.restore();
  if (B.dropHere) {
    c.fillStyle = 'rgba(232,106,74,.13)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(232,106,74,.67)'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, W - 3, H - 3);
  }
}

// ---- 引っぱっている付箋（画面全体の上に描く） ----
const G = { note: null, scale: 1, grabX: 0, grabY: 0, cx: 0, cy: 0, trash: null, overTrash: false };
function drawGhost() {
  const c = gc.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, innerWidth, innerHeight);
  if (!G.note) return;
  if (G.trash) {
    const t = G.trash;
    c.fillStyle = G.overTrash ? 'rgba(220,60,50,.8)' : 'rgba(220,60,50,.33)';
    ND.rr(c, t.left, t.top, t.width, t.height, 18); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = 'bold 20px ' + getComputedStyle(document.body).fontFamily;
    c.fillText('🗑 ' + (G.overTrash ? '離すと消します' : 'ここで離すと付箋を消します'), t.left + t.width / 2, t.top + t.height / 2 + 7);
  }
  c.save();
  c.translate(G.cx - G.grabX, G.cy - G.grabY);
  c.scale(G.scale, G.scale);
  ND.draw(c, G.note, 0, 0, true);
  c.restore();
}

function trashRect() {
  const k = $('keys').getBoundingClientRect();
  return { left: k.left + 10, top: k.top + 6, width: k.width - 20, height: k.height - 16 };
}
function inRect(r, x, y) { return x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height; }
function dispContains(x, y) { const r = $('disp').getBoundingClientRect(); return x >= r.left && x < r.right && y >= r.top && y < r.bottom; }
function setDispTarget(on) { $('disp').classList.toggle('target', on); $('dispSub').textContent = on ? 'ここで離すと、この数字を計算に使います' : sub(); }

// ---- キャンバスの指の動き ----
const SLOP = 8, LONG = 480;
// 長押しでメニューを開いたあと、指を離したときのクリックでメニューが閉じないように、次の 1 回のクリックは無視する
let eatClick = false;
document.addEventListener('click', e => { if (eatClick) { eatClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
document.addEventListener('pointerdown', () => { eatClick = false; }, true);
const T = { mode: 'none', pts: new Map(), hit: null, downX: 0, downY: 0, lastX: 0, lastY: 0, longTimer: 0, longFired: false,
  lastTapTime: 0, lastTapNote: null, lastTapEmpty: false, pinchDist: 1, pinchZoom: 1, pinchBX: 0, pinchBY: 0 };

function local(e) { const r = B.rect(); return [e.clientX - r.left, e.clientY - r.top]; }

cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch (x) {}
  const [x, y] = local(e);
  T.pts.set(e.pointerId, { x, y });
  if (T.pts.size === 1) {
    T.downX = T.lastX = x; T.downY = T.lastY = y;
    T.hit = B.hit(x, y);
    T.mode = 'pending'; T.longFired = false;
    clearTimeout(T.longTimer);
    T.longTimer = setTimeout(() => {
      if (T.mode !== 'pending') return;
      T.longFired = true; eatClick = true; buzz(30);
      if (T.hit) noteMenu(T.hit); else emptyMenu(B.bx(T.downX), B.by(T.downY));
      T.mode = 'ignore';
    }, LONG);
  } else if (T.pts.size === 2) {
    clearTimeout(T.longTimer);
    if (T.mode === 'drag') { T.hit.hidden = false; endGhost(); }
    startPinch();
  }
});

function startPinch() {
  const [a, b] = [...T.pts.values()];
  T.mode = 'pinch';
  T.pinchDist = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
  T.pinchZoom = board().zoom;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  T.pinchBX = B.bx(mx); T.pinchBY = B.by(my);
}

cv.addEventListener('pointermove', e => {
  if (!T.pts.has(e.pointerId)) return;
  const [x, y] = local(e);
  T.pts.set(e.pointerId, { x, y });
  const b = board();
  if (T.mode === 'pinch' && T.pts.size >= 2) {
    const [p, q] = [...T.pts.values()];
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const z = Math.max(0.35, Math.min(2.5, T.pinchZoom * Math.hypot(p.x - q.x, p.y - q.y) / T.pinchDist));
    b.zoom = z; b.panX = T.pinchBX - mx / z; b.panY = T.pinchBY - my / z;
    drawBoard();
    return;
  }
  if (T.pts.size !== 1) return;
  if (T.mode === 'pending' && Math.hypot(x - T.downX, y - T.downY) > SLOP) {
    clearTimeout(T.longTimer);
    if (T.hit) {
      T.mode = 'drag';
      T.hit.hidden = true;
      drawBoard();
      G.note = T.hit; G.scale = b.zoom;
      G.grabX = T.downX - (T.hit.x - b.panX) * b.zoom;
      G.grabY = T.downY - (T.hit.y - b.panY) * b.zoom;
      G.trash = trashRect(); G.overTrash = false;
    } else T.mode = 'pan';
  }
  if (T.mode === 'drag') {
    G.cx = e.clientX; G.cy = e.clientY;
    G.overTrash = inRect(G.trash, e.clientX, e.clientY);
    setDispTarget(dispContains(e.clientX, e.clientY));
    drawGhost();
  } else if (T.mode === 'pan') {
    b.panX -= (x - T.lastX) / b.zoom; b.panY -= (y - T.lastY) / b.zoom;
    drawBoard();
  }
  T.lastX = x; T.lastY = y;
});

function pointerEnd(e, cancel) {
  if (!T.pts.has(e.pointerId)) return;
  T.pts.delete(e.pointerId);
  if (T.pts.size > 0) { if (T.mode === 'pinch') T.mode = 'ignore'; return; }
  clearTimeout(T.longTimer);
  if (T.mode === 'drag') {
    T.hit.hidden = false;
    if (cancel) endGhost(); else noteDrop(T.hit, e.clientX, e.clientY);
  } else if (T.mode === 'pending' && !T.longFired && !cancel) {
    tap(T.hit);
  } else if (T.mode === 'pan' || T.mode === 'pinch' || T.mode === 'ignore') {
    save();
  }
  T.mode = 'none';
  drawBoard();
}
cv.addEventListener('pointerup', e => pointerEnd(e, false));
cv.addEventListener('pointercancel', e => pointerEnd(e, true));

function endGhost() { G.note = null; G.trash = null; drawGhost(); setDispTarget(false); }

function noteDrop(n, cx, cy) {
  const overTrash = G.overTrash;
  const grabX = G.grabX, grabY = G.grabY;
  endGhost();
  const b = board();
  if (dispContains(cx, cy)) {
    Calc.setValue(n.v); buzz(20);                          // 付箋はそのまま残す
  } else if (overTrash) {
    lastDeletedIndex = b.notes.indexOf(n);
    lastDeleted = n; lastDeletedMany = null;
    b.notes.splice(b.notes.indexOf(n), 1);
    toast('付箋を消しました（「付箋を消す」→「消した付箋を戻す」で戻せます）');
  } else if (B.contains(cx, cy)) {
    const [x, y] = B.pointFromClient(cx - grabX, cy - grabY);
    n.x = x; n.y = y;
    b.notes.splice(b.notes.indexOf(n), 1); b.notes.push(n);   // いちばん上に
  }
  save(); refresh();
}

function tap(n) {
  const now = Date.now();
  const dbl = now - T.lastTapTime < 320 && ((n && n === T.lastTapNote) || (!n && T.lastTapEmpty));
  T.lastTapTime = dbl ? 0 : now;
  T.lastTapNote = n; T.lastTapEmpty = !n;
  if (n) {
    n.sel = !n.sel;                    // 2 回タップでも、選んだのは元に戻る
    if (dbl) memoDialog(n);
    save(); refresh();
  } else if (dbl) fitAll();
}

function fitAll() {
  const b = board(), r = B.rect();
  if (!b.notes.length) { b.panX = 0; b.panY = 0; b.zoom = 1; }
  else {
    let l = Infinity, t = Infinity, rr = -Infinity, bb = -Infinity;
    for (const n of b.notes) { l = Math.min(l, n.x); t = Math.min(t, n.y); rr = Math.max(rr, n.x + ND.width(n)); bb = Math.max(bb, n.y + ND.height(n)); }
    const m = 14, w = rr - l + m * 2, h = bb - t + m * 2;
    const z = Math.max(0.35, Math.min(1.4, Math.min(r.width / w, r.height / h)));
    b.zoom = z; b.panX = (l + rr) / 2 - r.width / (2 * z); b.panY = (t + bb) / 2 - r.height / (2 * z);
  }
  save(); refresh();
}

function arrange() {
  const b = board(), r = B.rect();
  const maxW = r.width / Math.max(0.35, b.zoom);
  let x = b.panX + 8, y = b.panY + 8, rowH = 0;
  const left = x;
  for (const n of b.notes) {
    const w = ND.width(n), h = ND.height(n);
    if (x + w > left + maxW - 8 && x > left) { x = left; y += rowH + 8; rowH = 0; }
    n.x = x; n.y = y; x += w + 8; rowH = Math.max(rowH, h);
  }
  save(); refresh();
}

// ---- 数字の欄: 上に引っぱると付箋。長押しでメニュー ----
const D = { id: null, downX: 0, downY: 0, dragging: false, timer: 0, longFired: false, note: null };
const disp = $('disp');
disp.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (D.id !== null) return;
  try { disp.setPointerCapture(e.pointerId); } catch (x) {}
  D.id = e.pointerId; D.downX = e.clientX; D.downY = e.clientY; D.dragging = false; D.longFired = false;
  D.timer = setTimeout(() => { if (!D.dragging) { D.longFired = true; eatClick = true; buzz(30); displayMenu(); } }, LONG);
});
disp.addEventListener('pointermove', e => {
  if (e.pointerId !== D.id || D.longFired) return;
  if (!D.dragging && Math.hypot(e.clientX - D.downX, e.clientY - D.downY) > SLOP) {
    clearTimeout(D.timer);
    if (Calc.error) return;
    D.dragging = true;
    const n = newNote(Calc.value(), 0, 0); st.nextId--; n.id = 0;
    D.note = n;
    G.note = n; G.scale = board().zoom; G.trash = null;
    G.grabX = ND.width(n) * G.scale / 2; G.grabY = ND.height(n) * G.scale + 14;   // 指の少し上に出す
  }
  if (D.dragging) {
    G.cx = e.clientX; G.cy = e.clientY;
    const inB = B.contains(e.clientX, e.clientY - G.grabY / 2);
    if (inB !== B.dropHere) { B.dropHere = inB; drawBoard(); }
    drawGhost();
  }
});
function dispEnd(e, cancel) {
  if (e.pointerId !== D.id) return;
  D.id = null;
  clearTimeout(D.timer);
  if (!D.dragging) return;
  D.dragging = false;
  const n = D.note; D.note = null;
  const grabX = G.grabX, grabY = G.grabY;
  G.note = null; drawGhost();
  B.dropHere = false;
  if (!cancel && B.contains(e.clientX, e.clientY - grabY / 2)) {
    const [x, y] = B.pointFromClient(e.clientX - grabX, e.clientY - grabY);
    n.id = st.nextId++; n.x = x; n.y = y;
    board().notes.push(n);
    buzz(20); save();
  }
  refresh();
}
disp.addEventListener('pointerup', e => dispEnd(e, false));
disp.addEventListener('pointercancel', e => dispEnd(e, true));

// ================= 画面の表示 =================
function sub() { return '税率 ' + Fmt.rate(rate()) + '%　上に引っぱると付箋'; }

function commonUnit(ns) {
  let u = null;
  for (const n of ns) { if (u === null) u = n.unit; else if (u !== n.unit) return null; }
  return u === null ? '' : u;
}
function withUnit(v, u) {
  if (!u) return Fmt.fmt(v);
  if (u === 'ドル' || u === 'ユーロ') return Fmt.group(Dec.plain(Dec.setScale(v, 2))) + ' ' + u;
  return Fmt.fmt(v) + ' ' + u;
}

function refresh() {
  const b = board();
  $('rateChip').textContent = Fmt.rate(rate()) + '%';
  $('boardName').textContent = b.name + '（付箋 ' + b.notes.length + ' 枚）';
  const sl = b.notes.filter(n => n.sel);
  $('sumBtn').textContent = sl.length ? 'Σ\n選んだ' + sl.length + '枚' : 'Σ\n全部';
  if (sl.length) {
    let tot = Dec.ZERO; for (const n of sl) tot = Dec.add(tot, n.v);
    const u = commonUnit(sl);
    $('selText').innerHTML = '';
    $('selText').append('選んだ ' + sl.length + ' 枚の合計', document.createElement('br'),
      u === null ? Fmt.fmt(tot) + '（お金の種類が混ざっています）' : withUnit(tot, u));
    $('selBar').style.display = 'flex'; $('selHint').style.display = 'none';
  } else {
    $('selBar').style.display = 'none';
    $('selHint').style.display = b.notes.length >= 2 ? 'block' : 'none';
  }
  // 数字の欄
  $('dispPend').textContent = Calc.pending().replace(' -', ' −');
  if (!$('disp').classList.contains('target')) $('dispSub').textContent = sub();
  const num = $('dispNum');
  num.textContent = Calc.text();
  num.style.transform = '';
  const maxW = $('disp').clientWidth - 24, w = num.scrollWidth;
  if (w > maxW) num.style.transform = 'scale(' + (maxW / w) + ')';
  drawBoard();
}

// ================= キー =================
function buzz(ms) { if (st.vibrate && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }

function buildKeys() {
  const keys = [['7', '8', '9', '÷', '⌫'], ['4', '5', '6', '×', '±'], ['1', '2', '3', '-', '%'], ['0', '00', '.', '+', '=']];
  const box = $('keys');
  for (const row of keys) for (const s of row) {
    const b = document.createElement('button');
    b.className = 'key ' + (/^[0-9]+$|^\.$/.test(s) ? 'k-num' : s === '=' ? 'k-eq' : /[÷×+\-]/.test(s) ? 'k-op' : 'k-fn');
    b.textContent = s === '-' ? '−' : s;
    if (s === '00') b.style.fontSize = '24px';
    b.addEventListener('click', () => { press(s); buzz(8); });
    box.appendChild(b);
  }
}

function press(s) {
  switch (s) {
    case '⌫': Calc.back(); break;
    case '±': Calc.negate(); break;
    case '%': Calc.percent(); break;
    case '=': Calc.equals(); break;
    case '+': case '-': case '×': case '÷': Calc.setOp(s); break;
    case '.': Calc.dot(); break;
    default: Calc.digit(s);
  }
  refresh();
}

// パソコンのキーボードでも打てるように
document.addEventListener('keydown', e => {
  if ($('dlgBack').classList.contains('show') || e.ctrlKey || e.metaKey || e.altKey) return;
  const m = { '*': '×', '/': '÷', 'Enter': '=', 'Backspace': '⌫', '+': '+', '-': '-', '.': '.', '%': '%', '=': '=' };
  if (/^[0-9]$/.test(e.key)) press(e.key);
  else if (m[e.key]) press(m[e.key]);
  else if (e.key === 'Escape' || e.key === 'Delete') { Calc.clear(); refresh(); }
  else return;
  e.preventDefault();
});

// ================= 付箋の操作 =================
let lastDeleted = null, lastDeletedIndex = 0, lastDeletedMany = null;

function sumNotes() {
  const b = board();
  let use = b.notes.filter(n => n.sel);
  const all = !use.length;
  if (all) use = b.notes.slice();
  if (!use.length) { toast('付箋がありません。計算した数字の欄を上に引っぱると付箋ができます'); return; }
  let sum = Dec.ZERO, s = '';
  for (const n of use) {
    sum = Dec.add(sum, n.v);
    if (s) s += Dec.sign(n.v) < 0 ? ' ' : ' + ';
    s += Fmt.fmt(n.v);
  }
  Calc.setValue(sum);
  const u = commonUnit(use);
  const total = u === null ? Fmt.fmt(sum) : withUnit(sum, u);
  addHistory((all ? '付箋の合計（全部 ' : '付箋の合計（選んだ ') + use.length + ' 枚）: ' + s + ' = ' + total);
  save();
  toast((all ? '付箋 全部 ' : '選んだ付箋 ') + use.length + ' 枚の合計: ' + total + (u === null ? '\n（円・ドル・ユーロが混ざっています）' : ''));
  refresh();
}

function clearSelection() { for (const n of board().notes) n.sel = false; save(); refresh(); }

function addNoteAuto(v, memo = '', unit = '') {
  const b = board(), r = B.rect();
  const n = newNote(v, 0, 0); n.memo = memo; n.unit = unit;
  const w = ND.width(n), h = ND.height(n);
  const vw = r.width / b.zoom, vh = r.height / b.zoom;
  const px = b.panX + 8, py = b.panY + 8;
  let found = false;
  for (let y = py; y + h < b.panY + vh && !found; y += 12)
    for (let x = px; x + w < b.panX + vw; x += 12)
      if (free(x, y, w, h)) { n.x = x; n.y = y; found = true; break; }
  if (!found) { n.x = px; n.y = py; }
  b.notes.push(n);
  save(); refresh();
}
function free(x, y, w, h) {
  for (const o of board().notes) {
    const ow = ND.width(o), oh = ND.height(o);
    if (x < o.x + ow + 6 && x + w + 6 > o.x && y < o.y + oh + 6 && y + h + 6 > o.y) return false;
  }
  return true;
}

function deleteMany(ns) {
  const b = board();
  b.notes = b.notes.filter(n => !ns.includes(n));
  for (const n of ns) n.sel = false;
  lastDeletedMany = ns; lastDeleted = null;
  save(); refresh();
  toast(ns.length + ' 枚の付箋を消しました');
}

function restoreItems(items) {
  const b = board();
  if (lastDeletedMany && lastDeletedMany.length) {
    items.push(['消した付箋を戻す（' + lastDeletedMany.length + ' 枚）', () => {
      for (const n of lastDeletedMany) { n.hidden = false; b.notes.push(n); }
      lastDeletedMany = null; save(); refresh();
    }]);
  } else if (lastDeleted) {
    items.push(['消した付箋を戻す（' + withUnit(lastDeleted.v, lastDeleted.unit) + '）', () => {
      b.notes.splice(Math.max(0, Math.min(b.notes.length, lastDeletedIndex)), 0, lastDeleted);
      lastDeleted = null; save(); refresh();
    }]);
  }
}

function deleteDialog() {
  const b = board();
  const sl = b.notes.filter(n => n.sel);
  const items = [];
  if (b.notes.length) items.push(['付箋を全部消す（' + b.notes.length + ' 枚）', () => confirmDlg(
    'このキャンバスの付箋 ' + b.notes.length + ' 枚を全部消しますか？\n（すぐなら「付箋を消す」→「消した付箋を戻す」で戻せます）', '全部消す', () => deleteMany(b.notes.slice()))]);
  if (sl.length) items.push(['選んだ付箋だけ消す（' + sl.length + ' 枚）', () => deleteMany(sl)]);
  restoreItems(items);
  if (!items.length) { toast('付箋はありません'); return; }
  menu('付箋を消す', items, true);
}

function noteMenu(n) {
  menu(withUnit(n.v, n.unit) + (n.memo ? '　' + n.memo : ''), [
    ['電卓に入れる', () => { Calc.setValue(n.v); refresh(); }],
    ['メモを書く', () => memoDialog(n)],
    ['色を変える', () => menu('付箋の色', COLOR_NAMES.map((c, i) => [c, () => { n.color = i; save(); refresh(); }]))],
    ['数字をコピー', () => copy(Fmt.plain(n.v))],
    ['同じ付箋をもう 1 枚', () => {
      const c = newNote(n.v, n.x + 10, n.y + 10);
      c.memo = n.memo; c.unit = n.unit; c.color = n.color;
      board().notes.push(c); save(); refresh();
    }],
    ['消す', () => {
      const b = board();
      lastDeletedIndex = b.notes.indexOf(n); lastDeleted = n; lastDeletedMany = null;
      b.notes.splice(lastDeletedIndex, 1); save(); refresh();
    }],
  ]);
}

function emptyMenu(bx, by) {
  const items = [
    ['コピーした数字を付箋にする', async () => { const v = await pasteNumber(); if (v) { const n = newNote(v, bx, by); board().notes.push(n); save(); refresh(); } }],
    ['付箋が全部見えるようにする', fitAll],
    ['付箋をきれいに並べる', arrange],
    ['選んだ印を全部はずす', clearSelection],
  ];
  restoreItems(items);
  items.push(['このキャンバスの付箋を全部消す', () => confirmDlg('このキャンバスの付箋 ' + board().notes.length + ' 枚を全部消しますか？', '消す', () => deleteMany(board().notes.slice()))]);
  menu(null, items);
}

function displayMenu() {
  menu(Calc.text(), [
    ['付箋にする（空いている所に貼る）', () => addNoteAuto(Calc.value())],
    ['数字をコピー', () => copy(Fmt.plain(Calc.value()))],
    ['コピーした数字を貼り付け', async () => { const v = await pasteNumber(); if (v) { Calc.setValue(v); refresh(); } }],
    ['履歴を見る', historyDialog],
  ]);
}

async function copy(s) {
  try { await navigator.clipboard.writeText(s); toast('コピーしました: ' + s); }
  catch (e) { toast('コピーできませんでした'); }
}

async function pasteNumber() {
  let s = '';
  try { s = await navigator.clipboard.readText(); } catch (e) {
    s = await new Promise(res => promptDlg('数字を貼り付け', '', 'ここを長押しして「ペースト」', '入れる', res));
    if (s === null) return null;
  }
  s = (s || '').normalize('NFKC').replace(/[,，¥￥$€円\s]/g, '').replace(/－/g, '-');
  const v = Dec.parse(s);
  if (!v || s === '') { toast('コピーした中に数字がありません'); return null; }
  return v;
}

// ================= ダイアログ =================
const back = $('dlgBack');
let dlgStack = [];

/** opts: { title, body: Element|string, items: [[label, fn]], buttons: [[label, fn, cls]], cancel } */
function dialog(opts) {
  back.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'dlg';
  if (opts.title) { const h = document.createElement('h3'); h.textContent = opts.title; d.appendChild(h); }
  if (opts.body) {
    const bd = document.createElement('div'); bd.className = 'body';
    if (typeof opts.body === 'string') { bd.style.whiteSpace = 'pre-line'; bd.textContent = opts.body; } else bd.appendChild(opts.body);
    d.appendChild(bd);
  }
  if (opts.items) {
    const it = document.createElement('div'); it.className = 'items';
    for (const [label, fn] of opts.items) {
      const b = document.createElement('button'); b.className = 'item'; b.textContent = label;
      b.addEventListener('click', () => { close(); fn(); });
      it.appendChild(b);
    }
    d.appendChild(it);
  }
  if (opts.buttons && opts.buttons.length) {
    const bs = document.createElement('div'); bs.className = 'btns';
    for (const [label, fn, cls] of opts.buttons) {
      const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls;
      b.addEventListener('click', () => { if (fn && fn() === false) return; close(); });
      bs.appendChild(b);
    }
    d.appendChild(bs);
  }
  back.appendChild(d);
  back.classList.add('show');
  back.onclick = e => { if (e.target === back) close(); };
  function close() { if (back.firstChild === d) { back.classList.remove('show'); back.innerHTML = ''; } }
  return { close, el: d };
}

function menu(title, items, withCancel) {
  return dialog({ title, items, buttons: withCancel ? [['やめる']] : [] });
}
function confirmDlg(msg, ok, fn) {
  dialog({ body: msg, buttons: [['やめる'], [ok, fn]] });
}
function promptDlg(title, value, placeholder, ok, fn, extra) {
  const inp = document.createElement('input');
  inp.value = value || ''; inp.placeholder = placeholder || '';
  const btns = [];
  if (extra) btns.push([extra[0], () => fn(extra[1]), 'left']);
  btns.push(['やめる', () => fn(null)], [ok, () => fn(inp.value.trim())]);
  dialog({ title, body: inp, buttons: btns });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { back.classList.remove('show'); back.innerHTML = ''; fn(inp.value.trim()); } });
  setTimeout(() => { inp.focus(); inp.select(); }, 50);
}

function memoDialog(n) {
  promptDlg('メモ（' + Fmt.fmt(n.v) + '）', n.memo, '例: 電気代、A 社、ランチ', '決定', s => {
    if (s === null) return;
    n.memo = s; save(); refresh();
  }, ['メモを消す', '']);
}

function toast(s) {
  const t = $('toast');
  t.textContent = s; t.classList.add('show');
  clearTimeout(toast.tm);
  toast.tm = setTimeout(() => t.classList.remove('show'), s.length > 30 ? 3500 : 2000);
}

// ================= メニュー・キャンバス =================
function mainMenu() {
  menu(null, [
    ['履歴', historyDialog],
    ['通貨（円・ドル・ユーロ）', currencyDialog],
    ['消費税の設定', taxDialog],
    ['新しい付箋の色（今: ' + COLOR_NAMES[st.newColor] + '）', () => menu('新しい付箋の色', COLOR_NAMES.map((c, i) => [(i === st.newColor ? '● ' : '　') + c, () => { st.newColor = i; save(); }]))],
    ['付箋をきれいに並べる', arrange],
    ['付箋が全部見えるようにする', fitAll],
    ['キーを押したとき振動する: ' + (st.vibrate ? 'する' : 'しない'), () => { st.vibrate = !st.vibrate; save(); toast(st.vibrate ? '振動します（iPhone では振動しません）' : '振動しません'); }],
    ['使い方', helpDialog],
    ['このアプリについて', aboutDialog],
  ]);
}

function forgetDeleted() { lastDeleted = null; lastDeletedMany = null; }

function boardsDialog() {
  const items = st.boards.map((b, i) => [(i === st.cur ? '● ' : '　') + b.name + '（' + b.notes.length + ' 枚）', () => {
    if (st.cur !== i) forgetDeleted();
    st.cur = i; save(); refresh();
  }]);
  dialog({ title: 'キャンバス（付箋を貼る画面）', items, buttons: [['名前を変える・消す', boardEditDialog, 'left'], ['＋ 新しいキャンバス', () => nameDialog(null)]] });
}

function boardEditDialog() {
  const b = board();
  const items = [['名前を変える', () => nameDialog(b)]];
  if (st.boards.length > 1) items.push(['このキャンバスを消す', () => confirmDlg('「' + b.name + '」（付箋 ' + b.notes.length + ' 枚）を消しますか？', '消す', () => {
    st.boards.splice(st.cur, 1); st.cur = Math.max(0, st.cur - 1); forgetDeleted(); save(); refresh();
  })]);
  menu(b.name, items);
}

function nameDialog(edit) {
  promptDlg(edit ? '名前を変える' : '新しいキャンバスの名前', edit ? edit.name : 'キャンバス ' + (st.boards.length + 1), '', '決定', s => {
    if (s === null) return;
    if (!s) s = 'キャンバス ' + (st.boards.length + 1);
    if (edit) edit.name = s;
    else { st.boards.push(newBoard(s)); st.cur = st.boards.length - 1; forgetDeleted(); }
    save(); refresh();
  });
}

function historyDialog() {
  if (!st.history.length) { dialog({ title: '履歴', body: 'まだ計算の記録がありません。', buttons: [['閉じる']] }); return; }
  const box = document.createElement('div');
  box.style.margin = '0 -20px';
  const dd = dialog({ title: '履歴（タップで使う）', body: box, buttons: [['全部消す', () => { confirmDlg('履歴を全部消しますか？', '消す', () => { st.history = []; save(); }); return false; }, 'left'], ['閉じる']] });
  for (const line of st.history) {
    const r = document.createElement('div'); r.className = 'hist'; r.textContent = line;
    r.addEventListener('click', () => {
      const eq = line.lastIndexOf('=');
      const ans = line.slice(eq + 1).trim().replace(/\s*(円|ドル|ユーロ)$/, '');
      const val = Dec.parse(ans.replace(/,/g, ''));
      dd.close();
      if (!val) return;
      menu(line, [
        ['答え ' + Fmt.fmt(val) + ' を電卓に入れる', () => { Calc.setValue(val); refresh(); }],
        ['答えを付箋にする（メモに式）', () => addNoteAuto(val, line.slice(0, Math.max(0, eq)).trim())],
      ]);
    });
    box.appendChild(r);
  }
}

function taxDialog() {
  const box = document.createElement('div');
  const t0 = document.createElement('div'); t0.className = 'small'; t0.textContent = '今使う税率（押すとすぐ切り替わります）';
  box.appendChild(t0);
  const seg = document.createElement('div'); seg.className = 'seg'; seg.style.margin = '6px 0 14px';
  let dd;
  [0, 1].forEach(i => {
    const b = document.createElement('button');
    b.textContent = Fmt.rate(i === 0 ? st.rateA : st.rateB) + '%' + (i === 0 ? '（ふつう）' : '（軽減）');
    if (st.rateSel === i) b.className = 'on';
    b.style.height = '48px'; b.style.borderRadius = '24px'; b.style.fontSize = '16px';
    b.addEventListener('click', () => { st.rateSel = i; save(); refresh(); buzz(8); dd.close(); });
    seg.appendChild(b);
  });
  box.appendChild(seg);
  const mk = (label, val) => {
    const l = document.createElement('div'); l.className = 'small'; l.textContent = label; box.appendChild(l);
    const inp = document.createElement('input'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.value = Fmt.rate(val);
    inp.style.marginBottom = '12px'; box.appendChild(inp); return inp;
  };
  const a = mk('ふつうの税率 ％', st.rateA), bb = mk('軽減税率 ％', st.rateB);
  const l3 = document.createElement('div'); l3.className = 'small'; l3.textContent = '1 円より下の端数'; box.appendChild(l3);
  const rn = ['切り捨て', '四捨五入', '切り上げ', 'そのまま（小数も出す）'];
  let sel = st.round;
  rn.forEach((s, i) => {
    const lb = document.createElement('label'); lb.className = 'radio';
    const r = document.createElement('input'); r.type = 'radio'; r.name = 'round'; r.checked = i === st.round;
    r.addEventListener('change', () => { sel = i; });
    lb.append(r, s); box.appendChild(lb);
  });
  dd = dialog({ title: '消費税', body: box, buttons: [['やめる'], ['決定', () => {
    const pa = parseFloat(a.value.normalize('NFKC')), pb = parseFloat(bb.value.normalize('NFKC'));
    if (!isNaN(pa)) st.rateA = Math.max(0, Math.min(100, pa));
    if (!isNaN(pb)) st.rateB = Math.max(0, Math.min(100, pb));
    st.round = sel; save(); refresh();
  }]] });
}

// ================= 通貨 =================
async function fetchRates() {
  const r = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j.result !== 'success' || !j.rates || !j.rates.JPY || !j.rates.EUR) throw new Error('データの形がちがいます');
  st.usdJpy = j.rates.JPY; st.usdEur = j.rates.EUR;
  st.rateTime = (j.time_last_update_unix || 0) * 1000;
  st.rateFetched = Date.now();
  save();
}

function fmtTime(ms) {
  const d = new Date(ms), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function currencyDialog() {
  const amount = Calc.value();
  const names = ['円', 'ドル', 'ユーロ'], syms = ['¥', '$', '€'];
  let from = 0;
  const box = document.createElement('div');
  const info = document.createElement('div'); info.className = 'small'; box.appendChild(info);
  const q = document.createElement('div'); q.style.margin = '10px 0 4px'; q.textContent = '今の数字 ' + Fmt.fmt(amount) + ' は、どのお金ですか？'; box.appendChild(q);
  const seg = document.createElement('div'); seg.className = 'seg'; box.appendChild(seg);
  const segs = names.map((nm, i) => {
    const b = document.createElement('button'); b.textContent = nm + '（' + syms[i] + '）';
    b.addEventListener('click', () => { from = i; draw(); }); seg.appendChild(b); return b;
  });
  const rows = document.createElement('div'); rows.style.paddingTop = '8px'; box.appendChild(rows);
  const reload = document.createElement('button'); reload.className = 'wide'; reload.textContent = 'レートを読み直す'; box.appendChild(reload);
  const dd = dialog({ title: '通貨（円・ドル・ユーロ）', body: box, buttons: [['閉じる']] });

  function draw() {
    segs.forEach((b, i) => b.className = i === from ? 'on' : '');
    if (st.usdJpy <= 0) info.textContent = 'レートをまだ読んでいません。インターネットにつないで「レートを読み直す」を押してください。';
    else info.textContent = '1 ドル ＝ ' + st.usdJpy.toFixed(2) + ' 円　　1 ユーロ ＝ ' + (st.usdJpy / st.usdEur).toFixed(2) + ' 円\n'
      + (st.rateTime ? fmtTime(st.rateTime) : '?') + ' のレート（毎日 朝 9 時ごろ新しくなります）';
    info.style.whiteSpace = 'pre-line';
    rows.innerHTML = '';
    if (st.usdJpy <= 0) return;
    const perUsd = [st.usdJpy, 1, st.usdEur];
    const usd = Dec.div(amount, Dec.fromNumber(perUsd[from]));
    for (let i = 0; i < 3; i++) {
      const fv = Dec.setScale(Dec.mul(usd, Dec.fromNumber(perUsd[i])), i === 0 ? 0 : 2);
      const r = document.createElement('div'); r.className = 'curRow';
      const t = document.createElement('div'); t.className = 'v' + (i === from ? ' src' : '');
      t.append(syms[i] + ' ' + Fmt.group(Dec.plain(fv)), document.createElement('br'), names[i]);
      r.appendChild(t);
      if (i !== from) {
        const memo = syms[from] + Fmt.fmt(amount) + ' から';
        const c = document.createElement('button'); c.className = 'toCalc'; c.innerHTML = '電卓と<br>付箋へ';
        c.addEventListener('click', () => { Calc.setValue(fv); addNoteAuto(fv, memo, names[i]); refresh(); dd.close(); });
        const n = document.createElement('button'); n.className = 'toNote'; n.innerHTML = '付箋<br>だけ';
        n.addEventListener('click', () => { addNoteAuto(fv, memo, names[i]); dd.close(); });
        r.append(c, n);
      }
      rows.appendChild(r);
    }
  }
  async function load() {
    reload.textContent = 'レートを読んでいます…';
    try { await fetchRates(); }
    catch (e) { toast('レートを読めませんでした（' + e.message + '）。前に読んだレートを使います'); }
    reload.textContent = 'レートを読み直す';
    if (dd.el.isConnected) draw();
  }
  reload.addEventListener('click', load);
  draw();
  if (st.usdJpy <= 0 || Date.now() - st.rateFetched > 60 * 60 * 1000) load();
}

// ================= 説明 =================
const HELP = [
  ['付箋を作る', '計算した数字の欄（白い欄）を、指で上に引っぱって離すと、その数字が付箋になって貼られます。電卓の数字は消えずに残ります。\n長押し →「付箋にする」でも作れます。'],
  ['付箋を使う', '・付箋を数字の欄まで引っぱって離す: その数字を計算に使う（付箋は残る）\n・タップ: 選ぶ（赤い枠）。もう一度タップでやめる\n・2 回タップ: メモを書く\n・長押し: メニュー（色・コピー・もう 1 枚・消す など）\n・引っぱって下のキーの所（赤いゴミ箱）で離す: 消す'],
  ['選んだ付箋だけ足す', '足したい付箋を 1 枚ずつタップすると、赤い枠が付いて選んだ状態になります（もう一度タップでやめる）。キャンバスの下の赤い帯に「選んだ ◯ 枚の合計」がいつも出ます。「合計を電卓へ」でその合計が数字の欄に入り、「はずす」で選んだ印を全部はずします。'],
  ['付箋を消す', '「付箋を消す」ボタン: 付箋を全部消す・選んだ付箋だけ消す。消したすぐあとなら「消した付箋を戻す」で戻せます。'],
  ['合計', '右の「Σ」ボタン: 選んだ付箋があればその合計、なければ全部の合計を、数字の欄に出します。'],
  ['キャンバスを動かす', '2 本の指で動かす・広げる・縮める。何もない所を 1 本指で引っぱっても動かせます。\n何もない所を 2 回タップすると、付箋が全部見えるように戻ります。何もない所を長押しするとメニュー（きれいに並べる など）。'],
  ['消費税', '左の「10%」が今使う税率です。押すと消費税の画面が開き、10% と 8% を切り替えたり、税率の数字と端数（切り捨てなど）を変えたりできます。「税込に」「税抜に」で計算します。'],
  ['通貨', '「¥ $ €」: 今の数字を、円・ドル・ユーロに直します。「電卓と付箋へ」で、直した数字が数字の欄に入り、同じ数字の付箋（「ドル」「ユーロ」「円」の文字つき）も貼られます。レートはインターネットから読みます（毎日 朝 9 時ごろ新しくなります）。'],
  ['キャンバス', '左上の ☰: 付箋を貼る画面を何枚も作って、切り替えられます（仕事用・家計用 など）。'],
  ['データ', '付箋や履歴は、このブラウザの中に保存されます。ほかのブラウザやほかの機械とは共有されません。iPhone・iPad では、Safari の共有ボタン →「ホーム画面に追加」で、アプリのように使えます。'],
];
function helpDialog() {
  const box = document.createElement('div'); box.className = 'help';
  for (const [h, p] of HELP) {
    const a = document.createElement('h4'); a.textContent = '【' + h + '】';
    const b = document.createElement('p'); b.style.whiteSpace = 'pre-line'; b.textContent = p;
    box.append(a, b);
  }
  dialog({ title: '使い方', body: box, buttons: [['閉じる']] });
}
function aboutDialog() {
  dialog({ title: '超！付箋電卓', body: 'Web 版 v2（Android 版 v3 と同じ動き）\n\n計算した数字を付箋にして貼っておき、あとで足したり使ったりできる電卓です。広告はありません。\n\n通貨のレート: open.er-api.com（ExchangeRate-API）\n\npowered by CHOCORIN', buttons: [['閉じる']] });
}

// ================= はじめ =================
load();
buildKeys();
$('boardsBtn').addEventListener('click', boardsDialog);
$('boardName').addEventListener('click', boardsDialog);
$('menuBtn').addEventListener('click', mainMenu);
$('rateChip').addEventListener('click', () => { buzz(8); taxDialog(); });
$('taxIn').addEventListener('click', () => { Calc.tax(rate(), true, st.round); buzz(8); refresh(); });
$('taxEx').addEventListener('click', () => { Calc.tax(rate(), false, st.round); buzz(8); refresh(); });
$('curBtn').addEventListener('click', () => { buzz(8); currencyDialog(); });
$('delBtn').addEventListener('click', () => { buzz(8); deleteDialog(); });
$('clearBtn').addEventListener('click', () => { Calc.clear(); buzz(8); refresh(); });
$('sumBtn').addEventListener('click', () => { buzz(8); sumNotes(); });
$('selGo').addEventListener('click', () => { buzz(8); sumNotes(); });
$('selOff').addEventListener('click', () => { buzz(8); clearSelection(); });
// iPhone で、2 本指で画面全体が拡大されないように
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe($('boardBox'));
resize();
refresh();
