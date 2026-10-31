/* 管理者版：題目編輯（即時預覽）＋頁面文字（即時預覽）＋收集資料（試題分析、受試者列表、CSV 下載） */
const $ = s => document.querySelector(s);
const S = { key: "", sets: [], images: {}, texts: {}, cur: 0, dirty: false, data: null };
const YEARS = (APP_CONFIG.ITEM_YEARS || []).map(Number);
const YEARS_TXT = textVars(APP_CONFIG).YEARS;
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
    if (S.data && S.data.sheet_url) $("#mode").innerHTML = `<a href="${esc(S.data.sheet_url)}" target="_blank" rel="noopener">已連線 Google 試算表 ↗</a>`;
    showTab("edit");
  } catch (e) {
    $("#loginErr").textContent = e.message || "登入失敗";
    $("#loginErr").hidden = false;
  }
}
$("#loginBtn").addEventListener("click", () => login($("#key").value.trim()));
$("#key").addEventListener("keydown", e => { if (e.key === "Enter") login($("#key").value.trim()); });
$("#logout").addEventListener("click", () => { ss.set("nstc_admin_key", ""); location.reload(); });
window.addEventListener("beforeunload", e => { if (S.dirty || TS.dirty) { e.preventDefault(); e.returnValue = ""; } });

function showTab(t) {
  ["edit", "texts", "data"].forEach(k => {
    $("#view-" + k).hidden = t !== k;
    $("#tab-" + k).setAttribute("aria-selected", String(t === k));
  });
  if (t === "data") renderData();
  if (t === "texts") renderTexts();
}
$("#tab-edit").addEventListener("click", () => showTab("edit"));
$("#tab-texts").addEventListener("click", () => showTab("texts"));
$("#tab-data").addEventListener("click", async () => { await loadAll(true); showTab("data"); });

async function loadAll(dataOnly) {
  const all = await API.getAll(S.key);
  S.data = all;
  if (!dataOnly || !S.sets.length) {
    S.sets = JSON.parse(JSON.stringify(all.sets || []));
    S.images = { ...(all.images || {}) };
    S.texts = { ...(all.texts || {}) };
    S.cur = Math.min(S.cur, Math.max(0, S.sets.length - 1));
    renderEditor();
  }
}

/* ================= 題目編輯 ================= */
const sorted = () => S.sets.map((s, i) => ({ s, i })).sort((a, b) => String(a.s.booklet).localeCompare(String(b.s.booklet)) || (a.s.order || 0) - (b.s.order || 0));
const passageToText = p => (p || []).join("\n\n");
const textToPassage = (t, keep) => t.replace(/\r/g, "").split(/\n\s*\n/).map(x => {
  const lines = x.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length && lines.every(l => l.startsWith("|"))) return lines.join("\n");   // 表格一律保留換行
  return keep ? lines.join("\n") : lines.join("");
}).filter(Boolean);
const nextItemId = set => { let n = 1; const ids = new Set(set.items.map(i => i.id)); while (ids.has("q" + n)) n++; return "q" + n; };

function markDirty(v = true) {
  S.dirty = v;
  const el = $("#saveStatus");
  if (el) { el.textContent = v ? "有未儲存的變更" : "已儲存"; el.className = "status " + (v ? "dirty" : "saved"); }
}

/* 題本列表：正式題本依字母排序，練習題本放最後 */
const booklets = () => [...new Set(S.sets.map(s => String(s.booklet || "")))].filter(Boolean)
  .sort((a, b) => (a === PRACTICE_BOOKLET) - (b === PRACTICE_BOOKLET) || a.localeCompare(b));
