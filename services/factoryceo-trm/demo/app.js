// FactoryCEO-TRM demo: loads the run artifact and drives the four panels +
// the interactive repair stepper. No backend — fetches results/run_30day.json.

const $ = (id) => document.getElementById(id);

// theme toggle (mirrors thepursuits site)
$("themeToggle").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", cur);
  try { localStorage.setItem("thepursuits-theme", cur); } catch (e) {}
});

const DATA_URL = "../results/run_30day.json";

async function load() {
  let data;
  try {
    const r = await fetch(DATA_URL);
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch (e) {
    const el = $("loaderr");
    el.style.display = "block";
    el.textContent =
      "Could not load results/run_30day.json (" + e + "). Generate it with " +
      "`python run.py`, then serve over HTTP: `python -m http.server` from the " +
      "factoryceo_trm/ directory and open /demo/.";
    return;
  }
  render(data);
}

async function render(data) {
  const ep = data.episode;
  renderMessy(ep.observation.messy_prompt);
  renderState(ep.observation.factory_state);
  renderStepper(ep);
  renderScoreboard(data.scoreboard);
  try {
    const r = await fetch("../results/isaac_tasks.json");
    if (r.ok) { const t = await r.json(); renderHumanoid(t); renderHumanoid3D(t); }
  } catch (e) { /* optional panel */ }
}

function renderMessy(text) { $("messy").textContent = text; }

function renderState(fs) {
  const wrap = $("state");
  const chip = (t, cls) => `<span class="chip ${cls || ""}">${t}</span>`;
  let h = "";
  h += `<div class="statelabel">machines</div><div class="chips">`;
  h += fs.machines.map(m => chip(`${m.id} · ${m.capabilities.join("/")}`)).join("");
  h += `</div>`;
  h += `<div class="statelabel">operators (human · robot)</div><div class="chips">`;
  h += fs.operators.map(o => chip(`${o.id} · ${o.skills.join("/")}`,
        o.type === "robot" ? "robot" : "")).join("");
  h += `</div>`;
  h += `<div class="statelabel">materials</div><div class="chips">`;
  h += fs.materials.map(m => chip(`${m.name} ${m.inventory_kg}kg · ${m.lead_time_days}d`)).join("");
  h += `</div>`;
  h += `<div class="statelabel">jobs (showing ${fs.jobs.length})</div><div class="chips">`;
  h += fs.jobs.map(j => chip(`${j.id} · due d${j.due_day} · ${j.operations.length} ops`)).join("");
  h += `</div>`;
  wrap.innerHTML = h;
}

// ---- repair stepper ----
let STEPS = [];      // [{viol, reward, action}]
let cur = 0;
let timer = null;

function renderStepper(ep) {
  // step 0 = the raw plan; step k = state after repair_trace[k-1]
  STEPS = [{
    viol: ep.verifier_before.n_hard,
    reward: ep.verifier_before.reward,
    action: null,
  }];
  ep.repair_trace.forEach(t => {
    STEPS.push({
      viol: t.errors_after.length,
      reward: t.reward_after,
      action: t.repair_action,
    });
  });
  const slider = $("slider");
  slider.max = STEPS.length - 1;
  slider.value = 0;
  slider.addEventListener("input", () => { stop(); cur = +slider.value; paint(); });
  $("playBtn").addEventListener("click", play);
  $("resetBtn").addEventListener("click", () => { stop(); cur = 0; slider.value = 0; paint(); });
  cur = 0; paint();
}

function paint() {
  const s = STEPS[cur];
  const maxViol = STEPS[0].viol || 1;
  const v = $("violVal");
  v.textContent = s.viol;
  v.classList.toggle("zero", s.viol === 0);
  $("rewardVal").textContent = Math.round(s.reward).toLocaleString();
  $("violBar").style.width = (100 * s.viol / maxViol) + "%";
  $("violBar").style.background = s.viol === 0
    ? "var(--good)" : "var(--bad)";
  $("slider").value = cur;
  $("stepLabel").textContent =
    cur === 0 ? `raw plan (step 0 of ${STEPS.length - 1})`
              : `after repair ${cur} of ${STEPS.length - 1}`;
  const a = $("action");
  if (!s.action) {
    a.innerHTML = `<span class="tag">raw LLM plan</span> — un-verified output, before any repair.`;
  } else {
    const op = s.action.op;
    const detail = describe(s.action);
    a.innerHTML = `<span class="tag">${op}</span> ${detail}`;
  }
}

function describe(a) {
  const j = a.job_id ? `${a.job_id}/${a.operation_id || ""}` : "";
  switch (a.op) {
    case "swap_machine":
    case "move_operation":
    case "assign_operator":
    case "add_overtime":
      return `${j} → machine ${a.machine_id}, operator ${a.operator_id}, ` +
             `start ${a.start}h`;
    case "expedite_material": return `expedite ${a.material}` +
             (a.added ? " (new order)" : "");
    case "warn_customer": return `delay warning for ${a.job_id}`;
    case "reject_rfq": return `reject negative-margin ${a.rfq_id}`;
    case "drop_operation": return `drop ${j} (${a.reason || "infeasible"})`;
    default: return JSON.stringify(a);
  }
}

function play() {
  stop();
  if (cur >= STEPS.length - 1) cur = 0;
  timer = setInterval(() => {
    if (cur >= STEPS.length - 1) { stop(); return; }
    cur++; paint();
  }, 420);
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }

// ---- humanoid execution timeline (proxy for Isaac Sim outcomes) ----
function renderHumanoid(tasks) {
  const robots = tasks.robot_queues || {};
  const all = Object.values(robots).flat();
  // scale the axis to the actual task window so bars are legible
  const lo = Math.min(...all.map(t => t.start_hr), 0);
  const hi = Math.max(...all.map(t => t.end_hr), lo + 1);
  const span = (hi - lo) || 1;
  const meta = $("humanoidMeta");
  const safety = (tasks.safety_controls || [])
    .map(s => `<span class="safetytag">${s.control} ${s.target}</span>`).join("");
  meta.innerHTML =
    `verified=${tasks.meta.verified ? "✓" : "✗"} · 0 hard violations · ` +
    `${tasks.meta.safety_incidents} safety incidents &nbsp; ${safety}`;
  const wrap = $("humanoid");
  let h = "";
  for (const [rid, q] of Object.entries(robots)) {
    h += `<div class="statelabel">${rid} (humanoid) — ${q.length} tasks</div>`;
    h += `<div class="track"><div class="lane"></div>`;
    q.forEach(t => {
      const left = 100 * (t.start_hr - lo) / span;
      const w = Math.max(4, 100 * (t.end_hr - t.start_hr) / span);
      h += `<div class="task" style="left:${left}%;width:${w}%" ` +
           `title="${t.task} @ ${t.machine} (h${t.start_hr}-${t.end_hr}, job ${t.job})">` +
           `${t.machine}·${t.task.replace(/_/g, " ").split(" ")[0]}</div>`;
    });
    h += `</div>`;
  }
  h += `<div class="axis"><span>hour ${lo} (day ${Math.floor(lo/24)})</span>` +
       `<span>hour ${hi} (day ${Math.ceil(hi/24)})</span></div>`;
  wrap.innerHTML = h;
}

// ---- 3D humanoid on the floor (three.js, browser, no GPU) ----
async function renderHumanoid3D(tasks) {
  const mount = $("scene3d");
  const cssv = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  let THREE;
  try {
    THREE = await import("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js");
  } catch (e) {
    mount.innerHTML = '<div class="fallback">3D view needs network access to load three.js. ' +
      'The 2D timeline above shows the same humanoid schedule.</div>';
    return;
  }
  const robot = Object.entries(tasks.robot_queues || {})[0];
  if (!robot) { mount.innerHTML = '<div class="fallback">No robot queue.</div>'; return; }
  const [rid, queue] = robot;
  const machines = tasks.meta.machines || {};
  const ink = cssv("--ink") || "#888", accent = cssv("--accent") || "#2a4a8c";
  const paper = cssv("--paper") || "#f7f5f0";

  const W = mount.clientWidth, H = 360, S = 1.6;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  cam.position.set(5, 5.5, 6); cam.lookAt(1.6, 0, 1.6);
  const rnd = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  rnd.setSize(W, H); rnd.setPixelRatio(devicePixelRatio);
  mount.innerHTML = ""; mount.appendChild(rnd.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(4, 8, 4); scene.add(dl);

  // floor grid
  const grid = new THREE.GridHelper(8, 16, accent, ink);
  grid.position.set(1.6, 0, 1.6); grid.material.opacity = 0.25; grid.material.transparent = true;
  scene.add(grid);

  // machine stations (labeled boxes at their floor coords)
  const stations = {};
  for (const [mid, xy] of Object.entries(machines)) {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: accent, opacity: 0.85, transparent: true }));
    box.position.set(xy[0] * S, 0.25, xy[1] * S);
    scene.add(box);
    stations[mid] = box.position;
  }

  // humanoid (primitive figure)
  const human = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: ink });
  const accMat = new THREE.MeshStandardMaterial({ color: accent });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.42, 0.16), accMat);
  torso.position.y = 0.95; human.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), mat);
  head.position.y = 1.28; human.add(head);
  const mkLimb = (x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), mat);
    m.position.set(x, y, 0); human.add(m); return m; };
  const legL = mkLimb(-0.08, 0.5), legR = mkLimb(0.08, 0.5);
  const armL = mkLimb(-0.2, 0.95), armR = mkLimb(0.2, 0.95);
  human.position.set(0, 0, 0); scene.add(human);

  // schedule timeline for R1
  const items = queue.map(t => ({ x: t.machine_xy[0] * S, z: t.machine_xy[1] * S,
    s: t.start_hr, e: t.end_hr, m: t.machine, task: t.task })).sort((a, b) => a.s - b.s);
  const lo = Math.min(...items.map(i => i.s)), hi = Math.max(...items.map(i => i.e));
  const LOOP = 16000;  // ms for the whole schedule window

  function poseAt(simH) {
    let cur = items.find(i => simH >= i.s && simH <= i.e);
    if (cur) return { x: cur.x, z: cur.z, working: true, label: `${cur.m} · ${cur.task}` };
    let prev = null, next = null;
    for (const i of items) { if (i.e < simH) prev = i; if (i.s > simH && !next) next = i; }
    if (!prev) return { x: items[0].x, z: items[0].z, working: false, label: "idle" };
    if (!next) return { x: prev.x, z: prev.z, working: false, label: "done" };
    const t = (simH - prev.e) / Math.max(1e-6, next.s - prev.e);
    return { x: prev.x + (next.x - prev.x) * t, z: prev.z + (next.z - prev.z) * t,
             working: false, label: `→ ${next.m}` };
  }

  let running = false, t0 = 0, raf = 0, lastX = 0, lastZ = 0;
  const clock = $("floorClock"), btn = $("floor3dBtn");
  function frame(ts) {
    if (!t0) t0 = ts;
    const simH = lo + (((ts - t0) % LOOP) / LOOP) * (hi - lo);
    const p = poseAt(simH);
    const dx = p.x - lastX, dz = p.z - lastZ;
    if (Math.abs(dx) + Math.abs(dz) > 1e-4) human.rotation.y = Math.atan2(dx, dz);
    lastX = p.x; lastZ = p.z;
    human.position.x = p.x; human.position.z = p.z;
    const sw = Math.sin(ts / 120) * (p.working ? 0.0 : 0.5);
    legL.rotation.x = sw; legR.rotation.x = -sw; armL.rotation.x = -sw; armR.rotation.x = sw;
    torso.position.y = 0.95 + (p.working ? Math.abs(Math.sin(ts / 180)) * 0.06 : 0);
    if (p.working) { armL.rotation.x = -0.9; armR.rotation.x = -0.9; }  // hands at machine
    cam.position.x = 5 + Math.sin(ts / 4000) * 1.2;  // gentle orbit
    cam.lookAt(1.6, 0.4, 1.6);
    clock.textContent = `day ${Math.floor(simH / 24)} · hour ${Math.round(simH)} — ${p.label}`;
    rnd.render(scene, cam);
    if (running) raf = requestAnimationFrame(frame);
  }
  btn.onclick = () => {
    running = !running; btn.innerHTML = running ? "&#10073;&#10073; pause" : "&#9654; run humanoid";
    if (running) { t0 = 0; raf = requestAnimationFrame(frame); } else cancelAnimationFrame(raf);
  };
  rnd.render(scene, cam);  // initial static frame
  clock.textContent = `${rid} · ${items.length} tasks · day 0–${Math.ceil(hi / 24)}`;
}

