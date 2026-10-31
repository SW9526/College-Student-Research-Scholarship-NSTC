/* 受試者各頁的文字：這裡是預設值，管理者頁「頁面文字」修改後存在試算表的 Texts 工作表，優先使用。
   格式見 render.js 的 renderText：空一行分段、「## 」小標題、「- 」條列、**粗體**、__底線__、{{變數}}。
   可用變數：{{YEARS}}（如 114或115）、{{SET_MINUTES}}、{{N_SETS}}、{{N}}（未作答題數，只用在完成題組的確認視窗） */
const TEXT_PAGES = [
  { page: "device", name: "裝置檢查（不符合時）", fields: [
    { key: "device_block", label: "說明", rows: 5, def:
`## 請改用電腦作答
本研究的閱讀文章較長，為了讓每位受試者的作答環境一致，只能使用**電腦**（桌機或筆電）作答，螢幕寬度至少需要 {{MIN_WIDTH}}px。手機與平板無法進入作答。

請改用電腦開啟同一個連結。` }] },
  { page: "consent", name: "研究說明與知情同意", fields: [
    { key: "consent", label: "說明", rows: 22, def:
`# 學測國文閱讀作答研究：研究說明與知情同意

## 研究目的
本研究想了解大學生作答學測國文閱讀題組的表現，以及作答時花費的心力，並與 AI 模擬作答的結果比較。本研究為國科會大專學生研究計畫。

## 研究程序與所需時間
- 依序填寫背景問卷、閱讀作答說明、完成一個練習題組，接著作答 {{N_SETS}} 個閱讀題組，最後填寫簡短的回饋問卷。
- 全程約 50–60 分鐘，請使用電腦，在安靜、不受打擾的環境獨立完成。
- 每個題組作答完成後，會請你評定剛才花了多少心力。題組需依序作答，完成後不能返回。

## 系統記錄的資料
作答內容與作答時間、改答紀錄、畫記內容與時間點、心力評分、作答期間切換視窗或分頁與退出全螢幕的情形，以及裝置資訊（瀏覽器類型與螢幕尺寸）。本研究**不蒐集姓名、學號**等可直接識別個人的資訊，所有資料以編碼方式處理。

## 可能的風險與益處
本研究沒有已知的身心風險；連續閱讀約一小時可能感到疲倦，作答期間請依自己的狀況調整。參與本研究沒有直接的個人益處，研究結果將有助於了解 AI 能否預測人類作答的難易程度。

## 酬謝
完成作答後，可透過另一份表單領取酬謝：【待填：酬謝內容與發放方式】。領取酬謝所需的聯絡資料與作答資料分開保存，不會互相連結。

## 資料保存與使用
作答資料直接寫入研究者校內帳號的雲端試算表，須登入並具存取權限者才能檢視；施測網站本身不保存任何作答資料。分析用的資料檔存放於加密空間，僅研究團隊可存取，研究結束後【待填：保存期限】銷毀。你的作答與問卷資料不會輸入任何 AI 平台。

## 自願參與
參與完全出於自願。你可以隨時關閉網頁退出，不需要說明理由，也不會有任何不利影響。

## 聯絡方式
研究者：【待填：姓名、Email】
指導教授：【待填：姓名、Email】` },
    { key: "consent_agree", label: "勾選同意的文字", rows: 1, def: "我已閱讀上述說明，同意參與本研究。" }] },
  // 背景問卷的題目另外存在 bg_questions（見下方 DEFAULT_BG_QUESTIONS），管理者頁可以增刪題目
  { page: "background", name: "背景問卷", questions: true, fields: [
    { key: "bg_title", label: "標題", rows: 1, def: "背景資料" }] },
  { page: "instructions", name: "作答說明", fields: [
    { key: "instructions", label: "說明", rows: 14, def:
`# 作答說明
- 每個題組有一篇文章與數道單選題。**文章和題幹可以畫重點：按住滑鼠拖曳選取文字，放開後就會標上螢光；切換到「橡皮擦」再拖曳一次即可擦掉。**
- 同一個題組內可以自由作答與改答；不確定答案的題目可以留空。
- 作答完一個題組，按「完成這個題組」並確認後，會請你評定剛才花了多少心力（1 到 9 分），接著進入下一個題組。**完成後不能再回到前面的題組。**
- 每個題組建議作答約 {{SET_MINUTES}} 分鐘。畫面左上角會顯示已用時間，評定心力時暫停計時。
- 正式作答前有一個練習題組，用來熟悉畫重點與心力評分，不計分。
- 按下「開始」後畫面會切換為全螢幕。請盡量不要退出全螢幕或切換到其他視窗；作答期間請勿重新整理或關閉頁面。` }] },
  { page: "practice", name: "練習題組", fields: [
    { key: "practice_intro", label: "練習前的說明", rows: 4, def:
`## 練習題組
接下來是一個練習題組，請試著畫重點、作答，最後評定心力。練習不計分，作答內容不會被記錄。` },
    { key: "practice_done", label: "練習結束後的說明", rows: 4, def:
`## 練習結束
接下來是正式題組，共 {{N_SETS}} 個。每個題組完成後不能返回，請依自己的步調作答。` }] },
  { page: "confirm", name: "完成題組的確認視窗", fields: [
    { key: "confirm_blank", label: "還有題目未作答時", rows: 2, def: "還有 {{N}} 題未作答。完成這個題組後就不能再返回，確定要完成嗎？" },
    { key: "confirm_all", label: "全部都已作答時", rows: 2, def: "完成這個題組後就不能再返回，確定要完成嗎？" }] },
  { page: "effort", name: "心力評定", fields: [
    { key: "effort_question", label: "題目", rows: 2, def: "我覺得我需要耗費多少心力回答剛剛的測驗問題？" }] },
  { page: "post", name: "回饋問卷", fields: [
    { key: "post_title", label: "標題與說明", rows: 3, def:
`## 最後幾個問題
感謝你完成所有題組！以下問題的回答不會影響酬謝，請如實填寫。` },
    { key: "post_honest", label: "誠實作答自評", rows: 2, def: "你是否全程獨立作答，沒有查詢資料或詢問他人？" },
    { key: "post_time", label: "作答時間", rows: 1, def: "你覺得作答時間是否足夠？" },
    { key: "post_return", label: "是否想回到前面", rows: 2, def: "作答時，你是否曾想回到前面的題組修改答案？" },
    { key: "post_unclear", label: "操作不清楚之處（選填）", rows: 2, def: "有沒有哪裡的操作或說明讓你覺得不清楚？（選填）" },
    { key: "post_other", label: "其他意見（選填）", rows: 1, def: "其他想告訴研究者的事（選填）" }] },
  { page: "complete", name: "完成頁", fields: [
    { key: "complete", label: "說明", rows: 4, def:
`# 作答完成，謝謝你的參與
你的作答資料已經儲存，可以關閉這個頁面了。` },
    { key: "reward", label: "酬謝表單連結的說明", rows: 2, def: "如需領取酬謝，請填寫酬謝領取表單（非必填；聯絡資料與作答資料分開保存）：" }] },
  { page: "misc", name: "其他提示", fields: [
    { key: "already_done", label: "重複作答時", rows: 3, def:
`## 你已經完成過本研究
這台電腦已經完成過作答，每個人只需要參加一次。謝謝你的參與！` },
    { key: "resume", label: "重新整理後接續作答", rows: 3, def:
`## 繼續作答
頁面剛才被重新整理或中斷。按下「繼續作答」會回到剛才的地方，已作答的內容都還在。` },
    { key: "fullscreen_bar", label: "退出全螢幕時的提示列", rows: 1, def: "你已離開全螢幕。按這裡回到全螢幕作答。" },
    { key: "leave_warning", label: "離開頁面前的提醒（部分瀏覽器不顯示自訂文字）", rows: 1, def: "作答尚未完成，確定要離開嗎？" }] }
];
const DEFAULT_TEXTS = Object.fromEntries(TEXT_PAGES.flatMap(p => p.fields.map(f => [f.key, f.def])));

