const $ = (id) => document.getElementById(id);
const STATIC = !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const state = { seats: [], byKey: {}, current: null, es: null, queue: [], playing: false, replay: false };

function dataUrl(p) {
  if (!STATIC) return p;
  if (p === "/api/seats") return "data/seats.json";
  if (p === "/api/sessions") return "data/sessions.json";
  const m = String(p).match(/^\/api\/sessions\/(.+)$/);
  if (m) return `data/sessions/${m[1]}.json`;
  return p;
}

async function api(p) {
  const r = await fetch(dataUrl(p));
  if (!r.ok) throw new Error(`${p} ${r.status}`);
  return r.json();
}

function place(i, n, inner = false) {
  const r = inner ? 28 : 38;
  const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
  return { left: `${50 + Math.cos(a) * r}%`, top: `${50 + Math.sin(a) * r}%` };
}

function stanceClass(stance) {
  const s = String(stance || "").toLowerCase();
  if (/no|decline|hold/.test(s)) return "stance-no";
  if (/strong|yes|endorse/.test(s)) return "stance-yes";
  return "stance-mid";
}

function renderSeats(keys) {
  const box = $("seats");
  const list = $("seatList");
  box.innerHTML = "";
  list.innerHTML = "";
  keys.forEach((key, i) => {
    const s = state.byKey[key] || { key, short: key, initials: "?", color: "#c5cdd8" };
    const el = document.createElement("div");
    el.className = "seat";
    el.id = `seat-${key}`;
    el.dataset.key = key;
    Object.assign(el.style, place(i, keys.length));
    el.innerHTML = `<div class="av" style="border-color:${s.color};color:${s.color}">${s.initials}</div><div class="nm">${s.short}</div>`;
    box.appendChild(el);
    const li = document.createElement("li");
    li.id = `rail-${key}`;
    li.dataset.key = key;
    li.innerHTML = `<span class="rail-dot"></span><span class="rail-name">${s.short}</span><span class="rail-meta">${s.pillar || s.archetype || ""}</span>`;
    list.appendChild(li);
  });
  const chair = state.byKey.dalio;
  if (chair) {
    const c = document.createElement("div");
    c.className = "seat chair-seat";
    c.id = "seat-dalio";
    c.dataset.key = "dalio";
    Object.assign(c.style, { left: "50%", top: "14%" });
    c.innerHTML = `<div class="av chair-av" style="border-color:${chair.color};color:${chair.color}">${chair.initials}</div><div class="nm">Chair</div>`;
    box.appendChild(c);
  }
}

function setStep(step, label) {
  for (const li of $("stepper").querySelectorAll("li")) {
    li.classList.toggle("on", li.dataset.step === step);
    li.classList.toggle("done", stepOrder.indexOf(li.dataset.step) < stepOrder.indexOf(step));
  }
  if (label && $("phaseLabel")) $("phaseLabel").textContent = label;
}

const stepOrder = ["setup", "opening", "tensions", "synthesis", "ratify", "signal"];

function markSpeaking(seat) {
  for (const el of document.querySelectorAll(".seat")) el.classList.remove("speaking");
  const node = $(`seat-${seat}`);
  if (node) node.classList.add("speaking");
  for (const li of document.querySelectorAll("#seatList li")) {
    li.classList.toggle("active", li.dataset.key === seat);
    if (li.dataset.key === seat) li.classList.add("spoken");
  }
}

function formatSpeech(ev) {
  const p = ev.parsed || {};
  const tag = ev.round === 2 ? "Ratify" : ev.round === 1 ? "Opening" : "";
  const headline = p.call || p.oneLine || firstLine(ev.text);
  const sub = p.oneLine && p.call ? p.oneLine : "";
  const badge = ev.round === 2 && p.vote ? p.vote : p.stance || "";
  return { headline, sub, badge, tag, ruin: p.ruin, flag: p.flag };
}

function firstLine(text) {
  const m = String(text || "").match(/THE CALL:\s*(.+)/i);
  return m ? m[1].trim() : String(text || "").slice(0, 220);
}

function showCaption(seat, ev) {
  $("waiting").hidden = true;
  $("signalCard").hidden = true;
  $("caption").hidden = false;
  const s = state.byKey[seat] || { initials: "?", short: seat, color: "#c5cdd8" };
  const f = typeof ev === "string" ? { headline: ev, sub: "", badge: "", tag: "" } : formatSpeech(ev);
  $("capAv").textContent = s.initials;
  $("capAv").style.borderColor = s.color;
  $("capAv").style.color = s.color;
  $("capWho").textContent = s.short || s.name || seat;
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
}

function showSignal(sig) {
  $("waiting").hidden = true;
  $("caption").hidden = true;
  $("signalCard").hidden = false;
  for (const el of document.querySelectorAll(".seat")) el.classList.remove("speaking");
  const s = sig.signal || sig;
  $("sigLabel").textContent = s.label || "SIGNAL";
  $("sigOption").textContent = s.option ? `Option ${s.option}` : "";
  $("sigOption").hidden = !s.option;
  $("sigCall").textContent = s.call || s.signal || "";
  const extras = [];
  if (s.tensions_resolved?.length) extras.push(["Resolved", s.tensions_resolved]);
  if (s.conditions?.length) extras.push(["Conditions", s.conditions]);
  if (s.unresolved?.quote) extras.push(["Hold-out", [`${state.byKey[s.unresolved.seat]?.short || s.unresolved.seat}: ${s.unresolved.quote}`]]);
  if (s.next_steps?.length) {
    const steps = s.next_steps.map((n) => (typeof n === "string" ? n : `${n.when}: ${n.action}`));
    extras.push(["Next", steps]);
  }
  const foot = [];
  if (s.cheapest_test) foot.push(`Test: ${s.cheapest_test}`);
  if (s.kill_criteria) foot.push(`Kill: ${s.kill_criteria}`);
  if (s.disclaimer) foot.push(s.disclaimer);
  const box = $("sigExtras");
  box.innerHTML = extras
    .map(
      ([title, items]) =>
        `<div class="sig-block"><div class="sig-block-title">${title}</div><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul></div>`
    )
    .join("");
  $("sigFoot").textContent = foot.join(" · ");
  setStep("signal", "The Board speaks");
}

