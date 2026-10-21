const $ = (id) => document.getElementById(id);
const STATIC = !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const SHAPES = ["base", "open", "mid", "blink"];
const stepOrder = ["setup", "opening", "tensions", "synthesis", "ratify", "signal"];
const TABLE_STORE = "silver-board-table";
const SIDEBAR_STORE = "silver-board-sidebar";
const FIELD_STORE = "silver-board-field";

const state = {
  seats: [],
  byKey: {},
  archetypes: [],
  chairKey: "dalio",
  defaultSeats: [],
  current: null,
  es: null,
  queue: [],
  playing: false,
  replay: false,
  speed: 1,
  skip: false,
  speaking: null,
  talkTimer: null,
  blinkTimer: null,
  geo: {},
  writable: false,
  disclaimer: "",
  attachments: [],
  dictating: false,
  recognition: null,
};

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function displayName(s, fallback) {
  return (s && (s.name || s.short)) || fallback || "";
}

function dataUrl(p) {
  if (!STATIC) return p;
  if (p === "/api/seats") return "data/seats.json";
  if (p === "/api/sessions") return "data/sessions.json";
  const m = String(p).match(/^\/api\/sessions\/(.+)$/);
  if (m) return `data/sessions/${m[1]}.json`;
  const adv = String(p).match(/^\/api\/advisor\/(.+)$/);
  if (adv) return `data/advisors/${adv[1]}.json`;
  return p;
}