/* ---------- 背景問卷題目（管理者頁可增刪、改字、改選項、調整順序）----------
   type：years（學測年度，可複選，選項依 ITEM_YEARS 自動產生）、single（單選）、multi（複選）、text（簡答）
   locked：排除條件會用到的題目，不能刪除、不能改選項（題目文字可以改）
   內建題目（id 在 BG_COLUMNS 裡）的答案存在 Sessions 同名欄位；新增的題目存在 Sessions 的 bg_extra 欄（JSON） */
const BG_COLUMNS = ["exam_year", "retake", "seen_items", "tutor", "zh_level", "grade", "native_zh"];
const DEFAULT_BG_QUESTIONS = [
  { id: "exam_year", type: "years", label: "你參加學測的年度（可複選）", required: true, locked: true },
  { id: "retake", type: "single", label: "你是否曾重考或再次參加學測？", options: ["是", "否"], required: true },
  { id: "seen_items", type: "single", label: "你是否看過{{YEARS}}學年度學測國文的試題或解析（例如補習班教材、網路解析）？", options: ["是", "否", "不確定"], required: true, locked: true },
  { id: "tutor", type: "single", label: "你是否擔任過國文家教或相關備課工作？", options: ["是", "否"], required: true },
  { id: "zh_level", type: "single", label: "你在學測國文考科的成績落在哪個級距？（參加過多次者，填拿過最高的一次）", options: ["頂標", "前標", "均標", "後標", "底標", "底標以下", "不記得了"], required: true },
  { id: "grade", type: "single", label: "你目前的年級", options: ["大一", "大二", "大三", "大四", "大五以上", "研究所", "其他"], required: true },
  { id: "native_zh", type: "single", label: "中文是否為你的母語？", options: ["是", "否"], required: true }
];
const BG_TYPES = { single: "單選", multi: "複選", text: "簡答", years: "學測年度（自動選項）" };
/* 目前使用的題目：管理者存過就用存的版本；鎖定的題目一定存在，且選項固定為預設 */
function bgQuestions(T) {
  let qs = null;
  try { qs = T.bg_questions ? JSON.parse(T.bg_questions) : null; } catch (e) { qs = null; }
  if (!Array.isArray(qs) || !qs.length) qs = JSON.parse(JSON.stringify(DEFAULT_BG_QUESTIONS));
  DEFAULT_BG_QUESTIONS.filter(d => d.locked).forEach(d => {
    const q = qs.find(x => x.id === d.id);
    if (!q) qs.unshift(JSON.parse(JSON.stringify(d)));
    else Object.assign(q, { type: d.type, options: d.options, locked: true, required: true });
  });
  return qs;
}
const textVars = (cfg, extra = {}) => {
  const ys = (cfg.ITEM_YEARS || []).map(String);
  return { YEARS: ys.length > 1 ? ys.slice(0, -1).join("、") + "或" + ys[ys.length - 1] : ys.join(""), SET_MINUTES: cfg.SET_MINUTES_HINT || "8–10", MIN_WIDTH: cfg.MIN_WIDTH || 900, ...extra };
};

