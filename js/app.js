/* ==========================================================================
   MindScape — app wiring: notes, editor, semantic engine, graph, ask.
   ========================================================================== */
import { initTheme, esc } from "./theme.js";
import * as db from "./store.js";
import { parseLinks, parseTags, plainText, tfidf, cosine, semanticLinks, chunk, hash, highlight } from "./semantic.js";
import { SAMPLE_NOTES } from "./samples.js";
import * as cloud from "./cloud.js";

const $ = (id) => document.getElementById(id);
const byTitle = (t) => notes.find((n) => n.title.trim().toLowerCase() === t.trim().toLowerCase());

let notes = [];
let currentId = null;
let tagFilter = null;
let searchResults = null; // [{id, score}] | null
let view = "notes";
let cloudSession = null;

function applyNoteAppearance(note) {
  const editor = $("editorBody");
  editor.className = `note-paper style-${note.style || "regular"} paper-${note.color || "plain"} font-${note.font || "clean"}`;
}

/* ================================================================ engine */
// Semantic vectors come from the on-device model; TF-IDF is the fallback.
const engine = { ready: false, failed: false, vecs: new Map(), keyword: null };
let worker = null;
let reqId = 0;
const pending = new Map();

function setModel(state, text) {
  const el = $("modelStatus");
  el.className = `model ${state}`;
  el.querySelector(".txt").textContent = text;
  el.title = text;
}

function startModel() {
  try {
    worker = new Worker("js/embed-worker.js", { type: "module" });
  } catch {
    engine.failed = true; setModel("failed", "Basic search");
  }
  const rejectPending = (message) => {
    pending.forEach(({ reject }) => reject(new Error(message)));
    pending.clear();
  };
  setModel("loading", "Preparing suggestions…");
  worker.onmessage = ({ data }) => {
    if (data.type === "progress") {
      const pct = data.total ? Math.round((data.loaded / data.total) * 100) : 0;
      setModel("loading", `Preparing suggestions ${pct}%`);
      return;
    }
    if (data.type === "ready") {
      engine.ready = true;
      setModel("loading", "Finding related notes…");
      refreshVectors().then(() => { setModel("ready", "Smart suggestions on"); renderAll(); if ($("search").value.trim()) runSearch(); });
      return;
    }
    if (data.type === "failed") {
      engine.failed = true;
      setModel("failed", "Basic search (suggestions unavailable)");
      rejectPending(data.error || "The semantic model failed to load.");
      return;
    }
    const p = pending.get(data.id);
    if (!p) return;
    pending.delete(data.id);
    data.error ? p.reject(new Error(data.error)) : p.resolve(data.vectors);
  };
  worker.onerror = (event) => {
    engine.failed = true;
    setModel("failed", "Basic search (suggestions unavailable)");
    rejectPending(event.message || "The semantic model worker failed.");
  };
}

function embed(texts) {
  if (!texts.length) return Promise.resolve([]);
  if (!worker || engine.failed) return Promise.reject(new Error("model unavailable"));
  const id = ++reqId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker.postMessage({ id, texts }); });
}

/** Embeds texts with an IndexedDB cache keyed by content hash. */
const memCache = new Map();
let vectorRefreshToken = 0;
async function embedCached(texts) {
  const keys = texts.map(hash);
  const out = new Array(texts.length);
  const missing = [];
  await Promise.all(keys.map(async (k, i) => {
    const v = memCache.get(k) || await db.getVector(k).catch(() => null);
    if (v) { memCache.set(k, v); out[i] = v; } else missing.push(i);
  }));
  if (missing.length) {
    const vecs = await embed(missing.map((i) => texts[i]));
    const entries = [];
    missing.forEach((i, j) => { out[i] = vecs[j]; memCache.set(keys[i], vecs[j]); entries.push([keys[i], vecs[j]]); });
    db.putVectors(entries).catch(() => {});
  }
  return out;
}

const noteText = (n) => `${n.title}\n${plainText(n.body)}`.slice(0, 2000);

