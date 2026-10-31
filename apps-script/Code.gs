/**
 * 學測閱讀線上施測：Google 試算表後端
 *
 * 使用方式（詳見 README.md）：
 * 1. 在試算表中開啟「擴充功能 → Apps Script」，把這整份程式貼上並儲存。
 * 2. 在編輯器上方選擇函式 setup，按「執行」，依指示授權。會自動建立 Sets、Sessions、Responses、Texts、Images 五個工作表。
 * 3. 「專案設定 → 指令碼屬性」新增 ADMIN_KEY，值是你自訂的管理密碼。
 * 4. 「部署 → 新增部署作業 → 網頁應用程式」，執行身分選「我」，存取權選「所有人」。
 * 5. 把部署網址（/exec 結尾）貼到 assets/config.js 的 API_URL。
 * 修改程式後，先執行一次 setup（更新標題列），再到「部署 → 管理部署作業 → 編輯 → 版本：新版本」重新部署才會生效。
 */

const SHEETS = {
  Sets: {
    cols: ["set_id", "booklet", "order", "active", "source", "passage", "items", "updated_at", "keep_breaks"],
    json: ["passage", "items"]
  },
  Sessions: {
    cols: ["started_at", "pid", "booklet", "status", "completed_at", "total_ms", "exam_year", "retake", "seen_items", "tutor", "copy_attempts", "user_agent", "screen", "save_failed",
      "zh_level", "grade", "native_zh", "honest", "fb_time", "fb_return", "fb_unclear", "fb_other", "n_reloads", "bg_extra", "is_test"],
    json: ["bg_extra"]   // bg_extra：管理者在背景問卷新增的題目的答案 {題目代號: 答案}
  },
  Responses: {
    cols: ["timestamp", "pid", "booklet", "set_id", "set_order", "rt_ms", "n_items", "n_blank", "effort", "effort_rt_ms",
      "n_leaves", "leave_ms", "n_fullscreen_exits", "responses", "first_answer_ms", "highlights", "answer_log", "highlight_log", "leaves",
      "first_rt_ms", "n_visits", "visits", "flags", "flag_log", "save_seq"],
    json: ["responses", "first_answer_ms", "highlights", "answer_log", "highlight_log", "leaves", "visits", "flags", "flag_log"]
  },
  // 受試者各頁的文字（管理者頁「頁面文字」）；只存與預設不同的
  Texts: {
    cols: ["key", "text", "updated_at"],
    json: []
  },
  // 題組用的圖片：data URL 太長時分段存在 chunk 欄（每格最多 45000 字）
  Images: {
    cols: ["id", "n_chunks", "chunk"],
    json: []
  }
};
const PRACTICE_BOOKLET = "練習";   // 題本為「練習」的題組是共用的練習題組，不分派、不計分
const CHUNK = 45000;

/* ---------- 初次設定：建立工作表與標題列 ---------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, SHEETS[name].cols.length).setValues([SHEETS[name].cols]).setFontWeight("bold");   // Images 的 chunk 之後還有更多欄，不需標題
    sh.setFrozenRows(1);
  });
  if (!PropertiesService.getScriptProperties().getProperty("ADMIN_KEY")) {
    Logger.log("提醒：請到「專案設定 → 指令碼屬性」新增 ADMIN_KEY（管理密碼）。");
  }
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
        appendRow("Sessions", Object.assign({}, body.session, { started_at: new Date(), status: "started" }));
        return out({ ok: true });
      case "submitSet":
        upsertResponse(Object.assign({}, body.row, { timestamp: new Date() }));
        return out({ ok: true });
      case "complete":
        updateSession(body.pid, Object.assign({}, body.patch, { status: "completed", completed_at: new Date() }));
        return out({ ok: true });
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
function sheet(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error("找不到工作表 " + name + "，請先執行 setup");
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
  if (SHEETS[name].json.indexOf(c) >= 0 || typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return v;
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
  if (last < 2) return;
  const ids = sh.getRange(2, cols.indexOf("pid") + 1, last - 1, 1).getValues().map(r => String(r[0]));
  const idx = ids.lastIndexOf(String(pid));
  if (idx < 0) return;
  Object.keys(patch).forEach(k => {
    const ci = cols.indexOf(k);
    if (ci >= 0) sh.getRange(idx + 2, ci + 1).setValue(toCell("Sessions", k, patch[k]));
  });
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
  const rows = Object.keys(texts).map(k => [k, String(texts[k]), now]);
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
    return [id, chunks.length].concat(chunks);
  });
  if (!rows.length) return;
  const width = Math.max.apply(null, rows.map(r => r.length));
  sh.getRange(2, 1, rows.length, width).setValues(rows.map(r => r.concat(new Array(width - r.length).fill(""))));
}