async function api(p, opts) {
  const r = await fetch(dataUrl(p), opts);
  if (!r.ok) {
    let msg = `${p} ${r.status}`;
    try {
      const j = await r.json();
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (r.status === 204) return {};
  return r.json();
}

function avatarUrl(key, shape = "base") {
  return `${STATIC ? "" : "/"}avatars/${key}-${shape}.webp`;
}

function stanceClass(stance) {
  const s = String(stance || "").toLowerCase();
  if (/no|decline|hold/.test(s)) return "stance-no";
  if (/strong|yes|endorse/.test(s)) return "stance-yes";
  return "stance-mid";
}

function tableOrder(keys) {
  const chair = state.chairKey || "dalio";
  const rest = (keys || []).filter((k) => k !== chair);
  const mid = Math.floor(rest.length / 2);
  return [...rest.slice(0, mid), chair, ...rest.slice(mid)];
}

function bustHtml(s) {
  const imgs = SHAPES.map((sh) => `<img class="${sh}" src="${esc(avatarUrl(s.key, sh))}" alt="" draggable="false">`).join("");
  return `<div class="think" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="bust" data-shape="base" style="--seat:${esc(s.color || "#c5cdd8")}">
      ${imgs}
      <div class="bust-fallback" aria-hidden="true">
        <i class="shoulders"></i><i class="head"></i><b>${esc(s.initials || "?")}</b>
      </div>
    </div>`;
}

function bindArt(root) {
  for (const bust of root.querySelectorAll(".bust")) {
    const base = bust.querySelector("img.base");
    if (!base) continue;
    const ok = () => bust.classList.add("has-art");
    if (base.complete && base.naturalWidth) ok();
    else base.addEventListener("load", ok, { once: true });
    base.addEventListener("error", () => base.remove(), { once: true });
    for (const img of bust.querySelectorAll("img:not(.base)")) {
      img.addEventListener("error", () => img.remove(), { once: true });
    }
  }
}

function renderSeats(keys) {
  state.seats = tableOrder(keys);
  const box = $("seats");
  const plates = $("plates");
  box.innerHTML = "";
  plates.innerHTML = "";
  state.seats.forEach((key) => {
    const s = state.byKey[key] || { key, short: key, initials: "?", color: "#c5cdd8", name: key };
    const chair = key === state.chairKey;
    const el = document.createElement("div");
    el.className = `seat${chair ? " chair-seat" : ""}`;
    el.id = `seat-${key}`;
    el.dataset.key = key;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${displayName(s, key)}, ${s.pillar || ""}. Open card.`);
    el.innerHTML = bustHtml(s);
    box.appendChild(el);
    const pl = document.createElement("div");
    pl.className = `nameplate${chair ? " chair" : ""}`;
    pl.id = `plate-${key}`;
    pl.dataset.key = key;
    const plateSub = chair ? ["Chair", s.pillar || s.archetype].filter(Boolean).join(" · ") : s.pillar || s.archetype || "";
    pl.innerHTML = `<b>${esc(displayName(s, key))}</b><small>${esc(plateSub)}</small>`;
    plates.appendChild(pl);
  });
  bindArt(box);
  layoutStage();
}

function layoutStage() {
  const stage = $("stage");
  if (!stage || !state.seats.length) return;
  const W = stage.clientWidth;
  const narrow = matchMedia("(max-width: 820px)").matches;
  const H = narrow ? Math.round(W * 0.62) : stage.clientHeight;
  const cx = W / 2;
  const cy = H * (narrow ? 0.98 : 0.9);
  const rx = W * 0.48;
  const ry = H * (narrow ? 0.46 : 0.42);
  const t = $("table");
  Object.assign(t.style, { left: `${cx - rx}px`, top: `${cy - ry}px`, width: `${rx * 2}px`, height: `${ry * 2}px` });
  const totem = $("tableTotem");
  if (totem) {
    const tw = rx * 2 * 0.16;
    const th = tw * (590 / 742);
    Object.assign(totem.style, {
      left: `${cx - tw / 2}px`,
      top: `${cy - th * 0.62}px`,
      width: `${tw}px`,
      height: `${th}px`,
    });
  }
  const edge = (x) => cy - ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
  const n = state.seats.length;
  state.seats.forEach((key, i) => {
    const x = W * (0.1 + (0.8 * i) / Math.max(n - 1, 1));
    const d = ((x - cx) / rx) ** 2;
    const size = H * (narrow ? 0.48 + 0.08 * d : 0.36 + 0.07 * d);
    const bottom = edge(x) + size * 0.2;
    const el = $(`seat-${key}`);
    if (!el) return;
    Object.assign(el.style, {
      left: `${x - size / 2}px`,
      top: `${bottom - size}px`,
      width: `${size}px`,
      height: `${size}px`,
      zIndex: 10 + Math.round(d * 10),
    });
    const pl = $(`plate-${key}`);
    if (pl) {
      pl.style.left = `${x}px`;
      pl.style.top = `${edge(x) + H * 0.01}px`;
    }
    state.geo[key] = { x, head: bottom - size * 0.72, size };
  });
  const c = $("center");
  if (narrow) {
    Object.assign(c.style, { left: "", top: "", width: "", height: "" });
  } else {
    const top = H * 0.48;
    Object.assign(c.style, { left: `${W * 0.2}px`, width: `${W * 0.6}px`, top: `${top}px`, height: `${H - top - H * 0.1}px` });
  }
  if (state.speaking) moveSpot(state.speaking);
}

function moveSpot(key) {
  const g = state.geo[key];
  const spot = $("spot");
  if (!g) {
    spot.classList.remove("on");
    return;
  }
  spot.style.left = `${g.x}px`;
  spot.style.top = `${g.head}px`;
  spot.style.width = spot.style.height = `${g.size * 1.9}px`;
  spot.classList.add("on");
}

function stopTalk() {
  clearInterval(state.talkTimer);
  clearInterval(state.blinkTimer);
  state.talkTimer = state.blinkTimer = null;
  for (const bust of document.querySelectorAll(".bust")) bust.dataset.shape = "base";
}

function markSpeaking(seat) {
  state.speaking = seat;
  $("stage").classList.add("live");
  for (const el of document.querySelectorAll(".seat")) el.classList.toggle("speaking", el.dataset.key === seat);
  for (const el of document.querySelectorAll(".nameplate")) el.classList.toggle("speaking", el.dataset.key === seat);
  moveSpot(seat);
  stopTalk();
  const bust = document.querySelector(`#seat-${seat} .bust`);
  if (bust?.classList.contains("has-art")) {
    let i = 0;
    const cycle = ["open", "mid", "open", "base"];
    state.talkTimer = setInterval(() => {
      bust.dataset.shape = cycle[i++ % cycle.length];
    }, 180);
  }
}

function setStep(step, label) {
  for (const li of $("stepper").querySelectorAll("li")) {
    li.classList.toggle("on", li.dataset.step === step);
    li.classList.toggle("done", stepOrder.indexOf(li.dataset.step) < stepOrder.indexOf(step));
  }
}

function firstLine(text) {
  const m = String(text || "").match(/THE CALL:\s*(.+)/i);
  return m ? m[1].trim() : String(text || "").slice(0, 220);
}

function formatSpeech(ev) {
  const p = ev.parsed || {};
  const tag = ev.round === 2 ? "Ratify" : ev.round === 1 ? "Opening" : "";
  const headline = p.call || p.oneLine || firstLine(ev.text);
  const sub = p.oneLine && p.call ? p.oneLine : "";
  const badge = ev.round === 2 && p.vote ? p.vote : p.stance || "";
  return { headline, sub, badge, tag, ruin: p.ruin, flag: p.flag };
}

function capAvatar(s) {
  const wrap = $("capAv");
  wrap.innerHTML = "";
  wrap.style.borderColor = s.color || "#c5cdd8";
  wrap.style.color = s.color || "#c5cdd8";
  const img = document.createElement("img");
  img.src = avatarUrl(s.key);
  img.alt = "";
  img.onerror = () => {
    img.remove();
    wrap.textContent = s.initials || "?";
  };
  wrap.appendChild(img);
}

function hideSittingStatus() {
  const el = $("sittingStatus");
  if (el) el.hidden = true;
}

function showSittingStatus(ev = {}) {
  const el = $("sittingStatus");
  if (!el) return;
  $("waiting").hidden = true;
  $("caption").hidden = true;
  $("signalCard").hidden = true;
  el.hidden = false;
  const runner = ev.runner || "local";
  const stateName = ev.state || "awaiting_chair";
  $("sittingStatusPulse").textContent = stateName === "awaiting_chair" ? "Awaiting chair" : stateName;
  $("sittingStatusTitle").textContent =
    stateName === "awaiting_chair" ? "Sitting stamped — no auto-answer yet" : "Sitting status";
  $("sittingStatusNote").textContent =
    ev.note ||
    "The room is a viewer until the chair writes round files. Empty feed is not a silent bug.";
  $("sittingStatusMeta").textContent = `Runner: ${runner} · playback: ${ev.playbackRunner || "viewer"} · state: ${stateName}`;
  const pathEl = $("sittingStatusPath");
  if (ev.handoff) {
    pathEl.hidden = false;
    pathEl.textContent = ev.handoff;
  } else {
    pathEl.hidden = true;
    pathEl.textContent = "";
  }
}

function showCaption(seat, ev) {
  $("waiting").hidden = true;
  hideSittingStatus();
  $("signalCard").hidden = true;
  $("caption").hidden = false;
  const s = state.byKey[seat] || { initials: "?", short: seat, color: "#c5cdd8", key: seat };
  const f = typeof ev === "string" ? { headline: ev, sub: "", badge: "", tag: "" } : formatSpeech(ev);
  capAvatar(s);
  $("capWho").textContent = displayName(s, seat);
  $("capTag").textContent = f.tag || "";
  $("capBody").innerHTML = "";
  if (f.badge) {
    const b = document.createElement("span");
    b.className = `stance ${stanceClass(f.badge)}`;
    b.textContent = f.badge;
    $("capBody").appendChild(b);
  }
  const h = document.createElement("p");
  h.className = "cap-call";
  h.textContent = f.headline;
  $("capBody").appendChild(h);
  if (f.sub) {
    const t = document.createElement("p");
    t.className = "cap-tension";
    t.textContent = f.sub;
    $("capBody").appendChild(t);
  }
  const flags = [f.flag && f.flag !== "none" ? f.flag : "", f.ruin && f.ruin !== "none" ? `Ruin: ${f.ruin}` : ""].filter(Boolean);
  if (flags.length) {
    const fl = document.createElement("p");
    fl.className = "cap-flags";
    fl.textContent = flags.join(" · ");
    $("capBody").appendChild(fl);
  }
  markSpeaking(seat);
  pushFeed(seat, f);
}

function pushFeed(seat, f) {
  const empty = $("feedEmpty");
  if (empty) empty.remove();
  const s = state.byKey[seat] || { short: seat, key: seat };
  const card = document.createElement("button");
  card.type = "button";
  card.className = "feed-card";
  card.dataset.key = seat;
  card.innerHTML = `<div class="h"><span>${esc(displayName(s, seat))}</span><span class="r">${esc(f.tag || f.badge || "")}</span></div><p>${esc(f.headline)}</p>`;
  $("feed").prepend(card);
}

function setComposerMode(live) {
  $("topic").classList.toggle("live", live);
  $("topicTitle").hidden = !live;
  $("options").hidden = !live;
}

function showSignal(sig) {
  $("waiting").hidden = true;
  hideSittingStatus();
  $("caption").hidden = true;
  const card = $("signalCard");
  card.hidden = false;
  card.classList.remove("minimized");
  $("stage").classList.remove("live");
  stopTalk();
  $("spot").classList.remove("on");
  for (const el of document.querySelectorAll(".seat, .nameplate")) el.classList.remove("speaking");
  const s = sig.signal || sig;
  $("sigLabel").textContent = s.label || "SIGNAL";
  $("sigOption").textContent = s.option ? `Option ${s.option}` : "";
  $("sigOption").hidden = !s.option;
  $("sigCall").textContent = s.call || s.signal || "";
  const extras = [];
  if (s.tensions_resolved?.length) extras.push(["Resolved", s.tensions_resolved]);
  if (s.conditions?.length) extras.push(["Conditions", s.conditions]);
  if (s.unresolved?.quote) extras.push(["Hold-out", [`${displayName(state.byKey[s.unresolved.seat], s.unresolved.seat)}: ${s.unresolved.quote}`]]);
  if (s.next_steps?.length) {
    extras.push(["Next", s.next_steps.map((n) => (typeof n === "string" ? n : `${n.when}: ${n.action}`))]);
  }
  const foot = [];
  if (s.cheapest_test) foot.push(`Test: ${s.cheapest_test}`);
  if (s.kill_criteria) foot.push(`Kill: ${s.kill_criteria}`);
  if (s.disclaimer) foot.push(s.disclaimer);
  $("sigExtras").innerHTML = extras
    .map(([title, items]) => `<div class="sig-block"><div class="sig-block-title">${esc(title)}</div><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`)
    .join("");
  $("sigFoot").textContent = foot.join(" · ");
  setStep("signal");
}

function applySetup(d) {
  setComposerMode(true);
  $("topicTitle").textContent = d.title || d.decision || "Sitting";
  $("options").innerHTML = (d.options || []).map((o) => `<span class="opt">${esc(o.id)}: ${esc(o.label)}</span>`).join("");
  if (d.chair) state.chairKey = d.chair;
  renderSeats(d.seats || state.defaultSeats);
  setStep("opening");
}

function renderTensions(ev) {
  const lines = (ev.tensions || [])
    .map(
      (t) =>
        `<div class="tension-item"><div class="tension-q">${esc(t.question)}</div>${(t.sides || [])
          .map(
            (s) =>
              `<div class="tension-side"><span class="tension-pos">${esc(s.position)}</span><span class="tension-seats">${esc((s.seats || []).map((k) => displayName(state.byKey[k], k)).join(", "))}</span></div>`
          )
          .join("")}</div>`
    )
    .join("");
  $("tensionBox").innerHTML = lines || `<p class="muted">${esc(ev.note || "Tensions named.")}</p>`;
  if (ev.note && lines) {
    const n = document.createElement("p");
    n.className = "tension-note";
    n.textContent = ev.note;
    $("tensionBox").appendChild(n);
  }
}

function onEvent(ev) {
  if (ev.type === "setup") applySetup(ev);
  if (ev.type === "status") {
    if (ev.state === "awaiting_chair") showSittingStatus(ev);
    else hideSittingStatus();
  }
  if (ev.type === "phase") {
    const map = { opening: "opening", tensions: "tensions", synthesis: "synthesis", ratify: "ratify", signal: "signal" };
    if (map[ev.phase]) setStep(map[ev.phase]);
    if (ev.phase && ev.phase !== "opening") hideSittingStatus();
  }
  if (ev.type === "seat_done") showCaption(ev.seat, ev);
  if (ev.type === "tensions") {
    hideSittingStatus();
    renderTensions(ev);
    setStep("tensions");
  }
  if (ev.type === "draft") {
    setStep("synthesis");
    showCaption(state.chairKey || "dalio", { parsed: { call: ev.draft?.signal || "Synthesising…" }, text: "" });
  }
  if (ev.type === "signal") showSignal(ev);
  if (ev.type === "end") state.playing = false;
}

function delayFor(ev) {
  if (state.skip) return 0;
  const base = ev.type === "seat_done" ? 1400 : ev.type === "phase" ? 600 : 400;
  return state.replay ? base / state.speed : 0;
}

function drainQueue() {
  if (!state.queue.length) {
    state.playing = false;
    $("playbar").hidden = !state.replay;
    $("queueInfo").textContent = state.replay ? "Replay done" : "";
    return;
  }
  state.playing = true;
  $("playbar").hidden = false;
  $("queueInfo").textContent = `${state.queue.length} left`;
  const ev = state.queue.shift();
  onEvent(ev);
  setTimeout(drainQueue, delayFor(ev));
}

function enqueueEvents(events, replay = false) {
  state.queue = events.filter((e) => e.type !== "end");
  state.replay = replay;
  state.skip = false;
  if (!state.playing) drainQueue();
}

function resetStage({ preserveSittingStatus = false } = {}) {
  stopTalk();
  $("stage").classList.remove("live");
  $("spot").classList.remove("on");
  if (preserveSittingStatus) {
    $("waiting").hidden = true;
  } else {
    $("waiting").hidden = false;
    hideSittingStatus();
  }
  $("caption").hidden = true;
  const card = $("signalCard");
  card.hidden = true;
  card.classList.remove("minimized", "expanded");
  setComposerMode(false);
  $("tensionBox").innerHTML = '<span class="muted">Waiting for the field.</span>';
  $("feed").innerHTML =
    '<div class="empty" id="feedEmpty">One line per seat as the field speaks. Click a seat to open its card. Compose the table to swap who sits.</div>';
  for (const li of $("stepper").querySelectorAll("li")) li.classList.remove("on", "done");
}

function renderAttachList() {
  const list = $("attachList");
  if (!state.attachments.length) {
    list.hidden = true;
    list.innerHTML = "";
    return;
  }
  list.hidden = false;
  list.innerHTML = state.attachments.map((f, i) => `<li>${esc(f.name)} <button type="button" data-rm="${i}" aria-label="Remove">×</button></li>`).join("");
  list.querySelectorAll("[data-rm]").forEach((b) => {
    b.onclick = () => {
      state.attachments.splice(Number(b.dataset.rm), 1);
      renderAttachList();
    };
  });
}

function setComposerHint(text, ok = false) {
  const el = $("composerHint");
  el.textContent = text || "";
  el.classList.toggle("ok", ok);
}

async function fileToAttachment(file) {
  const buf = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return { name: file.name, data: btoa(binary) };
}

async function submitQuery(ev) {
  ev.preventDefault();
  const query = $("queryInput").value.trim();
  if (!query) {
    setComposerHint("Type a question for the board.");
    return;
  }
  if (STATIC || !state.writable) {
    setComposerHint("Local room needed — run npm start on this machine.");
    return;
  }
  $("querySubmit").disabled = true;
  setComposerHint("Opening sitting…");
  try {
    const attachments = await Promise.all(state.attachments.map(fileToAttachment));
    const chairKey = $("sittingChair")?.value || state.chairKey || "dalio";
    const res = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, attachments, chairKey }),
    });
    state.attachments = [];
    $("attachFiles").value = "";
    renderAttachList();
    $("queryInput").value = "";
    setComposerHint(res.hint || "Sitting opened. Run /silver-board in Claude Code.", true);
    if (res.id) {
      const awaiting = res.state === "awaiting_chair" || Boolean(res.handoff);
      if (awaiting) {
        showSittingStatus({
          state: res.state || "awaiting_chair",
          runner: res.thinking?.runner || "local",
          playbackRunner: res.runner || "viewer",
          handoff: res.handoff,
          note: res.hint,
        });
      }
      stream(res.id, false, { preserveSittingStatus: awaiting });
    }
  } catch (e) {
    setComposerHint(String(e.message || e));
  } finally {
    $("querySubmit").disabled = false;
  }
}

