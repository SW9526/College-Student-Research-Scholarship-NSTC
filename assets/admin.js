/* 管理者版：題目編輯（即時預覽）＋收集資料（試題分析、受試者列表、CSV 下載） */
const $ = s => document.querySelector(s);
const S = { key: "", sets: [], cur: 0, dirty: false, data: null };
const ss = {
  get(k) { try { return sessionStorage.getItem(k) || ""; } catch (e) { return ""; } },
  set(k, v) { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch (e) {} }
};

/* ================= 登入 ================= */
$("#mode").textContent = API.demo ? "示範模式：資料存在這台電腦" : "已連線 Google 試算表";
$("#mode").className = "mode " + (API.demo ? "demo" : "live");
$("#loginHint").textContent = API.demo ? "示範模式的密碼是 demo。部署後改用你在 Apps Script 設定的 ADMIN_KEY。" : "";

async function login(key) {
  $("#loginErr").hidden = true;
  try {
    await API.login(key);
    S.key = key; ss.set("nstc_admin_key", key);
    $("#login").hidden = true; $("#tabs").hidden = false;
    await loadAll();
    showTab("edit");
  } catch (e) {
    $("#loginErr").textContent = e.message || "登入失敗";
    $("#loginErr").hidden = false;
  }
}
$("#loginBtn").addEventListener("click", () => login($("#key").value.trim()));
$("#key").addEventListener("keydown", e => { if (e.key === "Enter") login($("#key").value.trim()); });
$("#logout").addEventListener("click", () => { ss.set("nstc_admin_key", ""); location.reload(); });
window.addEventListener("beforeunload", e => { if (S.dirty) { e.preventDefault(); e.returnValue = ""; } });

function showTab(t) {
  $("#view-edit").hidden = t !== "edit";
  $("#view-data").hidden = t !== "data";
  $("#tab-edit").setAttribute("aria-selected", String(t === "edit"));
  $("#tab-data").setAttribute("aria-selected", String(t === "data"));
  if (t === "data") renderData();
}
$("#tab-edit").addEventListener("click", () => showTab("edit"));
$("#tab-data").addEventListener("click", async () => { await loadAll(true); showTab("data"); });

async function loadAll(dataOnly) {
  const all = await API.getAll(S.key);
  S.data = all;
  if (!dataOnly || !S.sets.length) {
    S.sets = JSON.parse(JSON.stringify(all.sets || []));
    S.cur = Math.min(S.cur, Math.max(0, S.sets.length - 1));
    renderEditor();
  }
}

/* ================= 題目編輯 ================= */
const sorted = () => S.sets.map((s, i) => ({ s, i })).sort((a, b) => String(a.s.booklet).localeCompare(String(b.s.booklet)) || (a.s.order || 0) - (b.s.order || 0));
const passageToText = p => (p || []).join("\n\n");
const textToPassage = t => t.split(/\n\s*\n/).map(x => x.replace(/\s*\n\s*/g, "").trim()).filter(Boolean);
const nextItemId = set => { let n = 1; const ids = new Set(set.items.map(i => i.id)); while (ids.has("q" + n)) n++; return "q" + n; };

function markDirty(v = true) {
  S.dirty = v;
  const el = $("#saveStatus");
  if (el) { el.textContent = v ? "有未儲存的變更" : "已儲存"; el.className = "status " + (v ? "dirty" : "saved"); }
}

function renderSetList() {
  const groups = {};
  sorted().forEach(({ s, i }) => (groups[s.booklet || "（未指定）"] ||= []).push({ s, i }));
  $("#setList").innerHTML = Object.keys(groups).length ? Object.entries(groups).map(([b, arr]) => `
    <div class="bk"><h3>題本 ${esc(b)}</h3><ul>
      ${arr.map(({ s, i }) => `<li><button class="setbtn" type="button" data-i="${i}" aria-current="${i === S.cur}">
        <span class="id">${s.order || "–"}. ${esc(s.set_id || "（未命名）")}</span>
        <span class="meta">${(s.items || []).length} 題${s.active === false ? "・未啟用" : ""}</span></button></li>`).join("")}
    </ul></div>`).join("") : '<p class="muted">還沒有題組。</p>';
  $("#setList").querySelectorAll(".setbtn").forEach(b => b.addEventListener("click", () => { S.cur = +b.dataset.i; renderEditor(); }));
}