async function refreshVectors() {
  const token = ++vectorRefreshToken;
  engine.keyword = tfidf(notes.map(noteText));
  if (engine.ready) engine.vecs = new Map();
  if (!engine.ready) return;
  try {
    const vecs = await embedCached(notes.map(noteText));
    if (token !== vectorRefreshToken) return;
    engine.vecs = new Map(notes.map((n, i) => [n.id, vecs[i]]));
  } catch {
    if (token === vectorRefreshToken) engine.vecs = new Map();
  }
}
const semanticOn = () => engine.ready && engine.vecs.size === notes.length && notes.every((n) => engine.vecs.has(n.id));

/** Similarity between two notes in the current engine. */
function similarity(a, b) {
  if (semanticOn()) return cosine(engine.vecs.get(a.id), engine.vecs.get(b.id));
  const i = notes.indexOf(a), j = notes.indexOf(b);
  return engine.keyword ? cosine(engine.keyword.vecs[i], engine.keyword.vecs[j]) : 0;
}
// Thresholds differ: embedding similarity runs higher than TF-IDF overlap.
const relatedFloor = () => (semanticOn() ? 0.25 : 0.06);

/* ================================================================= notes */
async function load() {
  try {
    notes = await db.getAllNotes();
    const seeded = await db.getMeta("seeded");
    if (!notes.length && !seeded) {
      await addSamples();
      await db.setMeta("seeded", true);
    }
  } catch {
    // Private windows may block IndexedDB: work in memory only.
    if (!notes.length) notes = SAMPLE_NOTES.map(makeNote);
    $("saveState").textContent = "Storage unavailable — changes won't be kept after you close this tab.";
  }
  sortNotes();
  await refreshVectors();
  let fromHash = "";
  try { fromHash = decodeURIComponent(location.hash.slice(1)); } catch { /* use the first note */ }
  openNote(notes.find((n) => n.id === fromHash)?.id || notes[0]?.id || null);
}
function makeNote({ title = "Untitled", body = "" } = {}) {
  const now = Date.now();
  return { id: db.newId(), title, body, created: now, updated: now, style: "regular", color: "plain", font: "clean" };
}
async function addSamples() {
  const now = Date.now();
  const fresh = SAMPLE_NOTES.filter((s) => !byTitle(s.title)).map((s, i) => ({ ...makeNote(s), updated: now - i * 60000, created: now - i * 60000 }));
  notes.push(...fresh);
  await db.putNotes(fresh).catch(() => {});
}
const sortNotes = () => notes.sort((a, b) => b.updated - a.updated);

/* ------------------------------------------------------------- note list */
function renderTags() {
  const counts = new Map();
  notes.forEach((n) => parseTags(n.body).forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  const tags = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 14);
  if (tagFilter && !counts.has(tagFilter)) tagFilter = null;
  $("tagBar").innerHTML = tags.map(([t, c]) => `<button class="chip" type="button" data-tag="${esc(t)}" aria-pressed="${t === tagFilter}">#${esc(t)} <span class="muted">${c}</span></button>`).join("");
}
function renderList() {
  const q = $("search").value.trim();
  let list = searchResults ? searchResults.map((r) => ({ n: notes.find((x) => x.id === r.id), score: r.score })).filter((r) => r.n)
    : notes.map((n) => ({ n }));
  if (tagFilter) list = list.filter(({ n }) => parseTags(n.body).includes(tagFilter));
  $("listInfo").textContent = searchResults
    ? `${list.length} match${list.length === 1 ? "" : "es"} ${semanticOn() ? "by related ideas" : "by words"}`
    : `${list.length} note${list.length === 1 ? "" : "s"}${tagFilter ? ` tagged #${tagFilter}` : ""}`;
  $("noteList").innerHTML = list.map(({ n, score }) => {
    const snippet = esc(plainText(n.body).slice(0, 140));
    return `<li><button type="button" data-open="${n.id}" aria-current="${n.id === currentId}">
      <span class="t"><span>${q ? highlight(esc(n.title || "Untitled"), q) : esc(n.title || "Untitled")}</span>${score != null ? `<span class="score">${Math.round(score * 100)}%</span>` : ""}</span>
      <span class="s">${q ? highlight(snippet, q) : snippet}</span></button></li>`;
  }).join("") || '<li class="empty small">No notes here yet.</li>';
}

