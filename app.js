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
    const tw = rx * 2 * 0.32;
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

function showCaption(seat, ev) {
  $("waiting").hidden = true;
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
  if (ev.type === "phase") {
    const map = { opening: "opening", tensions: "tensions", synthesis: "synthesis", ratify: "ratify", signal: "signal" };
    if (map[ev.phase]) setStep(map[ev.phase]);
  }
  if (ev.type === "seat_done") showCaption(ev.seat, ev);
  if (ev.type === "tensions") {
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

function resetStage() {
  stopTalk();
  $("stage").classList.remove("live");
  $("spot").classList.remove("on");
  $("waiting").hidden = false;
  $("caption").hidden = true;
  const card = $("signalCard");
  card.hidden = true;
  card.classList.remove("minimized", "expanded");
  setComposerMode(false);
  $("tensionBox").innerHTML = '<span class="muted">Waiting for the field.</span>';
  $("feed").innerHTML = '<div class="empty" id="feedEmpty">One line per seat as the field speaks. Click a seat to open its card. Compose the table to swap who sits.</div>';
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
    const res = await api("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, attachments }),
    });
    state.attachments = [];
    $("attachFiles").value = "";
    renderAttachList();
    $("queryInput").value = "";
    setComposerHint(res.hint || "Sitting opened. Run /silver-board in Claude Code.", true);
    if (res.id) stream(res.id, false);
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

function stream(id, replay = false) {
  if (state.es) state.es.close();
  state.current = id;
  state.queue = [];
  state.playing = false;
  resetStage();
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

function fillCompose() {
  const grid = $("composeGrid");
  const chair = state.chairKey;
  const seated = state.defaultSeats.filter((k) => k !== chair);
  const arch = state.archetypes.length ? state.archetypes : [{ id: "seat", name: "Seat" }];
  const options = (selected) =>
    Object.values(state.byKey)
      .map((a) => `<option value="${esc(a.key)}" ${a.key === selected ? "selected" : ""}>${esc(displayName(a, a.key))} — ${esc(a.pillar || a.archetype)}</option>`)
      .join("");
  grid.innerHTML = `<label>Chair <select id="slot-chair">${options(chair)}</select></label>` +
    arch
      .map((a, i) => {
        const current = seated.find((k) => state.byKey[k]?.archetype === a.id) || seated[i] || seated[0];
        return `<label>${esc(a.name)} <select data-arch="${esc(a.id)}">${options(current)}</select></label>`;
      })
      .join("");
  $("composeNote").textContent = STATIC
    ? "GitHub Pages is a snapshot. Seating here is preview-only. To save brains, run the room locally (npm start)."
    : "Six seats plus the Chair. Saving writes board/roster.json and keeps one voice (Charter Art. 1).";
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
  $("knowledgePane").classList.toggle("disabled", !enabled);
  if (note) $("knowledgeNote").textContent = note;
}

async function loadKnowledge(key) {
  state.editorKey = key;
  if (STATIC || !state.writable || !key) {
    setKnowledgePaneMode(false, "Local room needed to ingest. Chrome preview only.");
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
  }
}

async function uploadKnowledgeFiles(files) {
  const key = state.editorKey;
  if (!key || STATIC || !state.writable) return;
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
  $("editorMsg").hidden = false;
  $("editorMsg").textContent = `Added ${files.length} file(s) to inbox/.`;
}

async function addKnowledgeLink() {
  const key = state.editorKey;
  if (!key || STATIC || !state.writable) return;
  const url = $("linkUrl").value.trim();
  if (!url) {
    $("editorMsg").hidden = false;
    $("editorMsg").textContent = "Enter a URL for the citation.";
    return;
  }
  await api(`/api/advisor/${encodeURIComponent(key)}/inbox`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, title: $("linkTitle").value.trim(), kind: $("linkKind").value }),
  });
  $("linkUrl").value = "";
  $("linkTitle").value = "";
  const data = await api(`/api/advisor/${encodeURIComponent(key)}`);
  renderKnowledgeList(data.knowledge);
  $("editorMsg").hidden = false;
  $("editorMsg").textContent = "Link appended to ledger.json.";
}

async function removeKnowledgeItem(id) {
  const key = state.editorKey;
  if (!key || STATIC || !state.writable) return;
  await api(`/api/advisor/${encodeURIComponent(key)}/inbox/${encodeURIComponent(id)}`, { method: "DELETE" });
  const data = await api(`/api/advisor/${encodeURIComponent(key)}`);
  renderKnowledgeList(data.knowledge);
}

async function requestDistill() {
  const key = state.editorKey;
  if (!key || STATIC || !state.writable) return;
  const res = await api(`/api/advisor/${encodeURIComponent(key)}/distill`, { method: "POST" });
  $("editorMsg").hidden = false;
  $("editorMsg").textContent = `Distill flag written (${res.queued} queued → distill-request.md). No hosted model called.`;
}

function bindKnowledgePane() {
  const drop = $("knowledgeDrop");
  $("knowledgePick").onclick = () => $("knowledgeFiles").click();
  $("knowledgeFiles").onchange = () => {
    if ($("knowledgeFiles").files.length) uploadKnowledgeFiles([...$("knowledgeFiles").files]);
    $("knowledgeFiles").value = "";
  };
  $("linkAdd").onclick = () => addKnowledgeLink().catch((e) => {
    $("editorMsg").hidden = false;
    $("editorMsg").textContent = String(e.message || e);
  });
  $("distillBtn").onclick = () => requestDistill().catch((e) => {
    $("editorMsg").hidden = false;
    $("editorMsg").textContent = String(e.message || e);
  });
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    if (e.dataTransfer?.files?.length) uploadKnowledgeFiles([...e.dataTransfer.files]).catch((err) => {
      $("editorMsg").hidden = false;
      $("editorMsg").textContent = String(err.message || err);
    });
  });
}

async function openEditor(key, isNew = false) {
  const form = $("editorForm");
  form.reset();
  form.dataset.create = isNew ? "1" : "0";
  $("editorTitle").textContent = isNew ? "Add a member" : "Edit member";
  form.key.readOnly = !isNew;
  populateArch();
  $("editorMsg").hidden = true;
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
        $("editorMsg").hidden = false;
        $("editorMsg").textContent = "Knowledge files are not on GitHub Pages. Run npm start to edit _hot.md.";
      }
      await loadKnowledge(key);
    } catch (e) {
      $("editorMsg").hidden = false;
      $("editorMsg").textContent = String(e.message || e);
    }
  } else {
    state.editorKey = null;
    setKnowledgePaneMode(false, "Save the member first, then ingest knowledge.");
    renderKnowledgeList({ ledger: { items: [] } });
  }
  $("editor").showModal();
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
  $("editorMsg").hidden = false;
  if (STATIC || !state.writable) {
    $("editorMsg").textContent = "Cannot write brains on GitHub Pages. Clone the private repo and npm start.";
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
    $("editorMsg").textContent = `Saved ${displayName(a, a.key)}. Brain at .claude/skills/silver-board/brains/${a.slug}/`;
    fillCompose();
  } catch (e) {
    $("editorMsg").textContent = String(e.message || e);
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
    { id: "default", label: "Default table", sessions: items.filter((s) => s.status === "live" || s.status === "running") },
    { id: "past", label: "Past sittings", sessions: items.filter((s) => s.status !== "live" && s.status !== "running") },
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
  setComposerMode(false);
  if (STATIC || !state.writable) {
    setComposerHint("Local room needed to run a sitting. Chrome preview only.");
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