function bindDictate() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $("dictateBtn");
  if (!SR) {
    btn.disabled = true;
    btn.title = "Dictation not supported in this browser";
    return;
  }
  const rec = new SR();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = document.documentElement.lang || "en-US";
  state.recognition = rec;
  rec.onresult = (ev) => {
    const text = [...ev.results].map((r) => r[0].transcript).join("");
    $("queryInput").value = text.trim();
  };
  rec.onend = () => {
    state.dictating = false;
    btn.classList.remove("on");
  };
  rec.onerror = () => {
    state.dictating = false;
    btn.classList.remove("on");
  };
  btn.onclick = () => {
    if (state.dictating) {
      rec.stop();
      return;
    }
    try {
      rec.start();
      state.dictating = true;
      btn.classList.add("on");
    } catch {
      setComposerHint("Could not start dictation.");
    }
  };
}

function bindSignalCard() {
  const card = $("signalCard");
  const handle = $("sigDrag");
  const stage = $("stage");
  let drag = null;

  const onMove = (e) => {
    if (!drag) return;
    const rect = stage.getBoundingClientRect();
    const x = e.clientX - rect.left - drag.ox;
    const y = e.clientY - rect.top - drag.oy;
    card.style.left = `${Math.max(0, Math.min(x, rect.width - card.offsetWidth))}px`;
    card.style.top = `${Math.max(0, Math.min(y, rect.height - card.offsetHeight))}px`;
  };

  const onUp = () => {
    drag = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };

  handle.onpointerdown = (e) => {
    e.preventDefault();
    const rect = card.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    drag = { ox: e.clientX - rect.left, oy: e.clientY - rect.top };
    card.style.left = `${rect.left - stageRect.left}px`;
    card.style.top = `${rect.top - stageRect.top}px`;
    card.style.transform = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  $("sigMin").onclick = () => {
    card.classList.toggle("minimized");
    if (card.classList.contains("minimized")) card.classList.remove("expanded");
  };
  $("sigExpand").onclick = () => {
    card.classList.remove("minimized");
    card.classList.toggle("expanded");
  };
}

function stream(id, replay = false, opts = {}) {
  if (state.es) state.es.close();
  state.current = id;
  state.queue = [];
  state.playing = false;
  resetStage({ preserveSittingStatus: !!opts.preserveSittingStatus });
  if (STATIC) {
    api(`/api/sessions/${id}`).then((data) => enqueueEvents(data.events || [], true));
    return;
  }
  const es = new EventSource(`/api/stream/${encodeURIComponent(id)}`);
  state.es = es;
  const batch = [];
  es.onmessage = (m) => {
    if (!m.data || m.data.startsWith(":")) return;
    try {
      const ev = JSON.parse(m.data);
      if (ev.type === "end") {
        if (replay && batch.length) enqueueEvents(batch, true);
        state.playing = false;
        return;
      }
      if (replay) batch.push(ev);
      else onEvent(ev);
    } catch {
      /* ignore malformed */
    }
  };
}

function openCard(key) {
  const s = state.byKey[key];
  if (!s) return;
  const body = $("cardBody");
  body.innerHTML = `<div class="card-head">
      <span class="av">${esc(s.initials)}</span>
      <div><div class="label">${esc(s.pillar || "")}</div><h3 style="margin:0.15rem 0">${esc(s.name)}</h3>
      <p class="muted" style="margin:0">Owns: ${esc(s.question || "")}</p></div>
    </div>
    <p>${esc(s.dimension || "")}</p>
    <p class="muted">Simulation. Not ${esc(s.name)}. ${key === "stark" ? "Fictional seat." : ""}</p>
    <p><button class="ghost" type="button" data-edit="${esc(key)}">Edit knowledge</button></p>`;
  const av = body.querySelector(".av");
  const img = document.createElement("img");
  img.src = avatarUrl(key);
  img.alt = "";
  img.onload = () => {
    av.textContent = "";
    av.appendChild(img);
  };
  $("cardDialog").showModal();
  body.querySelector("[data-edit]")?.addEventListener("click", () => {
    $("cardDialog").close();
    openEditor(key);
  });
}

function advisorOptions(selected) {
  return Object.values(state.byKey)
    .map((a) => `<option value="${esc(a.key)}" ${a.key === selected ? "selected" : ""}>${esc(displayName(a, a.key))} — ${esc(a.pillar || a.archetype)}</option>`)
    .join("");
}

function fillSittingChair() {
  const sel = $("sittingChair");
  if (!sel) return;
  const current = sel.value || state.chairKey || "dalio";
  sel.innerHTML = advisorOptions(current);
  if (![...sel.options].some((o) => o.value === current)) sel.value = state.chairKey || "dalio";
  else sel.value = current;
}

function fillCompose() {
  const grid = $("composeGrid");
  const chair = state.chairKey;
  const seated = state.defaultSeats.filter((k) => k !== chair);
  const arch = state.archetypes.length ? state.archetypes : [{ id: "seat", name: "Seat" }];
  grid.innerHTML = `<label>Chair <select id="slot-chair">${advisorOptions(chair)}</select></label>` +
    arch
      .map((a, i) => {
        const current = seated.find((k) => state.byKey[k]?.archetype === a.id) || seated[i] || seated[0];
        return `<label>${esc(a.name)} <select data-arch="${esc(a.id)}">${advisorOptions(current)}</select></label>`;
      })
      .join("");
  $("composeNote").textContent = STATIC
    ? "GitHub Pages is a snapshot. Seating here is preview-only. To save brains, run the room locally (npm start)."
    : "Six seats plus the Chair. Saving writes board/roster.json and keeps one voice (Charter Art. 1).";
}

const NVIDIA_BASE_DEFAULT = "https://integrate.api.nvidia.com/v1";

function fillSettingsSeatSelect(selected) {
  const sel = $("settingsLocalFolderSeat");
  if (!sel) return;
  const current = selected || sel.value || state.chairKey || "dalio";
  sel.innerHTML = advisorOptions(current);
  if (![...sel.options].some((o) => o.value === current)) sel.value = state.chairKey || "dalio";
  else sel.value = current;
}

function syncSettingsFields() {
  const runtime = $("settingsRuntime")?.value || "local";
  const provider = $("settingsProvider");
  const showOllama = runtime === "ollama";
  const showApi = runtime === "api";
  $("settingsOllamaBaseLabel").hidden = !showOllama;
  $("settingsApiBaseLabel").hidden = !showApi;
  $("settingsApiKeyLabel").hidden = !showApi;
  const hint = $("settingsRuntimeHint");
  if (hint) {
    if (runtime === "cursor") {
      hint.hidden = false;
      hint.textContent =
        "Cursor = open this repo in Cursor and chair with the agent runtime (Composer) — same idea as Buzz Agents. Sittings stamp thinking-handoff.md.";
    } else if (runtime === "api") {
      hint.hidden = false;
      hint.textContent =
        "API (BYOK): pick Provider (Anthropic, OpenAI, NVIDIA, …), Model, and Key. Without a key, sittings fall back to local — cloud never defaults.";
    } else {
      hint.hidden = true;
      hint.textContent = "";
    }
  }
  if (!provider) return;
  if (runtime === "api") {
    provider.disabled = false;
    $("settingsModel").disabled = false;
    $("settingsApiKey").disabled = false;
    $("settingsApiBase").disabled = false;
    const apiOk = ["anthropic", "openai", "nvidia", "openai-compatible", "custom", "ollama"];
    if (!apiOk.includes(provider.value)) provider.value = "anthropic";
    if (provider.value === "nvidia" && !$("settingsApiBase").value.trim()) {
      $("settingsApiBase").value = NVIDIA_BASE_DEFAULT;
    }
  } else {
    const map = { local: "local", cursor: "cursor", "claude-code": "claude-code", ollama: "ollama" };
    if (map[runtime]) provider.value = map[runtime];
    $("settingsModel").disabled = false;
    if (showOllama) $("settingsOllamaBase").disabled = false;
  }
}

function onSettingsProviderChange() {
  const runtime = $("settingsRuntime")?.value || "local";
  if (runtime !== "api") return;
  const provider = $("settingsProvider")?.value;
  if (provider === "nvidia") {
    const base = $("settingsApiBase");
    if (base && (!base.value.trim() || base.value.includes("openai.com"))) {
      base.value = NVIDIA_BASE_DEFAULT;
      base.placeholder = NVIDIA_BASE_DEFAULT;
    }
  }
}

async function refreshRootsStatus() {
  const el = $("settingsRootsStatus");
  if (!el || STATIC || !state.writable) return;
  try {
    const roots = await api("/api/knowledge/roots");
    const local = roots.localFolder?.configured
      ? roots.localFolder.exists
        ? `${roots.localFolder.fileCount} file(s)`
        : roots.localFolder.error || "missing"
      : "not set";
    const vault = roots.obsidianVault?.configured
      ? roots.obsidianVault.exists
        ? `${roots.obsidianVault.fileCount} .md`
        : roots.obsidianVault.error || "missing"
      : "not set";
    el.hidden = false;
    el.textContent = `Roots — local: ${local}; Obsidian: ${vault}. Seat: ${roots.seat || "—"}.`;
  } catch (e) {
    el.hidden = false;
    el.textContent = String(e.message || e);
  }
}

function renderOperatorLog(entries = []) {
  const list = $("settingsOperatorLog");
  if (!list) return;
  if (!entries.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = entries
    .slice(0, 40)
    .map((e) => {
      const level = String(e.level || "info");
      const event = e.event || e.stage || "event";
      const when = e.ts ? String(e.ts).replace("T", " ").slice(0, 19) : "—";
      const hint = e.hint ? `<p class="ol-hint">${esc(e.hint)}</p>` : "";
      return `<li class="ol-level-${esc(level)}"><div class="ol-head"><span class="ol-event">${esc(event)}</span><span>${esc(level)}</span><span>${esc(when)}</span></div><p class="ol-msg">${esc(e.message || "")}</p>${hint}</li>`;
    })
    .join("");
}

async function refreshOperatorLog() {
  const depsHint = $("settingsDepsHint");
  if (STATIC || !state.writable) {
    renderOperatorLog([]);
    if (depsHint) depsHint.hidden = true;
    return;
  }
  try {
    if (depsHint) {
      if (state.deps && state.deps.extractOk === false) {
        depsHint.hidden = false;
        depsHint.textContent = state.deps.hint || `Missing deps: ${(state.deps.missing || []).join(", ")}. Run npm install.`;
      } else {
        depsHint.hidden = true;
        depsHint.textContent = "";
      }
    }
    const log = await api("/api/operator-log?limit=40");
    renderOperatorLog(log.entries || []);
  } catch (e) {
    renderOperatorLog([{ level: "error", event: "operator_log_read", message: String(e.message || e) }]);
  }
}

async function openSettings() {
  const note = $("settingsNote");
  const msg = $("settingsMsg");
  const dlg = $("settings");
  const cta = $("settingsPagesCta");
  msg.hidden = true;
  if (STATIC || !state.writable) {
    note.textContent = "Local room needed — Settings write paths are 127.0.0.1 only (Precedence 01).";
    dlg.classList.add("pages-static");
    if (cta) cta.hidden = false;
    $("settings").showModal();
    return;
  }
  dlg.classList.remove("pages-static");
  if (cta) cta.hidden = true;
  $("settingsForm").querySelectorAll("input, select, button").forEach((el) => {
    el.disabled = false;
  });
  fillSettingsSeatSelect(state.chairKey);
  try {
    const s = await api("/api/settings");
    const runtime = s.thinking?.runtime || "local";
    $("settingsRuntime").value = runtime;
    const prov =
      s.thinking?.provider ||
      (runtime === "api" ? s.thinking?.api?.provider : runtime) ||
      "local";
    $("settingsProvider").value = prov;
    $("settingsModel").value = s.thinking?.model || "";
    $("settingsOllamaBase").value = s.thinking?.local?.ollama?.baseUrl || "http://127.0.0.1:11434";
    $("settingsApiBase").value =
      s.thinking?.api?.baseUrl || (prov === "nvidia" ? NVIDIA_BASE_DEFAULT : "");
    $("settingsApiKey").value = "";
    $("settingsApiKey").placeholder = s.thinking?.api?.apiKeySet
      ? `set (${s.thinking.api.apiKey || "••••"})`
      : "optional BYOK — NVIDIA / Anthropic / OpenAI";
    $("settingsLocalFolder").value = s.knowledge?.localFolder || "";
    $("settingsObsidianVault").value = s.knowledge?.obsidianVault || "";
    $("settingsWatchLocal").checked = !!s.knowledge?.watchLocal;
    fillSettingsSeatSelect(s.knowledge?.localFolderSeat || state.chairKey);
    if (s.presets?.nvidiaBaseUrl) {
      $("settingsApiBase").placeholder = s.presets.nvidiaBaseUrl;
    }
    syncSettingsFields();
    note.textContent =
      "Default LLM for all members. Local room only (127.0.0.1). Override per member in Edit a member’s brain. Cloud/API never default. Keys stay in board/secrets.json — never on Pages.";
    await refreshRootsStatus();
    await refreshOperatorLog();
  } catch (e) {
    note.textContent = String(e.message || e);
  }
  $("settings").showModal();
}

async function saveSettings(ev) {
  ev.preventDefault();
  const msg = $("settingsMsg");
  msg.hidden = false;
  if (STATIC || !state.writable) {
    msg.textContent = "Local room needed — open http://127.0.0.1:7770";
    return;
  }
  try {
    const runtime = $("settingsRuntime").value;
    const provider = $("settingsProvider").value;
    let apiBase = $("settingsApiBase").value.trim();
    if (runtime === "api" && provider === "nvidia" && !apiBase) apiBase = NVIDIA_BASE_DEFAULT;
    const body = {
      thinking: {
        runtime,
        provider,
        model: $("settingsModel").value.trim(),
        local: {
          ollama: {
            baseUrl: $("settingsOllamaBase").value.trim(),
            model: runtime === "ollama" ? $("settingsModel").value.trim() : "",
          },
        },
        api: {
          provider: runtime === "api" ? provider : "anthropic",
          model: runtime === "api" ? $("settingsModel").value.trim() : "",
          baseUrl: apiBase,
        },
      },
      knowledge: {
        localFolder: $("settingsLocalFolder").value.trim(),
        localFolderSeat: $("settingsLocalFolderSeat").value,
        watchLocal: !!$("settingsWatchLocal").checked,
        obsidianVault: $("settingsObsidianVault").value.trim(),
      },
    };
    const key = $("settingsApiKey").value.trim();
    if (key) body.thinking.api.apiKey = key;
    const saved = await api("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    $("settingsApiKey").value = "";
    $("settingsApiKey").placeholder = saved.thinking?.api?.apiKeySet
      ? `set (${saved.thinking.api.apiKey || "••••"})`
      : "optional BYOK — NVIDIA / Anthropic / OpenAI";
    let planNote = saved.thinking?.runtime || "local";
    try {
      const plan = await api("/api/thinking");
      planNote = `${plan.used?.runner || "local"} (${plan.used?.runtime || plan.used?.mode || "local"})`;
      state.thinkingRunner = plan.used?.runner;
    } catch {
      /* ignore */
    }
    await refreshRootsStatus();
    msg.textContent = `Saved — sittings use ${planNote}. Playback runner stays viewer.`;
  } catch (e) {
    msg.textContent = String(e.message || e);
  }
}

async function linkSettingsRoot(source) {
  const msg = $("settingsMsg");
  msg.hidden = false;
  if (STATIC || !state.writable) {
    msg.textContent = "Local room needed — open http://127.0.0.1:7770";
    return;
  }
  try {
    // Persist paths first so link sees configured roots
    await saveSettings({ preventDefault() {} });
    const key = $("settingsLocalFolderSeat").value || state.chairKey;
    const result = await api("/api/knowledge/roots/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, key, limit: 50 }),
    });
    await refreshRootsStatus();
    msg.textContent = `Linked ${result.linked} from ${source} → ${key}` +
      (result.skipped ? ` (${result.skipped} skipped)` : "");
  } catch (e) {
    msg.textContent = String(e.message || e);
  }
}

async function saveTable() {
  const chair = $("slot-chair").value;
  const picks = [...document.querySelectorAll("#composeGrid select[data-arch]")].map((s) => s.value);
  const defaultSeats = [...new Set(picks.filter((k) => k !== chair))];
  $("saveMsg").hidden = false;
  try {
    if (STATIC || !state.writable) {
      localStorage.setItem(TABLE_STORE, JSON.stringify({ chairKey: chair, defaultSeats }));
      $("saveMsg").textContent = "Preview saved in this browser. Local room needed to persist the roster.";
    } else {
      await api("/api/table", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chairKey: chair, defaultSeats }),
      });
      $("saveMsg").textContent = "Table written. Next /silver-board sitting uses these seats unless you pass --seats.";
    }
    state.chairKey = chair;
    state.defaultSeats = defaultSeats;
    renderSeats(defaultSeats);
    fillSittingChair();
  } catch (e) {
    $("saveMsg").textContent = String(e.message || e);
  }
}