/* ----------------------------------------------------------------- search */
let searchTimer;
let searchToken = 0;
$("search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 220);
});
async function runSearch() {
  const q = $("search").value.trim();
  const token = ++searchToken;
  if (!q) { searchResults = null; renderList(); return; }
  const kw = engine.keyword ? engine.keyword.vectorize(q) : null;
  const lower = q.toLowerCase();
  let scored = notes.map((n, i) => {
    const k = kw ? cosine(kw, engine.keyword.vecs[i]) : 0;
    const literal = (n.title + " " + n.body).toLowerCase().includes(lower) ? 0.25 : 0;
    return { id: n.id, k, literal };
  });
  let useSemantic = false;
  if (semanticOn()) {
    try {
      const [qv] = await embed([q]);
      if (token !== searchToken) return;
      scored = scored.map((s) => ({ ...s, sem: cosine(qv, engine.vecs.get(s.id)) }));
      useSemantic = true;
    } catch { /* fall back */ }
  }
  searchResults = scored
    .map((s) => ({ id: s.id, score: useSemantic ? Math.min(1, 0.8 * s.sem + 0.2 * s.k + s.literal * 0.5) : Math.min(1, s.k + s.literal) }))
    .filter((s) => s.score >= (useSemantic ? 0.15 : 0.04))
    .sort((a, b) => b.score - a.score)
    .slice(0, useSemantic ? 8 : undefined);
  renderList();
}

/* ----------------------------------------------------------------- editor */
const current = () => notes.find((n) => n.id === currentId) || null;
let previewMode = false;

function openNote(id) {
  currentId = id;
  const n = current();
  $("editorEmpty").hidden = !!n;
  $("editorBody").hidden = !n;
  if (n) {
    $("title").value = n.title;
    $("body").value = n.body;
    $("noteStyle").value = n.style || "regular";
    $("noteColor").value = n.color || "plain";
    $("noteFont").value = n.font || "clean";
    applyNoteAppearance(n);
    history.replaceState(null, "", `#${n.id}`);
    setPreview(previewMode);
  } else history.replaceState(null, "", location.pathname);
  renderAll();
}

function renderMeta() {
  const n = current();
  if (!n) return;
  const words = plainText(n.body).split(/\s+/).filter(Boolean).length;
  $("edMeta").textContent = `${words} word${words === 1 ? "" : "s"} · edited ${new Date(n.updated).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
}

function renderPreview() {
  const n = current();
  if (!n) return;
  // Wiki links and tags become clickable before Markdown rendering.
  const src = n.body
    .replace(/\[\[([^\]\n]{1,120})\]\]/g, (_, t) => `<a href="#" class="wikilink${byTitle(t) ? "" : " missing"}" data-wiki="${esc(t.trim())}">${esc(t.trim())}</a>`)
    .replace(/(^|[\s(])#([\p{L}\d][\p{L}\d_-]{0,40})/gu, (_, pre, t) => `${pre}<span class="tagpill" data-tag="${esc(t.toLowerCase())}">#${esc(t)}</span>`);
  $("preview").innerHTML = DOMPurify.sanitize(marked.parse(src), { ADD_ATTR: ["data-wiki", "data-tag"] });
}

function setPreview(on) {
  previewMode = on;
  $("modeEdit").setAttribute("aria-pressed", String(!on));
  $("modePreview").setAttribute("aria-pressed", String(on));
  $("body").hidden = on;
  $("preview").hidden = !on;
  if (on) renderPreview();
}
$("modeEdit").addEventListener("click", () => { setPreview(false); $("body").focus(); });
$("modePreview").addEventListener("click", () => setPreview(true));

let saveTimer, embedTimer;
function onEdit() {
  const n = current();
  if (!n) return;
  n.title = $("title").value;
  n.body = $("body").value;
  n.style = $("noteStyle").value;
  n.color = $("noteColor").value;
  n.font = $("noteFont").value;
  n.updated = Date.now();
  applyNoteAppearance(n);
  $("saveState").textContent = "Saving…";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await db.putNote(n);
      if (cloudSession) await cloud.putNote(n);
      $("saveState").textContent = cloudSession ? "Saved to your account" : "Saved";
    }
    catch { $("saveState").textContent = "Couldn't save — storage unavailable"; }
  }, 400);
  clearTimeout(embedTimer);
  embedTimer = setTimeout(async () => { sortNotes(); await refreshVectors(); renderAll(); }, 1200);
  renderMeta();
}
$("title").addEventListener("input", onEdit);
$("body").addEventListener("input", onEdit);
$("noteStyle").addEventListener("change", onEdit);
$("noteColor").addEventListener("change", onEdit);
$("noteFont").addEventListener("change", onEdit);
$("title").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); $("body").focus(); } });