/* 同一題本內依目前順序重新編號 1, 2, 3… */
function renumber(b) {
  S.sets.filter(s => String(s.booklet) === String(b)).sort((x, y) => (x.order || 0) - (y.order || 0)).forEach((s, k) => { s.order = k + 1; });
}
function renderSetList() {
  const groups = {};
  sorted().forEach(({ s, i }) => (groups[s.booklet || "（未指定）"] ||= []).push({ s, i }));
  const order = Object.keys(groups).sort((a, b) => (a === PRACTICE_BOOKLET) - (b === PRACTICE_BOOKLET) || a.localeCompare(b));
  $("#setList").innerHTML = (order.length ? order.map(b => `
    <div class="bk" data-booklet="${esc(b)}"><h3>題本 ${esc(b)}</h3><ul>
      ${groups[b].map(({ s, i }) => `<li draggable="true" data-i="${i}"><button class="setbtn" type="button" data-i="${i}" aria-current="${i === S.cur}">
        <span class="id"><span class="grip" aria-hidden="true">⋮⋮</span>${s.order || "–"}. ${esc(s.set_id || "（未命名）")}</span>
        <span class="meta">${(s.items || []).length} 題${s.active === false ? "・未啟用" : ""}</span></button></li>`).join("")}
    </ul></div>`).join("") : '<p class="muted">還沒有題組。</p>')
    + '<p class="hint">拖曳題組可以調整順序，或拖到其他題本。</p>';
  $("#setList").querySelectorAll(".setbtn").forEach(b => b.addEventListener("click", () => { S.cur = +b.dataset.i; renderEditor(); }));
  // 拖曳排序：放到某個題組上＝插在它前面（拖到下半部則插在後面）；放到題本空白處＝排到最後
  let dragI = null;
  $("#setList").querySelectorAll("li[draggable]").forEach(li => {
    li.addEventListener("dragstart", e => { dragI = +li.dataset.i; li.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", li.dataset.i); });
    li.addEventListener("dragend", () => { li.classList.remove("dragging"); $("#setList").querySelectorAll(".drop-before,.drop-after").forEach(x => x.classList.remove("drop-before", "drop-after")); });
    li.addEventListener("dragover", e => {
      e.preventDefault();
      const r = li.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      li.classList.toggle("drop-after", after); li.classList.toggle("drop-before", !after);
    });
    li.addEventListener("dragleave", () => li.classList.remove("drop-before", "drop-after"));
    li.addEventListener("drop", e => {
      e.preventDefault(); e.stopPropagation();
      const target = S.sets[+li.dataset.i], moving = S.sets[dragI];
      if (!moving || moving === target) return renderSetList();
      const after = li.classList.contains("drop-after"), from = moving.booklet;
      moving.booklet = target.booklet;
      const list = S.sets.filter(s => String(s.booklet) === String(target.booklet) && s !== moving).sort((x, y) => (x.order || 0) - (y.order || 0));
      list.splice(list.indexOf(target) + (after ? 1 : 0), 0, moving);
      list.forEach((s, k) => { s.order = k + 1; });
      if (from !== target.booklet) renumber(from);
      markDirty(); renderEditor();
    });
  });
  $("#setList").querySelectorAll(".bk").forEach(bk => {
    bk.addEventListener("dragover", e => e.preventDefault());
    bk.addEventListener("drop", e => {
      e.preventDefault();
      const moving = S.sets[dragI];
      if (!moving) return;
      const from = moving.booklet;
      moving.booklet = bk.dataset.booklet;
      moving.order = Math.max(0, ...S.sets.filter(s => s !== moving && String(s.booklet) === bk.dataset.booklet).map(s => s.order || 0)) + 1;
      renumber(from); renumber(moving.booklet);
      markDirty(); renderEditor();
    });
  });
  renderTestLinks();
}
/* 以測試模式開啟受試者頁：不擋重複作答、資料標記為測試（不納入分析、不影響題本分派），可指定題本 */
function renderTestLinks() {
  const box = $("#testLinks");
  if (!box) return;
  const key = APP_CONFIG.TEST_KEY;
  if (!key) { box.innerHTML = ""; return; }
  const url = b => `index.html?test=${encodeURIComponent(key)}${b ? "&booklet=" + encodeURIComponent(b) : ""}`;
  const formal = booklets().filter(b => b !== PRACTICE_BOOKLET);
  box.innerHTML = `<h3>測試受試者頁</h3>
    <p class="hint">用這些連結開啟的受試者頁不會擋重複作答，作答資料會標記為「測試」，不納入分析。<b>不要把這些連結給受試者。</b></p>
    <div class="tools"><a class="tool" href="${url("")}" target="_blank" rel="noopener">隨機題本</a>
      ${formal.map(b => `<a class="tool" href="${url(b)}" target="_blank" rel="noopener">題本 ${esc(b)}</a>`).join("")}</div>
    <p class="hint">在某台電腦被擋在「你已經完成過本研究」時，在那台電腦開啟：
      <a href="index.html?reset=${encodeURIComponent(key)}" target="_blank" rel="noopener">清除這台電腦的作答紀錄</a></p>`;
}

let pvTimer = null;
function renderPreview() {
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => {
    const set = S.sets[S.cur];
    if (!set) { $("#preview").innerHTML = '<p class="muted">選擇或新增一個題組。</p>'; return; }
    const inBk = S.sets.filter(s => s.booklet === set.booklet && s.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
    const idx = Math.max(0, inBk.indexOf(set));
    const label = String(set.booklet) === PRACTICE_BOOKLET ? "練習題組" : null;
    $("#preview").innerHTML = renderSet(set, { idx, total: inBk.length || 1, startNo: inBk.includes(set) ? startNoFor(set, inBk) : 1, showSource: true, label, images: S.images });
    attachHighlighter($("#preview .set-screen"));
    fitPreview();
  }, 120);
}
/* 預覽窗比受試者畫面窄時，把試題紙等比例縮小（版面以 em 為單位，換行位置與受試者畫面相同） */
function fitPreview() {
  const paper = $("#preview .paper");
  if (!paper) return;
  const base = APP_CONFIG.EXAM_FONT_PX || 17;
  const natural = 48.5 * base + 2;                       // 版心 42.5em + 左右邊界 6em + 邊框
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
    $("#form").innerHTML = `<p class="muted">還沒有題組。按左側「新增題組」開始，或先載入示範題組看看格式。</p>
      <button class="btn ghost small" id="loadDemo" type="button" style="justify-self:start">載入示範題組</button>`;
    $("#loadDemo").addEventListener("click", () => { S.sets = JSON.parse(JSON.stringify(DEMO_SETS)); S.cur = 0; markDirty(); renderEditor(); });
    renderPreview(); return;
  }
  $("#form").innerHTML = `
    <div class="actions"><button class="btn" id="save" type="button">儲存全部變更</button><span class="status" id="saveStatus"></span></div>
    <div id="errors"></div>
    <div class="row">
      <label class="f"><span>題組代號</span><input type="text" id="f_set_id" value="${esc(set.set_id)}" placeholder="例：114-R1"></label>
      <label class="f"><span>題本</span><input type="text" id="f_booklet" value="${esc(set.booklet)}" placeholder="A、B 或 練習"></label>
    </div>
    <label class="check"><input type="checkbox" id="f_active" ${set.active !== false ? "checked" : ""}> 啟用（取消勾選後受試者不會看到這個題組）</label>
    <label class="f"><span>來源說明</span><input type="text" id="f_source" value="${esc(set.source)}" placeholder="例：114學年度學測國文 第21–22題"></label>
    <label class="check"><input type="checkbox" id="f_keep" ${set.keep_breaks ? "checked" : ""}> 保留換行（新詩、古詩等需要照原本分行的文章）</label>
    <label class="f"><span>文章</span><textarea id="f_passage" rows="12">${esc(passageToText(set.passage))}</textarea>
      <span class="hint">段落之間空一行。沒勾「保留換行」時，從 PDF 貼上的段落內換行會自動合併。<br>
      標記：<code>__文字__</code> 底線、<code>**文字**</code> 粗體、段落開頭 <code>【甲】</code> 多文本標籤、段落開頭 <code>注：</code> 注釋、
      每行以 <code>|</code> 開頭為表格（<code>| 格 | 格 |</code>，格子開頭加 <code>!</code> 為標題格）、圖片用下方按鈕插入。題幹與選項也可以用底線、粗體。</span></label>
    <div class="actions"><label class="btn ghost small"><input type="file" id="f_img" accept="image/*" hidden>插入圖片</label>
      <span class="hint">圖片會縮到最寬 1200px 後存進試算表，並在文章游標處插入 <code>![圖說](img:代號)</code>。</span></div>
    <div id="itemEds" style="display:grid;gap:10px"></div>
    <div class="actions">
      <button class="btn ghost small" id="addItem" type="button">新增題目</button>
      <button class="btn ghost small" id="dupSet" type="button">複製此題組</button>
      <button class="btn danger small" id="delSet" type="button">刪除此題組</button>
    </div>`;
  markDirty(S.dirty);
  const bind = (id, fn) => $(id).addEventListener("input", e => { fn(e.target); markDirty(); renderPreview(); renderSetList(); });
  bind("#f_set_id", t => set.set_id = t.value.trim());
  $("#f_booklet").addEventListener("change", e => {      // 換題本時排到新題本的最後
    const from = set.booklet, to = e.target.value.trim().toUpperCase() || from;
    if (to === from) return;
    set.booklet = to;
    set.order = Math.max(0, ...S.sets.filter(s => s !== set && String(s.booklet) === to).map(s => s.order || 0)) + 1;
    renumber(from); markDirty(); renderEditor();
  });
  $("#f_active").addEventListener("change", e => { set.active = e.target.checked; markDirty(); renderPreview(); renderSetList(); });
  bind("#f_source", t => set.source = t.value);
  bind("#f_passage", t => set.passage = textToPassage(t.value, set.keep_breaks));
  $("#f_keep").addEventListener("change", e => { set.keep_breaks = e.target.checked; set.passage = textToPassage($("#f_passage").value, set.keep_breaks); markDirty(); renderPreview(); });
  $("#f_img").addEventListener("change", async e => {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    const id = "i" + Date.now().toString(36);
    S.images[id] = await shrinkImage(file);
    const ta = $("#f_passage"), at = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, at) + `\n\n![](img:${id})\n\n` + ta.value.slice(at);
    set.passage = textToPassage(ta.value, set.keep_breaks);
    markDirty(); renderPreview();
  });
  $("#save").addEventListener("click", save);
  $("#addItem").addEventListener("click", () => { set.items.push({ id: nextItemId(set), stem: "", options: ["", "", "", ""], answer: "" }); markDirty(); renderItems(); renderPreview(); renderSetList(); });
  $("#dupSet").addEventListener("click", () => {
    const copy = JSON.parse(JSON.stringify(set)); copy.set_id = set.set_id + "-copy"; copy.order = (set.order || 0) + 1;
    S.sets.push(copy); S.cur = S.sets.length - 1; markDirty(); renderEditor();
  });
  const del = $("#delSet");
  del.addEventListener("click", () => {
    if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = "確定刪除？再按一次"; setTimeout(() => { if (del.isConnected) { del.dataset.confirm = ""; del.textContent = "刪除此題組"; } }, 4000); return; }
    const from = S.sets[S.cur].booklet;
    S.sets.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1); renumber(from); markDirty(); renderEditor();
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

$("#addBooklet").addEventListener("click", () => {
  const used = new Set(booklets());
  let b = "A"; while (used.has(b)) b = String.fromCharCode(b.charCodeAt(0) + 1);
  S.sets.push({ set_id: "", booklet: b, order: 1, active: true, source: "", passage: [], items: [{ id: "q1", stem: "", options: ["", "", "", ""], answer: "" }] });
  S.cur = S.sets.length - 1; markDirty(); renderEditor(); $("#f_set_id").focus();
});
$("#addSet").addEventListener("click", () => {
  const b = S.sets[S.cur]?.booklet || "A";
  const order = Math.max(0, ...S.sets.filter(s => s.booklet === b).map(s => s.order || 0)) + 1;
  S.sets.push({ set_id: "", booklet: b, order, active: true, source: "", passage: [], items: [{ id: "q1", stem: "", options: ["", "", "", ""], answer: "" }] });
  S.cur = S.sets.length - 1; markDirty(); renderEditor(); $("#f_set_id").focus();
});

/* 上傳的圖片縮到最寬 1200px，存成 data URL（PNG 較清楚；太大時改用 JPEG） */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1200 / img.width);
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      let url = c.toDataURL("image/png");
      if (url.length > 400000) url = c.toDataURL("image/jpeg", 0.85);
      URL.revokeObjectURL(img.src); resolve(url);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