function populateArch() {
  $("archSelect").innerHTML = state.archetypes.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");
}

function renderKnowledgeList(knowledge) {
  const list = $("knowledgeList");
  const items = knowledge?.ledger?.items || [];
  if (!items.length) {
    list.innerHTML = `<li class="muted" style="border:0;background:transparent;padding:0.2rem 0">Inbox empty</li>`;
    return;
  }
  list.innerHTML = items
    .map(
      (i) =>
        `<li><span class="k-meta">${esc(i.kind)}</span><span class="k-title" title="${esc(i.title)}">${esc(i.title)}</span><span class="k-status">${esc(i.status || "queued")}</span><button type="button" data-rm="${esc(i.id)}" aria-label="Remove">×</button></li>`
    )
    .join("");
  list.querySelectorAll("[data-rm]").forEach((b) => {
    b.onclick = () => removeKnowledgeItem(b.dataset.rm);
  });
}

function setKnowledgePaneMode(enabled, note) {
  const pane = $("knowledgePane");
  const cta = $("knowledgePagesCta");
  const ingest = $("knowledgeIngest");
  if (STATIC) {
    pane.classList.add("pages-static");
    pane.classList.remove("disabled");
    if (cta) cta.hidden = false;
    if (ingest) ingest.hidden = true;
    $("knowledgeNote").textContent =
      note || "Knowledge files are not on GitHub Pages. Use the local room (127.0.0.1) to ingest.";
    return;
  }
  pane.classList.remove("pages-static");
  if (cta) cta.hidden = true;
  if (ingest) ingest.hidden = false;
  pane.classList.toggle("disabled", !enabled);
  if (note) $("knowledgeNote").textContent = note;
  else if (enabled) {
    $("knowledgeNote").textContent =
      "Drop PDFs, MD, TXT, DOCX, bib/ris, or captions into this seat's local inbox. Links append ledger.json. Distill does not call a hosted model.";
  }
}