function newNote(title = "Untitled") {
  const n = makeNote({ title });
  notes.unshift(n);
  $("search").value = ""; searchResults = null; tagFilter = null;
  setPreview(false);
  // Open first so typing straight away is never overwritten by a late render.
  openNote(n.id);
  $("title").focus(); $("title").select();
  db.putNote(n).then(() => cloudSession && cloud.putNote(n)).catch(() => { $("saveState").textContent = "Couldn't save this note"; });
  refreshVectors().then(renderConnections);
}
$("newBtn").addEventListener("click", () => newNote());
document.querySelectorAll("[data-new]").forEach((b) => b.addEventListener("click", () => newNote()));

$("deleteNote").addEventListener("click", async () => {
  const n = current();
  if (!n || !confirm(`Delete “${n.title || "Untitled"}”? This can't be undone.`)) return;
  notes = notes.filter((x) => x.id !== n.id);
  await db.deleteNote(n.id).catch(() => {});
  if (cloudSession) await cloud.deleteNote(n.id).catch(() => {});
  await refreshVectors();
  openNote(notes[0]?.id || null);
});
$("downloadNote").addEventListener("click", () => {
  const n = current();
  if (n) download(`${(n.title || "note").replace(/[^\w-]+/g, "_")}.md`, `# ${n.title}\n\n${n.body}\n`, "text/markdown");
});

/* ------------------------------------------------------------ connections */
function renderConnections() {
  const n = current();
  if (!n) { ["related", "links", "backlinks"].forEach((id) => { $(id).innerHTML = ""; }); return; }
  const linked = new Set(parseLinks(n.body));
  const related = notes.filter((o) => o !== n).map((o) => ({ o, s: similarity(n, o) }))
    .filter((r) => r.s >= relatedFloor()).sort((a, b) => b.s - a.s).slice(0, 6);
  $("relatedHint").textContent = semanticOn()
    ? "Suggested because the ideas seem related, even when the words are different."
    : engine.failed ? "Showing notes with similar words. Smart suggestions are unavailable right now." : "Looking for notes with similar words while smart suggestions load…";
  $("related").innerHTML = related.map(({ o, s }) => `
    <li><button class="open" type="button" data-open="${o.id}"><span>${esc(o.title || "Untitled")}</span><span class="pct">${Math.round(s * 100)}%</span></button>
    ${linked.has(o.title.toLowerCase()) ? "" : `<button class="btn link" type="button" data-link="${esc(o.title)}" aria-label="Link ${esc(o.title)} into this note">+ link</button>`}</li>`).join("")
    || '<li class="none">Nothing closely related yet. Write a bit more.</li>';
  const out = [...linked].map((t) => ({ t, o: byTitle(t) }));
  $("links").innerHTML = out.map(({ t, o }) => o
    ? `<li><button class="open" type="button" data-open="${o.id}"><span>${esc(o.title)}</span></button></li>`
    : `<li><button class="open" type="button" data-create="${esc(t)}"><span>${esc(t)}</span><span class="pct">create</span></button></li>`).join("")
    || '<li class="none">Link notes with [[Title]].</li>';
  const back = notes.filter((o) => o !== n && parseLinks(o.body).includes(n.title.trim().toLowerCase()));
  $("backlinks").innerHTML = back.map((o) => `<li><button class="open" type="button" data-open="${o.id}"><span>${esc(o.title)}</span></button></li>`).join("")
    || '<li class="none">No notes link here yet.</li>';
}