// 存檔時只送出題組文章裡用到的圖片
const usedImages = () => {
  const ids = new Set();
  S.sets.forEach(s => (s.passage || []).forEach(p => { for (const m of String(p).matchAll(/\(img:([^)\s]+)\)/g)) ids.add(m[1]); }));
  return Object.fromEntries([...ids].filter(id => S.images[id]).map(id => [id, S.images[id]]));
};

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
    await API.saveSets(S.key, S.sets, usedImages());
    markDirty(false);
  } catch (e) {
    $("#errors").innerHTML = `<div class="errors">儲存失敗：${esc(e.message)}。請確認網路連線後再試一次。</div>`;
  } finally { btn.disabled = false; btn.textContent = "儲存全部變更"; }
}

/* ================= 收集資料 ================= */
const F = { maxAwaySec: 30, useAway: true, useSeen: true, useYear: true, useSaveFail: true, useHonest: false, useTest: true };
/* 排除條件：k 對應 F.useXxx；desc 是給使用者看的說明 */
const FILTERS = [
  { k: "Test", short: () => "測試資料", label: () => "測試資料", desc: "用管理頁「測試受試者頁」連結作答的資料。" },
  { k: "Away", short: () => "離開過久", label: () => `作答期間累計離開超過 <input type="number" id="fAwaySec" min="0" value="${F.maxAwaySec}"> 秒`, desc: "切換到其他視窗或分頁的累計時間（含重新整理中斷的時間），可能分心或查資料。" },
  { k: "Year", short: () => `學測年度為${YEARS_TXT}`, label: () => `學測年度為${YEARS_TXT}學年度`, desc: "考過與施測試題同年度的學測，等於作答過這些題目。" },
  { k: "Seen", short: () => "看過試題", label: () => `看過${YEARS_TXT}學年度試題`, desc: "背景問卷中自填看過施測試題。" },
  { k: "SaveFail", short: () => "部分資料未能儲存", label: () => "部分資料未能儲存", desc: "網路問題導致部分作答資料沒有上傳成功，資料不完整。" },
  { k: "Honest", short: () => "自評未獨立作答", label: () => "自評未獨立作答", desc: "結尾問卷自評有查資料或請人協助。預設不排除，可視需要勾選。" }
];
const DATA_OPEN = new Set();   // 記住「排除條件」「詳細資料」是否展開（調整條件時畫面會重畫）
const isTest = s => s.is_test === true || s.is_test === "TRUE" || s.is_test === "true";
// 參加學測的年度與施測試題相同（例如預試時勾選 114 或 115 學年度）
const tookItemYear = s => (String(s.exam_year || "").match(/\d{3}/g) || []).map(Number).some(y => YEARS.includes(y));
const fmtTime = t => { if (!t) return "—"; const d = new Date(t); return isNaN(d) ? String(t) : d.toLocaleString("zh-TW", { hour12: false }); };
const sec = ms => ms == null || ms === "" ? "—" : (ms / 1000).toFixed(1);
const pct = x => x == null || isNaN(x) ? "—" : x.toFixed(2);

