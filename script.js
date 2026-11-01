const GAS_URL = "https://script.google.com/macros/s/AKfycby0IiEHNm_6S0OFkxiAWes4zTlO3tZelE-sDk5r3QL4pgcxkArD4fAMhWn8gKGQfhH2mA/exec";

const $ = (s) => document.querySelector(s);

// Calls Apps Script backend over HTTP from GitHub Pages
const run = async (fn, ...args) => {
  const res = await fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({ fn, args })
  });
  const json = await res.json();
  if (json.status === "error") throw new Error(json.error);
  return json.data;
};

const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseNum = (s) => Number(String(s).replace(/[^0-9.\-]/g, "")) || 0;

// Uses replaceAll with plain strings to prevent quote corruption
const esc = (s) => {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&")
    .replaceAll("<", "<")
    .replaceAll(">", ">")
    .replaceAll('"', '"')
    .replaceAll("'", "'");
};

const compact = (n) => (Math.abs(n) >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(Math.round(n)));

const niceDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

let S = null;          // all data from the sheet
let view = "home";
let cat = "ALL";       // to-do category filter
let showDone = false;  // show finished to-dos

/* ---------- loading ---------- */
async function load() {
  try {
    S = await run("getAll");
  } catch (e) {
    toast("Couldn't reach the sheet. Check your connection and refresh.");
  }
  render();
}
$("#refresh").onclick = () => { S = null; render(); load(); };

/* ---------- shell ---------- */
function render() {
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.v === view));
  const el = $("#app");
  if (!S) { el.innerHTML = '<div class="empty">Loading your tracker…</div>'; return; }
  const d = S.dashboard;
  if (d && !d.error && d.title) $("#sub").textContent = d.title.replace(/[🌸]/gu, "").replace(/^\s*FINANCIAL DASHBOARD\s*/i, "").replace(/[()]/g, "").trim();
  el.innerHTML = { home: renderHome, salary: renderSalary, debts: renderDebts, budget: renderBudget, savings: renderSavings, todo: renderTodo }[view]();
}
$("#nav").onclick = (e) => {
  const b = e.target.closest("button[data-v]");
  if (b) { view = b.dataset.v; render(); window.scrollTo(0, 0); }
};

function errCard(x) {
  return '<div class="card err">This tab didn’t load' + (x && x.error ? ": " + esc(x.error) : ".") + "</div>";
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = "none"), 3200);
}

/* ---------- home ---------- */
function renderHome() {
  const d = S.dashboard;
  if (!d || d.error) return errCard(d);
  const s = d.summary || {};
  let html = `
  <div class="card hero">
    <div class="sub">Net gain</div>
    <div class="big">${esc(s.net || "–")}</div>
    <div class="sub">${esc(s.retained || "")}</div>
    <div class="stats">
      <div class="stat"><b>${esc(s.income || "–")}</b><span>Total income</span></div>
      <div class="stat"><b>${esc(s.expenses || "–")}</b><span>Total expenses</span></div>
    </div>
    <div class="sub" style="margin-top:12px">${esc(s.periods || "")} · ${esc(s.ratio || "")} expense ratio</div>
  </div>`;

    if (d.months.length) {
    const nets = d.months.map((m) => parseNum(m.net));
    const max = Math.max(...nets, 1);
    html += `<div class="card"><h2>Net gain per month</h2><div class="chart" style="justify-content:space-between;">` +
      d.months.map((m, i) => {
        const parts = m.month.split(" ");
        const label = parts[0].slice(0, 3) + (parts[1] ? " '" + parts[1].slice(-2) : "");
        return `<div class="col" style="flex:1; min-width:34px;">
          <em>${compact(nets[i])}</em>
          <i style="height:${Math.max(2, (nets[i] / max) * 100)}px"></i>
          <span>${esc(label)}</span>
        </div>`;
      }).join("") + `</div></div>`;
  }

  if (d.categories.length) {
    const top = parseNum(d.categories[0].amount) || 1;
    html += `<div class="card"><h2>Top Expenses</h2>` +
      d.categories.map((c) => `
      <div class="cat"><span class="n">${esc(c.rank)}</span><span>${esc(c.name)}</span><b>${esc(c.amount)} <span class="muted" style="font-weight:400">${esc(c.pct)}</span></b>
        <div class="bar"><i style="width:${Math.min(100, (parseNum(c.amount) / top) * 100)}%"></i></div></div>`).join("") + `</div>`;
  }

  if (d.months.length) {
    html += `<div class="card"><h2>By month</h2><div class="scroll"><table>
      <tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net gain</th><th>Kept</th></tr>` +
      d.months.map((m) => `<tr><td>${esc(m.month)}</td><td>${esc(m.income)}</td><td>${esc(m.expenses)}</td><td><b>${esc(m.net)}</b></td><td>${esc(m.retPct)}</td></tr>`).join("") +
      `</table></div></div>`;
  }

  if (d.periods.length) {
    html += `<div class="card"><h2>Every pay period</h2><div class="scroll"><table>
      <tr><th>Pay date</th><th>Income</th><th>Expenses</th><th>Net gain</th><th>Status</th></tr>` +
      d.periods.map((p) => `<tr><td>${esc(p.date)}</td><td>${esc(p.income)}</td><td>${esc(p.expenses)}</td><td><b>${esc(p.net)}</b></td><td><span class="pill ${p.status === "PAID" ? "ok" : ""}">${esc(p.status)}</span></td></tr>`).join("") +
      `</table></div></div>`;
  }
  return html;
}