/* ------------------------------------------------------------ delegation */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-open],[data-create],[data-link],[data-wiki],[data-tag]");
  if (!t) return;
  if (t.dataset.open) { showView("notes"); openNote(t.dataset.open); if (matchMedia("(max-width: 720px)").matches) $("title").scrollIntoView(); return; }
  if (t.dataset.create) { newNote(t.dataset.create); return; }
  if (t.dataset.wiki) {
    e.preventDefault();
    const o = byTitle(t.dataset.wiki);
    o ? openNote(o.id) : newNote(t.dataset.wiki);
    return;
  }
  if (t.dataset.link) {
    const b = $("body");
    b.value = `${b.value.replace(/\s*$/, "")}\n\nSee also: [[${t.dataset.link}]]`;
    onEdit();
    if (previewMode) renderPreview();
    renderConnections();
    return;
  }
  if (t.dataset.tag) {
    tagFilter = tagFilter === t.dataset.tag ? null : t.dataset.tag;
    showView("notes");
    renderTags(); renderList();
  }
});

function renderAll() {
  renderTags();
  renderList();
  renderConnections();
  renderMeta();
  if (previewMode) renderPreview();
  if (view === "graph") drawGraph();
}

/* ================================================================== views */
function showView(v) {
  view = v;
  document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
  ["notes", "graph", "ask"].forEach((k) => { $(`view-${k}`).hidden = k !== v; });
  if (v === "graph") drawGraph();
  if (v === "ask") { renderExamples(); $("askInput").focus(); }
}
document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));

/* ================================================================== graph */
let sim = null;
function drawGraph() {
  const box = $("graph");
  if (sim) sim.stop();
  box.innerHTML = "";
  if (!notes.length) { box.innerHTML = '<p class="empty">No notes to map yet.</p>'; return; }
  const W = box.clientWidth || 800, H = box.clientHeight || 500;
  const nodes = notes.map((n) => ({ id: n.id, title: n.title || "Untitled" }));
  const index = new Map(nodes.map((n) => [n.id, n]));
  const edges = [];
  const seen = new Set();
  notes.forEach((n) => parseLinks(n.body).forEach((t) => {
    const o = byTitle(t);
    if (!o || o.id === n.id) return;
    const k = [n.id, o.id].sort().join("|");
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ source: n.id, target: o.id, kind: "link" });
  }));
  const thr = Number($("threshold").value);
  const semantic = semanticOn();
  const vecs = semantic ? notes.map((n) => engine.vecs.get(n.id)) : engine.keyword?.vecs || [];
  // TF-IDF overlap runs lower than embedding similarity, so scale the slider in keyword mode.
  const found = semanticLinks(notes.map((n) => n.id), vecs, semantic ? thr : thr * 0.35, 3)
    .filter(({ a, b }) => !seen.has([a, b].sort().join("|")));
  found.forEach(({ a, b, score }) => edges.push({ source: a, target: b, kind: "sem", score }));
  $("graphInfo").textContent = `${nodes.length} notes · ${edges.length - found.length} links · ${found.length} suggested`;

  const degree = new Map();
  edges.forEach((e) => { degree.set(e.source, (degree.get(e.source) || 0) + 1); degree.set(e.target, (degree.get(e.target) || 0) + 1); });
  const svg = d3.select(box).append("svg").attr("viewBox", [0, 0, W, H]);
  const g = svg.append("g");
  svg.call(d3.zoom().scaleExtent([0.3, 3]).on("zoom", (ev) => g.attr("transform", ev.transform)));
  const link = g.append("g").selectAll("line").data(edges).join("line").attr("class", (d) => `edge ${d.kind === "sem" ? "sem" : ""}`);
  link.append("title").text((d) => (d.kind === "sem" ? `${Math.round(d.score * 100)}% similar` : "your link"));
  const node = g.append("g").selectAll("g").data(nodes).join("g")
    .attr("class", (d) => `node ${d.id === currentId ? "current" : ""}`)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", (d) => `Open ${d.title}`)
    .on("click", (_, d) => { showView("notes"); openNote(d.id); })
    .on("keydown", (ev, d) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); showView("notes"); openNote(d.id); } })
    .on("mouseenter focus", (_, d) => {
      const near = new Set([d.id]);
      edges.forEach((e) => { if (e.source.id === d.id) near.add(e.target.id); if (e.target.id === d.id) near.add(e.source.id); });
      node.classed("dim", (n) => !near.has(n.id));
      link.classed("dim", (e) => e.source.id !== d.id && e.target.id !== d.id);
    })
    .on("mouseleave blur", () => { node.classed("dim", false); link.classed("dim", false); })
    .call(d3.drag()
      .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));
  node.append("circle").attr("r", (d) => 7 + Math.min(10, (degree.get(d.id) || 0) * 1.6));
  node.append("text").attr("x", (d) => 11 + Math.min(10, (degree.get(d.id) || 0) * 1.6)).attr("y", 4).text((d) => (d.title.length > 28 ? `${d.title.slice(0, 27)}…` : d.title));

  sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id((d) => d.id).distance((d) => (d.kind === "sem" ? 120 : 90)).strength(0.6))
    .force("charge", d3.forceManyBody().strength(-260))
    .force("center", d3.forceCenter(W / 2, H / 2))
    .force("collide", d3.forceCollide(30))
    .force("x", d3.forceX(W / 2).strength(0.04))
    .force("y", d3.forceY(H / 2).strength(0.06))
    .on("tick", () => {
      link.attr("x1", (d) => d.source.x).attr("y1", (d) => d.source.y).attr("x2", (d) => d.target.x).attr("y2", (d) => d.target.y);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { sim.stop(); for (let i = 0; i < 300; i++) sim.tick(); sim.on("tick")(); }
  void index;
}
$("threshold").addEventListener("input", () => { $("thresholdOut").value = `${Math.round($("threshold").value * 100)}%`; drawGraph(); });
let resizeTimer;
addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => view === "graph" && drawGraph(), 200); });

