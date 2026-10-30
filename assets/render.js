/* 題組畫面：受試者頁與管理者預覽共用同一份程式，確保兩邊看到的完全一樣。
   版面依學測國綜試題本：單欄、標楷體 + Times New Roman、題組說明加底線、文章整段縮排、題號凸排、選項依長度排成 4／2／1 欄。 */
const KEYS = ["A", "B", "C", "D"];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const chars = (s, zone) => [...String(s ?? "")].map((c, i) => `<span class="ch" data-z="${zone}" data-i="${i}">${esc(c)}</span>`).join("");

/* 選項排列：layout 為 "1" "2" "4" 時照設定，"auto"（預設）依最長選項的字數決定，規則仿照學測試題本 */
function optionCols(item) {
  const L = String(item.layout || "auto");
  if (L === "1" || L === "2" || L === "4") return Number(L);
  const width = s => [...String(s || "")].reduce((a, c) => a + (c.charCodeAt(0) < 128 ? 0.5 : 1), 0);
  const max = Math.max(0, ...(item.options || []).map(width));
  return max <= 7 ? 4 : max <= 17 ? 2 : 1;
}

function renderSet(set, { idx = 0, total = 1, startNo = 1, showSource = false } = {}) {
  const items = set.items || [];
  const a = startNo, b = startNo + items.length - 1;
  const head = items.length > 1
    ? `<span class="u">${a}-${b}為題組</span>。閱讀下文，回答${a}-${b}題。`
    : `閱讀下文，回答第${a}題。`;
  const passage = (set.passage || []).map((p, i) => `<p class="hl-zone">${chars(p, "p" + (i + 1))}</p>`).join("");
  const qs = items.map((it, n) => `
    <div class="q" role="radiogroup" aria-labelledby="stem-${esc(it.id)}">
      <span class="qno">${a + n}.</span>
      <button type="button" class="flag" data-item="${esc(it.id)}" aria-pressed="false" title="標註這題的答案不確定，之後再回來檢查">不確定</button>
      <div class="stem hl-zone" id="stem-${esc(it.id)}">${chars(it.stem, it.id + "_stem")}</div>
      <div class="opts cols-${optionCols(it)}">
        ${(it.options || []).map((o, k) => `<label class="opt"><input class="vh" type="radio" name="${esc(it.id)}" value="${KEYS[k]}"><span class="k">(${KEYS[k]})</span><span class="ot">${esc(o)}</span></label>`).join("")}
      </div>
    </div>`).join("");
  const size = (window.APP_CONFIG && APP_CONFIG.EXAM_FONT_PX) || 17;
  return `<div class="set-screen">
    <div class="taskbar">
      <span class="where">題組 ${idx + 1} / ${total}</span>
      <div class="tools" role="group" aria-label="畫記工具">
        <button type="button" class="tool" data-mode="pen" aria-pressed="true"><span class="sw"></span>螢光筆</button>
        <button type="button" class="tool" data-mode="erase" aria-pressed="false">橡皮擦</button>
        <button type="button" class="tool" data-mode="clear" aria-pressed="false">清除全部畫記</button>
      </div>
    </div>
    <div class="paper" style="font-size:${size}px">
      ${showSource && set.source ? `<p class="src">${esc(set.source)}</p>` : ""}
      <p class="grp">${head}</p>
      <div class="passage">${passage || '<p class="empty">（尚未輸入文章）</p>'}</div>
      ${qs || '<p class="empty">（尚未新增題目）</p>'}
    </div>
  </div>`;
}

/* 畫重點：拖曳選取文字即標記；回傳的 st.runs 隨時是目前的畫記段落。
   prev 是同一題組上次的狀態（回到前面題組時用）：還原畫記，畫記紀錄接在後面 */
function attachHighlighter(screen, t0 = performance.now(), prev = null) {
  const st = { t0, hlLog: prev ? prev.hlLog : [], mode: "pen", runs: [] };
  const root = screen.querySelector(".paper");
  const snapshot = () => {
    const runs = []; let cur = null;
    root.querySelectorAll(".hl-zone .ch").forEach(s => {
      const z = s.dataset.z, i = +s.dataset.i, on = s.classList.contains("hl");
      if (on && cur && cur.zone === z && cur.end === i - 1) { cur.end = i; cur.text += s.textContent; }
      else if (on) { cur = { zone: z, start: i, end: i, text: s.textContent }; runs.push(cur); }
      else cur = null;
    });
    st.runs = runs;
  };
  screen.querySelectorAll(".tool").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.mode === "clear") {
      root.querySelectorAll(".ch.hl").forEach(s => s.classList.remove("hl"));
      st.hlLog.push({ t: Math.round(performance.now() - t0), action: "clear" });
      snapshot();
      return;
    }
    st.mode = b.dataset.mode;
    screen.querySelectorAll(".tool[data-mode=pen],.tool[data-mode=erase]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  }));
  const apply = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const hit = [...root.querySelectorAll(".hl-zone .ch")].filter(s => sel.containsNode(s, true));
    if (!hit.length) return;
    hit.forEach(s => s.classList.toggle("hl", st.mode === "pen"));
    st.hlLog.push({ t: Math.round(performance.now() - t0), action: st.mode, zone: hit[0].dataset.z, text: hit.map(s => s.textContent).join("") });
    sel.removeAllRanges();
    snapshot();
  };
  root.addEventListener("mouseup", apply);
  root.addEventListener("touchend", () => setTimeout(apply, 0));
  if (prev && prev.runs && prev.runs.length) {
    root.querySelectorAll(".hl-zone .ch").forEach(s => {
      const i = +s.dataset.i;
      if (prev.runs.some(r => r.zone === s.dataset.z && i >= r.start && i <= r.end)) s.classList.add("hl");
    });
    snapshot();
  }
  return st;
}

/* 題號：同一題本中，前面題組的題數加總 + 1 */
function startNoFor(set, setsInBooklet) {
  let n = 1;
  for (const s of setsInBooklet) { if (s === set) break; n += (s.items || []).length; }
  return n;
}