function analyse() {
  const { sessions, responses } = S.data;
  const sets = S.data.sets.filter(s => String(s.booklet) !== PRACTICE_BOOKLET);   // 練習題組不分析
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
    const flags = {
      Away: leaveMs > F.maxAwaySec * 1000, Test: isTest(s), Year: tookItemYear(s), Seen: s.seen_items === "是",
      SaveFail: !!s.save_failed,                                   // 受試者端重試後仍上傳失敗（見 save_failed 欄）
      Honest: !!s.honest && s.honest !== BG_OPTIONS.honest[0]
    };
    const reasons = FILTERS.filter(f => F["use" + f.k] && flags[f.k]).map(f => f.k === "Away" ? `離開 ${sec(leaveMs)} 秒` : f.short());
    return {
      ...s, rs, leaveMs, flags, reasons,
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
      rows.push({ booklet: set.booklet, set_id: set.set_id, no: n + 1, item_id: it.id, answer: it.answer, N, P, D, blank: N ? ans.filter(a => a === null).length / N : null, dist, meanEff, meanRt, active: set.active !== false });
    });
  });
  return { people, included, rows, resp };
}

function renderData() {
  if (!S.data) return;
  const A = analyse();
  // 總覽的人數不含測試資料（排除測試資料時）
  const real = A.people.filter(p => !(F.useTest && p.flags.Test));
  const nTest = A.people.length - real.length;
  const completed = real.filter(p => p.status === "completed");
  const excluded = completed.filter(p => p.reasons.length);
  const booklets = [...new Set(real.map(p => p.booklet))].filter(Boolean).sort();
  const nMatch = k => A.people.filter(p => p.status === "completed" && p.flags[k]).length;
  const kpi = (n, label, note) => `<div class="kpi"><b>${n}</b><span>${label}</span>${note ? `<small>${note}</small>` : ""}</div>`;
  const dlItem = (id, name, desc) => `<li><button class="btn ghost small" id="${id}" type="button">${name}</button><span class="muted">${desc}</span></li>`;
  $("#view-data").innerHTML = `
    <div class="howto">
      <strong>怎麼使用這一頁</strong>
      <ol>
        <li>看「總覽」確認收到多少份資料、各題本人數是否接近。</li>
        <li>需要時展開「排除條件」，決定哪些受試者不納入分析（預設已勾選建議的條件）。</li>
        <li>按「下載分析用資料」取得逐題作答資料；試題分析、受試者名單與其他檔案在最下方「詳細資料」。</li>
      </ol>
    </div>

    <h2>總覽</h2>
    <div class="kpis">
      ${kpi(completed.length, "已完成")}
      ${kpi(real.length - completed.length, "未完成", "作答中，或中途離開")}
      ${kpi(excluded.length, "已完成但排除", "符合下方排除條件")}
      ${kpi(A.included.length, "納入分析")}
    </div>
    <p class="muted">各題本完成人數：${booklets.map(b => `題本 ${esc(b)} <b>${completed.filter(p => p.booklet === b).length}</b> 人`).join("・") || "—"}
      ${nTest ? `（另有測試資料 ${nTest} 筆，未計入）` : ""}</p>
    <div class="actions">
      <button class="btn" id="dlMain" type="button">下載分析用資料（${A.included.length} 人）</button>
      <button class="btn ghost small" id="refresh" type="button">重新整理</button>
      ${API.demo ? '<button class="btn danger small" id="resetDemo" type="button">清除示範資料</button>' : ""}
    </div>
    <p class="hint">分析用資料：每一列是一位受試者的一題（作答、對錯、時間、心力評分等），只包含「已完成」且未被排除的受試者。</p>

    <details class="sec" data-k="filters" ${DATA_OPEN.has("filters") ? "open" : ""}>
      <summary>排除條件<span class="muted">目前排除 ${excluded.length} 人</span></summary>
      <p class="hint">勾選的條件會用在總覽、下載與試題分析。右側人數為「已完成」的受試者中符合該條件的人數。</p>
      <ul class="flist">${FILTERS.map(f => `<li>
        <label class="check"><input type="checkbox" id="f${f.k}" ${F["use" + f.k] ? "checked" : ""}> ${f.label()}</label>
        <span class="cnt">${nMatch(f.k)} 人</span><p class="muted">${f.desc}</p></li>`).join("")}</ul>
    </details>

    <details class="sec" data-k="detail" ${DATA_OPEN.has("detail") ? "open" : ""}>
      <summary>詳細資料與其他下載</summary>
      <ul class="dlist">
        ${dlItem("csvItems", "試題分析", "每一列是一題：答對率、鑑別度、各選項選答比例（即下方表格）。")}
        ${dlItem("csvPeople", "受試者資料", "每一列是一位受試者：背景問卷、回饋意見、離開次數、排除原因（含被排除者）。")}
        ${dlItem("csvLong", "全部作答資料", "格式同分析用資料，但包含被排除與未完成者，最後一欄「納入分析」標記 1 或 0。")}
      </ul>
      <h3>試題分析</h3>
      <p class="muted">答對率＝答對人數 ÷ 作答人數（留空算答錯）；鑑別度＝題本總分前 27% 與後 27% 的答對率差，納入人數少於 4 人時不計算；低於 0.2 以紅字標示。</p>
      <div class="tablebox"><table>
        <thead><tr><th>題本</th><th>題組</th><th>題號</th><th>答案</th><th>人數</th><th>答對率 P</th><th>鑑別度 D</th><th>留空率</th>${KEYS.map(k => `<th>選 ${k}</th>`).join("")}<th>題組平均心力</th><th>題組平均作答（秒）</th></tr></thead>
        <tbody>${A.rows.map(r => `<tr${r.active ? "" : ' class="excluded"'}><td>${esc(r.booklet)}</td><td>${esc(r.set_id)}</td><td class="n">${r.no}</td><td>${r.answer}</td><td class="n">${r.N}</td>
          <td class="n">${pct(r.P)}</td><td class="n${r.D != null && r.D < 0.2 ? " low" : ""}">${pct(r.D)}</td><td class="n">${pct(r.blank)}</td>
          ${KEYS.map(k => `<td class="n">${pct(r.dist[k])}</td>`).join("")}<td class="n">${r.meanEff == null ? "—" : r.meanEff.toFixed(2)}</td><td class="n">${sec(r.meanRt)}</td></tr>`).join("") || `<tr><td colspan="14" class="muted">還沒有題目。</td></tr>`}</tbody>
      </table></div>
      <h3>受試者</h3>
      <p class="muted">刪除線表示不納入分析，原因見最後一欄。</p>
      <div class="tablebox"><table>
        <thead><tr><th>編碼</th><th>題本</th><th>狀態</th><th>開始時間</th><th>得分</th><th>題組作答（秒）</th><th>離開次數</th><th>離開（秒）</th><th>退出全螢幕</th><th>複製嘗試</th><th>看過試題</th><th>排除原因</th></tr></thead>
        <tbody>${A.people.map(p => `<tr${p.reasons.length ? ' class="excluded"' : ""}><td style="font-family:var(--f-num)">${esc(p.pid)}</td><td>${esc(p.booklet)}</td>
          <td><span class="pill ${p.status === "completed" ? "ok" : "wip"}">${p.status === "completed" ? "已完成" : "未完成"}</span></td><td>${fmtTime(p.started_at)}</td>
          <td class="n">${p.score} / ${p.nItems}</td><td class="n">${sec(p.setMs)}</td><td class="n">${p.nLeaves}</td><td class="n">${sec(p.leaveMs)}</td><td class="n">${p.fsExits}</td>
          <td class="n">${p.copy_attempts ?? "—"}</td><td>${esc(p.seen_items || "—")}</td><td>${p.reasons.map(esc).join("、") || "—"}</td></tr>`).join("") || `<tr><td colspan="12" class="muted">還沒有受試者。把受試者版的連結發出去後，資料會出現在這裡。</td></tr>`}</tbody>
      </table></div>
    </details>`;
  $("#view-data").querySelectorAll("details[data-k]").forEach(d => d.addEventListener("toggle", () => { d.open ? DATA_OPEN.add(d.dataset.k) : DATA_OPEN.delete(d.dataset.k); }));
  $("#refresh").addEventListener("click", async () => { await loadAll(true); renderData(); });
  FILTERS.forEach(f => $("#f" + f.k).addEventListener("change", e => { F["use" + f.k] = e.target.checked; renderData(); }));
  $("#fAwaySec").addEventListener("click", e => e.preventDefault());   // 點數字框不要切換勾選
  $("#fAwaySec").addEventListener("change", e => { F.maxAwaySec = Number(e.target.value) || 0; renderData(); });
  $("#csvItems").addEventListener("click", () => download("試題分析.csv",
    [["題本", "題組", "題號", "題目代碼", "正確答案", "人數", "答對率P", "鑑別度D", "留空率", ...KEYS.map(k => "選" + k), "題組平均心力", "題組平均作答秒數"],
     ...A.rows.map(r => [r.booklet, r.set_id, r.no, r.item_id, r.answer, r.N, r.P, r.D, r.blank, ...KEYS.map(k => r.dist[k]), r.meanEff, r.meanRt == null ? "" : r.meanRt / 1000])]));
  const longRows = onlyIncluded => {
    const setMap = Object.fromEntries(S.data.sets.map(s => [s.set_id, s]));
    const out = [["受試者", "題本", "題組", "題組順序", "題目代碼", "作答", "正確答案", "答對", "首次作答毫秒", "題組作答毫秒", "進入題組次數（重新整理會增加）", "心力耗費", "心力作答毫秒", "離開次數", "離開毫秒", "退出全螢幕", "畫記段數", "納入分析"]];
    const inc = new Set(A.included.map(p => p.pid));
    A.resp.filter(r => !onlyIncluded || inc.has(r.pid)).forEach(r => (setMap[r.set_id]?.items || Object.keys(r.responses || {}).map(id => ({ id }))).forEach(it => {
      const a = (r.responses || {})[it.id] ?? "";
      out.push([r.pid, r.booklet, r.set_id, r.set_order, it.id, a, it.answer ?? "", (r.correct || {})[it.id] ? 1 : 0, (r.first_answer_ms || {})[it.id] ?? "", r.rt_ms, r.n_visits || 1, r.effort, r.effort_rt_ms, r.n_leaves, r.leave_ms, r.n_fullscreen_exits, (r.highlights || []).length, inc.has(r.pid) ? 1 : 0]);
    }));
    return out;
  };
  $("#dlMain").addEventListener("click", () => download("分析用資料.csv", longRows(true)));
  $("#csvLong").addEventListener("click", () => download("全部作答資料.csv", longRows(false)));
  // 管理者新增的背景題目（存在 bg_extra），以題目文字當欄名；已刪除但有資料的題目也保留
  const plain = t => String(t || "").replace(/__|\*\*/g, "").replace(/\{\{YEARS\}\}/g, YEARS_TXT);
  const extraQs = curQs().filter(q => !BG_COLUMNS.includes(q.id));
  A.people.forEach(p => Object.keys(p.bg_extra || {}).forEach(id => { if (!extraQs.some(q => q.id === id)) extraQs.push({ id, label: id }); }));
  $("#csvPeople").addEventListener("click", () => download("受試者.csv",
    [["受試者", "題本", "狀態", "開始時間", "完成時間", "總時間毫秒", "得分", "題數", "學測年度", "重考", "看過試題", "國文家教", "國文級距", "年級", "中文母語", ...extraQs.map(q => plain(q.label)),
      "離開次數", "離開毫秒", "退出全螢幕", "複製嘗試", "重新整理次數", "獨立作答自評", "作答時間是否足夠", "是否想回到前面", "操作不清楚之處", "其他意見", "排除原因", "未能儲存的資料", "裝置", "螢幕"],
     ...A.people.map(p => [p.pid, p.booklet, p.status, p.started_at, p.completed_at, p.total_ms, p.score, p.nItems, p.exam_year, p.retake, p.seen_items, p.tutor, p.zh_level, p.grade, p.native_zh, ...extraQs.map(q => (p.bg_extra || {})[q.id] ?? ""),
      p.nLeaves, p.leaveMs, p.fsExits, p.copy_attempts, p.n_reloads, p.honest, p.fb_time, p.fb_return, p.fb_unclear, p.fb_other, p.reasons.join("、"), p.save_failed || "", p.user_agent, p.screen])]));
  const rd = $("#resetDemo");
  if (rd) rd.addEventListener("click", () => {
    if (rd.dataset.confirm !== "1") { rd.dataset.confirm = "1"; rd.textContent = "確定清除？再按一次"; return; }
    API.resetDemo(); location.reload();
  });
}