/* =================================================================== ask */
const EXAMPLES = ["How should I store passwords?", "What's the best way to study for an exam?", "How do computers understand meaning?", "How can I spot a scam email?"];
function renderExamples() {
  $("askExamples").innerHTML = notes.length ? EXAMPLES.map((q) => `<button class="chip" type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join("") : "";
}
$("askExamples").addEventListener("click", (e) => { const b = e.target.closest("[data-ask]"); if (b) { $("askInput").value = b.dataset.ask; ask(b.dataset.ask); } });
$("askForm").addEventListener("submit", (e) => { e.preventDefault(); const q = $("askInput").value.trim(); if (q) ask(q); });

let askToken = 0;
async function ask(q) {
  const token = ++askToken;
  const out = $("answers");
  const passages = notes.flatMap((n) => chunk(n.body).map((text) => ({ n, text })));
  if (!passages.length) { out.innerHTML = '<p class="empty">Your notes are empty, so there is nothing to answer from yet.</p>'; return; }
  out.innerHTML = `<p class="small muted"><span class="spinner"></span> Reading ${passages.length} passages…</p>`;
  let scored, mode = "keyword";
  if (engine.ready && !engine.failed) {
    try {
      const [qv, ...pv] = await embedCached([q, ...passages.map((p) => `${p.n.title}: ${plainText(p.text)}`)]);
      scored = passages.map((p, i) => ({ ...p, score: cosine(qv, pv[i]) }));
      mode = "meaning";
    } catch { /* fall back */ }
  }
  if (!scored) {
    const idx = tfidf(passages.map((p) => `${p.n.title} ${p.text}`));
    const qv = idx.vectorize(q);
    scored = passages.map((p, i) => ({ ...p, score: cosine(qv, idx.vecs[i]) }));
  }
  if (token !== askToken) return;
  const floor = mode === "meaning" ? 0.25 : 0.05;
  const top = scored.filter((s) => s.score >= floor).sort((a, b) => b.score - a.score).slice(0, 5);
  if (!top.length) {
    out.innerHTML = `<div class="note warn">Nothing in your notes answers this closely. MindScape only answers from what you've written, so try rephrasing or add a note about it.</div>`;
    return;
  }
  out.innerHTML = `<p class="small muted">Most helpful notes${mode === "keyword" ? " (based on matching words)" : ""}:</p>` +
    top.map((s, i) => `
    <article class="card answer ${i === 0 ? "best" : ""}">
      <div class="src"><button type="button" data-open="${s.n.id}">${esc(s.n.title || "Untitled")}</button><span class="tag">${Math.round(s.score * 100)}% match</span></div>
      <div class="passage">${highlight(DOMPurify.sanitize(marked.parse(s.text.replace(/\[\[([^\]]+)\]\]/g, "$1"))), q)}</div>
    </article>`).join("");
}