/* ---------- expected salary ---------- */
function renderSalary() {
  const s = S.salary;
  if (!s || s.error) return errCard(s);
  
  return `
  <div class="card hero">
    <div class="hero-head">
      <div class="hero-meta">
        <span class="role">${esc(s.role)}</span>
        <span class="date-range">${esc(s.start)} – ${esc(s.end)}</span>
      </div>
      <button class="btn ghost" data-a="sal-edit-dates">Edit</button>
    </div>
    
    <div class="big">${peso(s.deducted)}</div>
    <div class="sub" style="margin-top:2px">Take-home salary</div>
    
    <div class="stats" style="margin-top:14px">
      <div class="stat"><b>${peso(s.expected)}</b><span>Gross expected</span></div>
      <div class="stat"><b>${peso(s.daily)}</b><span>Daily rate</span></div>
    </div>
  </div>
  
  <div class="card">
    <div class="addbar">
      <h2 style="margin:0">Work breakdown</h2>
      <button class="btn" data-a="sal-edit-hours" style="padding:7px 14px; font-size:13px">Edit hours</button>
    </div>
    <div class="scroll" style="margin-top:10px">
      <table class="table-responsive">
        <tr>
          <th style="text-align:left">Type</th>
          <th>Count</th>
          <th>Pay</th>
          <th style="text-align:right">Rate</th>
        </tr>
        ${s.workItems.map(i => `
          <tr>
            <td style="text-align:left; font-weight:600">${esc(i.type)}</td>
            <td>${i.count || '–'}</td>
            <td style="font-weight:600">${peso(i.pay)}</td>
            <td style="text-align:right; color:var(--mute)">${esc(i.pct)}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  </div>`;
}


/* ---------- debts ---------- */
function renderDebts() {
  const d = S.debts;
  if (!d || d.error) return errCard(d);
  const paid = d.items.filter((i) => i.paid).reduce((a, i) => a + i.amount, 0);
  const pct = d.total ? Math.round((paid / d.total) * 100) : 0;
  return `
  <div class="card">
    <div class="addbar"><h2 style="margin:0">Payday ${esc(niceDate(d.date))}</h2><button class="btn ghost" data-a="debt-head">Edit</button></div>
    <div class="kv" style="margin-top:12px">
      <div><span>Salary</span><b>${peso(d.salary)}</b></div>
      <div><span>Debts</span><b>${peso(d.total)}</b></div>
      <div><span>For me</span><b>${peso(d.forMe)}</b></div>
      <div><span>Paid so far</span><b>${peso(paid)}</b></div>
    </div>
    <div class="meter"><i style="width:${pct}%"></i></div>
    <div class="s muted" style="font-size:13px">${pct}% of this period’s debts paid</div>
  </div>
  <div class="card">
    <div class="addbar"><h2 style="margin:0">To pay</h2><button class="btn" data-a="debt-add">Add debt</button></div>
    ${d.items.length ? d.items.map((i) => `
      <div class="row ${i.paid ? "done" : ""}">
        <button class="chk ${i.paid ? "on" : ""}" data-a="debt-toggle" data-row="${i.row}" aria-label="Mark ${esc(i.desc)} as ${i.paid ? "unpaid" : "paid"}">${i.paid ? "✓" : ""}</button>
        <div class="body"><div class="t">${esc(i.desc)}</div></div>
        <div class="amt">${peso(i.amount)}</div>
        <button class="edit" data-a="debt-edit" data-row="${i.row}" aria-label="Edit ${esc(i.desc)}">✎</button>
      </div>`).join("") : '<div class="empty">No debts listed. Add one to get started.</div>'}
  </div>`;
}

/* ---------- budget ---------- */
function renderBudget() {
  const b = S.budget;
  if (!b || b.error) return errCard(b);

  const forMe = b.forMe || 0;
  const items = b.items || [];

  // Calculate totals directly from amounts
  const totalAssigned = items.reduce((sum, it) => sum + (it.amount || 0), 0);
  const left = forMe - totalAssigned;
  const unassignedPct = forMe > 0 ? ((left / forMe) * 100).toFixed(1) : "0.0";
  const assignedPctClamped = forMe > 0 ? Math.min(100, Math.max(0, (totalAssigned / forMe) * 100)) : 0;

  // Clean date formatter that avoids "undefined NaN"
  let dateLabel = b.date || '–';
  if (b.date) {
    const d = new Date(b.date);
    if (!isNaN(d.getTime())) {
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      if (/^\d{4}-\d{2}-\d{2}/.test(b.date)) {
        const parts = b.date.split(/[-T]/);
        dateLabel = `${months[parseInt(parts[1], 10) - 1]} ${parseInt(parts[2], 10)}, ${parts[0]}`;
      } else {
        dateLabel = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
      }
    }
  }

  return `
  <div class="card">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
      <h2 style="margin:0; font-size:18px;">Budget for ${esc(dateLabel)}</h2>
      <button class="btn ghost" data-a="bud-head" style="padding:6px 14px; font-size:13px;">Edit</button>
    </div>

    <div class="stats" style="display:flex; gap:12px; margin-bottom:14px;">
      <div class="stat" style="flex:1; background:rgba(255,255,255,0.05); border-radius:12px; padding:12px 14px;">
        <span style="font-size:12px; color:var(--mute, #a89ba2); display:block; margin-bottom:4px;">For me</span>
        <b style="font-size:18px; font-weight:700; color:#fff;">${peso(forMe)}</b>
      </div>
      <div class="stat" style="flex:1; background:rgba(255,255,255,0.05); border-radius:12px; padding:12px 14px;">
        <span style="font-size:12px; color:var(--mute, #a89ba2); display:block; margin-bottom:4px;">Left to assign</span>
        <b style="font-size:18px; font-weight:700; color:#fff;">${peso(left)}</b>
      </div>
    </div>

    <div class="bar" style="height:8px; background:rgba(255,255,255,0.1); border-radius:99px; overflow:hidden; margin-bottom:8px;">
      <i style="display:block; height:100%; background:var(--accent, #be1759); width:${assignedPctClamped}%; border-radius:99px;"></i>
    </div>
    <div style="font-size:12px; color:var(--mute, #a89ba2);">
      ${peso(totalAssigned)} assigned · ${unassignedPct}% unassigned
    </div>
  </div>

  <div class="card">
    <div class="addbar" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <h2 style="margin:0;">Plan</h2>
      <button class="btn" data-a="bud-add" style="padding:8px 16px;">Add item</button>
    </div>

    <div style="display:flex; flex-direction:column; gap:8px;">
      ${items.map((it) => {
        const itemPct = forMe > 0 ? ((it.amount / forMe) * 100).toFixed(1) : "0.0";
        return `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06); gap:12px;">
          <!-- Checkbox -->
          <button data-a="bud-toggle" data-row="${it.row}" style="
            width:26px; height:26px; min-width:26px; border-radius:8px;
            background:${it.done ? 'var(--accent, #be1759)' : 'rgba(255,255,255,0.05)'};
            border:2px solid ${it.done ? 'var(--accent, #be1759)' : 'rgba(255,255,255,0.2)'};
            display:flex; align-items:center; justify-content:center;
            cursor:pointer; color:#fff; font-size:14px; font-weight:bold; padding:0; outline:none;
          ">${it.done ? '✓' : ''}</button>

          <!-- Description & Auto-calculated % -->
          <div style="flex:1; min-width:0;">
            <div style="font-size:14.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; ${it.done ? 'text-decoration:line-through; opacity:0.5;' : 'color:#fff;'}">
              ${esc(it.desc)}
            </div>
            <div style="font-size:12px; color:var(--mute, #a89ba2); margin-top:2px;">
              ${itemPct}% of what’s for me
            </div>
          </div>

          <!-- Amount -->
          <b style="font-size:15px; font-weight:700; white-space:nowrap; ${it.done ? 'text-decoration:line-through; opacity:0.5; color:var(--mute, #a89ba2);' : 'color:#fff;'}">
            ${peso(it.amount)}
          </b>

          <!-- Edit Pencil -->
          <button data-a="bud-edit" data-row="${it.row}" style="
            background:transparent; border:none; cursor:pointer; color:var(--mute, #a89ba2);
            font-size:16px; padding:4px 6px; display:flex; align-items:center; justify-content:center; outline:none;
          ">✎</button>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

/* ---------- savings ---------- */
function renderSavings() {
  const s = S.savings;
  if (!s || s.error) return errCard(s);
  return `
  <div class="card hero">
    <div class="sub">Total savings</div>
    <div class="big">${peso(s.total)}</div>
    <div class="sub">${s.items.length} entries</div>
  </div>
  <div class="card">
    <div class="addbar"><h2 style="margin:0">Entries</h2><button class="btn" data-a="sav-add">Add savings</button></div>
    ${s.items.length ? s.items.map((i) => `
      <div class="row">
        <div class="body"><div class="t">${esc(i.desc)}</div></div>
        <div class="amt">${peso(i.amount)}</div>
        <button class="edit" data-a="sav-edit" data-row="${i.row}" aria-label="Edit ${esc(i.desc)}">✎</button>
      </div>`).join("") : '<div class="empty">No savings logged yet.</div>'}
  </div>`;
}

/* ---------- to-do ---------- */
function renderTodo() {
  const t = S.todos;
  if (!t || t.error) return errCard(t);
  const cats = ["ALL"].concat([...new Set(t.items.map((i) => i.category).filter(Boolean))].sort());
  const open = t.items.filter((i) => !i.done);
  const doneItems = t.items.filter((i) => i.done);
  const pick = (list) => list.filter((i) => cat === "ALL" || i.category === cat);
  const card = (i) => `
    <div class="row ${i.done ? "done" : ""}">
      <button class="chk ${i.done ? "on" : ""}" data-a="todo-toggle" data-row="${i.row}" aria-label="Mark ${esc(i.title)} as ${i.done ? "not done" : "done"}">${i.done ? "✓" : ""}</button>
      <div class="body">
        <div class="t">${esc(i.title)}</div>
        <div class="s">${[i.where, i.what].filter(Boolean).map(esc).join(" · ")}</div>
        <div style="margin-top:4px">${i.category ? `<span class="pill">${esc(i.category.toLowerCase())}</span> ` : ""}${i.when ? `<span class="s">${esc(i.when)}</span>` : ""}</div>
      </div>
      <button class="edit" data-a="todo-edit" data-row="${i.row}" aria-label="Edit ${esc(i.title)}">✎</button>
    </div>`;
  const shown = pick(open);
  const shownDone = showDone ? pick(doneItems) : [];
  return `
  <div class="card">
    <div class="addbar"><h2 style="margin:0">To-do · ${open.length} open</h2><button class="btn" data-a="todo-add">Add to-do</button></div>
    <div class="chips" style="margin-top:10px">
      ${cats.map((c) => `<button class="chip ${c === cat ? "on" : ""}" data-a="todo-cat" data-v="${esc(c)}">${c === "ALL" ? "All" : esc(c.toLowerCase())}</button>`).join("")}
      <button class="chip ${showDone ? "on" : ""}" data-a="todo-showdone">${showDone ? "Hide" : "Show"} done (${doneItems.length})</button>
    </div>
    ${shown.length || shownDone.length ? shown.map(card).join("") + shownDone.map(card).join("") : '<div class="empty">Nothing here. Add something to look forward to.</div>'}
  </div>`;
}

/* ---------- modal ---------- */
function openModal(cfg) {
  const m = $("#modal");
  const lists = cfg.fields.filter((f) => f.list).map((f) => `<datalist id="dl_${f.k}">${f.list.map((o) => `<option value="${esc(o)}">`).join("")}</datalist>`).join("");
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(cfg.title)}">
    <h3>${esc(cfg.title)}</h3>
    ${cfg.fields.map((f) => `<label>${esc(f.label)}<input id="f_${f.k}" type="${f.type || "text"}" value="${esc(f.value == null ? "" : f.value)}" placeholder="${esc(f.ph || "")}"
      ${f.type === "number" ? 'step="0.01" inputmode="decimal"' : ""} ${f.list ? `list="dl_${f.k}"` : ""} autocomplete="off"></label>`).join("")}
    ${lists}
    <div class="actions">
      ${cfg.del ? '<button class="btn danger" id="m_del">Delete</button>' : ""}
      <button class="btn ghost" id="m_cancel">Cancel</button>
      <button class="btn" id="m_save">Save</button>
    </div>
  </div>`;
  m.classList.add("open");
  const close = () => { m.classList.remove("open"); m.innerHTML = ""; };
  m.onclick = (e) => { if (e.target === m) close(); };
  $("#m_cancel").onclick = close;
  const busy = async (fn) => {
    const btns = m.querySelectorAll("button"); btns.forEach((b) => (b.disabled = true));
    try { await fn(); close(); render(); }
    catch (e) { toast(String((e && e.message) || "Couldn't save. Try again.")); btns.forEach((b) => (b.disabled = false)); }
  };
  $("#m_save").onclick = () => {
    const vals = {};
    for (const f of cfg.fields) {
      vals[f.k] = $("#f_" + f.k).value.trim();
      if (f.req && !vals[f.k]) { toast("Add a " + f.label.toLowerCase() + " first."); $("#f_" + f.k).focus(); return; }
    }
    busy(() => cfg.save(vals));
  };
  if (cfg.del) $("#m_del").onclick = () => busy(cfg.del);
  const first = m.querySelector("input"); if (first && !first.value) first.focus();
}

/* ---------- actions ---------- */
const byRow = (list, row) => list.find((i) => i.row === row);
const niceIso = (str) => {
  if (!str) return "";
  const d = new Date(str);
  if (isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

$("#app").addEventListener("click", async (e) => {
  const el = e.target.closest("[data-a]");
  if (!el) return;
  const a = el.dataset.a, row = Number(el.dataset.row) || 0;
  try {
    /* salary */
    if (a === "sal-edit-dates") {
      openModal({
        title: "Edit Coverage Dates",
        fields: [{ k: "start", label: "Start Date", type: "date", value: niceIso(S.salary.start), req: true },
                 { k: "end", label: "End Date", type: "date", value: niceIso(S.salary.end), req: true }],
        save: async (v) => { S.salary = await run("saveSalaryDates", v.start, v.end); }
      });
    } else if (a === "sal-edit-hours") {
      const getC = (type) => {
        const item = S.salary.workItems.find(i => i.type === type);
        return item ? item.count : "";
      };
      openModal({
        title: "Update Hours",
        fields: [{ k: "basic", label: "Basic Hours", type: "number", value: getC("BASIC") },
                 { k: "eve", label: "Evening Hours", type: "number", value: getC("EVENING") },
                 { k: "rh", label: "Regular Holiday (RH)", type: "number", value: getC("RH") },
                 { k: "uh", label: "US Holiday (UH)", type: "number", value: getC("UH") },
                 { k: "sh", label: "Special Holiday (SH)", type: "number", value: getC("SH") },
                 { k: "ot", label: "Overtime (OT)", type: "number", value: getC("OT") },
                 { k: "otrh", label: "Overtime on Regular Holiday (OT/RH)", type: "number", value: getC("OT/RH") },
                 { k: "erh", label: "Evening on Regular Holiday (E/RH)", type: "number", value: getC("E/RH") },
                 { k: "euh", label: "Evening on US Holiday (E/UH)", type: "number", value: getC("E/UH") }],
        save: async (v) => { 
          S.salary = await run("saveSalaryHours", [
            { t: "BASIC", v: v.basic },
            { t: "EVENING", v: v.eve },
            { t: "RH", v: v.rh },
            { t: "UH", v: v.uh },
            { t: "SH", v: v.sh },
            { t: "OT", v: v.ot },
            { t: "OT/RH", v: v.otrh },
            { t: "E/RH", v: v.erh },
            { t: "E/UH", v: v.euh }
          ]); 
        }
      });

    /* debts */
    } else if (a === "debt-toggle") {
      const it = byRow(S.debts.items, row); it.paid = !it.paid; render();
      S.debts = await run("setDebtPaid", row, it.paid); render();
    } else if (a === "debt-add" || a === "debt-edit") {
      const it = row ? byRow(S.debts.items, row) : null;
      openModal({
        title: it ? "Edit debt" : "Add debt",
        fields: [{ k: "desc", label: "Name", value: it ? it.desc : "", req: true, ph: "e.g. Electric" },
                 { k: "amt", label: "Amount (₱)", type: "number", value: it ? it.amount : "", req: true }],
        save: async (v) => { S.debts = await run("saveDebt", row || null, v.desc, v.amt); },
        del: it ? async () => { S.debts = await run("deleteDebt", row); } : null
      });
    } else if (a === "debt-head") {
      openModal({
        title: "Payday details",
        fields: [{ k: "date", label: "Pay date", type: "date", value: niceIso(S.debts.date) },
                 { k: "sal", label: "Salary (₱)", type: "number", value: S.debts.salary, req: true }],
        save: async (v) => { S.debts = await run("saveDebtHeader", v.date, v.sal); }
      });

    /* budget */
    } else if (a === "bud-toggle") {
      const it = byRow(S.budget.items, row); it.done = !it.done; render();
      S.budget = await run("setBudgetDone", row, it.done); render();
    } else if (a === "bud-add" || a === "bud-edit") {
      const it = row ? byRow(S.budget.items, row) : null;
      openModal({
        title: it ? "Edit budget item" : "Add budget item",
        fields: [
          { k: "desc", label: "Name", value: it ? it.desc : "", req: true, ph: "e.g. Food" },
          { k: "amount", label: "Amount (₱)", type: "number", value: it ? it.amount : "", req: true, ph: "e.g. 1500" }
        ],
        save: async (v) => { S.budget = await run("saveBudget", row || null, v.desc, v.amount); },
        del: it ? async () => { S.budget = await run("deleteBudget", row); } : null
      });
    } else if (a === "bud-head") {
      openModal({
        title: "Budget details",
        fields: [{ k: "date", label: "Pay date", type: "date", value: niceIso(S.budget.date) },
                 { k: "me", label: "For me (₱)", type: "number", value: S.budget.forMe, req: true }],
        save: async (v) => { S.budget = await run("saveBudgetHeader", v.date, v.me); }
      });

    /* savings */
    } else if (a === "sav-add" || a === "sav-edit") {
      const it = row ? byRow(S.savings.items, row) : null;
      openModal({
        title: it ? "Edit savings" : "Add savings",
        fields: [{ k: "desc", label: "Description", value: it ? it.desc : "", req: true, ph: "e.g. 1st cut off of Nov" },
                 { k: "amt", label: "Amount (₱)", type: "number", value: it ? it.amount : "", req: true }],
        save: async (v) => { S.savings = await run("saveSaving", row || null, v.desc, v.amt); },
        del: it ? async () => { S.savings = await run("deleteSaving", row); } : null
      });

    /* to-do */
    } else if (a === "todo-toggle") {
      const it = byRow(S.todos.items, row); it.done = !it.done; render();
      S.todos = await run("setTodoDone", row, it.done); render();
    } else if (a === "todo-cat") { cat = el.dataset.v; render();
    } else if (a === "todo-showdone") { showDone = !showDone; render();
    } else if (a === "todo-add" || a === "todo-edit") {
      const it = row ? byRow(S.todos.items, row) : null;
      const cats = [...new Set(S.todos.items.map((i) => i.category).filter(Boolean))];
      openModal({
        title: it ? "Edit to-do" : "Add to-do",
        fields: [{ k: "title", label: "Title", value: it ? it.title : "", req: true },
                 { k: "where", label: "Where", value: it ? it.where : "" },
                 { k: "what", label: "What", value: it ? it.what : "" },
                 { k: "when", label: "When", type: "date", value: it ? it.whenIso : "" },
                 { k: "category", label: "Category", value: it ? it.category : (cat !== "ALL" ? cat : ""), list: cats }],
        save: async (v) => { S.todos = await run("saveTodo", row || null, { title: v.title, where: v.where, what: v.what, whenIso: v.when, category: v.category }); },
        del: it ? async () => { S.todos = await run("deleteTodo", row); } : null
      });
    }
  } catch (err) {
    toast("That didn't save. Refresh and try again.");
    load();
  }
});

load();
