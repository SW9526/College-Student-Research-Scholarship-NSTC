/* 題組畫面：受試者頁與管理者預覽共用同一份程式，確保兩邊看到的完全一樣。
   版面依學測國綜試題本：單欄、標楷體 + Times New Roman、題組說明加底線、文章整段縮排、題號凸排、選項依長度排成 4／2／1 欄。

   文章、題幹、選項可用的標記（管理者頁輸入）：
     __文字__        畫底線（例如「上文畫線處」）
     **文字**        粗體
     段落開頭【甲】   甲、乙、丙等多文本的標籤；只寫【甲】一行則標籤單獨成行
     段落開頭 注：    注釋，以小字顯示
     | 格 | 格 |    表格：段落的每一行都以 | 開頭；格子內容以 ! 開頭為標題格
     ![圖說](img:代號) 圖片（在管理者頁上傳），也可以是圖片網址
     段落內換行       題組勾選「保留換行」時保留（新詩、古詩）；表格一律保留 */
const KEYS = ["A", "B", "C", "D"];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* 行內標記 → [{ch, u, b}]；__ 與 ** 只是開關，不算字 */
function tokens(s) {
  const out = [], str = String(s ?? "");
  let u = false, b = false;
  for (let i = 0; i < str.length; i++) {
    if (str.startsWith("__", i)) { u = !u; i++; continue; }
    if (str.startsWith("**", i)) { b = !b; i++; continue; }
    const cp = str.codePointAt(i), ch = String.fromCodePoint(cp);
    if (cp > 0xffff) i++;
    out.push({ ch, u, b });
  }
  return out;
}
const wrap = (t, html) => (t.u ? `<u>${t.b ? `<b>${html}</b>` : html}</u>` : t.b ? `<b>${html}</b>` : html);
/* 可畫重點的文字：每個字一個 span（data-z 區塊、data-i 第幾個字）；換行 → <br> */
function chars(s, zone) {
  let i = 0;
  return tokens(s).map(t => t.ch === "\n" ? "<br>" : wrap(t, `<span class="ch" data-z="${zone}" data-i="${i++}">${esc(t.ch)}</span>`)).join("");
}
/* 不需要畫重點的文字（選項、頁面說明）：只處理底線、粗體、換行 */
function inline(s) {
  return tokens(s).map(t => t.ch === "\n" ? "<br>" : wrap(t, esc(t.ch))).join("");
}

/* 選項排列：layout 為 "1" "2" "4" 時照設定，"auto"（預設）依最長選項的字數決定，規則仿照學測試題本 */
function optionCols(item) {
  const L = String(item.layout || "auto");
  if (L === "1" || L === "2" || L === "4") return Number(L);
  const width = s => tokens(s).reduce((a, t) => a + (t.ch.charCodeAt(0) < 128 ? 0.5 : 1), 0);
  const max = Math.max(0, ...(item.options || []).map(width));
  return max <= 7 ? 4 : max <= 17 ? 2 : 1;
}

/* 文章的一個段落 → HTML。zone 是畫重點的區塊代號 */
function block(p, zone, images) {
  const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(p.trim());
  if (img) {
    const src = img[2].startsWith("img:") ? (images || {})[img[2].slice(4)] : img[2];
    return src
      ? `<figure class="fig"><img src="${esc(src)}" alt="${esc(img[1])}">${img[1] ? `<figcaption>${inline(img[1])}</figcaption>` : ""}</figure>`
      : `<p class="empty">（找不到圖片 ${esc(img[2])}）</p>`;
  }
  const lines = p.split("\n");
  if (lines.every(l => l.trim().startsWith("|"))) {
    const rows = lines.map(l => l.trim().replace(/^\||\|$/g, "").split("|"));
    return `<table class="xt"><tbody>${rows.map((r, ri) => `<tr>${r.map((c, ci) => {
      const head = c.trim().startsWith("!"), txt = c.trim().replace(/^!/, "");
      return `<${head ? "th" : "td"} class="hl-zone">${chars(txt, `${zone}r${ri + 1}c${ci + 1}`)}</${head ? "th" : "td"}>`;
    }).join("")}</tr>`).join("")}</tbody></table>`;
  }
  const lab = /^【([^】]{1,4})】\s*/.exec(p);
  if (lab) {
    const rest = p.slice(lab[0].length);
    return `<div class="plabel"><span class="lab">${esc(lab[1])}</span></div>${rest ? block(rest, zone, images) : ""}`;
  }
  if (/^(注|註)：/.test(p)) return `<p class="note hl-zone">${chars(p, zone)}</p>`;
  return `<p class="hl-zone${p.includes("\n") ? " verse" : ""}">${chars(p, zone)}</p>`;
}

function renderSet(set, { idx = 0, total = 1, startNo = 1, showSource = false, label = null, images = {} } = {}) {
  const items = set.items || [];
  const a = startNo, b = startNo + items.length - 1;
  const head = items.length > 1
    ? `<span class="u">${a}-${b}為題組</span>。閱讀下文，回答${a}-${b}題。`
    : `閱讀下文，回答第${a}題。`;
  const passage = (set.passage || []).map((p, i) => block(p, "p" + (i + 1), images)).join("");
  const qs = items.map((it, n) => `
    <div class="q" role="radiogroup" aria-labelledby="stem-${esc(it.id)}">
      <span class="qno">${a + n}.</span>
      <div class="stem hl-zone" id="stem-${esc(it.id)}">${chars(it.stem, it.id + "_stem")}</div>
      <div class="opts cols-${optionCols(it)}">
        ${(it.options || []).map((o, k) => `<label class="opt"><input class="vh" type="radio" name="${esc(it.id)}" value="${KEYS[k]}"><span class="k">(${KEYS[k]})</span><span class="ot">${inline(o)}</span></label>`).join("")}
      </div>
    </div>`).join("");
  const size = (window.APP_CONFIG && APP_CONFIG.EXAM_FONT_PX) || 17;
  return `<div class="set-screen">
    <div class="taskbar">
      <span class="where">${label ?? `題組 ${idx + 1} / ${total}`}</span>
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
   prev 是同一題組先前的狀態（重新整理後接續作答時用）：還原畫記，畫記紀錄接在後面 */
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

/* 頁面說明文字（管理者可編修）的簡易格式：
   空一行分段；「## 」小標題；「- 」條列；**粗體**、__底線__；{{變數}} 代入；【待填：…】以醒目底色標示 */
function renderText(src, vars = {}) {
  const filled = String(src ?? "").replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  const line = s => inline(s).replace(/【待填[^】]*】/g, m => `<mark class="todo">${m}</mark>`);
  const body = ls => {
    if (!ls.length) return "";
    if (ls.every(l => /^\s*-\s/.test(l))) return `<ul class="tight">${ls.map(l => `<li>${line(l.replace(/^\s*-\s+/, ""))}</li>`).join("")}</ul>`;
    return `<p>${line(ls.join("\n"))}</p>`;
  };
  return filled.split(/\n\s*\n/).map(blk => {
    const ls = blk.split("\n").filter(l => l.trim());
    if (!ls.length) return "";
    // 標題行之後緊接的內容（段落或條列）照常處理
    if (/^##\s/.test(ls[0])) return `<h3>${line(ls[0].replace(/^##\s+/, ""))}</h3>${body(ls.slice(1))}`;
    if (/^#\s/.test(ls[0])) return `<h2>${line(ls[0].replace(/^#\s+/, ""))}</h2>${body(ls.slice(1))}`;
    return body(ls);
  }).join("");
}