/* ============================================================== settings */
const dlg = $("settings");
$("settingsBtn").addEventListener("click", () => dlg.showModal());
function download(name, text, type) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("exportBtn").addEventListener("click", () => {
  download(`mindscape-notes-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify({ app: "MindScape", version: 1, exported: new Date().toISOString(), notes }, null, 2), "application/json");
});
$("importFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = (Array.isArray(data) ? data : data.notes || []).filter((n) => n && typeof n.body === "string");
    if (!list.length) throw new Error("no notes");
    const known = new Set(notes.map((n) => n.id));
    const incoming = list.map((n) => ({ ...makeNote({ title: String(n.title || "Untitled"), body: n.body }), ...(n.id && !known.has(n.id) ? { id: String(n.id) } : {}), style: n.style || "regular", color: n.color || "plain", font: n.font || "clean", updated: Number(n.updated) || Date.now(), created: Number(n.created) || Date.now() }));
    notes.push(...incoming);
    await db.putNotes(incoming).catch(() => {});
    if (cloudSession) await cloud.putNotes(incoming);
    sortNotes();
    await refreshVectors();
    renderAll();
    alert(`Imported ${incoming.length} note${incoming.length === 1 ? "" : "s"}.`);
  } catch { alert("That file isn't a MindScape export (a JSON file with a list of notes)."); }
  e.target.value = "";
});
$("samplesBtn").addEventListener("click", async () => { await addSamples(); if (cloudSession) await cloud.putNotes(notes); sortNotes(); await refreshVectors(); openNote(currentId || notes[0]?.id); dlg.close(); });
$("emptyBtn").addEventListener("click", async () => {
  if (!confirm("Delete every note in this browser? Export first if you want a backup.")) return;
  notes = [];
  await db.clearNotes().catch(() => {});
  if (cloudSession) await cloud.deleteAllNotes().catch(() => {});
  await db.setMeta("seeded", true).catch(() => {});
  await refreshVectors();
  openNote(null);
  dlg.close();
});

/* ============================================================== keyboard */
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); showView("notes"); $("search").focus(); $("search").select(); }
});

/* ================================================================= start */
initTheme($("themeToggle"));

async function syncAccount(session) {
  cloudSession = session;
  const button = $("accountBtn");
  if (!session) {
    button.textContent = cloud.cloudConfigured ? "Sign in" : "Set up account";
    button.title = cloud.cloudConfigured ? "Sign in to sync your notes" : "Add Supabase settings to enable accounts";
    return;
  }
  button.textContent = session.user.email?.split("@")[0] || "Account";
  button.title = "Sign out";
  try {
    const remote = await cloud.getNotes();
    if (remote.length) {
      notes = remote;
      await db.clearNotes();
      await db.putNotes(notes);
    } else if (notes.length) {
      await cloud.putNotes(notes);
    }
    sortNotes();
    await refreshVectors();
    openNote(notes.find((n) => n.id === currentId)?.id || notes[0]?.id || null);
    $("saveState").textContent = "Synced to your account";
  } catch {
    $("saveState").textContent = "Signed in, but notes could not sync";
  }
}

function initAccount() {
  const dialog = $("accountDialog");
  const form = $("accountForm");
  const openAccount = async () => {
    if (cloudSession) {
      await cloud.signOut();
      return;
    }
    if (!cloud.cloudConfigured) {
      alert("Accounts are not connected yet. Add your Supabase URL and public anon key in js/config.js.");
      return;
    }
    dialog.showModal();
  };
  $("accountBtn").addEventListener("click", openAccount);
  $("disclaimerSignIn").addEventListener("click", openAccount);
  $("accountCancel").addEventListener("click", () => dialog.close());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const action = event.submitter?.value;
    const error = $("accountError");
    error.hidden = true;
    const result = action === "signup"
      ? await cloud.signUp($("accountEmail").value.trim(), $("accountPassword").value)
      : await cloud.signIn($("accountEmail").value.trim(), $("accountPassword").value);
    if (result.error) {
      error.textContent = result.error.message;
      error.hidden = false;
      return;
    }
    dialog.close();
    if (action === "signup" && !result.data.session) {
      alert("Check your email to confirm your account, then sign in.");
    }
  });
  cloud.onAuthChange(syncAccount);
  cloud.getSession().then(syncAccount);
}

load().then(() => { startModel(); initAccount(); });