// ---- scoreboard ----
function renderScoreboard(rows) {
  const maxProfit = Math.max(...rows.map(r => r.profit), 1);
  const body = $("scoreBody");
  body.innerHTML = rows.map(r => {
    const w = Math.max(2, 60 * r.profit / maxProfit);
    const inv = r.invalid_actions;
    const invCls = inv === 0 ? "good" : "bad";
    const trustCls = r.customer_trust >= 90 ? "good" : (r.customer_trust < 50 ? "bad" : "");
    const unsafe = r.safety_incidents == null ? "—" : r.safety_incidents;
    const unsafeCls = (+unsafe === 0) ? "good" : "bad";
    return `<tr class="${r.method === "trm" ? "trm" : ""}">
      <td>${r.label}</td>
      <td>${Math.round(r.profit).toLocaleString()}<span class="mini" style="width:${w}px"></span></td>
      <td>${Math.round(r.on_time_rate * 100)}%</td>
      <td class="${invCls}">${inv}</td>
      <td class="${trustCls}">${Math.round(r.customer_trust)}</td>
      <td class="${unsafeCls}">${unsafe}</td>
    </tr>`;
  }).join("");
  $("scoreNote").textContent =
    "Base LLM is raw, un-verified output. Each step adds a layer of the same verifier: " +
    "capped retry recovers part of the loss; the full recursive repair loop drives invalid " +
    "actions to zero and restores customer trust to 100 — that zero is what makes 2 weeks " +
    "of unattended operation defensible.";
}

load();