/* ================= 頁面文字（受試者各頁的說明，可預覽）================= */
const TS = { page: TEXT_PAGES[0].page, dirty: false };
const txt = k => (k in S.texts ? S.texts[k] : DEFAULT_TEXTS[k]);
function renderTexts() {
  const pg = TEXT_PAGES.find(p => p.page === TS.page) || TEXT_PAGES[0];
  const todo = TEXT_PAGES.filter(p => p.fields.some(f => /【待填/.test(txt(f.key)))).map(p => p.name);
  $("#view-texts").innerHTML = `
    <div class="editor">
      <aside class="sidebar"><ul class="pagelist">${TEXT_PAGES.map(p => `<li><button class="setbtn" type="button" data-page="${p.page}" aria-current="${p.page === pg.page}">
        <span class="id">${esc(p.name)}</span><span class="meta">${p.fields.some(f => f.key in S.texts) || (p.questions && "bg_questions" in S.texts) ? "已修改" : "預設文字"}${p.fields.some(f => /【待填/.test(txt(f.key))) ? "・有待填" : ""}</span></button></li>`).join("")}</ul></aside>
      <div class="form">
        <div class="actions"><button class="btn" id="saveTexts" type="button">儲存頁面文字</button><span class="status" id="textStatus"></span></div>
        ${todo.length ? `<div class="errors">還有【待填】的內容：${esc(todo.join("、"))}。正式施測前請填好。</div>` : ""}
        ${pg.fields.map(f => `<label class="f"><span>${esc(f.label)}</span><textarea rows="${f.rows}" data-key="${f.key}">${esc(txt(f.key))}</textarea></label>
          <div class="actions"><button class="btn ghost small" type="button" data-reset="${f.key}" ${f.key in S.texts ? "" : "disabled"}>還原預設文字</button></div>`).join("")}
        ${pg.questions ? `<h3>題目</h3>
          <p class="hint">可以新增、刪除、調整順序，修改題目文字、題型、選項與是否必答。標示「鎖定」的題目會用在排除條件，不能刪除也不能改選項。<b>施測開始後請不要再改題目</b>，否則前後受試者的資料無法比較。</p>
          <div id="qErrors"></div><div id="qEditor" style="display:grid;gap:10px"></div>
          <div class="actions"><button class="btn ghost small" type="button" id="addQ">新增題目</button>
            <button class="btn ghost small" type="button" id="resetQ" ${"bg_questions" in S.texts ? "" : "disabled"}>還原預設題目</button></div>` : ""}
        <p class="hint">格式：空一行分段；「# 」大標題、「## 」小標題；每行以「- 」開頭為條列；<code>**粗體**</code>、<code>__底線__</code>；
          <code>{{YEARS}}</code>＝${esc(YEARS_TXT)}、<code>{{SET_MINUTES}}</code>＝${esc(APP_CONFIG.SET_MINUTES_HINT || "")}、<code>{{N_SETS}}</code>＝題組數、<code>{{N}}</code>＝未作答題數（只用在確認視窗）。
          <code>【待填：…】</code> 會以醒目底色標示。</p>
      </div>
      <div class="preview"><div class="cap"><span>受試者看到的畫面</span></div><div class="frame" id="textPreview"></div></div>
    </div>`;
  const status = $("#textStatus");
  const mark = v => { TS.dirty = v; status.textContent = v ? "有未儲存的變更" : ""; status.className = "status " + (v ? "dirty" : ""); };
  mark(TS.dirty);
  $("#view-texts").querySelectorAll("[data-page]").forEach(b => b.addEventListener("click", () => { TS.page = b.dataset.page; renderTexts(); }));
  $("#view-texts").querySelectorAll("textarea[data-key]").forEach(ta => ta.addEventListener("input", () => {
    const k = ta.dataset.key;
    if (ta.value === DEFAULT_TEXTS[k]) delete S.texts[k]; else S.texts[k] = ta.value;
    mark(true); textPreview(pg.page);
  }));
  $("#view-texts").querySelectorAll("[data-reset]").forEach(b => b.addEventListener("click", () => { delete S.texts[b.dataset.reset]; TS.dirty = true; renderTexts(); }));
  if (pg.questions) renderQEditor(() => { mark(true); textPreview(pg.page); });
  $("#saveTexts").addEventListener("click", async () => {
    const errs = qErrors();
    if ($("#qErrors")) $("#qErrors").innerHTML = errs.length ? `<div class="errors">背景問卷還不能儲存：<ul class="tight">${errs.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>` : "";
    if (errs.length) { TS.page = "background"; if (pg.page !== "background") renderTexts(); return; }
    const btn = $("#saveTexts"); btn.disabled = true; btn.textContent = "儲存中…";
    try { await API.saveTexts(S.key, S.texts); TS.dirty = false; renderTexts(); $("#textStatus").textContent = "已儲存"; $("#textStatus").className = "status saved"; }
    catch (e) { $("#textStatus").textContent = "儲存失敗：" + e.message; $("#textStatus").className = "status dirty"; btn.disabled = false; btn.textContent = "儲存頁面文字"; }
  });
  textPreview(pg.page);
  makeResizable($("#view-texts .editor"), "texts");
}
/* 背景問卷題目編輯器：改動直接寫回 S.texts.bg_questions（JSON），與預設相同時刪除 */
const curQs = () => bgQuestions({ ...DEFAULT_TEXTS, ...S.texts });
const putQs = qs => {
  const js = JSON.stringify(qs);
  if (js === JSON.stringify(bgQuestions({}))) delete S.texts.bg_questions; else S.texts.bg_questions = js;
};
const optsToText = o => (o || []).join("\n");
const textToOpts = t => t.split("\n").map(x => x.trim()).filter(Boolean);
function qErrors() {
  const errs = [];
  curQs().forEach((q, n) => {
    if (!String(q.label || "").trim()) errs.push(`第 ${n + 1} 題：沒有題目文字`);
    if ((q.type === "single" || q.type === "multi") && (q.options || []).length < 2) errs.push(`第 ${n + 1} 題：選擇題至少要有 2 個選項`);
  });
  return errs;
}
function renderQEditor(changed) {
  const qs = curQs();
  $("#qEditor").innerHTML = qs.map((q, n) => `
    <div class="itemed" data-n="${n}">
      <header><b>第 ${n + 1} 題</b>${q.locked ? '<span class="pill wip">鎖定</span>' : ""}
        <button class="btn ghost small" data-act="up" type="button" ${n === 0 ? "disabled" : ""} aria-label="上移">↑</button>
        <button class="btn ghost small" data-act="down" type="button" ${n === qs.length - 1 ? "disabled" : ""} aria-label="下移">↓</button>
        <button class="btn danger small" data-act="del" type="button" ${q.locked ? "disabled" : ""}>刪除</button></header>
      <label class="f"><span>題目</span><textarea rows="2" data-k="label">${esc(q.label)}</textarea></label>
      ${q.locked
        ? `<p class="hint">${q.type === "years" ? `選項：依 ITEM_YEARS 自動產生（${esc(examYearOptions(APP_CONFIG).join("、"))}），可複選` : `選項：${esc((q.options || []).join("、"))}（${esc(BG_TYPES[q.type])}）`}。排除條件會用到這題。</p>`
        : `<div class="row" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <label class="f"><span>題型</span><select data-k="type">${["single", "multi", "text"].map(t => `<option value="${t}" ${q.type === t ? "selected" : ""}>${BG_TYPES[t]}</option>`).join("")}</select></label>
            <label class="check" style="align-self:end"><input type="checkbox" data-k="required" ${q.required !== false ? "checked" : ""}> 必答</label>
          </div>
          ${q.type === "text" ? "" : `<label class="f"><span>選項（一行一個）</span><textarea rows="${Math.max(2, (q.options || []).length)}" data-k="options">${esc(optsToText(q.options))}</textarea></label>`}`}
      <p class="hint">資料欄位：${BG_COLUMNS.includes(q.id) ? `Sessions 的 <code>${esc(q.id)}</code>` : `Sessions 的 <code>bg_extra</code> 中的 <code>${esc(q.id)}</code>`}</p>
    </div>`).join("");
  const update = fn => { const list = curQs(); fn(list); putQs(list); changed(); };
  $("#qEditor").querySelectorAll(".itemed").forEach(card => {
    const n = +card.dataset.n;
    card.querySelector("[data-k=label]").addEventListener("input", e => update(l => { l[n].label = e.target.value; }));
    card.querySelector("[data-k=type]")?.addEventListener("change", e => { update(l => { l[n].type = e.target.value; if (e.target.value !== "text" && !(l[n].options || []).length) l[n].options = ["是", "否"]; }); renderQEditor(changed); });
    card.querySelector("[data-k=required]")?.addEventListener("change", e => update(l => { l[n].required = e.target.checked; }));
    card.querySelector("[data-k=options]")?.addEventListener("input", e => update(l => { l[n].options = textToOpts(e.target.value); }));
    card.querySelectorAll("[data-act]").forEach(b => b.addEventListener("click", () => {
      update(l => {
        if (b.dataset.act === "del") l.splice(n, 1);
        if (b.dataset.act === "up") [l[n - 1], l[n]] = [l[n], l[n - 1]];
        if (b.dataset.act === "down") [l[n + 1], l[n]] = [l[n], l[n + 1]];
      });
      renderQEditor(changed);
    }));
  });
  $("#addQ").onclick = () => { update(l => l.push({ id: "q_" + Date.now().toString(36), type: "single", label: "", options: ["是", "否"], required: true })); renderQEditor(changed); };
  $("#resetQ").onclick = () => { delete S.texts.bg_questions; changed(); renderQEditor(changed); };
  $("#resetQ").disabled = !("bg_questions" in S.texts);
}

