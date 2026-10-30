/* 資料存取：有 API_URL 時連到 Google 試算表（Apps Script）；沒有時為示範模式，存在本機瀏覽器 */
const DEMO_SETS = [
  {
    set_id: "demo-1", booklet: "A", order: 1, active: true,
    source: "示範題組（自編，非學測原題）",
    passage: [
      "一般人以為，讀得快的人理解得也快。然而，眼動研究發現，熟練讀者並不是靠視線跳得遠來加速，而是在關鍵處停得準：遇到轉折詞、數字與專有名詞時，他們的視線會停留較久，甚至回頭重讀；在可預測的句子上，則一掃而過。換言之，速度來自取捨，而非均勻地加快。",
      "這也解釋了為什麼「速讀訓練」的效果往往難以持久。若訓練只要求眼睛移動得更快，讀者為了跟上節奏，只能放棄回讀，結果在需要整合前後訊息的段落上，理解反而下降。真正能遷移的，是判斷哪裡值得停下來的能力，而這種能力仰賴讀者對文體與主題的熟悉。",
      "因此，與其追求每分鐘讀多少字，不如練習在讀完一段後問自己：剛才哪一句改變了我對全文的理解？能回答這個問題的人，即使讀得慢一些，也往往讀得更準。"
    ],
    items: [
      { id: "q1", stem: "根據本文，熟練讀者讀得較快的主要原因是：", options: ["視線每次跳躍的距離較遠", "能在關鍵處停留，在可預測處略過", "幾乎不需要回頭重讀", "受過速讀訓練，眼球移動較快"], answer: "B" },
      { id: "q2", stem: "下列何者最符合作者對「速讀訓練」的看法？", options: ["能全面提升理解，但需要長期練習", "對熟悉文體的讀者完全無效", "應以每分鐘讀多少字作為成效指標", "若只要求眼睛加快，可能使需要整合前後訊息的理解下降"], answer: "D" }
    ]
  },
  {
    set_id: "demo-2", booklet: "B", order: 1, active: true,
    source: "示範題組（自編，非學測原題）",
    passage: [
      "博物館展示古畫時，常把燈光調得很暗，許多觀眾以為這是為了營造氣氛。其實，主要原因在於保存：紙張與顏料長期受光照，會逐漸褪色、脆化，而且這種損害會累積，無法逆轉。因此，館方通常以「年曝光量」管理展品，也就是限制一件作品一年內累計接受的光照總量。",
      "為了在保存與觀賞之間取得平衡，有些博物館採用輪展制度：同一件作品展出數週後便收回庫房「休息」，由複製品或其他作品替代。也有館方在展櫃前設置感應器，觀眾靠近時才亮燈。這些作法的共同前提是：作品能被看見的時間是有限的資源，必須分配給最需要的時刻。"
    ],
    items: [
      { id: "q1", stem: "根據本文，博物館將古畫展區燈光調暗的主要原因是：", options: ["營造神祕的觀展氣氛", "減少觀眾拍照", "降低光照對作品的累積損害", "節省電力成本"], answer: "C" },
      { id: "q2", stem: "下列何者最能說明「年曝光量」的管理概念？", options: ["每天固定開館的時數", "限制作品一年內累計受光的總量", "只在特定節日展出真跡", "以複製品永久取代真跡"], answer: "B" }
    ]
  }
];

const API = (() => {
  const url = (window.APP_CONFIG && APP_CONFIG.API_URL) || "";
  const demo = !url;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const K = { sets: "nstc_demo_sets", sessions: "nstc_demo_sessions", responses: "nstc_demo_responses" };
  const DEMO_KEY = "demo";

  async function get(params) {
    const r = await fetch(url + "?" + new URLSearchParams(params));
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "伺服器回傳錯誤");
    return j;
  }
  async function post(body) {
    // text/plain 可避免瀏覽器的跨網域預檢，Apps Script 才收得到
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "伺服器回傳錯誤");
    return j;
  }
  const demoSets = () => { let s = LS.get(K.sets, null); if (!s) { s = DEMO_SETS; LS.set(K.sets, s); } return s; };
  const now = () => new Date().toISOString();

  return {
    demo,
    /* ---- 受試者端 ---- */
    async getSets() {
      // 和正式版一樣不提供正確答案
      if (demo) return demoSets().filter(s => s.active !== false).map(s => ({ ...s, items: s.items.map(({ answer, ...it }) => it) }));
      return (await get({ action: "items" })).sets;
    },
    async assign() {
      if (demo) {
        const booklets = [...new Set(demoSets().filter(s => s.active !== false).map(s => s.booklet))].sort();
        const sessions = LS.get(K.sessions, []);
        const count = b => sessions.filter(s => s.booklet === b).length;
        const min = Math.min(...booklets.map(count));
        const pool = booklets.filter(b => count(b) === min);
        return pool[Math.floor(Math.random() * pool.length)];
      }
      return (await post({ action: "assign" })).booklet;
    },
    async start(session) {
      if (demo) { const a = LS.get(K.sessions, []); a.push({ ...session, started_at: now(), status: "started" }); LS.set(K.sessions, a); return; }
      await post({ action: "start", session });
    },
    async submitSet(row) {
      if (demo) {
        // 與後端相同：同一受試者同一題組只留一筆，較舊的資料不覆蓋較新的
        const a = LS.get(K.responses, []), k = a.findIndex(x => x.pid === row.pid && x.set_id === row.set_id);
        if (k >= 0 && (a[k].n_visits || 0) > (row.n_visits || 0)) return;
        if (k >= 0) a[k] = { ...row, timestamp: now() }; else a.push({ ...row, timestamp: now() });
        LS.set(K.responses, a); return;
      }
      await post({ action: "submitSet", row });
    },
    async complete(pid, patch) {
      if (demo) { const a = LS.get(K.sessions, []); const s = a.find(x => x.pid === pid); if (s) Object.assign(s, patch, { status: "completed", completed_at: now() }); LS.set(K.sessions, a); return; }
      await post({ action: "complete", pid, patch });
    },
    /* ---- 管理者端 ---- */
    async login(key) {
      if (demo) { if (key !== DEMO_KEY) throw new Error("密碼錯誤（示範模式的密碼是 demo）"); return true; }
      await post({ action: "login", key }); return true;
    },
    async getAll(key) {
      if (demo) return { sets: demoSets(), sessions: LS.get(K.sessions, []), responses: LS.get(K.responses, []) };
      const j = await post({ action: "data", key });
      return { sets: j.sets, sessions: j.sessions, responses: j.responses };
    },
    async saveSets(key, sets) {
      if (demo) { LS.set(K.sets, sets); return; }
      await post({ action: "saveSets", key, sets });
    },
    resetDemo() { Object.values(K).forEach(k => { try { localStorage.removeItem(k); } catch (e) {} }); }
  };
})();
