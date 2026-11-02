/**
 * 學測閱讀線上施測：Google 試算表後端
 *
 * 使用方式（詳見 README.md）：
 * 1. 在試算表中開啟「擴充功能 → Apps Script」，把這整份程式貼上並儲存。
 * 2. 在編輯器上方選擇函式 setup，按「執行」，依指示授權。會建立「說明」與受試者、題組作答、題目、頁面文字、圖片五個工作表，並設定標題與格式。
 * 3. 「專案設定 → 指令碼屬性」新增 ADMIN_KEY，值是你自訂的管理密碼。
 * 4. 「部署 → 新增部署作業 → 網頁應用程式」，執行身分選「我」，存取權選「所有人」。
 * 5. 把部署網址（/exec 結尾）貼到 assets/config.js 的 API_URL。
 * 修改程式後，先執行一次 setup（更新標題列與說明），再到「部署 → 管理部署作業 → 編輯 → 版本：新版本」重新部署才會生效。
 *
 * 程式依「欄的位置」讀寫：fields 的順序就是工作表的欄順序，只能在最後面新增欄位。
 * 第一列的中文標題與註解只給人看，程式不會讀。
 */

// 每個欄位：[欄位代碼, 中文標題, 說明]
const SHEETS = {
  Sessions: {
    title: "受試者", color: "#34a853", freeze: 2,
    purpose: "每位受試者的背景問卷、回饋問卷、作答總時間與狀態", row: "一位受試者", edit: "可以刪除整列（該電腦就能重新作答）；不要修改內容",
    fields: [
      ["started_at", "開始時間", "填完背景問卷、開始作答的時間"],
      ["pid", "受試者編碼", "系統隨機產生；對應「題組作答」的受試者編碼"],
      ["booklet", "題本", "分派到的題本"],
      ["status", "狀態", "started＝作答中或中途離開；completed＝已完成"],
      ["completed_at", "完成時間", "送出回饋問卷的時間"],
      ["total_ms", "總時間（毫秒）", "從開始到完成，含練習與回饋問卷；1000 毫秒＝1 秒"],
      ["exam_year", "學測年度", "可複選，以「、」連接"],
      ["retake", "重考", "是否曾重考或再次參加學測"],
      ["seen_items", "看過施測年度試題", "是／否／不確定；「是」預設排除"],
      ["tutor", "國文家教經驗", "是否擔任過國文家教或相關備課工作"],
      ["copy_attempts", "複製嘗試次數", "在題組頁嘗試複製文字的次數"],
      ["user_agent", "瀏覽器資訊", "瀏覽器與作業系統"],
      ["screen", "螢幕解析度", "寬x高（像素）"],
      ["save_failed", "未能儲存的資料", "空白＝全部存到；有內容時預設排除"],
      ["zh_level", "國文級距", "學測國文成績級距（最高的一次）"],
      ["grade", "年級", ""],
      ["native_zh", "中文母語", "中文是否為母語"],
      ["honest", "獨立作答自評", "回饋問卷：是否全程獨立作答"],
      ["fb_time", "作答時間是否足夠", "回饋問卷"],
      ["fb_return", "曾想回到前面題組", "回饋問卷"],
      ["fb_unclear", "操作不清楚之處", "回饋問卷（選填）"],
      ["fb_other", "其他意見", "回饋問卷（選填）"],
      ["n_reloads", "重新整理次數", "作答中重新整理頁面的次數"],
      ["bg_extra", "新增背景題目的答案", "管理者在背景問卷新增的題目，格式 {題目代號: 答案}"],
      ["is_test", "測試資料", "TRUE＝用測試連結產生，不納入分析、不影響題本分派"]
    ],
    json: ["bg_extra"]
  },
  Responses: {
    title: "題組作答", color: "#34a853", freeze: 2,
    purpose: "每個正式題組的作答、時間、心力評定、畫記與離開視窗紀錄", row: "一位受試者的一個正式題組（練習題組不上傳）", edit: "不要修改；刪除受試者時可一併刪除他的列",
    fields: [
      ["timestamp", "上傳時間", "最後一次上傳這個題組的時間"],
      ["pid", "受試者編碼", "對應「受試者」的受試者編碼"],
      ["booklet", "題本", ""],
      ["set_id", "題組代碼", "對應「題目」的題組代碼"],
      ["set_order", "作答順序", "這是受試者的第幾個正式題組"],
      ["rt_ms", "題組作答時間（毫秒）", "從進入題組到確認完成；1000 毫秒＝1 秒"],
      ["n_items", "題數", ""],
      ["n_blank", "留空題數", ""],
      ["effort", "心力評定", "1 非常非常少 ～ 9 非常非常多"],
      ["effort_rt_ms", "心力評定時間（毫秒）", ""],
      ["n_leaves", "離開視窗次數", ""],
      ["leave_ms", "離開視窗總時間（毫秒）", ""],
      ["n_fullscreen_exits", "退出全螢幕次數", ""],
      ["responses", "各題作答", "{題目代碼: 選項}；null＝留空"],
      ["first_answer_ms", "各題首次作答時間", "{題目代碼: 毫秒}，從進入題組起算"],
      ["highlights", "最後的畫記", "完成題組時留下的螢光筆畫記"],
      ["answer_log", "作答紀錄", "每次選取、改答、取消選取（value 空白＝取消）"],
      ["highlight_log", "畫記紀錄", "每次畫記與擦除"],
      ["leaves", "離開視窗紀錄", "每次離開的時間點與長度"],
      ["first_rt_ms", "評定心力前的累計時間（毫秒）", ""],
      ["n_visits", "進入題組次數", "只有重新整理會增加"],
      ["visits", "進入紀錄", "每次進入的開始時間、停留時間、結束方式（done 完成／reload 重新整理）"],
      ["flags", "（停用）不確定標記", "舊版欄位，已停用；保留以免資料錯位"],
      ["flag_log", "（停用）不確定標記紀錄", "舊版欄位，已停用"],
      ["save_seq", "上傳序號", "同一題組重送時，以序號大的為準"]
    ],
    json: ["responses", "first_answer_ms", "highlights", "answer_log", "highlight_log", "leaves", "visits", "flags", "flag_log"]
  },
  Sets: {
    title: "題目", color: "#4285f4", freeze: 2,
    purpose: "題組的文章、題目與正確答案（管理者頁「題目編輯」）", row: "一個題組", edit: "請在管理者頁修改；在這裡改會在下次儲存時被覆蓋",
    fields: [
      ["set_id", "題組代碼", ""],
      ["booklet", "題本", "「練習」＝共用的練習題組，不分派、不計分"],
      ["order", "題本內順序", ""],
      ["active", "啟用", "FALSE＝受試者不會看到"],
      ["source", "出處", "例如學測年度與題號"],
      ["passage", "文章", ""],
      ["items", "題目與答案", "含正確答案，試算表請勿公開分享"],
      ["updated_at", "最後儲存時間", ""],
      ["keep_breaks", "保留換行", ""]
    ],
    json: ["passage", "items"]
  },
  // 只存與預設不同的
  Texts: {
    title: "頁面文字", color: "#4285f4", freeze: 1,
    purpose: "受試者各頁修改過的文字（管理者頁「頁面文字」）；只存與預設不同的", row: "一段文字", edit: "請在管理者頁修改；在這裡改會在下次儲存時被覆蓋",
    fields: [
      ["key", "文字代碼", ""],
      ["text", "內容", ""],
      ["updated_at", "最後儲存時間", ""]
    ],
    json: []
  },
  // data URL 太長時分段存在 chunk 欄（每格最多 45000 字）
  Images: {
    title: "圖片", color: "#9aa0a6", freeze: 1,
    purpose: "題組插入的圖片（管理者頁「插入圖片」）", row: "一張圖片", edit: "不要修改",
    fields: [
      ["id", "圖片代碼", ""],
      ["n_chunks", "分段數", ""],
      ["chunk", "圖片資料", "編碼後的圖片，看起來像亂碼是正常的；太長時接續存在右邊的欄"]
    ],
    json: []
  }
};
Object.keys(SHEETS).forEach(k => { SHEETS[k].cols = SHEETS[k].fields.map(f => f[0]); });
const GUIDE = "說明";
const PRACTICE_BOOKLET = "練習";   // 題本為「練習」的題組是共用的練習題組，不分派、不計分
const CHUNK = 45000;