let pvTimer = null;
function renderPreview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => {
    const set = S.sets[S.cur];
    if (!set) { $("#preview").innerHTML = '<p class="muted">選擇或新增一個題組。</p>'; return; }
    const inBk = S.sets.filter(s => s.booklet === set.booklet && s.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = Math.max(0, inBk.indexOf(set));
    $("#preview").innerHTML = renderSet(set, { idx, total: inBk.length || 1, startNo: inBk.includes(set) ? startNoFor(set, inBk) : 1, showSource: true });
    attachHighlighter($("#preview .set-screen"));
    $("#preview .set-screen").addEventListener("click", e => {
      const f = e.target.closest(".flag");
      if (f) f.setAttribute("aria-pressed", String(f.getAttribute("aria-pressed") !== "true"));
    });
    fitPreview();
  }, 120);
}
/* 預覽窗比受試者畫面窄時，把試題紙等比例縮小（版面以 em 為單位，換行位置與受試者畫面相同） */
function fitPreview() {
  const paper = $("#preview .paper");
  if (!paper) return;
  const base = APP_CONFIG.EXAM_FONT_PX || 17;
  const natural = 49.7 * base + 2;                       // 版心 42.5em + 左右邊界 7.2em + 邊框
  const avail = $("#preview").clientWidth - 28;          // 扣掉預覽框內距
  const scale = Math.min(1, avail / natural);
  paper.style.fontSize = (base * scale).toFixed(2) + "px";
  $("#pvNote").textContent = (scale < 1 ? `已等比例縮小為 ${Math.round(scale * 100)}%，換行位置與受試者畫面相同` : "與受試者畫面相同大小")
    + (APP_CONFIG.SHOW_SOURCE_NOTE ? "・受試者也會看到來源說明" : "・來源說明只在這裡顯示，受試者看不到");
}
window.addEventListener("resize", () => fitPreview());

function renderEditor() {
  renderSetList();
  const set = S.sets[S.cur];
  if (!set) {
    $("#form").innerHTML = `<p class="muted">還沒有題組。按左側「新增題組」開始，或先載入兩個示範題組看看格式。</p>
      <button class="btn ghost small" id="loadDemo" type="button" style="justify-self:start">載入示範題組</button>`;
    $("#loadDemo").addEventListener("click", () => { S.sets = JSON.parse(JSON.stringify(DEMO_SETS)); S.cur = 0; markDirty(); renderEditor(); });
    renderPreview(); return;
  }
  $("#form").innerHTML = `
    <div class="actions"><button class="btn" id="save" type="button">儲存全部變更</button><span class="status" id="saveStatus"></span></div>
    <div id="errors"></div>
    <div class="row">
      <label class="f"><span>題組代號</span><input type="text" id="f_set_id" value="${esc(set.set_id)}" placeholder="例：114-R1"></label>
      <label class="f"><span>題本</span><input type="text" id="f_booklet" value="${esc(set.booklet)}" placeholder="A 或 B"></label>
      <label class="f"><span>順序</span><input type="number" id="f_order" min="1" value="${esc(set.order)}"></label>
    </div>
    <label class="check"><input type="checkbox" id="f_active" ${set.active !== false ? "checked" : ""}> 啟用（取消勾選後受試者不會看到這個題組）</label>
    <label class="f"><span>來源說明</span><input type="text" id="f_source" value="${esc(set.source)}" placeholder="例：114學年度學測國文 第21–22題"></label>
    <label class="f"><span>文章</span><textarea id="f_passage" rows="10">${esc(passageToText(set.passage))}</textarea>
      <span class="hint">段落之間空一行。從 PDF 貼上時，段落內的換行會自動合併。</span></label>
    <div id="itemEds" style="display:grid;gap:10px"></div>
    <div class="actions">
      <button class="btn ghost small" id="addItem" type="button">新增題目</button>
      <button class="btn ghost small" id="dupSet" type="button">複製此題組</button>
      <button class="btn danger small" id="delSet" type="button">刪除此題組</button>
    </div>`;
  markDirty(S.dirty);
  const bind = (id, fn) => $(id).addEventListener("input", e => { fn(e.target); markDirty(); renderPreview(); renderSetList(); });
  bind("#f_set_id", t => set.set_id = t.value.trim());
  bind("#f_booklet", t => set.booklet = t.value.trim().toUpperCase());
  bind("#f_order", t => set.order = Number(t.value) || 0);
  $("#f_active").addEventListener("change", e => { set.active = e.target.checked; markDirty(); renderPreview(); renderSetList(); });
  bind("#f_source", t => set.source = t.value);
  bind("#f_passage", t => set.passage = textToPassage(t.value));
  $("#save").addEventListener("click", save);
  $("#addItem").addEventListener("click", () => { set.items.push({ id: nextItemId(set), stem: "", options: ["", "", "", ""], answer: "" }); markDirty(); renderItems(); renderPreview(); renderSetList(); });
  $("#dupSet").addEventListener("click", () => {
    const copy = JSON.parse(JSON.stringify(set)); copy.set_id = set.set_id + "-copy"; copy.order = (set.order || 0) + 1;
    S.sets.push(copy); S.cur = S.sets.length - 1; markDirty(); renderEditor();
  });
  const del = $("#delSet");
  del.addEventListener("click", () => {
    if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = "確定刪除？再按一次"; setTimeout(() => { if (del.isConnected) { del.dataset.confirm = ""; del.textContent = "刪除此題組"; } }, 4000); return; }
    S.sets.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1); markDirty(); renderEditor();
  });
  renderItems();
  renderPreview();
}