function applySetup(d) {
  $("topic").hidden = false;
  $("topicTitle").textContent = d.title || d.decision || "Sitting";
  $("options").innerHTML = (d.options || []).map((o) => `<span class="opt">${o.id}: ${o.label}</span>`).join("");
  renderSeats(d.seats || []);
  setStep("opening", "Frame set");
}

function renderTensions(ev) {
  const lines = (ev.tensions || [])
    .map(
      (t) =>
        `<div class="tension-item"><div class="tension-q">${t.question}</div>${(t.sides || [])
          .map((s) => `<div class="tension-side"><span class="tension-pos">${s.position}</span><span class="tension-seats">${(s.seats || []).map((k) => state.byKey[k]?.short || k).join(", ")}</span></div>`)
          .join("")}</div>`
    )
    .join("");
  $("tensionBox").innerHTML = lines || `<p class="muted">${ev.note || "Tensions named."}</p>`;
  if (ev.note && lines) $("tensionBox").insertAdjacentHTML("beforeend", `<p class="tension-note">${ev.note}</p>`);
}

function onEvent(ev) {
  if (ev.type === "setup") applySetup(ev);
  if (ev.type === "phase") {
    const map = { opening: "opening", tensions: "tensions", synthesis: "synthesis", ratify: "ratify", signal: "signal" };
    if (map[ev.phase]) setStep(map[ev.phase], ev.label || "");
  }
  if (ev.type === "seat_done") showCaption(ev.seat, ev);
  if (ev.type === "tensions") {
    renderTensions(ev);
    setStep("tensions", "Tensions named");
  }
  if (ev.type === "draft") {
    setStep("synthesis", "Silver Pill synthesis");
    showCaption("dalio", { parsed: { call: ev.draft?.signal || "Synthesising…" }, text: "" });
  }
  if (ev.type === "signal") showSignal(ev);
  if (ev.type === "end") state.playing = false;
}

function enqueueEvents(events, replay = false) {
  state.queue = events.filter((e) => e.type !== "end");
  state.replay = replay;
  if (!state.playing) drainQueue();
}

function drainQueue() {
  if (!state.queue.length) {
    state.playing = false;
    return;
  }
  state.playing = true;
  const ev = state.queue.shift();
  onEvent(ev);
  const delay = state.replay ? (ev.type === "seat_done" ? 1400 : ev.type === "phase" ? 600 : 400) : 0;
  setTimeout(drainQueue, delay);
}

function resetStage() {
  if (state.es) state.es.close();
  state.queue = [];
  state.playing = false;
  $("waiting").hidden = false;
  $("caption").hidden = true;
  $("signalCard").hidden = true;
  $("topic").hidden = true;
  $("tensionBox").innerHTML = '<span class="muted">Waiting for the field.</span>';
  for (const li of $("stepper").querySelectorAll("li")) li.classList.remove("on", "done");
  for (const li of document.querySelectorAll("#seatList li")) li.classList.remove("active", "spoken");
}

async function stream(id, replay = false) {
  resetStage();
  state.current = id;
  if (STATIC) {
    const s = await api(`/api/sessions/${id}`);
    enqueueEvents(s.events || [], true);
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

async function boot() {
  const seats = await api("/api/seats");
  state.byKey = Object.fromEntries((seats.advisors || []).map((a) => [a.key, a]));
  renderSeats(seats.defaultSeats || []);

  if (STATIC) {
    const wait = $("waiting");
    wait.querySelector("h2").textContent = "Watch a sitting";
    wait.querySelector("p").textContent = "This public page is a static replay. Live sittings still run on your machine: npm start → http://localhost:7770.";
    const code = wait.querySelector("code");
    if (code) code.textContent = "Past sittings → replay the example";
  }

  $("guideBtn").onclick = () => $("guide").showModal();
  $("guideClose").onclick = () => $("guide").close();
  $("historyClose").onclick = () => $("history").close();
  $("historyBtn").onclick = async () => {
    const data = await api("/api/sessions");
    $("historyList").innerHTML =
      (data.sessions || [])
        .map(
          (s) =>
            `<li><button class="ghost replay" data-id="${s.id}">${s.title || s.id}</button> <span class="muted">${s.status}</span></li>`
        )
        .join("") || "<li class='muted'>None yet</li>";
    $("history").showModal();
    $("historyList").onclick = (e) => {
      const btn = e.target.closest("[data-id]");
      if (!btn) return;
      stream(btn.dataset.id, true);
      $("history").close();
    };
  };

  const sess = await api("/api/sessions");
  if (STATIC) {
    const demo = (sess.sessions || [])[0];
    if (demo) stream(demo.id, true);
    return;
  }
  const live = sess.live || sess.running;
  if (live) stream(live, false);

  const tick = async () => {
    if (state.current && state.playing) return;
    const data = await api("/api/sessions");
    if (data.live && data.live !== state.current) stream(data.live, false);
  };
  setInterval(tick, 2000);
}

boot().catch((e) => {
  $("tensionBox").textContent = String(e);
});