function showEditorMsg(text) {
  $("editorMsg").hidden = false;
  $("editorMsg").textContent = text;
}

function ingestBlockedReason(key) {
  if (STATIC) {
    return "Knowledge ingest is not available on GitHub Pages. Run npm start → http://127.0.0.1:7770";
  }
  if (!state.writable) return "Local room is read-only; cannot ingest.";
  if (!key) return "Select a member first, then drop, choose a file, or add a link.";
  return "";
}

function fillEditorMemberSelect(selected) {
  const sel = $("editorMemberSelect");
  if (!sel) return;
  const keys = Object.keys(state.byKey).sort((a, b) =>
    displayName(state.byKey[a], a).localeCompare(displayName(state.byKey[b], b)),
  );
  const pick = selected && state.byKey[selected] ? selected : keys[0] || "";
  sel.innerHTML = keys
    .map(
      (k) =>
        `<option value="${esc(k)}" ${k === pick ? "selected" : ""}>${esc(displayName(state.byKey[k], k))} — ${esc(state.byKey[k]?.pillar || state.byKey[k]?.archetype || k)}</option>`,
    )
    .join("");
  if (pick) sel.value = pick;
}

function setEditorChrome(isNew) {
  const memberLabel = $("editorMemberLabel");
  const seatLabel = $("editorSeatModeLabel");
  if (memberLabel) memberLabel.hidden = !!isNew;
  if (seatLabel) seatLabel.hidden = !!isNew;
  const seatMode = $("editorSeatMode");
  if (seatMode) seatMode.disabled = !!isNew || STATIC || !state.writable;
}

