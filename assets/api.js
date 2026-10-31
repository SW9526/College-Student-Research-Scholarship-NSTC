/* 資料存取：有 API_URL 時連到 Google 試算表（Apps Script）；沒有時為示範模式，存在本機瀏覽器 */
/* 練習題組：題本填「練習」的題組是所有受試者共用的練習；試算表裡沒有時用這個預設題組。練習不計分、不上傳 */
const PRACTICE_BOOKLET = "練習";
const DEFAULT_PRACTICE = {
  set_id: "practice", booklet: PRACTICE_BOOKLET, order: 1, active: true, source: "練習題組（自編）",
  passage: [
    "清晨的公園裡，總有幾位長者在樹下打太極拳。他們的動作緩慢，看起來毫不費力，其實每一個轉身、每一次移步，都需要腿部肌肉持續出力，並且時時調整身體重心。",
    "研究者發現，長期練習太極拳的人，單腳站立的時間明顯較長，跌倒的次數也較少。原因不在於力氣變大，而在於身體對重心變化的感知更加敏銳，能在失去平衡之前就察覺並修正。"
  ],
  items: [
    { id: "q1", stem: "根據本文，太極拳看起來毫不費力，實際上：", options: ["只需要手臂出力", "需要腿部肌肉持續出力", "主要訓練心肺功能", "動作越快效果越好"], answer: "B" },
    { id: "q2", stem: "長期練習太極拳的人較少跌倒，本文認為主要是因為：", options: ["腿部力氣變大", "身體較為柔軟", "對重心變化的感知更敏銳", "練習時特別小心"], answer: "C" }
  ]
};

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
  },
  {
    set_id: "demo-3", booklet: "A", order: 2, active: true,
    source: "示範題組（自編，非學測原題）",
    passage: [
      "城市裡的行道樹，常被當成單純的綠化裝飾。不過，研究者在夏季量測街道溫度時發現，有連續樹冠遮蔭的人行道，地表溫度可比無遮蔭處低十度以上；而且樹木透過葉片蒸散水分，也會帶走周圍的熱。",
      "然而，樹種與種植方式同樣關鍵。若為了整齊而選擇樹冠窄小的樹種，或把樹穴鋪得過小、讓根系無處伸展，樹木長不大，降溫效果便大打折扣。換句話說，行道樹的價值不在於「有沒有種」，而在於能不能長成一片連續的樹蔭。"
    ],
    items: [
      { id: "q1", stem: "根據本文，行道樹能降低街道溫度的原因，不包括下列何者？", options: ["樹冠遮蔽陽光", "葉片蒸散帶走熱量", "樹穴鋪面反射陽光", "連續的樹蔭減少地表受熱"], answer: "C" },
      { id: "q2", stem: "作者認為評估行道樹價值時，最應該關注的是：", options: ["城市種植的總棵數", "樹木外觀是否整齊一致", "是否選用開花樹種", "樹木能否長成連續的樹蔭"], answer: "D" }
    ]
  },
  {
    set_id: "demo-4", booklet: "B", order: 2, active: true,
    source: "示範題組（自編，非學測原題）",
    passage: [
      "許多人背單字時習慣把同一個字連續抄寫十遍，覺得抄完就記住了。心理學研究卻指出，這種「集中練習」帶來的熟悉感，往往在幾天後就消退；相較之下，把同樣的練習次數分散在不同日子進行，長期記憶的效果明顯較好。",
      "分散練習之所以有效，部分原因在於每次重新回想時都有些許困難。正是這種「想不太起來、但努力想起來」的過程，讓記憶被重新整理與鞏固。因此，學習時感到輕鬆流暢，不一定代表學得牢靠。"
    ],
    items: [
      { id: "q1", stem: "根據本文，「集中練習」的主要問題是：", options: ["需要花費更多的練習次數", "產生的熟悉感容易在數日後消退", "會讓學習者感到困難而放棄", "只適用於背誦單字"], answer: "B" },
      { id: "q2", stem: "下列何者最符合本文的觀點？", options: ["學習時越流暢，記憶越牢固", "回想時的適度困難有助於鞏固記憶", "分散練習需要的總次數比集中練習少", "抄寫是最有效的背誦方法"], answer: "B" }
    ]
  },
  {
    set_id: "demo-5", booklet: "A", order: 3, active: true,
    source: "示範題組（自編，非學測原題）",
    passage: [
      "傳統市場的攤商很少使用價目表，卻能在一天之內根據天氣、貨量與客人多寡調整售價：早上新貨上架時價格較高，接近收攤時則降價求售。這種看似隨興的定價，其實反映了生鮮食品難以久放的特性。",
      "對熟客來說，攤商有時會多送一把蔥或抹去零頭。這些小小的讓利不只是人情，也是一種穩定客源的策略：在競爭激烈的市場裡，比起每次都賺足差價，讓客人願意每週回來，或許更有利可圖。"
    ],
    items: [
      { id: "q1", stem: "根據本文，攤商接近收攤時降價的主要原因是：", options: ["生鮮食品不易久放", "早上的客人比較多", "價目表規定必須降價", "為了與超市競爭"], answer: "A" },
      { id: "q2", stem: "作者如何看待攤商對熟客的讓利？", options: ["純粹出於人情，不考慮利潤", "會使攤商長期虧損", "是穩定客源的經營策略", "只在市場冷清時才會出現"], answer: "C" }
    ]
  },
  {
    set_id: "demo-6", booklet: "B", order: 3, active: true,
    source: "示範題組（自編，非學測原題）",
    passage: [
      "翻譯詩歌時，譯者常面臨兩難：若逐字對照，雖然忠於字面，卻可能失去原詩的節奏與韻腳；若重新安排詞句以求音韻和諧，又可能偏離原意。因此有人說，詩是在翻譯中失去的東西。",
      "不過，也有譯者主張，翻譯不是複製，而是在另一種語言裡重新創作。好的譯詩未必與原作字字相符，卻能讓讀者感受到相近的情緒與畫面。從這個角度看，翻譯所失去的，或許也能以另一種形式被補回來。"
    ],
    items: [
      { id: "q1", stem: "本文所說翻譯詩歌的「兩難」，指的是：", options: ["字面忠實與音韻節奏難以兼顧", "譯者與原作者的意見不同", "詩歌的讀者越來越少", "不同語言的字數無法相同"], answer: "A" },
      { id: "q2", stem: "根據第二段，主張「翻譯是重新創作」的譯者認為好的譯詩應該：", options: ["與原作字字相符", "完全捨棄原作的意思", "讓讀者感受到相近的情緒與畫面", "只保留原作的韻腳"], answer: "C" }
    ]
  },
  { ...DEFAULT_PRACTICE }
];

