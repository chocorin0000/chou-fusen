// 誤差のない 10 進数（Android 版の BigDecimal の代わり）。値は m / 10^s（m は BigInt、s は 0 以上）
'use strict';

const Dec = (() => {
  const P = n => 10n ** BigInt(n);
  const abs = x => (x < 0n ? -x : x);
  const digits = x => (x === 0n ? 1 : abs(x).toString().length);

  function make(m, s) {
    if (s < 0) { m = m * P(-s); s = 0; }
    return { m, s };
  }

  /** 文字の数字を読む（"1,234.5" "-0.25" "1.2E15" も読める）。読めなければ null */
  function parse(str) {
    if (str == null) return null;
    let t = String(str).trim().replace(/,/g, '');
    if (t === '' || t === '-' || t === '.' || t === '-.') return make(0n, 0);
    const mt = t.match(/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
    if (!mt || (mt[2] === '' && (mt[3] || '') === '')) return null;
    const ip = mt[2] || '0', fp = mt[3] || '';
    let m = BigInt(ip + fp), s = fp.length;
    if (mt[1] === '-') m = -m;
    if (mt[4]) s -= parseInt(mt[4], 10);
    return make(m, s);
  }

  /** a ÷ p を、mode（'HALF_UP' 四捨五入 / 'DOWN' 切り捨て / 'UP' 切り上げ、どれも 0 から見て）で整数に */
  function roundDiv(m, p, mode) {
    const neg = m < 0n;
    const a = abs(m);
    let q = a / p;
    const r = a % p;
    if (r !== 0n) {
      if (mode === 'UP') q += 1n;
      else if (mode === 'HALF_UP' && r * 2n >= p) q += 1n;
    }
    return neg ? -q : q;
  }

  /** 小数 n けたに丸める */
  function setScale(a, n, mode = 'HALF_UP') {
    if (a.s <= n) return make(a.m * P(n - a.s), n);
    return make(roundDiv(a.m, P(a.s - n), mode), n);
  }

  /** 上から n けた（有効数字）に丸める */
  function roundSig(a, n, mode = 'HALF_UP') {
    const d = digits(a.m);
    if (d <= n) return a;
    const drop = d - n;
    const q = roundDiv(a.m, P(drop), mode);
    return make(q, a.s - drop);   // s が負になれば make が 0 を足す
  }

  /** 余分な 0 を消す */
  function strip(a) {
    let { m, s } = a;
    if (m === 0n) return make(0n, 0);
    while (s > 0 && m % 10n === 0n) { m /= 10n; s--; }
    return make(m, s);
  }

  function align(a, b) {
    const s = Math.max(a.s, b.s);
    return [a.m * P(s - a.s), b.m * P(s - b.s), s];
  }
  const add = (a, b) => { const [x, y, s] = align(a, b); return make(x + y, s); };
  const sub = (a, b) => { const [x, y, s] = align(a, b); return make(x - y, s); };
  const mul = (a, b) => make(a.m * b.m, a.s + b.s);
  const neg = a => make(-a.m, a.s);
  const sign = a => (a.m > 0n ? 1 : a.m < 0n ? -1 : 0);
  const cmp = (a, b) => { const [x, y] = align(a, b); return x > y ? 1 : x < y ? -1 : 0; };
  const absD = a => make(abs(a.m), a.s);

  /** 割り算（有効数字 sig けた、四捨五入） */
  function div(a, b, sig = 24) {
    if (b.m === 0n) throw new Error('÷0');
    if (a.m === 0n) return make(0n, 0);
    const k = Math.max(0, sig + 2 - (digits(a.m) - digits(b.m)));
    const q = (a.m * P(k)) / b.m;          // 切り捨て（あとで丸める。けたは sig+1 以上ある）
    return roundSig(make(q, a.s + k - b.s), sig);
  }

  /** カンマなしの数字（"-1234.5"） */
  function plain(a) {
    const neg = a.m < 0n;
    let t = abs(a.m).toString();
    if (a.s > 0) {
      t = t.padStart(a.s + 1, '0');
      t = t.slice(0, t.length - a.s) + '.' + t.slice(t.length - a.s);
    }
    if (neg && a.m !== 0n) t = '-' + t;
    return t;
  }

  const fromNumber = x => parse(String(x));
  const toNumber = a => Number(plain(a));
  const ZERO = make(0n, 0), ONE = make(1n, 0), HUND = make(100n, 0);

  return { parse, make, setScale, roundSig, strip, add, sub, mul, div, neg, sign, cmp, abs: absD, plain, fromNumber, toNumber, ZERO, ONE, HUND };
})();

/** 数字の見せ方（3 けたごとのカンマ）。Android 版の Fmt と同じ */
const Fmt = (() => {
  const BIG = Dec.parse('1E15');

  function group(p) {
    let neg = p.startsWith('-');
    if (neg) p = p.slice(1);
    const dot = p.indexOf('.');
    const ip = dot < 0 ? p : p.slice(0, dot);
    const fp = dot < 0 ? '' : p.slice(dot);
    let b = '';
    for (let i = 0; i < ip.length; i++) {
      if (i > 0 && (ip.length - i) % 3 === 0) b += ',';
      b += ip[i];
    }
    return (neg ? '-' : '') + b + fp;
  }

  /** 計算の結果を見せる形に（15 けたまで、余分な 0 は消す） */
  function fmt(v) {
    if (!v) return '0';
    const s = Dec.strip(Dec.roundSig(v, 15));
    if (Dec.cmp(Dec.abs(s), BIG) >= 0) {
      // 大きい数は 1.23E15 のように
      const neg = s.m < 0n;
      const ds = (s.m < 0n ? -s.m : s.m).toString().replace(/0+$/, '') || '0';
      const exp = (s.m < 0n ? -s.m : s.m).toString().length - 1 - s.s;
      return (neg ? '-' : '') + ds[0] + (ds.length > 1 ? '.' + ds.slice(1) : '') + 'E' + exp;
    }
    let p = Dec.plain(s);
    if (p === '-0') p = '0';
    return group(p);
  }

  /** 計算に使う形（カンマなし） */
  function plain(v) {
    const p = Dec.plain(Dec.strip(Dec.roundSig(v, 15)));
    return p === '-0' ? '0' : p;
  }

  /** 税率 10 → "10"、8.5 → "8.5" */
  function rate(r) {
    return Dec.plain(Dec.strip(Dec.fromNumber(r)));
  }

  return { fmt, plain, group, rate };
})();