async function loadSeatMode(key) {
  const sel = $("editorSeatMode");
  if (!sel) return;
  if (!key || STATIC || !state.writable) {
    sel.value = "inherit";
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  try {
    const s = await api("/api/settings");
    const mode = s.seats?.[key]?.mode || "inherit";
    sel.value = ["inherit", "local", "api"].includes(mode) ? mode : "inherit";
  } catch {
    sel.value = "inherit";
  }
}

async function saveSeatMode(key, mode) {
  if (!key || STATIC || !state.writable) return null;
  const allowed = ["inherit", "local", "api"];
  const next = allowed.includes(mode) ? mode : "inherit";
  return api("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seats: { [key]: { mode: next } } }),
  });
}

async function loadKnowledge(key) {
  state.editorKey = key;
  if (STATIC) {
    setKnowledgePaneMode(false);
    renderKnowledgeList({ ledger: { items: [] } });
    return;
  }
  if (!state.writable || !key) {
    setKnowledgePaneMode(false, "Local room needed to ingest.");
    renderKnowledgeList({ ledger: { items: [] } });
    return;
  }
  setKnowledgePaneMode(true);
  try {
    const data = await api(`/api/advisor/${encodeURIComponent(key)}`);
    renderKnowledgeList(data.knowledge);
  } catch (e) {
    renderKnowledgeList({ ledger: { items: [] } });
    $("knowledgeNote").textContent = String(e.message || e);
    showEditorMsg(String(e.message || e));
  }
}

async function uploadKnowledgeFiles(files) {
  const key = state.editorKey;
  const blocked = ingestBlockedReason(key);
  if (blocked) {
    showEditorMsg(blocked);
    return;
  }
  if (!files?.length) {
    showEditorMsg("No files selected.");
    return;
  }
  try {
    for (const file of files) {
      const attachment = await fileToAttachment(file);
      await api(`/api/advisor/${encodeURIComponent(key)}/inbox`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(attachment),
      });
    }
    const data = await api(`/api/advisor/${encodeURIComponent(key)}`);
    renderKnowledgeList(data.knowledge);
    showEditorMsg(`Added ${files.length} file(s) to inbox/.`);
  } catch (e) {
    showEditorMsg(String(e.message || e));
  }
}

async function addKnowledgeLink() {
  const key = state.editorKey;
  const blocked = ingestBlockedReason(key);
  if (blocked) {
    showEditorMsg(blocked);
    return;
  }
  const url = $("linkUrl").value.trim();
  if (!url) {
    showEditorMsg("Enter a URL for the citation.");
    return;
  }
  try {
    await api(`/api/advisor/${encodeURIComponent(key)}/inbox`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, title: $("linkTitle").value.trim(), kind: $("linkKind").value }),
    });
    $("linkUrl").value = "";
    $("linkTitle").value = "";
    const data = await api(`/api/advisor/${encodeURIComponent(key)}`);
    renderKnowledgeList(data.knowledge);
    showEditorMsg("Link appended to ledger.json.");
  } catch (e) {
    showEditorMsg(String(e.message || e));
  }
}