/* 預覽用的是受試者頁同一份版型（texts.js 的 PAGE_HTML） */
function textPreview(page) {
  const T = { ...DEFAULT_TEXTS, ...S.texts };
  const nSets = Math.max(0, ...[...new Set(S.sets.map(s => String(s.booklet)))].filter(b => b !== PRACTICE_BOOKLET)
    .map(b => S.sets.filter(s => String(s.booklet) === b && s.active !== false).length));
  const V = textVars(APP_CONFIG, { N_SETS: nSets, N: 2 });
  const html = {
    device: () => PAGE_HTML.device(T, V, false),
    consent: () => PAGE_HTML.consent(T, V),
    background: () => PAGE_HTML.background(T, V, APP_CONFIG),
    instructions: () => PAGE_HTML.instructions(T, V),
    practice: () => PAGE_HTML.practice_intro(T, V) + "<hr>" + PAGE_HTML.practice_done(T, V),
    confirm: () => `<div class="modal-box" style="margin:0 auto"><p>${renderTextInline(T.confirm_blank, V)}</p><p class="muted">（以上為還有 2 題未作答時）</p><hr><p>${renderTextInline(T.confirm_all, V)}</p></div>`,
    effort: () => PAGE_HTML.effort(T, V),
    post: () => PAGE_HTML.post(T, V),
    complete: () => PAGE_HTML.complete(T, V, APP_CONFIG),
    misc: () => PAGE_HTML.already_done(T, V) + "<hr>" + PAGE_HTML.resume(T, V) + `<hr><p class="fsbar" style="position:static">${esc(T.fullscreen_bar)}</p><p class="muted">離開頁面前的提醒：${esc(T.leave_warning)}</p>`
  }[page];
  $("#textPreview").innerHTML = html ? html() : "";
  $("#textPreview").querySelectorAll("button").forEach(b => { b.type = "button"; });
  $("#textPreview").querySelectorAll("form").forEach(f => f.addEventListener("submit", e => e.preventDefault()));
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

/* ================= 三欄寬度可拖曳調整（記在這台電腦）================= */
function makeResizable(ed, key) {
  if (!ed || ed.querySelector(":scope > .gutter")) return;
  const panes = [...ed.children];
  const gutters = [0, 1].map(n => {
    const g = document.createElement("div");
    g.className = "gutter"; g.setAttribute("role", "separator"); g.setAttribute("aria-orientation", "vertical"); g.title = "拖曳調整欄寬";
    panes[n].after(g); return g;
  });
  let w = [220, 440];
  try { const v = JSON.parse(localStorage.getItem("nstc_cols_" + key)); if (Array.isArray(v) && v.length === 2) w = v; } catch (e) {}
  const apply = () => {
    ed.style.gridTemplateColumns = window.innerWidth > 1200 ? `${w[0]}px 12px ${w[1]}px 12px minmax(0,1fr)` : "";
    if (key === "edit") fitPreview();
  };
  gutters.forEach((g, n) => g.addEventListener("pointerdown", e => {
    e.preventDefault(); g.setPointerCapture(e.pointerId); g.classList.add("active");
    const x0 = e.clientX, w0 = w[n];
    const move = ev => { w[n] = Math.max(n ? 260 : 150, Math.min(900, w0 + ev.clientX - x0)); apply(); };
    const up = () => { g.classList.remove("active"); g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up);
      try { localStorage.setItem("nstc_cols_" + key, JSON.stringify(w)); } catch (err) {} };
    g.addEventListener("pointermove", move); g.addEventListener("pointerup", up);
  }));
  gutters.forEach(g => g.addEventListener("dblclick", () => { w = [220, 440]; apply(); try { localStorage.removeItem("nstc_cols_" + key); } catch (e) {} }));
  window.addEventListener("resize", apply);
  apply();
}
makeResizable($("#view-edit .editor"), "edit");

/* 自動登入（同一個分頁內） */
const saved = ss.get("nstc_admin_key");
if (saved) { $("#key").value = saved; login(saved); }