/* ---------- 初次設定：建立工作表、標題列、格式與說明 ---------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  writeGuide(ss);   // 先建立「說明」，下面排序工作表時位置才不會超出範圍
  Object.keys(SHEETS).forEach((name, i) => {
    const def = SHEETS[name], n = def.cols.length;
    let sh = ss.getSheetByName(def.title);
    if (!sh) { sh = ss.getSheetByName(name); if (sh) sh.setName(def.title); else sh = ss.insertSheet(def.title); }
    // 第一列：中文標題，註解是欄位代碼與說明（Images 的 chunk 之後還有更多欄，不需標題）
    sh.getRange(1, 1, 1, n).setValues([def.fields.map(f => f[1])])
      .setNotes([def.fields.map(f => "欄位代碼：" + f[0] + (f[2] ? "\n" + f[2] : ""))])
      .setFontWeight("bold").setBackground("#e8f0fe").setWrap(true).setVerticalAlignment("middle");
    sh.setFrozenRows(1);
    sh.setFrozenColumns(def.freeze);
    sh.setTabColor(def.color);
    const rows = sh.getMaxRows() - 1;
    def.cols.forEach((c, ci) => {
      const col = sh.getRange(2, ci + 1, rows, 1);
      if (def.json.indexOf(c) >= 0 || c === "user_agent" || c === "chunk" || c === "text") {
        col.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);   // 長內容不撐高列
        sh.setColumnWidth(ci + 1, 200);
      } else sh.setColumnWidth(ci + 1, 120);
      if (/(_at|^timestamp)$/.test(c)) col.setNumberFormat("yyyy-mm-dd hh:mm:ss");
    });
    // 由管理者頁寫入的工作表：手動編輯前顯示警告（不會擋住程式）
    if (name === "Sets" || name === "Texts" || name === "Images") {
      sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(p => { if (p.getDescription() === "nstc") p.remove(); });
      sh.protect().setDescription("nstc").setWarningOnly(true);
    }
    ss.setActiveSheet(sh); ss.moveActiveSheet(i + 2);
  });
  ss.setActiveSheet(ss.getSheetByName(GUIDE));
  if (!PropertiesService.getScriptProperties().getProperty("ADMIN_KEY")) {
    Logger.log("提醒：請到「專案設定 → 指令碼屬性」新增 ADMIN_KEY（管理密碼）。");
  }
}

/* 「說明」工作表：每個工作表的用途與每個欄位的意思；每次執行 setup 重新產生 */
function writeGuide(ss) {
  let sh = ss.getSheetByName(GUIDE);
  if (!sh) sh = ss.insertSheet(GUIDE);
  sh.clear();
  const rows = [], heads = [];
  const add = (r, head) => { rows.push(r.concat(["", "", "", ""]).slice(0, 4)); if (head) heads.push(rows.length); };
  add(["國科會預試資料：工作表說明"]);
  add(["平常看資料、下載分析用的 CSV，請用管理者頁「收集資料」（會計分並套用排除條件）。這份試算表是原始資料的存放處。"]);
  add(["不要插入、刪除或移動欄，也不要在第一列上方插入列：程式依欄的位置讀寫，移動後資料會錯位。需要篩選或排序時，請用「資料 → 建立篩選器檢視畫面」。"]);
  add(["時間欄位的單位是毫秒（1000 毫秒＝1 秒）。有 { } 或 [ ] 的欄位是程式用的格式（JSON），管理者頁會解讀。把滑鼠移到各工作表的標題上，可以看到欄位說明。"]);
  add(["「題目」含正確答案，試算表請勿設定成「知道連結的人都能檢視」。這張說明由程式產生，執行 setup 會重新產生。"]);
  add([""]);
  add(["工作表", "用途", "每一列代表", "可以手動修改嗎"], true);
  Object.keys(SHEETS).forEach(k => { const d = SHEETS[k]; add([d.title, d.purpose, d.row, d.edit]); });
  add([""]);
  add(["工作表", "欄位", "說明", "欄位代碼"], true);
  Object.keys(SHEETS).forEach(k => SHEETS[k].fields.forEach(f => add([SHEETS[k].title, f[1], f[2], f[0]])));
  sh.getRange(1, 1, rows.length, 4).setValues(rows).setWrap(true).setVerticalAlignment("top");
  sh.getRange(1, 1).setFontSize(14).setFontWeight("bold");
  heads.forEach(r => sh.getRange(r, 1, 1, 4).setFontWeight("bold").setBackground("#e8f0fe"));
  [2, 3, 4, 5].forEach(r => sh.getRange(r, 1, 1, 4).merge());
  sh.setColumnWidth(1, 110); sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 380); sh.setColumnWidth(4, 220);
  sh.setTabColor("#fbbc04");
  ss.setActiveSheet(sh); ss.moveActiveSheet(1);
}