const API = (() => {
  const url = (window.APP_CONFIG && APP_CONFIG.API_URL) || "";
  const demo = !url;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  const K = { sets: "nstc_demo_sets", sessions: "nstc_demo_sessions", responses: "nstc_demo_responses", texts: "nstc_demo_texts", images: "nstc_demo_images" };
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
  const isFormal = s => s.active !== false && s.active !== "FALSE" && String(s.booklet) !== PRACTICE_BOOKLET;

  return {
    demo,
    /* ---- 受試者端 ---- */
    // 題組（不含正確答案）、頁面文字、圖片
    async getContent() {
      if (demo) return {
        sets: demoSets().filter(s => s.active !== false).map(s => ({ ...s, items: s.items.map(({ answer, ...it }) => it) })),
        texts: LS.get(K.texts, {}), images: LS.get(K.images, {})
      };
      const j = await get({ action: "items" });
      return { sets: j.sets, texts: j.texts || {}, images: j.images || {} };
    },
    // 這位受試者的資料是否還在（研究者刪除後，該電腦可重新作答）
    async sessionExists(pid) {
      if (demo) return LS.get(K.sessions, []).some(s => String(s.pid) === String(pid));
      return (await get({ action: "exists", pid })).exists;
    },
    async assign() {
      if (demo) {
        const booklets = [...new Set(demoSets().filter(isFormal).map(s => s.booklet))].sort();
        const sessions = LS.get(K.sessions, []);
        const count = b => sessions.filter(s => s.booklet === b).length;
        const min = Math.min(...booklets.map(count));
        const pool = booklets.filter(b => count(b) === min);
        return pool[Math.floor(Math.random() * pool.length)];
      }
      return (await post({ action: "assign" })).booklet;
    },
    async start(session) {
      if (demo) { const a = LS.get(K.sessions, []); if (!a.some(x => x.pid === session.pid)) a.push({ ...session, started_at: now(), status: "started" }); LS.set(K.sessions, a); return; }
      await post({ action: "start", session });
    },
    async submitSet(row) {
      if (demo) {
        // 與後端相同：同一受試者同一題組只留一筆，較舊的資料不覆蓋較新的
        const a = LS.get(K.responses, []), k = a.findIndex(x => x.pid === row.pid && x.set_id === row.set_id);
        if (k >= 0 && (a[k].save_seq || 0) > (row.save_seq || 0)) return;
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
      if (demo) return { sets: demoSets(), sessions: LS.get(K.sessions, []), responses: LS.get(K.responses, []), texts: LS.get(K.texts, {}), images: LS.get(K.images, {}) };
      const j = await post({ action: "data", key });
      return { sets: j.sets, sessions: j.sessions, responses: j.responses, texts: j.texts || {}, images: j.images || {}, sheet_url: j.sheet_url || "" };
    },
    // images：題組用到的全部圖片 {代號: dataURL}，存檔時整批取代
    async saveSets(key, sets, images) {
      if (demo) { LS.set(K.sets, sets); LS.set(K.images, images || {}); return; }
      await post({ action: "saveSets", key, sets, images: images || {} });
    },
    // texts：只存與預設不同的頁面文字
    async saveTexts(key, texts) {
      if (demo) { LS.set(K.texts, texts); return; }
      await post({ action: "saveTexts", key, texts });
    },
    resetDemo() { Object.values(K).forEach(k => { try { localStorage.removeItem(k); } catch (e) {} }); }
  };
})();