async function removeKnowledgeItem(id) {
  const key = state.editorKey;
  const blocked = ingestBlockedReason(key);
  if (blocked) {
    showEditorMsg(blocked);
    return;
  }
  try {
    await api(`/api/advisor/${encodeURIComponent(key)}/inbox/${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await api(`/api/advisor/${encodeURIComponent(key)}`);
    renderKnowledgeList(data.knowledge);
    showEditorMsg("Removed from inbox.");
  } catch (e) {
    showEditorMsg(String(e.message || e));
  }
}

async function requestDistill() {
  const key = state.editorKey;
  const blocked = ingestBlockedReason(key);
  if (blocked) {
    showEditorMsg(blocked);
    return;
  }
  try {
    const res = await api(`/api/advisor/${encodeURIComponent(key)}/distill`, { method: "POST" });
    showEditorMsg(`Distill flag written (${res.queued} queued → distill-request.md). No hosted model called.`);
  } catch (e) {
    showEditorMsg(String(e.message || e));
  }
}

function bindKnowledgePane() {
  const drop = $("knowledgeDrop");
  $("knowledgePick").onclick = () => {
    const blocked = ingestBlockedReason(state.editorKey);
    if (blocked) {
      showEditorMsg(blocked);
      return;
    }
    $("knowledgeFiles").click();
  };
  $("knowledgeFiles").onchange = () => {
    const files = $("knowledgeFiles").files;
    if (files?.length) {
      uploadKnowledgeFiles([...files]).catch((e) => showEditorMsg(String(e.message || e)));
    } else {
      showEditorMsg("No files selected.");
    }
    $("knowledgeFiles").value = "";
  };
  $("linkAdd").onclick = () => addKnowledgeLink().catch((e) => showEditorMsg(String(e.message || e)));
  $("distillBtn").onclick = () => requestDistill().catch((e) => showEditorMsg(String(e.message || e)));
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    if (e.dataTransfer?.files?.length) {
      uploadKnowledgeFiles([...e.dataTransfer.files]).catch((err) => showEditorMsg(String(err.message || err)));
    } else {
      showEditorMsg("Drop contained no files.");
    }
  });
  $("editorMemberSelect")?.addEventListener("change", () => {
    const key = $("editorMemberSelect").value;
    if (!key || key === state.editorKey) return;
    openEditor(key, false).catch((e) => showEditorMsg(String(e.message || e)));
  });
  $("editorSeatMode")?.addEventListener("change", () => {
    const key = state.editorKey || $("editorForm")?.key?.value;
    if (!key) return;
    saveSeatMode(key, $("editorSeatMode").value)
      .then(() => showEditorMsg(`Model for ${displayName(state.byKey[key], key)}: ${$("editorSeatMode").selectedOptions[0]?.text || $("editorSeatMode").value}.`))
      .catch((e) => showEditorMsg(String(e.message || e)));
  });
}

async function openEditor(key, isNew = false) {
  const form = $("editorForm");
  form.reset();
  form.dataset.create = isNew ? "1" : "0";
  $("editorTitle").textContent = isNew ? "Add a member" : "Edit a member’s brain";
  form.key.readOnly = !isNew;
  populateArch();
  $("editorMsg").hidden = true;
  setEditorChrome(isNew);
  if (!isNew) {
    fillEditorMemberSelect(key || state.chairKey);
    key = $("editorMemberSelect")?.value || key || state.chairKey;
  }
  if (!isNew && key) {
    form.key.value = key;
    try {
      const data = STATIC ? { advisor: state.byKey[key], hot: "", sources: "" } : await api(`/api/advisor/${encodeURIComponent(key)}`);
      const a = data.advisor || state.byKey[key];
      form.name.value = a.name || "";
      form.short.value = a.short || "";
      form.initials.value = a.initials || "";
      form.slug.value = a.slug || "";
      form.archetype.value = a.archetype || "";
      form.pillar.value = a.pillar || "";
      form.color.value = a.color || "#c5cdd8";
      form.question.value = a.question || "";
      form.dimension.value = a.dimension || "";
      form.hot.value = data.hot || "";
      form.sources.value = data.sources || "";
      if (STATIC) {
        showEditorMsg("Knowledge files are not on GitHub Pages. Run npm start to edit _hot.md.");
      }
      await loadSeatMode(key);
      await loadKnowledge(key);
    } catch (e) {
      showEditorMsg(String(e.message || e));
    }
  } else {
    state.editorKey = null;
    setKnowledgePaneMode(false, "Save the member first, then ingest knowledge.");
    renderKnowledgeList({ ledger: { items: [] } });
    await loadSeatMode(null);
  }
  if (!$("editor").open) $("editor").showModal();
}

async function saveMember(ev) {
  ev.preventDefault();
  const form = $("editorForm");
  const create = form.dataset.create === "1";
  const body = {
    key: form.key.value.trim(),
    name: form.name.value.trim(),
    short: form.short.value.trim(),
    initials: form.initials.value.trim(),
    slug: form.slug.value.trim(),
    archetype: form.archetype.value,
    pillar: form.pillar.value.trim(),
    color: form.color.value,
    question: form.question.value.trim(),
    dimension: form.dimension.value.trim(),
    hot: form.hot.value,
    sources: form.sources.value,
  };
  if (STATIC || !state.writable) {
    showEditorMsg("Cannot write brains on GitHub Pages. Clone the private repo and npm start.");
    return;
  }
  try {
    const path = create ? "/api/advisor" : `/api/advisor/${encodeURIComponent(body.key)}`;
    const saved = await api(path, {
      method: create ? "POST" : "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const a = saved.advisor;
    state.byKey[a.key] = a;
    if (!create) {
      await saveSeatMode(a.key, $("editorSeatMode")?.value || "inherit");
      fillEditorMemberSelect(a.key);
    }
    showEditorMsg(`Saved ${displayName(a, a.key)}. Brain at .claude/skills/silver-board/brains/${a.slug}/`);
    fillCompose();
    if (create) {
      form.dataset.create = "0";
      form.key.readOnly = true;
      setEditorChrome(false);
      fillEditorMemberSelect(a.key);
      await loadSeatMode(a.key);
      await loadKnowledge(a.key);
    }
  } catch (e) {
    showEditorMsg(String(e.message || e));
  }
}

function onStageClick(e) {
  const seat = e.target.closest(".seat, .nameplate, .feed-card");
  if (!seat?.dataset.key) return;
  openCard(seat.dataset.key);
}

function sessionWhen(s) {
  if (s.started) return new Date(s.started);
  const m = String(s.id || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? new Date(m[1]) : null;
}

function sessionDateGroup(s) {
  const d = sessionWhen(s);
  if (!d || Number.isNaN(d.getTime())) return "Older";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = startToday - startDate;
  const day = 86400000;
  if (diff === 0) return "Today";
  if (diff === day) return "Yesterday";
  if (diff < 7 * day) return "Previous 7 days";
  return "Older";
}

function bindSessionClicks(root) {
  root.querySelectorAll("[data-id]").forEach((btn) => {
    btn.onclick = () => {
      stream(btn.dataset.id, true);
      $("history").close();
    };
  });
}

function renderSidebarSessions(sessions, filter = "") {
  const nav = $("sidebarNav");
  const q = filter.trim().toLowerCase();
  const items = (sessions || []).filter((s) => {
    if (!q) return true;
    return `${s.title || ""} ${s.id || ""} ${s.status || ""}`.toLowerCase().includes(q);
  });
  const order = ["Today", "Yesterday", "Previous 7 days", "Older"];
  const folders = [
    {
      id: "default",
      label: "Default table",
      sessions: items.filter((s) => s.status === "live" || s.status === "running" || s.status === "awaiting_chair"),
    },
    {
      id: "past",
      label: "Past sittings",
      sessions: items.filter((s) => s.status !== "live" && s.status !== "running" && s.status !== "awaiting_chair"),
    },
  ];
  let html = "";
  for (const folder of folders) {
    html += `<div class="sidebar-folder" data-folder="${esc(folder.id)}">
      <button type="button" class="sidebar-folder-toggle">${esc(folder.label)}</button>
      <div class="sidebar-folder-body">`;
    if (!folder.sessions.length) {
      html += `<p class="sidebar-empty muted">Empty</p>`;
    } else {
      const byGroup = new Map();
      for (const s of folder.sessions) {
        const g = sessionDateGroup(s);
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push(s);
      }
      for (const g of order) {
        const list = byGroup.get(g);
        if (!list?.length) continue;
        html += `<div class="sidebar-group"><div class="sidebar-group-title">${esc(g)}</div><ul class="sidebar-sessions">`;
        html += list
          .map(
            (s) =>
              `<li><button type="button" data-id="${esc(s.id)}" class="${s.id === state.current ? "active" : ""}">${esc(s.title || s.id)}</button></li>`
          )
          .join("");
        html += `</ul></div>`;
      }
    }
    html += `</div></div>`;
  }
  if (!items.length) {
    nav.innerHTML = `<div class="sidebar-empty muted">${q ? "No matches" : "No sittings yet"}</div>`;
    return;
  }
  nav.innerHTML = html;
  nav.querySelectorAll(".sidebar-folder-toggle").forEach((btn) => {
    btn.onclick = () => btn.closest(".sidebar-folder").classList.toggle("collapsed");
  });
  bindSessionClicks(nav);
}

async function refreshSessions() {
  const data = await api("/api/sessions");
  state.allSessions = data.sessions || [];
  renderSidebarSessions(state.allSessions, $("sessionSearch")?.value || "");
  return data;
}

async function openHistory() {
  const data = await refreshSessions();
  $("historyList").innerHTML =
    (data.sessions || [])
      .map((s) => `<li><button class="ghost replay" data-id="${esc(s.id)}" type="button">${esc(s.title || s.id)}</button> <span class="muted">${esc(s.status)}</span></li>`)
      .join("") || "<li class='muted'>None yet</li>";
  bindSessionClicks($("historyList"));
  $("history").showModal();
}

function bindField() {
  const panel = $("fieldPanel");
  const layout = document.querySelector(".layout");
  const expanded = localStorage.getItem(FIELD_STORE) === "expanded";
  panel.classList.toggle("collapsed", !expanded);
  layout.classList.toggle("field-collapsed", !expanded);
  $("fieldToggle").setAttribute("aria-label", expanded ? "Collapse Field" : "Expand Field");
  layoutStage();
  $("fieldToggle").onclick = () => {
    const next = panel.classList.contains("collapsed");
    panel.classList.toggle("collapsed", !next);
    layout.classList.toggle("field-collapsed", !next);
    localStorage.setItem(FIELD_STORE, next ? "expanded" : "collapsed");
    $("fieldToggle").setAttribute("aria-label", next ? "Collapse Field" : "Expand Field");
    layoutStage();
  };
}

function bindSidebar() {
  const sidebar = $("sidebar");
  const expanded = localStorage.getItem(SIDEBAR_STORE) === "expanded";
  sidebar.classList.toggle("collapsed", !expanded);
  $("sidebarToggle").setAttribute("aria-label", expanded ? "Collapse sidebar" : "Expand sidebar");
  layoutStage();
  $("sidebarToggle").onclick = () => {
    const next = !sidebar.classList.contains("collapsed");
    sidebar.classList.toggle("collapsed", next);
    localStorage.setItem(SIDEBAR_STORE, next ? "collapsed" : "expanded");
    $("sidebarToggle").setAttribute("aria-label", next ? "Expand sidebar" : "Collapse sidebar");
    layoutStage();
  };
  $("newSitting").onclick = () => {
    if (state.es) state.es.close();
    state.current = null;
    resetStage();
    $("queryInput").focus();
    setComposerHint(STATIC || !state.writable ? "Local room needed to run a sitting. Chrome preview only." : "Writes sessions/ on this machine. Chair with /silver-board in Claude Code.");
  };
  $("sessionSearch").oninput = () => renderSidebarSessions(state.allSessions || [], $("sessionSearch").value);
}

async function boot() {
  const seats = await api("/api/seats");
  state.byKey = Object.fromEntries((seats.advisors || []).map((a) => [a.key, a]));
  state.archetypes = seats.archetypes || [];
  state.chairKey = seats.chairKey || seats.chair?.key || "dalio";
  state.defaultSeats = seats.defaultSeats || [];
  state.writable = !!seats.writable && !STATIC;
  state.deps = seats.deps || null;
  if (seats.disclaimer) {
    $("disclaimer").textContent = seats.disclaimer;
  }
  const stored = (() => {
    try {
      return JSON.parse(localStorage.getItem(TABLE_STORE) || "null");
    } catch {
      return null;
    }
  })();
  if (stored?.defaultSeats?.length) {
    state.chairKey = stored.chairKey || state.chairKey;
    state.defaultSeats = stored.defaultSeats;
  }
  renderSeats(state.defaultSeats);
  fillSittingChair();
  setComposerMode(false);
  if (STATIC || !state.writable) {
    setComposerHint("Local room needed to run a sitting. Chrome preview only.");
  } else if (state.deps?.extractOk === false && state.deps.hint) {
    setComposerHint(state.deps.hint);
  } else {
    setComposerHint("Writes sessions/ on this machine. Chair with /silver-board in Claude Code.");
  }
  window.addEventListener("resize", layoutStage);
  bindSignalCard();
  bindDictate();

  $("composer").onsubmit = submitQuery;
  $("attachBtn").onclick = () => $("attachFiles").click();
  $("attachFiles").onchange = () => {
    state.attachments = [...state.attachments, ...$("attachFiles").files];
    $("attachFiles").value = "";
    renderAttachList();
  };

  bindSidebar();
  bindField();
  bindKnowledgePane();

  $("guideBtn").onclick = () => $("guide").showModal();
  $("guideClose").onclick = () => $("guide").close();
  $("historyClose").onclick = () => $("history").close();
  $("waitHistory").onclick = openHistory;
  $("settingsBtn").onclick = openSettings;
  $("settingsClose").onclick = () => $("settings").close();
  $("settingsClosePages")?.addEventListener("click", () => $("settings").close());
  $("settingsForm").onsubmit = saveSettings;
  $("settingsRuntime")?.addEventListener("change", syncSettingsFields);
  $("settingsProvider")?.addEventListener("change", onSettingsProviderChange);
  $("settingsLinkLocal")?.addEventListener("click", () => linkSettingsRoot("local"));
  $("settingsLinkVault")?.addEventListener("click", () => linkSettingsRoot("obsidian"));
  $("settingsRefreshLog")?.addEventListener("click", () => refreshOperatorLog());
  $("composeBtn").onclick = () => {
    fillCompose();
    $("saveMsg").hidden = true;
    $("compose").showModal();
  };
  $("waitCompose").onclick = $("composeBtn").onclick;
  $("composeClose").onclick = () => $("compose").close();
  $("saveTable").onclick = saveTable;
  $("editMember").onclick = () => openEditor($("slot-chair")?.value || state.chairKey, false);
  $("addMember").onclick = () => openEditor("", true);
  $("editorClose").onclick = () => $("editor").close();
  $("cardClose").onclick = () => $("cardDialog").close();
  $("editorForm").onsubmit = saveMember;
  $("stage").onclick = onStageClick;
  $("feed").onclick = onStageClick;
  $("skipBtn").onclick = () => {
    state.skip = true;
  };
  $("playbar").querySelectorAll("[data-speed]").forEach((b) => {
    b.onclick = () => {
      state.speed = Number(b.dataset.speed);
      $("playbar").querySelectorAll("[data-speed]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    };
  });

  const sess = await refreshSessions();
  const live = sess.live || sess.running;
  if (live) stream(live, false);
  else if (STATIC && sess.sessions?.[0]) stream(sess.sessions[0].id, true);

  if (!STATIC) {
    setInterval(async () => {
      if (state.current && state.playing) return;
      const data = await refreshSessions();
      if (data.live && data.live !== state.current) stream(data.live, false);
    }, 2000);
  }
}

boot().catch((e) => {
  $("tensionBox").textContent = String(e);
});
