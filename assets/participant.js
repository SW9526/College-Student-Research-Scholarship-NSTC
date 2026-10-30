/* 受試者版：知情同意 → 裝置檢查 → 背景問卷 → 作答說明 → 題組（第一輪依序作答，每個題組完成後立即填心力量表；之後可自由切換）→ 交卷確認 → 完成 */
(async () => {
  const CFG = window.APP_CONFIG;
  const pid = Math.random().toString(36).slice(2, 12);
  const pending = [];                       // 尚未確認送達的上傳
  const copyLog = [];
  const send = (fn, ...args) => { const p = fn(...args).catch(e => ({ failed: true, fn, args, e })); pending.push(p); return p; };

  /* ---------- 載入題目、分派題本 ---------- */
  let sets, booklet;
  try {
    const all = await API.getSets();
    booklet = await API.assign();
    sets = all.filter(s => s.booklet === booklet).sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!sets.length) throw new Error("題本中沒有題組");
  } catch (e) {
    document.getElementById("app").innerHTML = `<div class="panel"><h2>目前無法開始作答</h2><p>題目載入失敗，請稍後重新整理頁面；若持續發生，請聯絡研究人員。</p><p class="muted">${esc(e.message)}</p></div>`;
    return;
  }

  /* ---------- 監測：複製、離開視窗、全螢幕 ---------- */
  const monitor = { ended: false };
  ["copy", "cut", "contextmenu"].forEach(ev => document.addEventListener(ev, e => {
    if (monitor.ended) return;
    e.preventDefault();
    copyLog.push({ type: ev, t: Math.round(performance.now()) });
  }));
  // 只在題組作答頁計算；切換全螢幕後 1.5 秒內的失焦不計
  const away = { active: false, open: null, lastFs: -1e9, leaves: [], fsExits: 0, t0: 0 };
  const leaveStart = via => {
    if (!away.active || away.open) return;
    if (via === "blur" && performance.now() - away.lastFs < 1500) return;
    away.open = { via, start: performance.now() };
  };
  const leaveEnd = () => {
    if (!away.open) return;
    away.leaves.push({ via: away.open.via, at_ms: Math.round(away.open.start - away.t0), duration_ms: Math.round(performance.now() - away.open.start) });
    away.open = null;
  };
  window.addEventListener("blur", () => leaveStart("blur"));
  window.addEventListener("focus", leaveEnd);
  document.addEventListener("visibilitychange", () => document.hidden ? leaveStart("hidden") : leaveEnd());
  document.addEventListener("fullscreenchange", () => { away.lastFs = performance.now(); if (away.active && !document.fullscreenElement) away.fsExits++; });

  /* ---------- 題組狀態 ----------
     每個題組的作答、不確定標註、畫記、離開紀錄跨次保留。時間一律是「停留在這個題組的累計時間」：
     rt_ms＝所有進入次數的停留時間總和；log 裡的 t、離開的 at_ms 也都以累計時間計。
     切換題組只是換頁，不會觸發 blur／visibilitychange，也不在題組頁以外計算離開。 */
  const store = sets.map(() => ({
    responses: {}, flags: {}, ansLog: [], flagLog: [], hlLog: [], runs: [], leaves: [], fsExits: 0,
    visits: [], activeMs: 0, firstRtMs: null, effort: null, effortRtMs: null, uploaded: false
  }));
  // cur：要顯示的題組，-1＝交卷確認頁；go／focus：點圓圈或題號時要去的題組與題目
  const exam = { started: false, cur: 0, go: null, focus: null, effortFor: null, after: null, done: false, t0: 0, seq: 0, lastSeq: {} };
  const nItems = k => sets[k].items.length;
  const nAnswered = k => sets[k].items.filter(it => store[k].responses[it.id] != null).length;
  const nFlagged = k => sets[k].items.filter(it => store[k].flags[it.id]).length;
  // 第一輪依序作答：frontier＝第一個還沒評心力的題組（-1＝全部完成）。之前的題組可以回去，後面的題組要等前面完成
  const frontier = () => store.findIndex(s => s.effort == null);
  const canGo = k => frontier() < 0 || (k >= 0 && k <= frontier());   // k＝-1 是交卷頁，全部完成後才能去
  // 「暫存答案」後要去的地方：第一輪中回到還沒完成的題組；全部完成後依序往下，最後一個到交卷頁
  const nextAfterSave = i => { const f = store.findIndex((s, k) => k !== i && s.effort == null); return f >= 0 ? f : i + 1 < sets.length ? i + 1 : -1; };

  /* ---------- 上方進度圓圈：每個階段、每個題組各一個；作答期間可點題組圓圈切換 ---------- */
  const steps = [
    { key: "consent", label: "同意" }, { key: "background", label: "背景" }, { key: "instructions", label: "說明" },
    ...sets.map((_, k) => ({ key: "set", k, label: `題組 ${k + 1}` })),
    { key: "review", label: "交卷" }
  ];
  let stage = "consent", navigate = null;          // navigate(k)：目前頁面提供的切換方式；null＝不可切換
  const stepIndex = () => stage === "set" ? 3 + exam.cur : stage === "effort" ? 3 + exam.effortFor : steps.findIndex(s => s.key === stage);
  const drawSteps = () => {
    const at = stepIndex();
    document.getElementById("steps").innerHTML = steps.map((s, n) => {
      const cls = ["step"], cur = n === at;
      let mark = n < at || exam.started ? "✓" : "";      // 前三個階段：完成打勾；題組圓圈顯示題組編號
      if (s.key === "set") {
        const a = nAnswered(s.k), f = nFlagged(s.k);
        mark = String(s.k + 1);
        cls.push(f ? "flagged" : a === nItems(s.k) ? "complete" : a ? "partial" : "todo");
      } else if (s.key === "review") mark = "交";
      else cls.push(n < at || exam.started ? "done" : "todo");
      if (cur) cls.push("current");
      const can = navigate && !cur && (s.key === "set" ? canGo(s.k) : s.key === "review" && canGo(-1));
      const title = s.key === "set" ? `${s.label}：已作答 ${nAnswered(s.k)} / ${nItems(s.k)} 題${nFlagged(s.k) ? `，${nFlagged(s.k)} 題標註不確定` : ""}` : s.label;
      const dot = can
        ? `<button type="button" class="dot" data-n="${n}" title="${esc(title)}" aria-label="${esc(title)}">${mark}</button>`
        : `<span class="dot" title="${esc(title)}"${cur ? ' aria-current="step"' : ""}>${mark}</span>`;
      return `<li class="${cls.join(" ")}">${dot}<span class="lbl">${esc(s.label)}</span></li>`;
    }).join("");
  };
  document.getElementById("steps").addEventListener("click", e => {
    const b = e.target.closest("button.dot");
    if (!b || !navigate) return;
    const s = steps[Number(b.dataset.n)];
    navigate(s.key === "set" ? s.k : -1, null);
  });
  const enterStage = st => { stage = st; navigate = null; drawSteps(); };

  const jsPsych = initJsPsych({ display_element: "app", on_finish: () => finish() });
  const tStart = performance.now();

  /* ---------- 1. 知情同意 ---------- */
  const consent = {
    type: jsPsychSurveyHtmlForm,
    preamble: `<div class="panel" style="margin-bottom:12px">
      ${API.demo ? '<span class="demo-tag">示範模式：資料只存在這台電腦</span>' : ''}
      <h1>學測國文閱讀作答研究</h1>
      <p>本研究想了解大學生作答學測國文閱讀題組的表現，以及作答時花費的心力。</p>
      <ul class="tight">
        <li>作答約需 50–60 分鐘，請使用電腦或平板，在安靜、不受打擾的環境完成。</li>
        <li>作答期間請勿查詢資料，也請勿離開作答視窗；系統會記錄作答時間與視窗切換情形。</li>
        <li>本研究不蒐集姓名、學號等可識別個人的資訊，資料以編碼方式保存。</li>
        <li>你可以隨時關閉網頁退出，不會有任何不利影響。</li>
      </ul>
    </div>`,
    html: `<div class="panel"><label><input type="checkbox" name="consent" value="yes" required> 我已閱讀上述說明，同意參與本研究。</label></div>`,
    button_label: "同意並繼續",
    on_load: () => enterStage("consent"),
    data: { task: "consent" }
  };

  /* ---------- 2. 裝置檢查 ---------- */
  const isSmall = () => window.innerWidth < CFG.MIN_WIDTH || /Mobi|Android|iPhone/i.test(navigator.userAgent);
  const deviceBlock = {
    timeline: [{
      type: jsPsychHtmlButtonResponse,
      stimulus: () => `<div class="panel"><h2>請改用電腦或平板作答</h2>
        <p>閱讀題組的文章較長，為了讓每位受試者的作答環境一致，本研究需要寬度至少 ${CFG.MIN_WIDTH}px 的螢幕。請改用電腦或平板開啟同一個連結。</p>
        ${API.demo ? '<p class="muted">示範模式可以繼續；正式施測時這一頁沒有按鈕。</p>' : ''}</div>`,
      choices: () => API.demo ? ["示範：仍要繼續"] : [],
      data: { task: "device_block" }
    }],
    conditional_function: isSmall
  };

  /* ---------- 3. 背景問卷 ---------- */
  const radios = (name, opts) => `<div class="opts">${opts.map(o => `<label><input type="radio" name="${name}" value="${o}" required> ${o}</label>`).join("")}</div>`;
  const YEARS = [...[110, 111, 112, 113, 114, 115].map(y => `${y}學年度`), "其他"];
  const background = {
    type: jsPsychSurveyHtmlForm,
    // 學測年度可複選：勾選框不設 name，選到的年度以「、」串起來放進隱藏欄位 exam_year
    html: `<div class="panel">
      <h2>背景資料</h2>
      <div class="field"><span class="q">1. 你參加學測的年度（可複選）</span>
        <div class="opts" id="yearOpts">${YEARS.map(y => `<label><input type="checkbox" value="${y}"> ${y}</label>`).join("")}</div>
        <input type="hidden" name="exam_year" value=""></div>
      <div class="field"><span class="q">2. 你是否曾重考或再次參加學測？</span>${radios("retake", ["是", "否"])}</div>
      <div class="field"><span class="q">3. 你是否看過114或115學年度學測國文的試題或解析（例如補習班教材、網路解析）？</span>${radios("seen_items", ["是", "否", "不確定"])}</div>
      <div class="field"><span class="q">4. 你是否擔任過國文家教或相關備課工作？</span>${radios("tutor", ["是", "否"])}</div>
    </div>`,
    button_label: "下一步",
    data: { task: "background" },
    on_load: () => {
      enterStage("background");
      const boxes = [...document.querySelectorAll("#yearOpts input")];
      const hidden = document.querySelector("input[name=exam_year]");
      const sync = () => {
        const picked = boxes.filter(b => b.checked).map(b => b.value);
        hidden.value = picked.join("、");
        boxes[0].setCustomValidity(picked.length ? "" : "請至少勾選一個年度");
      };
      boxes.forEach(b => b.addEventListener("change", sync));
      sync();
    },
    on_finish: data => send(API.start, {
      pid, booklet, ...data.response,
      user_agent: navigator.userAgent, screen: `${screen.width}x${screen.height}`
    })
  };

  /* ---------- 4. 作答說明＋全螢幕 ---------- */
  const instructions = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<div class="panel wide">
      <h2>作答說明</h2>
      <ul class="tight">
        <li>每個題組有一篇文章與數道單選題。<strong>文章和題幹可以畫重點：按住滑鼠拖曳選取文字，放開後就會標上螢光；切換到「橡皮擦」再拖曳一次即可擦掉。</strong></li>
        <li>沒把握的題目可以按題目右側的「不確定」做記號，之後再回來檢查；不確定答案的題目也可以留空。</li>
        <li>請依序作答。每個題組完成後按「暫存答案」，接著會請你評定剛才花了多少心力（1 到 9 分），再進入下一個題組。</li>
        <li>上方圓圈代表各個題組：已完成的題組可以點圓圈回去檢查或修改，答案和螢光都會保留。</li>
        <li>作答到一半點圓圈回到前面的題組時，若這個題組已經作答，也會先請你評定心力。</li>
        <li>全部題組完成後，可以自由切換檢查，最後在「交卷」頁按「結束作答」才會交卷。</li>
        <li>按下「開始作答」後畫面會切換為全螢幕。請盡量不要退出全螢幕或切換到其他視窗。</li>
      </ul></div>`,
    choices: ["開始作答"],
    on_load: () => {
      enterStage("instructions");
      const b = document.querySelector(".jspsych-btn");
      if (b) b.addEventListener("click", () => {
        try { const p = document.documentElement.requestFullscreen?.(); if (p) p.catch(() => {}); } catch (e) {}
      }, { capture: true });
    },
    on_finish: () => { exam.t0 = performance.now(); exam.started = true; },   // visits 的 start_ms 以開始作答為 0
    data: { task: "instructions" }
  };

  /* ---------- 5. 題組頁 ---------- */
  // 每次上傳的是該題組的完整現況；save_seq 逐次遞增，後端只保留最新的一筆（同一題組一列）
  const upload = i => {
    const s = store[i], set = sets[i];
    s.uploaded = true;
    const row = {
      pid, booklet, set_id: set.set_id, set_order: i + 1, save_seq: (exam.lastSeq[set.set_id] = ++exam.seq),
      rt_ms: Math.round(s.activeMs), first_rt_ms: s.firstRtMs,
      n_visits: s.visits.length, visits: s.visits,
      n_items: set.items.length,
      n_blank: set.items.filter(it => s.responses[it.id] == null).length,
      responses: Object.fromEntries(set.items.map(it => [it.id, s.responses[it.id] ?? null])),
      flags: set.items.filter(it => s.flags[it.id]).map(it => it.id), flag_log: s.flagLog,
      first_answer_ms: Object.fromEntries(set.items.map(it => [it.id, (s.ansLog.find(a => a.item === it.id) || {}).t ?? null])),
      highlights: s.runs, highlight_log: s.hlLog, answer_log: s.ansLog,
      leaves: s.leaves, n_leaves: s.leaves.length,
      leave_ms: s.leaves.reduce((a, l) => a + l.duration_ms, 0),
      n_fullscreen_exits: s.fsExits,
      effort: s.effort, effort_rt_ms: s.effortRtMs
    };
    send(API.submitSet, JSON.parse(JSON.stringify(row)));   // 存快照，重試時不會送出之後才改的內容
  };

  let visit = null;
  const setPage = {
    type: jsPsychSurveyHtmlForm,
    html: () => renderSet(sets[exam.cur], { idx: exam.cur, total: sets.length, startNo: startNoFor(sets[exam.cur], sets), showSource: CFG.SHOW_SOURCE_NOTE }),
    button_label: "暫存答案",
    data: { task: "item_set" },
    on_load: () => {
      const i = exam.cur, s = store[i], set = sets[i];
      const focus = exam.focus;
      exam.go = null; exam.focus = null;
      const start = performance.now();
      const t0 = start - s.activeMs;                         // performance.now() - t0 ＝ 在這個題組的累計時間
      Object.assign(away, { active: true, open: null, leaves: s.leaves, fsExits: s.fsExits, t0 });
      const screenEl = document.querySelector(".set-screen");
      const form = document.querySelector("#jspsych-survey-html-form");
      set.items.forEach(it => {
        const v = s.responses[it.id];
        const r = v && [...screenEl.querySelectorAll("input[type=radio]")].find(x => x.name === it.id && x.value === v);
        if (r) r.checked = true;                             // 程式設定不會觸發 change，不會寫進 answer_log
        const f = screenEl.querySelector(`.flag[data-item="${CSS.escape(it.id)}"]`);
        if (f) f.setAttribute("aria-pressed", String(!!s.flags[it.id]));
      });
      const st = attachHighlighter(screenEl, t0, s);
      visit = { i, start, st };

      const counter = document.createElement("p");
      counter.className = "answered";
      form.querySelector("input[type=submit]").before(counter);
      const update = () => {
        const n = nAnswered(i), f = nFlagged(i);
        counter.textContent = `已作答 ${n} / ${set.items.length} 題` + (f ? `，${f} 題標註不確定` : "") + (n < set.items.length ? "（未作答的題目可以留空）" : "");
        drawSteps();
      };
      screenEl.addEventListener("change", e => {
        if (e.target.type !== "radio") return;
        s.responses[e.target.name] = e.target.value;
        s.ansLog.push({ t: Math.round(performance.now() - t0), item: e.target.name, value: e.target.value });
        update();
      });
      screenEl.addEventListener("click", e => {
        const f = e.target.closest(".flag");
        if (!f) return;
        const on = f.getAttribute("aria-pressed") !== "true";
        f.setAttribute("aria-pressed", String(on));
        s.flags[f.dataset.item] = on;
        s.flagLog.push({ t: Math.round(performance.now() - t0), item: f.dataset.item, on });
        update();
      });

      // 點上方圓圈切換題組：照常送出表單，答案與時間都會先存好
      stage = "set";
      navigate = (k, item) => { exam.go = k; exam.focus = item; form.requestSubmit(); };
      update();
      const target = focus && screenEl.querySelector(`#stem-${CSS.escape(focus)}`);
      if (target) target.closest(".q").scrollIntoView({ block: "center" }); else window.scrollTo(0, 0);
    },
    on_finish: data => {
      const { i, start, st } = visit, s = store[i], set = sets[i];
      navigate = null;
      leaveEnd(); away.active = false;
      const end = performance.now();
      s.activeMs += end - start;
      s.visits.push({ start_ms: Math.round(start - exam.t0), duration_ms: Math.round(end - start), via: exam.go == null ? "save" : "nav" });
      s.fsExits = away.fsExits;
      s.runs = st.runs;
      // 受試者端沒有正確答案，只記錄作答；留空記為 null。計分在管理者頁依目前的答案進行
      set.items.forEach(it => { s.responses[it.id] = data.response[it.id] ?? null; });
      data.set_id = set.set_id;
      data.via = exam.go == null ? "save" : "nav";

      const next = exam.go ?? nextAfterSave(i);
      // 還沒評心力的題組：按「暫存答案」，或已作答至少一題後點圓圈離開，都立即評心力（first_rt_ms＝評分當下的累計時間）。
      // 一題都還沒作答就點圓圈回前面的題組，不算完成，之後回來暫存時再評
      if (s.effort == null && (exam.go == null || nAnswered(i) > 0)) {
        exam.effortFor = i; exam.after = next;
      } else {
        upload(i);
        exam.cur = next;
      }
    }
  };

  /* ---------- 6. 心力耗費量表（每個題組完成後立即填寫，只填一次）---------- */
  const effortPage = {
    type: jsPsychSurveyHtmlForm,
    html: () => `<div class="panel">
      <p class="muted">題組 ${exam.effortFor + 1}</p>
      <h2>我覺得我需要耗費多少心力回答剛剛的測驗問題？</h2>
      <div class="scale" role="radiogroup" aria-label="心力耗費，1到9分">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => `<label><input type="radio" name="effort" value="${v}" required>${v}</label>`).join("")}
      </div>
      <div class="scale-ends"><span>1 非常非常少</span><span>9 非常非常多</span></div>
    </div>`,
    button_label: "下一步",
    data: { task: "effort" },
    on_load: () => enterStage("effort"),
    on_finish: data => {
      const i = exam.effortFor, s = store[i];
      Object.assign(s, { effort: Number(data.response.effort), effortRtMs: data.rt, firstRtMs: Math.round(s.activeMs) });
      data.set_id = sets[i].set_id;
      upload(i);
      exam.cur = exam.after;
      exam.effortFor = null;
    }
  };

  /* ---------- 7. 交卷確認：答案一覽，點題號回到該題 ---------- */
  const reviewPage = {
    type: jsPsychSurveyHtmlForm,
    html: () => {
      let no = 0, total = 0, answered = 0, flagged = 0;
      const groups = sets.map((set, k) => `<div class="sheet-row"><span class="sheet-set">題組 ${k + 1}</span>${set.items.map(it => {
        no++; total++;
        const v = store[k].responses[it.id], f = store[k].flags[it.id];
        if (v != null) answered++;
        if (f) flagged++;
        const state = v != null ? "answered" : "blank";
        return `<button type="button" class="cell ${state}${f ? " flagged" : ""}" data-k="${k}" data-item="${esc(it.id)}" title="第 ${no} 題${f ? "（標註不確定）" : ""}"><span class="no">${no}</span><span class="v">${v ?? "—"}</span></button>`;
      }).join("")}</div>`).join("");
      return `<div class="panel">
        <h2>交卷前確認</h2>
        <p>已作答 <b>${answered}</b> / ${total} 題${total - answered ? `，<b>${total - answered}</b> 題未作答` : ""}${flagged ? `，<b>${flagged}</b> 題標註不確定` : ""}。<b>點下方的題號可以回到那一題</b>；確認沒問題後，按「結束作答」交卷，交卷後就不能再修改。</p>
        <div class="sheet">${groups}</div>
        <p class="legend"><span class="cell answered"></span>已作答 <span class="cell blank"></span>未作答 <span class="cell flagged"></span>標註不確定</p>
      </div>`;
    },
    button_label: "結束作答",
    data: { task: "review" },
    on_load: () => {
      const form = document.querySelector("#jspsych-survey-html-form");
      stage = "review";
      navigate = (k, item) => { exam.go = k; exam.focus = item; form.requestSubmit(); };
      drawSteps();
      exam.go = null;
      form.querySelector(".sheet").addEventListener("click", e => {
        const c = e.target.closest(".cell[data-k]");
        if (c) navigate(Number(c.dataset.k), c.dataset.item);
      });
    },
    on_finish: data => {
      navigate = null;
      if (exam.go != null && exam.go >= 0) { data.go = exam.go; exam.cur = exam.go; return; }
      if (exam.go === -1) return;                            // 在交卷頁點「交卷」圓圈：留在這頁
      exam.done = true;                                      // 交卷頁要全部題組完成（都已評心力）才進得來
    }
  };

  /* ---------- 8. 完成 ---------- */
  async function finish() {
    monitor.ended = true;
    navigate = null;
    stage = "review"; drawSteps();
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
    const app = document.getElementById("app");
    app.innerHTML = `<div class="panel"><h1>正在儲存作答資料…</h1><p class="muted">請先不要關閉這個頁面。</p></div>`;
    store.forEach((s, k) => { if (!s.uploaded) upload(k); });   // 保險：沒上傳過的題組也留一列
    // 先等所有上傳完成，失敗的重試一次；仍失敗的記在 Sessions 的 save_failed，管理者頁預設排除這位受試者
    const results = await Promise.all(pending);
    const failed = results.filter(r => r && r.failed);
    const retry = await Promise.all(failed.map(f => f.fn(...f.args).then(() => null).catch(() => f)));
    // 同一題組只要最後一次上傳成功，資料就是完整的；較早的快照失敗不算
    const lost = retry.filter(f => f && !(f.fn === API.submitSet && f.args[0].save_seq !== exam.lastSeq[f.args[0].set_id]))
      .map(f => f.fn === API.submitSet ? "題組 " + f.args[0].set_id : f.fn === API.start ? "背景資料" : "其他");
    const patch = { total_ms: Math.round(performance.now() - tStart), copy_attempts: copyLog.length, save_failed: lost.join("、") };
    // 交卷紀錄本身也失敗時，這位受試者會停在「未完成」，同樣不會納入分析
    await API.complete(pid, patch).catch(() => API.complete(pid, patch)).catch(() => {});
    // 不向受試者顯示編號；儲存失敗也只顯示一般的完成畫面，由研究者在管理者頁看到排除原因
    app.innerHTML = `<div class="panel">
      <h1>作答完成，謝謝你的參與</h1>
      ${CFG.REWARD_FORM_URL ? `<p>請到 <a href="${esc(CFG.REWARD_FORM_URL)}" target="_blank" rel="noopener">酬謝領取表單</a> 填寫聯絡方式（與作答資料分開保存）。</p>` : ""}
      ${API.demo ? '<p class="muted">示範模式：資料存在這台電腦的瀏覽器，可到 <a href="admin.html">管理者頁</a>（密碼 demo）查看。</p>' : ""}
    </div>`;
  }

  /* ---------- 組合流程 ---------- */
  // 每一輪依狀態決定顯示題組頁、心力量表或交卷頁
  const examLoop = {
    timeline: [
      { timeline: [setPage], conditional_function: () => !exam.done && exam.effortFor == null && exam.cur >= 0 },
      { timeline: [effortPage], conditional_function: () => !exam.done && exam.effortFor != null },
      { timeline: [reviewPage], conditional_function: () => !exam.done && exam.effortFor == null && exam.cur < 0 }
    ],
    loop_function: () => !exam.done
  };
  drawSteps();
  jsPsych.run([consent, deviceBlock, background, instructions, examLoop]);
})();
