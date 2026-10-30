/**
 * 學測閱讀線上施測：Google 試算表後端
 *
 * 使用方式（詳見 README.md）：
 * 1. 在試算表中開啟「擴充功能 → Apps Script」，把這整份程式貼上並儲存。
 * 2. 在編輯器上方選擇函式 setup，按「執行」，依指示授權。會自動建立三個工作表。
 * 3. 「專案設定 → 指令碼屬性」新增 ADMIN_KEY，值是你自訂的管理密碼。
 * 4. 「部署 → 新增部署作業 → 網頁應用程式」，執行身分選「我」，存取權選「所有人」。
 * 5. 把部署網址（/exec 結尾）貼到 assets/config.js 的 API_URL。
 * 修改程式後，要到「部署 → 管理部署作業 → 編輯 → 版本：新版本」重新部署才會生效。
 */

const SHEETS = {
  Sets: {
    cols: ["set_id", "booklet", "order", "active", "source", "passage", "items", "updated_at"],
    json: ["passage", "items"]
  },
  Sessions: {
    cols: ["started_at", "pid", "booklet", "status", "completed_at", "total_ms", "exam_year", "retake", "seen_items", "tutor", "copy_attempts", "user_agent", "screen"],
    json: []
  },
  Responses: {
    cols: ["timestamp", "pid", "booklet", "set_id", "set_order", "rt_ms", "n_items", "n_blank", "effort", "effort_rt_ms",
      "n_leaves", "leave_ms", "n_fullscreen_exits", "responses", "first_answer_ms", "highlights", "answer_log", "highlight_log", "leaves"],
    json: ["responses", "first_answer_ms", "highlights", "answer_log", "highlight_log", "leaves"]
  }
};

/* ---------- 初次設定：建立工作表與標題列 ---------- */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, SHEETS[name].cols.length).setValues([SHEETS[name].cols]).setFontWeight("bold");
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
      return out({ ok: true, sets: sets });
    }
    if (p.action === "data") {
      requireAdmin(p.key);
      return out({ ok: true, sets: readRows("Sets"), sessions: readRows("Sessions"), responses: readRows("Responses") });
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
        appendRow("Responses", Object.assign({}, body.row, { timestamp: new Date() }));
        return out({ ok: true });
      case "complete":
        updateSession(body.pid, Object.assign({}, body.patch, { status: "completed", completed_at: new Date() }));
        return out({ ok: true });
      case "login":
        requireAdmin(body.key);
        return out({ ok: true });
      case "saveSets":
        requireAdmin(body.key);
        writeSets(body.sets);
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
  const booklets = [...new Set(readRows("Sets").filter(s => s.active !== false && s.active !== "FALSE").map(s => String(s.booklet)))].sort();
  if (!booklets.length) throw new Error("沒有啟用中的題組");
  const sessions = readRows("Sessions");
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