function renderItems() {
  const set = S.sets[S.cur];
  $("#itemEds").innerHTML = set.items.map((it, n) => `
    <div class="itemed" data-n="${n}">
      <header><b>第 ${n + 1} 題</b>
        <button class="btn ghost small" data-act="up" type="button" ${n === 0 ? "disabled" : ""} aria-label="上移">↑</button>
        <button class="btn ghost small" data-act="down" type="button" ${n === set.items.length - 1 ? "disabled" : ""} aria-label="下移">↓</button>
        <button class="btn danger small" data-act="del" type="button">刪除</button></header>
      <label class="f"><span>題幹</span><textarea rows="2" data-k="stem">${esc(it.stem)}</textarea></label>
      ${KEYS.map((k, i) => `<div class="opt-row"><span>(${k})</span><input type="text" data-opt="${i}" value="${esc(it.options[i] || "")}" aria-label="選項 ${k}"></div>`).join("")}
      <div class="row" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <label class="f"><span>正確答案</span><select data-k="answer"><option value="">請選擇</option>${KEYS.map(k => `<option ${it.answer === k ? "selected" : ""}>${k}</option>`).join("")}</select></label>
        <label class="f"><span>選項排列</span><select data-k="layout">${[["auto", "自動（依選項長度）"], ["1", "一行一個"], ["2", "一行兩個"], ["4", "一行四個"]].map(([v, t]) => `<option value="${v}" ${String(it.layout || "auto") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>
    </div>`).join("");
  $("#itemEds").querySelectorAll(".itemed").forEach(card => {
    const it = set.items[+card.dataset.n];
    const touch = () => { markDirty(); renderPreview(); };
    card.querySelector("[data-k=stem]").addEventListener("input", e => { it.stem = e.target.value.replace(/\s*\n\s*/g, ""); touch(); });
    card.querySelector("[data-k=answer]").addEventListener("change", e => { it.answer = e.target.value; touch(); });
    card.querySelector("[data-k=layout]").addEventListener("change", e => { it.layout = e.target.value; touch(); });
    card.querySelectorAll("[data-opt]").forEach(inp => inp.addEventListener("input", e => { it.options[+inp.dataset.opt] = e.target.value; touch(); }));
    card.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
      const n = +card.dataset.n;
      if (b.dataset.act === "del") set.items.splice(n, 1);
      if (b.dataset.act === "up") [set.items[n - 1], set.items[n]] = [set.items[n], set.items[n - 1]];
      if (b.dataset.act === "down") [set.items[n + 1], set.items[n]] = [set.items[n], set.items[n + 1]];
      markDirty(); renderItems(); renderPreview(); renderSetList();
    }));
  });
}

$("#addSet").addEventListener("click", () => {
  const b = S.sets[S.cur]?.booklet || "A";
  const order = Math.max(0, ...S.sets.filter(s => s.booklet === b).map(s => s.order || 0)) + 1;
  S.sets.push({ set_id: "", booklet: b, order, active: true, source: "", passage: [], items: [{ id: "q1", stem: "", options: ["", "", "", ""], answer: "" }] });
  S.cur = S.sets.length - 1; markDirty(); renderEditor(); $("#f_set_id").focus();
});

function validate() {
  const errs = [], ids = new Set();
  S.sets.forEach(s => {
    const name = s.set_id || "（未命名題組）";
    if (!s.set_id) errs.push("有題組沒有填題組代號");
    else if (ids.has(s.set_id)) errs.push(`題組代號「${s.set_id}」重複`);
    ids.add(s.set_id);
    if (!s.booklet) errs.push(`${name}：沒有填題本`);
    if (!s.passage.length) errs.push(`${name}：沒有文章`);
    if (!s.items.length) errs.push(`${name}：沒有題目`);
    s.items.forEach((it, n) => {
      if (!it.stem) errs.push(`${name} 第 ${n + 1} 題：沒有題幹`);
      if (it.options.some(o => !String(o).trim())) errs.push(`${name} 第 ${n + 1} 題：選項沒有填完`);
      if (!KEYS.includes(it.answer)) errs.push(`${name} 第 ${n + 1} 題：沒有選正確答案`);
    });
  });
  return [...new Set(errs)];
}
async function save() {
  const errs = validate();
  $("#errors").innerHTML = errs.length ? `<div class="errors">還不能儲存：<ul class="tight">${errs.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "";
  if (errs.length) return;
  const btn = $("#save"); btn.disabled = true; btn.textContent = "儲存中…";
  try {
    await API.saveSets(S.key, S.sets);
    markDirty(false);
  } catch (e) {
    $("#errors").innerHTML = `<div class="errors">儲存失敗：${esc(e.message)}。請確認網路連線後再試一次。</div>`;
  } finally { btn.disabled = false; btn.textContent = "儲存全部變更"; }
}

/* ================= 收集資料 ================= */
const F = { maxAwaySec: 30, useAway: true, useSeen: true, useSaveFail: true };
const fmtTime = t => { if (!t) return "—"; const d = new Date(t); return isNaN(d) ? String(t) : d.toLocaleString("zh-TW", { hour12: false }); };
const sec = ms => ms == null || ms === "" ? "—" : (ms / 1000).toFixed(1);
const pct = x => x == null || isNaN(x) ? "—" : x.toFixed(2);

function analyse() {
  const { sets, sessions, responses } = S.data;
  // 每位受試者每個題組只取一筆：save_seq 最大（最新）的那筆（舊資料沒有 save_seq 時看 n_visits），相同時取後面的
  const byKey = new Map();
  const newer = (r, o) => (Number(r.save_seq) || 0) - (Number(o.save_seq) || 0) || (Number(r.n_visits) || 0) - (Number(o.n_visits) || 0);
  responses.forEach(r => {
    const k = r.pid + "|" + r.set_id, o = byKey.get(k);
    if (!o || newer(r, o) >= 0) byKey.set(k, r);
  });
  const resp = [...byKey.values()];
  // 依目前題目的正確答案計分（答案修正後會自動重算）
  const setMap = Object.fromEntries(sets.map(s => [s.set_id, s]));
  resp.forEach(r => {
    const items = setMap[r.set_id]?.items || [];
    r.correct = Object.fromEntries(items.map(it => [it.id, (r.responses || {})[it.id] === it.answer]));
    r.n_correct = Object.values(r.correct).filter(Boolean).length;
    r.n_items = items.length || r.n_items;
  });
  const people = sessions.map(s => {
    const rs = resp.filter(r => r.pid === s.pid);
    const leaveMs = rs.reduce((a, r) => a + (Number(r.leave_ms) || 0), 0);
    const reasons = [];
    if (F.useAway && leaveMs > F.maxAwaySec * 1000) reasons.push(`離開 ${sec(leaveMs)} 秒`);
    if (F.useSeen && s.seen_items === "是") reasons.push("看過試題");
    if (F.useSaveFail && s.save_failed) reasons.push("部分資料未能儲存");   // 受試者端重試後仍上傳失敗（見 save_failed 欄）
    return {
      ...s, rs, leaveMs, reasons,
      nLeaves: rs.reduce((a, r) => a + (Number(r.n_leaves) || 0), 0),
      fsExits: rs.reduce((a, r) => a + (Number(r.n_fullscreen_exits) || 0), 0),
      score: rs.reduce((a, r) => a + (Number(r.n_correct) || 0), 0),
      nItems: rs.reduce((a, r) => a + (Number(r.n_items) || 0), 0),
      setMs: rs.reduce((a, r) => a + (Number(r.rt_ms) || 0), 0)
    };
  });
  const included = people.filter(p => p.status === "completed" && !p.reasons.length);
  // 試題分析：答對率 P、鑑別度 D（依題本總分取高低各 27%）
  const rows = [];
  const bySetOrder = [...sets].sort((a, b) => String(a.booklet).localeCompare(String(b.booklet)) || (a.order || 0) - (b.order || 0));
  bySetOrder.forEach(set => {
    const grp = included.filter(p => p.booklet === set.booklet).sort((a, b) => b.score - a.score);
    const g = grp.length >= 4 ? Math.max(1, Math.round(grp.length * 0.27)) : 0;
    const hi = new Set(grp.slice(0, g).map(p => p.pid)), lo = new Set(grp.slice(-g).map(p => p.pid));
    const rr = resp.filter(r => r.set_id === set.set_id && grp.some(p => p.pid === r.pid));
    const effort = rr.map(r => Number(r.effort)).filter(x => !isNaN(x) && x > 0);
    const meanEff = effort.length ? effort.reduce((a, b) => a + b, 0) / effort.length : null;
    const meanRt = rr.length ? rr.reduce((a, r) => a + (Number(r.rt_ms) || 0), 0) / rr.length : null;
    set.items.forEach((it, n) => {
      const ans = rr.map(r => (r.responses || {})[it.id] ?? null);
      const N = ans.length;
      const P = N ? ans.filter(a => a === it.answer).length / N : null;
      const pOf = ids => { const a = rr.filter(r => ids.has(r.pid)); return a.length ? a.filter(r => (r.responses || {})[it.id] === it.answer).length / a.length : null; };
      const D = g ? pOf(hi) - pOf(lo) : null;
      const dist = Object.fromEntries(KEYS.map(k => [k, N ? ans.filter(a => a === k).length / N : null]));
      rows.push({ booklet: set.booklet, set_id: set.set_id, no: n + 1, item_id: it.id, answer: it.answer, N, P, D, blank: N ? ans.filter(a => a === null).length / N : null, flagged: N ? rr.filter(r => (r.flags || []).includes(it.id)).length / N : null, dist, meanEff, meanRt, active: set.active !== false });
    });
  });
  return { people, included, rows, resp };
}

function renderData() {
  if (!S.data) return;
  const A = analyse();
  const booklets = [...new Set(A.people.map(p => p.booklet))].sort();
  const done = A.people.filter(p => p.status === "completed").length;
  $("#view-data").innerHTML = `
    <div class="actions">
      <button class="btn small" id="refresh" type="button">重新整理</button>
      <button class="btn ghost small" id="csvItems" type="button">下載試題分析 CSV</button>
      <button class="btn ghost small" id="csvLong" type="button">下載作答資料 CSV</button>
      <button class="btn ghost small" id="csvPeople" type="button">下載受試者 CSV</button>
      ${API.demo ? '<button class="btn danger small" id="resetDemo" type="button">清除示範資料</button>' : ""}
    </div>
    <div class="chips">
      <span class="chip">已完成<b>${done}</b></span>
      <span class="chip">未完成<b>${A.people.length - done}</b></span>
      ${booklets.map(b => `<span class="chip">題本 ${esc(b)} 完成<b>${A.people.filter(p => p.booklet === b && p.status === "completed").length}</b></span>`).join("")}
      <span class="chip">納入分析<b>${A.included.length}</b></span>
    </div>
    <div class="filters">
      <strong>排除條件</strong>
      <label class="check"><input type="checkbox" id="fAway" ${F.useAway ? "checked" : ""}> 作答期間累計離開超過 <input type="number" id="fAwaySec" min="0" value="${F.maxAwaySec}"> 秒</label>
      <label class="check"><input type="checkbox" id="fSeen" ${F.useSeen ? "checked" : ""}> 看過114或115學年度試題</label>
      <label class="check"><input type="checkbox" id="fSaveFail" ${F.useSaveFail ? "checked" : ""}> 部分資料未能儲存</label>
      <span class="muted">只有「已完成」且未被排除的受試者納入試題分析。</span>
    </div>
    <h2>試題分析</h2>
    <p class="muted">答對率＝答對人數 ÷ 作答人數（留空算答錯）；鑑別度＝題本總分前 27% 與後 27% 的答對率差，納入人數少於 4 人時不計算。</p>
    <div class="tablebox"><table>
      <thead><tr><th>題本</th><th>題組</th><th>題號</th><th>答案</th><th>人數</th><th>答對率 P</th><th>鑑別度 D</th><th>留空率</th><th>標註不確定率</th>${KEYS.map(k => `<th>選 ${k}</th>`).join("")}<th>題組平均心力</th><th>題組平均作答（秒）</th></tr></thead>
      <tbody>${A.rows.map(r => `<tr${r.active ? "" : ' class="excluded"'}><td>${esc(r.booklet)}</td><td>${esc(r.set_id)}</td><td class="n">${r.no}</td><td>${r.answer}</td><td class="n">${r.N}</td>
        <td class="n">${pct(r.P)}</td><td class="n${r.D != null && r.D < 0.2 ? " low" : ""}">${pct(r.D)}</td><td class="n">${pct(r.blank)}</td><td class="n">${pct(r.flagged)}</td>
        ${KEYS.map(k => `<td class="n">${pct(r.dist[k])}</td>`).join("")}<td class="n">${r.meanEff == null ? "—" : r.meanEff.toFixed(2)}</td><td class="n">${sec(r.meanRt)}</td></tr>`).join("") || `<tr><td colspan="15" class="muted">還沒有題目。</td></tr>`}</tbody>
    </table></div>
    <h2>受試者</h2>
    <div class="tablebox"><table>
      <thead><tr><th>編碼</th><th>題本</th><th>狀態</th><th>開始時間</th><th>得分</th><th>題組作答（秒）</th><th>離開次數</th><th>離開（秒）</th><th>退出全螢幕</th><th>複製嘗試</th><th>看過試題</th><th>排除原因</th></tr></thead>
      <tbody>${A.people.map(p => `<tr${p.reasons.length ? ' class="excluded"' : ""}><td style="font-family:var(--f-num)">${esc(p.pid)}</td><td>${esc(p.booklet)}</td>
        <td><span class="pill ${p.status === "completed" ? "ok" : "wip"}">${p.status === "completed" ? "已完成" : "未完成"}</span></td><td>${fmtTime(p.started_at)}</td>
        <td class="n">${p.score} / ${p.nItems}</td><td class="n">${sec(p.setMs)}</td><td class="n">${p.nLeaves}</td><td class="n">${sec(p.leaveMs)}</td><td class="n">${p.fsExits}</td>
        <td class="n">${p.copy_attempts ?? "—"}</td><td>${esc(p.seen_items || "—")}</td><td>${p.reasons.map(esc).join("、") || "—"}</td></tr>`).join("") || `<tr><td colspan="12" class="muted">還沒有受試者。把受試者版的連結發出去後，資料會出現在這裡。</td></tr>`}</tbody>
    </table></div>`;
  $("#refresh").addEventListener("click", async () => { await loadAll(true); renderData(); });
  $("#fAway").addEventListener("change", e => { F.useAway = e.target.checked; renderData(); });
  $("#fAwaySec").addEventListener("change", e => { F.maxAwaySec = Number(e.target.value) || 0; renderData(); });
  $("#fSeen").addEventListener("change", e => { F.useSeen = e.target.checked; renderData(); });
  $("#fSaveFail").addEventListener("change", e => { F.useSaveFail = e.target.checked; renderData(); });
  $("#csvItems").addEventListener("click", () => download("試題分析.csv",
    [["題本", "題組", "題號", "題目代碼", "正確答案", "人數", "答對率P", "鑑別度D", "留空率", "標註不確定率", ...KEYS.map(k => "選" + k), "題組平均心力", "題組平均作答秒數"],
     ...A.rows.map(r => [r.booklet, r.set_id, r.no, r.item_id, r.answer, r.N, r.P, r.D, r.blank, r.flagged, ...KEYS.map(k => r.dist[k]), r.meanEff, r.meanRt == null ? "" : r.meanRt / 1000])]));
  $("#csvLong").addEventListener("click", () => {
    const setMap = Object.fromEntries(S.data.sets.map(s => [s.set_id, s]));
    const out = [["受試者", "題本", "題組", "題組順序", "題目代碼", "作答", "標註不確定", "正確答案", "答對", "首次作答毫秒", "題組作答毫秒（累計）", "首次送出前作答毫秒", "進入題組次數", "心力耗費", "心力作答毫秒", "離開次數", "離開毫秒", "退出全螢幕", "畫記段數", "納入分析"]];
    const inc = new Set(A.included.map(p => p.pid));
    A.resp.forEach(r => (setMap[r.set_id]?.items || Object.keys(r.responses || {}).map(id => ({ id }))).forEach(it => {
      const a = (r.responses || {})[it.id] ?? "";
      out.push([r.pid, r.booklet, r.set_id, r.set_order, it.id, a, (r.flags || []).includes(it.id) ? 1 : 0, it.answer ?? "", (r.correct || {})[it.id] ? 1 : 0, (r.first_answer_ms || {})[it.id] ?? "", r.rt_ms, r.first_rt_ms ?? r.rt_ms, r.n_visits || 1, r.effort, r.effort_rt_ms, r.n_leaves, r.leave_ms, r.n_fullscreen_exits, (r.highlights || []).length, inc.has(r.pid) ? 1 : 0]);
    }));
    download("作答資料.csv", out);
  });
  $("#csvPeople").addEventListener("click", () => download("受試者.csv",
    [["受試者", "題本", "狀態", "開始時間", "完成時間", "總時間毫秒", "得分", "題數", "學測年度", "重考", "看過試題", "國文家教", "離開次數", "離開毫秒", "退出全螢幕", "複製嘗試", "排除原因", "未能儲存的資料", "裝置", "螢幕"],
     ...A.people.map(p => [p.pid, p.booklet, p.status, p.started_at, p.completed_at, p.total_ms, p.score, p.nItems, p.exam_year, p.retake, p.seen_items, p.tutor, p.nLeaves, p.leaveMs, p.fsExits, p.copy_attempts, p.reasons.join("、"), p.save_failed || "", p.user_agent, p.screen])]));
  const rd = $("#resetDemo");
  if (rd) rd.addEventListener("click", () => {
    if (rd.dataset.confirm !== "1") { rd.dataset.confirm = "1"; rd.textContent = "確定清除？再按一次"; return; }
    API.resetDemo(); location.reload();
  });
}

function download(name, rows) {
  const csv = "﻿" + rows.map(r => r.map(v => {
    const s = v == null ? "" : typeof v === "number" ? String(Math.round(v * 10000) / 10000) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* 自動登入（同一個分頁內） */
const saved = ss.get("nstc_admin_key");
if (saved) { $("#key").value = saved; login(saved); }