/* ---------- 讀取 ---------- */
function doGet(e) {
  try {
    const p = e.parameter || {};
    if (p.action === "items") {
      // 受試者端不提供正確答案；計分在管理者頁進行
      const sets = readRows("Sets").filter(s => s.active !== false && s.active !== "FALSE").map(s => Object.assign({}, s, {
        items: (s.items || []).map(it => ({ id: it.id, stem: it.stem, options: it.options, layout: it.layout }))
      }));
      return out({ ok: true, sets: sets, texts: readTexts(), images: readImages() });
    }
    if (p.action === "exists") {
      // 只回答這個編碼是否還在 Sessions（研究者刪除後，該電腦可重新作答），不回傳任何作答內容
      const pid = String(p.pid || "");
      return out({ ok: true, exists: !!pid && readRows("Sessions").some(s => String(s.pid) === pid) });
    }
    return out({ ok: true, message: "running" });
  } catch (err) {
    return out({ ok: false, error: String(err.message || err) });
  }
}

/* ---------- 寫入 ---------- */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case "assign":
        return out({ ok: true, booklet: assignBooklet() });
      case "start":
        // 重送（例如上次結果不明）時更新原列，不新增重複的列
        if (!updateSession(body.session.pid, body.session))
          appendRow("Sessions", Object.assign({}, body.session, { started_at: new Date(), status: "started" }));
        return out({ ok: true });
      case "submitSet":
        upsertResponse(Object.assign({}, body.row, { timestamp: new Date() }));
        return out({ ok: true });
      case "complete": {
        const patch = Object.assign({}, body.patch, { status: "completed", completed_at: new Date() });
        // 找不到這位受試者（背景資料始終沒送達）時，用交卷時附上的背景資料補建一列
        if (!updateSession(body.pid, patch)) {
          const s = Object.assign({ pid: body.pid }, body.session || {});
          appendRow("Sessions", Object.assign(s, { started_at: s.started_at ? new Date(s.started_at) : "" }, patch));
        }
        return out({ ok: true });
      }
      case "login":
        requireAdmin(body.key);
        return out({ ok: true });
      case "data":
        // 管理者讀取資料改用 POST，密碼不會出現在網址與執行紀錄中
        requireAdmin(body.key);
        return out({ ok: true, sets: readRows("Sets"), sessions: readRows("Sessions"), responses: readRows("Responses"), texts: readTexts(), images: readImages(),
          sheet_url: SpreadsheetApp.getActiveSpreadsheet().getUrl() });   // 只在管理者登入後提供，不寫進公開的程式碼
      case "saveSets":
        requireAdmin(body.key);
        writeSets(body.sets);
        if (body.images) writeImages(body.images);
        return out({ ok: true });
      case "saveTexts":
        requireAdmin(body.key);
        writeTexts(body.texts || {});
        return out({ ok: true });
      default:
        return out({ ok: false, error: "未知的動作" });
    }
  } catch (err) {
    return out({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* 題本分派：選目前已開始人數最少的題本，平手時隨機 */
function assignBooklet() {
  const booklets = [...new Set(readRows("Sets").filter(s => s.active !== false && s.active !== "FALSE" && String(s.booklet) !== PRACTICE_BOOKLET).map(s => String(s.booklet)))].sort();
  if (!booklets.length) throw new Error("沒有啟用中的題組");
  const sessions = readRows("Sessions").filter(s => s.is_test !== true && s.is_test !== "TRUE");   // 測試資料不影響分派
  const count = b => sessions.filter(s => String(s.booklet) === b).length;
  const min = Math.min.apply(null, booklets.map(count));
  const pool = booklets.filter(b => count(b) === min);
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ---------- 工具函式 ---------- */
function requireAdmin(key) {
  const real = PropertiesService.getScriptProperties().getProperty("ADMIN_KEY");
  if (!real) throw new Error("尚未設定 ADMIN_KEY");
  if (key !== real) throw new Error("密碼錯誤");
}
function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
// 依中文名稱找工作表；還沒執行過新版 setup 時用舊的英文名稱
function sheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEETS[name].title) || ss.getSheetByName(name);
  if (!sh) throw new Error("找不到工作表 " + SHEETS[name].title + "，請先執行 setup");
  return sh;
}
function readRows(name) {
  const sh = sheet(name), def = SHEETS[name];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, def.cols.length).getValues();
  return values.map(r => {
    const o = {};
    def.cols.forEach((c, i) => {
      let v = r[i];
      if (def.json.indexOf(c) >= 0 && typeof v === "string" && v) { try { v = JSON.parse(v); } catch (err) {} }
      if (v instanceof Date) v = v.toISOString();
      o[c] = v;
    });
    return o;
  });
}
function toCell(name, c, v) {
  if (v === undefined || v === null) return "";
  if (SHEETS[name].json.indexOf(c) >= 0 || typeof v === "object" && !(v instanceof Date)) return asText(JSON.stringify(v));
  return asText(v);
}
// 文字前加 '：試算表照原樣存成文字，不會把 = + - 開頭的內容當成公式（顯示 #ERROR!），也不會把像數字或日期的文字轉掉。讀回時不含 '
function asText(v) {
  return typeof v === "string" && v !== "" ? "'" + v : v;
}
function appendRow(name, obj) {
  const def = SHEETS[name];
  sheet(name).appendRow(def.cols.map(c => toCell(name, c, obj[c])));
}
/* 同一受試者同一題組只留一列：重送時覆蓋原列；save_seq 較小（較舊）的資料不會蓋掉較新的 */
function upsertResponse(obj) {
  const sh = sheet("Responses"), cols = SHEETS.Responses.cols;
  const last = sh.getLastRow();
  if (last >= 2) {
    const col = c => sh.getRange(2, cols.indexOf(c) + 1, last - 1, 1).getValues().map(r => r[0]);
    const pids = col("pid"), setIds = col("set_id"), seqs = col("save_seq");
    for (let r = pids.length - 1; r >= 0; r--) {
      if (String(pids[r]) !== String(obj.pid) || String(setIds[r]) !== String(obj.set_id)) continue;
      if ((Number(seqs[r]) || 0) > (Number(obj.save_seq) || 0)) return;
      sh.getRange(r + 2, 1, 1, cols.length).setValues([cols.map(c => toCell("Responses", c, obj[c]))]);
      return;
    }
  }
  appendRow("Responses", obj);
}
function updateSession(pid, patch) {
  const sh = sheet("Sessions"), cols = SHEETS.Sessions.cols;
  const last = sh.getLastRow();
  if (last < 2) return false;
  const ids = sh.getRange(2, cols.indexOf("pid") + 1, last - 1, 1).getValues().map(r => String(r[0]));
  const idx = ids.lastIndexOf(String(pid));
  if (idx < 0) return false;
  Object.keys(patch).forEach(k => {
    const ci = cols.indexOf(k);
    if (ci >= 0) sh.getRange(idx + 2, ci + 1).setValue(toCell("Sessions", k, patch[k]));
  });
  return true;
}
function writeSets(sets) {
  if (!Array.isArray(sets)) throw new Error("題目格式錯誤");
  const sh = sheet("Sets"), def = SHEETS.Sets;
  const last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, def.cols.length).clearContent();
  if (!sets.length) return;
  const now = new Date();
  const rows = sets.map(s => def.cols.map(c => c === "updated_at" ? now : toCell("Sets", c, c === "active" ? s.active !== false : s[c])));
  sh.getRange(2, 1, rows.length, def.cols.length).setValues(rows);
}
function readTexts() {
  const o = {};
  readRows("Texts").forEach(r => { if (r.key) o[r.key] = String(r.text); });
  return o;
}
function writeTexts(texts) {
  const sh = sheet("Texts"), last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 3).clearContent();
  const now = new Date();
  const rows = Object.keys(texts).map(k => [asText(k), asText(String(texts[k])), now]);
  if (rows.length) sh.getRange(2, 1, rows.length, 3).setValues(rows);
}
function readImages() {
  const sh = sheet("Images"), last = sh.getLastRow();
  if (last < 2) return {};
  const width = Math.max(3, sh.getLastColumn());
  const o = {};
  sh.getRange(2, 1, last - 1, width).getValues().forEach(r => {
    if (!r[0]) return;
    const n = Number(r[1]) || 1;
    o[String(r[0])] = r.slice(2, 2 + n).join("");
  });
  return o;
}
function writeImages(images) {
  const sh = sheet("Images"), last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, Math.max(3, sh.getLastColumn())).clearContent();
  const rows = Object.keys(images).map(id => {
    const d = String(images[id]), chunks = [];
    for (let i = 0; i < d.length; i += CHUNK) chunks.push(d.slice(i, i + CHUNK));
    return [asText(id), chunks.length].concat(chunks.map(asText));   // 分段可能以 + 或 = 開頭
  });
  if (!rows.length) return;
  const width = Math.max.apply(null, rows.map(r => r.length));
  sh.getRange(2, 1, rows.length, width).setValues(rows.map(r => r.concat(new Array(width - r.length).fill(""))));
}
