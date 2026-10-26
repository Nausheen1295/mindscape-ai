/* ==========================================================================
   MindScape — text & similarity helpers. Pure functions, no DOM (tested).
   ========================================================================== */

/** [[Wiki links]] in a note body, as lower-cased titles. */
export function parseLinks(body) {
  return [...new Set([...String(body).matchAll(/\[\[([^\]\n]{1,120})\]\]/g)].map((m) => m[1].trim().toLowerCase()))];
}

/** #tags in a note body (letters, digits, - and _; not inside words or headings). */
export function parseTags(body) {
  return [...new Set([...String(body).matchAll(/(?:^|[\s(])#([\p{L}\d][\p{L}\d_-]{0,40})/gu)].map((m) => m[1].toLowerCase()))];
}

/** Plain text for search and embeddings: strips markdown syntax. */
export function plainText(s) {
  return String(s)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#*_>`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(("a an and are as at be but by for from has have in into is it its of on or that the this to was were will with " +
  "you your i we they he she them our not no can do does so if than then there these those what when which who why how all any " +
  "more most some such only own same very just also about over after before because been being both each few other").split(" "));

export function tokenize(text) {
  return plainText(text).toLowerCase().split(/[^\p{L}\d]+/u).filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/, (m) => (w.length - m.length >= 4 ? "" : m)));
}

/**
 * TF-IDF vectors for a set of documents — the keyword fallback used until the
 * embedding model is ready (or if it can't load). Returns sparse Maps, L2-normalised.
 */
export function tfidf(docs) {
  const tokens = docs.map(tokenize);
  const df = new Map();
  tokens.forEach((t) => new Set(t).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
  const N = docs.length;
  const vecs = tokens.map((t) => {
    const tf = new Map();
    t.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
    const v = new Map();
    let norm = 0;
    tf.forEach((n, w) => { const x = (1 + Math.log(n)) * Math.log(1 + N / df.get(w)); v.set(w, x); norm += x * x; });
    norm = Math.sqrt(norm) || 1;
    v.forEach((x, w) => v.set(w, x / norm));
    return v;
  });
  return { vecs, vectorize: (text) => {
    const t = tokenize(text);
    const tf = new Map();
    t.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
    const v = new Map();
    let norm = 0;
    tf.forEach((n, w) => { if (!df.has(w)) return; const x = (1 + Math.log(n)) * Math.log(1 + N / df.get(w)); v.set(w, x); norm += x * x; });
    norm = Math.sqrt(norm) || 1;
    v.forEach((x, w) => v.set(w, x / norm));
    return v;
  } };
}

/** Cosine similarity for dense (Float32Array/array) or sparse (Map) unit vectors. */
export function cosine(a, b) {
  if (!a || !b) return 0;
  if (a instanceof Map) {
    let s = 0;
    const [small, big] = a.size < b.size ? [a, b] : [b, a];
    small.forEach((x, w) => { const y = big.get(w); if (y) s += x * y; });
    return s;
  }
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Pairs of notes whose similarity clears the threshold, each note keeping at
 * most `perNote` strongest partners (so one generic note can't link to everything).
 */
export function semanticLinks(ids, vecs, threshold, perNote = 4) {
  const best = new Map(ids.map((id) => [id, []]));
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const s = cosine(vecs[i], vecs[j]);
    if (s < threshold) continue;
    best.get(ids[i]).push([ids[j], s]);
    best.get(ids[j]).push([ids[i], s]);
  }
  const keep = new Map();
  best.forEach((list, id) => list.sort((x, y) => y[1] - x[1]).slice(0, perNote).forEach(([other, s]) => {
    const key = id < other ? `${id}|${other}` : `${other}|${id}`;
    keep.set(key, s);
  }));
  return [...keep].map(([k, s]) => { const [a, b] = k.split("|"); return { a, b, score: s }; });
}

/** Splits a note into passages (paragraphs, long ones split by sentence) for "Ask". */
export function chunk(body, maxChars = 420) {
  const paras = String(body).split(/\n\s*\n/).map((p) => p.trim()).filter((p) => plainText(p).length > 25);
  const out = [];
  for (const p of paras) {
    if (p.length <= maxChars) { out.push(p); continue; }
    let cur = "";
    for (const s of p.split(/(?<=[.!?])\s+/)) {
      if ((cur + " " + s).length > maxChars && cur) { out.push(cur.trim()); cur = ""; }
      cur += " " + s;
    }
    if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

/** FNV-1a hash — cache key for embeddings of a given text. */
export function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

/** Wraps query words found in `text` with <mark> (expects already-escaped text). */
export function highlight(escaped, query) {
  const words = [...new Set(tokenize(query))].filter((w) => w.length > 2).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return escaped;
  return escaped.replace(new RegExp(`\\b(${words.join("|")})\\w*`, "gi"), "<mark>$&</mark>");
}