/* 背景問卷選項：學測年度依 ITEM_YEARS 往前推 5 年 */
const examYearOptions = cfg => {
  const ys = (cfg.ITEM_YEARS || [114, 115]).map(Number), max = Math.max(...ys), min = Math.min(...ys) - 5;
  const out = []; for (let y = min; y <= max; y++) out.push(`${y}學年度`);
  return [...out, "其他"];
};
const BG_OPTIONS = { honest: ["是，全程獨立作答", "否"], fb_time: ["足夠", "勉強足夠", "不夠"], fb_return: ["曾經想過", "沒有"] };

/* 各頁的 HTML（受試者頁與管理者預覽共用）。T＝文字、V＝變數 */
const radios = (name, opts, required = true) => `<div class="opts">${opts.map(o => `<label><input type="radio" name="${name}" value="${esc(o)}"${required ? " required" : ""}> ${esc(o)}</label>`).join("")}</div>`;
const fieldQ = (n, html, body) => `<div class="field"><span class="q">${n ? n + ". " : ""}${html}</span>${body}</div>`;   // html 已經過 renderTextInline
const PAGE_HTML = {
  device: (T, V, demo) => `<div class="panel">${renderText(T.device_block, V)}${demo ? '<p class="muted">示範模式可以繼續；正式施測時這一頁沒有按鈕。</p><button class="btn" type="button" data-next>示範：仍要繼續</button>' : ""}</div>`,
  consent: (T, V) => `<form class="stack"><div class="panel wide consent">${renderText(T.consent, V)}</div>
    <div class="panel wide"><label><input type="checkbox" name="consent" value="yes" required> ${inline(T.consent_agree)}</label></div>
    <button class="btn center" type="submit">同意並繼續</button></form>`,
  background: (T, V, cfg) => `<form class="stack"><div class="panel">
      <h2>${inline(T.bg_title)}</h2>
      ${bgQuestions(T).map((q, n) => fieldQ(n + 1, renderTextInline(q.label, V), bgInput(q, cfg))).join("")}
    </div><button class="btn center" type="submit">下一步</button></form>`,
  instructions: (T, V) => `<div class="stack"><div class="panel wide">${renderText(T.instructions, V)}</div><button class="btn center" type="button" data-next>開始</button></div>`,
  practice_intro: (T, V) => `<div class="stack"><div class="panel">${renderText(T.practice_intro, V)}</div><button class="btn center" type="button" data-next>開始練習</button></div>`,
  practice_done: (T, V) => `<div class="stack"><div class="panel">${renderText(T.practice_done, V)}</div><button class="btn center" type="button" data-next>開始正式作答</button></div>`,
  confirm: (T, V) => `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="cfmText"><div class="modal-box">
      <p id="cfmText">${renderTextInline(V.N ? T.confirm_blank : T.confirm_all, V)}</p>
      <div class="actions end"><button class="btn ghost" type="button" data-cancel>返回作答</button><button class="btn" type="button" data-ok>確定完成</button></div>
    </div></div>`,
  effort: (T, V) => `<form class="stack"><div class="panel">
      ${V.LABEL ? `<p class="muted">${esc(V.LABEL)}</p>` : ""}
      <h2>${renderTextInline(T.effort_question, V)}</h2>
      <div class="scale" role="radiogroup" aria-label="心力耗費，1到9分">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => `<label><input type="radio" name="effort" value="${v}" required>${v}</label>`).join("")}
      </div>
      <div class="scale-ends"><span>1 非常非常少</span><span>9 非常非常多</span></div>
    </div><button class="btn center" type="submit">下一步</button></form>`,
  post: (T, V) => `<form class="stack"><div class="panel">
      ${renderText(T.post_title, V)}
      ${fieldQ(1, renderTextInline(T.post_honest, V), radios("honest", BG_OPTIONS.honest))}
      ${fieldQ(2, renderTextInline(T.post_time, V), radios("fb_time", BG_OPTIONS.fb_time))}
      ${fieldQ(3, renderTextInline(T.post_return, V), radios("fb_return", BG_OPTIONS.fb_return))}
      ${fieldQ(4, renderTextInline(T.post_unclear, V), `<textarea name="fb_unclear" rows="3"></textarea>`)}
      ${fieldQ(5, renderTextInline(T.post_other, V), `<textarea name="fb_other" rows="2"></textarea>`)}
    </div><button class="btn center" type="submit">送出</button></form>`,
  complete: (T, V, cfg) => `<div class="panel">${renderText(T.complete, V)}
      ${cfg.REWARD_FORM_URL ? `<p>${renderTextInline(T.reward, V)}<br><a href="${esc(cfg.REWARD_FORM_URL)}" target="_blank" rel="noopener">酬謝領取表單</a></p>` : ""}
      ${V.DEMO ? '<p class="muted">示範模式：資料存在這台電腦的瀏覽器，可到 <a href="admin.html">管理者頁</a>（密碼 demo）查看。</p>' : ""}</div>`,
  already_done: (T, V) => `<div class="panel">${renderText(T.already_done, V)}${V.DEMO ? '<p class="muted">示範模式：<button class="btn ghost small" type="button" data-reset>清除這台電腦的作答紀錄</button></p>' : ""}</div>`,
  resume: (T, V) => `<div class="stack"><div class="panel">${renderText(T.resume, V)}</div><button class="btn center" type="button" data-next>繼續作答</button></div>`
};
/* 背景問卷一題的作答欄：複選題的勾選框不設 name，選到的值以「、」串起來放在同名的隱藏欄位 */
function bgInput(q, cfg) {
  const opts = q.type === "years" ? examYearOptions(cfg) : (q.options || []);
  if (q.type === "single") return radios(q.id, opts, q.required !== false);
  if (q.type === "text") return `<textarea name="${esc(q.id)}" rows="2"${q.required !== false ? " required" : ""}></textarea>`;
  return `<div class="opts multi" data-id="${esc(q.id)}" data-required="${q.required !== false}">${opts.map(o => `<label><input type="checkbox" value="${esc(o)}"> ${esc(o)}</label>`).join("")}</div><input type="hidden" name="${esc(q.id)}" value="">`;
}
/* 單行文字：只代入變數與行內標記 */
function renderTextInline(src, vars = {}) {
  return inline(String(src ?? "").replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? String(vars[k]) : m)))
    .replace(/【待填[^】]*】/g, m => `<mark class="todo">${m}</mark>`);
}
