/* 受試者版：知情同意 → 裝置檢查 → 背景問卷 → 作答說明 → 每個題組（作答頁＋心力量表）→ 完成 */
(async () => {
  const CFG = window.APP_CONFIG;
  const pid = Math.random().toString(36).slice(2, 12);
  const pending = [];                       // 尚未確認送達的上傳
  const copyLog = [];
  const send = (fn, ...args) => { const p = fn(...args).catch(e => ({ failed: true, fn, args, e })); pending.push(p); return p; };

  /* ---------- 進度條 ---------- */
  const progress = { done: 0, total: 1 };
  const setProgress = done => {
    progress.done = done;
    const pct = Math.round(100 * done / progress.total);
    document.getElementById("progressFill").style.width = pct + "%";
    document.getElementById("progressLbl").textContent = `填答進度 ${pct}%`;
    document.getElementById("progress").setAttribute("aria-valuenow", pct);
  };

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
  progress.total = 3 + sets.length * 2;

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

  const jsPsych = initJsPsych({
    display_element: "app",
    // 題組相關的頁面會重複出現，進度改由 refreshProgress 依已送出的題組數計算
    on_trial_finish: data => { if (["consent", "background", "instructions"].includes(data.task)) setProgress(progress.done + 1); },
    on_finish: () => finish()
  });
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
  const background = {
    type: jsPsychSurveyHtmlForm,
    html: `<div class="panel">
      <h2>背景資料</h2>
      <div class="field"><span class="q">1. 你參加學測的年度</span>
        <select name="exam_year" required><option value="">請選擇</option>${[110, 111, 112, 113, 114, 115].map(y => `<option>${y}學年度</option>`).join("")}<option>其他</option></select></div>
      <div class="field"><span class="q">2. 你是否曾重考或再次參加學測？</span>${radios("retake", ["是", "否"])}</div>
      <div class="field"><span class="q">3. 你是否看過114或115學年度學測國文的試題或解析（例如補習班教材、網路解析）？</span>${radios("seen_items", ["是", "否", "不確定"])}</div>
      <div class="field"><span class="q">4. 你是否擔任過國文家教或相關備課工作？</span>${radios("tutor", ["是", "否"])}</div>
    </div>`,
    button_label: "下一步",
    data: { task: "background" },
    on_finish: data => send(API.start, {
      pid, booklet, ...data.response,
      user_agent: navigator.userAgent, screen: `${screen.width}x${screen.height}`
    })
  };

  /* ---------- 4. 作答說明＋全螢幕 ---------- */
  const instructions = {
    type: jsPsychHtmlButtonResponse,
    stimulus: `<div class="panel">
      <h2>作答說明</h2>
      <ul class="tight">
        <li>每個題組有一篇文章與數道單選題。文章和題幹可以畫重點：按住滑鼠拖曳選取文字，放開後就會標上螢光；切換到「橡皮擦」再拖曳一次即可擦掉。</li>
        <li>不確定答案的題目可以留空，直接送出也沒有關係。</li>
        <li>每個題組作答完畢後，會請你評定剛才花了多少心力，用 1 到 9 分表示。</li>
        <li>送出的題組之後仍可以用上方的「題組」按鈕回去檢查或修改答案；全部題組完成後，按「結束作答」才會交卷。</li>
        <li>按下「開始作答」後畫面會切換為全螢幕。請盡量不要退出全螢幕或切換到其他視窗。</li>
      </ul></div>`,
    choices: ["開始作答"],
    on_load: () => {
      const b = document.querySelector(".jspsych-btn");
      if (b) b.addEventListener("click", () => {
        try { const p = document.documentElement.requestFullscreen?.(); if (p) p.catch(() => {}); } catch (e) {}
      }, { capture: true });
    },
    on_finish: () => { exam.t0 = performance.now(); },      // visits 的 start_ms 以開始作答為 0
    data: { task: "instructions" }
  };

  /* ---------- 5. 題組頁：送出後仍可回到前面的題組 ----------
     每個題組的作答、畫記、離開紀錄跨次保留。時間一律是「停留在這個題組的累計時間」：
     rt_ms＝所有進入次數的停留時間總和；log 裡的 t、離開的 at_ms 也都以累計時間計。
     切換題組只是換頁，不會觸發 blur／visibilitychange，也不在題組頁以外計算離開。 */
  const store = sets.map(() => ({
    responses: {}, ansLog: [], hlLog: [], runs: [], leaves: [], fsExits: 0,
    visits: [], activeMs: 0, firstRtMs: null, effort: null, effortRtMs: null, submitted: false
  }));
  const exam = { cur: 0, go: null, effortFor: null, done: false, t0: 0 };
  const firstOpen = () => store.findIndex(s => !s.submitted);   // -1＝全部題組都送出過
  const canVisit = k => firstOpen() < 0 || k <= firstOpen();
  const refreshProgress = () => setProgress(3 + 2 * store.filter(s => s.submitted).length - (exam.effortFor != null ? 1 : 0));

  // 每次上傳的是該題組的完整現況；後端以 n_visits 判斷新舊，同一題組只留最新一列
  const upload = i => {
    const s = store[i], set = sets[i];
    const row = {
      pid, booklet, set_id: set.set_id, set_order: i + 1,
      rt_ms: Math.round(s.activeMs), first_rt_ms: s.firstRtMs,
      n_visits: s.visits.length, visits: s.visits,
      n_items: set.items.length,
      n_blank: set.items.filter(it => s.responses[it.id] == null).length,
      responses: s.responses,
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
    button_label: () => store[exam.cur].submitted ? "儲存並繼續" : "送出這個題組",
    data: { task: "item_set" },
    on_load: () => {
      const i = exam.cur, s = store[i], set = sets[i];
      exam.go = null;
      const start = performance.now();
      const t0 = start - s.activeMs;                         // performance.now() - t0 ＝ 在這個題組的累計時間
      Object.assign(away, { active: true, open: null, leaves: s.leaves, fsExits: s.fsExits, t0 });
      const screenEl = document.querySelector(".set-screen");
      const form = document.querySelector("#jspsych-survey-html-form");
      set.items.forEach(it => {
        const v = s.responses[it.id];
        const r = v && [...screenEl.querySelectorAll("input[type=radio]")].find(x => x.name === it.id && x.value === v);
        if (r) r.checked = true;                             // 程式設定不會觸發 change，不會寫進 answer_log
      });
      const st = attachHighlighter(screenEl, t0, s);
      visit = { i, start, st };

      // 題組切換按鈕：已送出過的題組與目前進行到的題組可以進入
      if (sets.length > 1) {
        const nav = document.createElement("div");
        nav.className = "tools setnav";
        nav.setAttribute("role", "group");
        nav.setAttribute("aria-label", "切換題組");
        nav.innerHTML = sets.map((x, k) => `<button type="button" class="tool" data-k="${k}"${k === i ? ' aria-current="true"' : ""}${k === i || !canVisit(k) ? " disabled" : ""}>題組 ${k + 1}${store[k].submitted ? " ✓" : ""}</button>`).join("");
        nav.addEventListener("click", e => {
          const b = e.target.closest("button[data-k]");
          if (!b || b.disabled) return;
          exam.go = Number(b.dataset.k);
          form.requestSubmit();
        });
        screenEl.querySelector(".taskbar .where").replaceWith(nav);
      }

      const counter = document.createElement("p");
      counter.className = "answered";
      form.querySelector("input[type=submit]").before(counter);
      const update = () => {
        const n = set.items.filter(it => screenEl.querySelector(`input[name="${it.id}"]:checked`)).length;
        counter.textContent = `已作答 ${n} / ${set.items.length} 題` + (n < set.items.length ? "（未作答的題目可以留空送出）" : "");
      };
      update();
      screenEl.addEventListener("change", e => {
        if (e.target.type === "radio") s.ansLog.push({ t: Math.round(performance.now() - t0), item: e.target.name, value: e.target.value });
        update();
      });
    },
    on_finish: data => {
      const { i, start, st } = visit, s = store[i], set = sets[i];
      leaveEnd(); away.active = false;
      const end = performance.now();
      s.activeMs += end - start;
      s.visits.push({ start_ms: Math.round(start - exam.t0), duration_ms: Math.round(end - start), via: exam.go == null ? "submit" : "nav" });
      s.fsExits = away.fsExits;
      s.runs = st.runs;
      // 受試者端沒有正確答案，只記錄作答；留空記為 null。計分在管理者頁依目前的答案進行
      set.items.forEach(it => { s.responses[it.id] = data.response[it.id] ?? null; });
      data.set_id = set.set_id;
      data.via = exam.go == null ? "submit" : "nav";

      if (exam.go == null && !s.submitted) {
        // 第一次送出：心力量表對應的是到這裡為止的累計時間
        s.submitted = true;
        s.firstRtMs = Math.round(s.activeMs);
        exam.effortFor = i;
      } else {
        if (s.submitted) upload(i);                          // 回來修改過的題組，離開時更新資料
        exam.cur = exam.go ?? firstOpen();                   // 「儲存並繼續」回到目前進行到的題組；都完成則到總覽頁
      }
      refreshProgress();
    }
  };

  /* ---------- 6. 心力耗費量表（只在題組第一次送出後出現）---------- */
  const effortPage = {
    type: jsPsychSurveyHtmlForm,
    html: `<div class="panel">
      <h2>我覺得我需要耗費多少心力回答剛剛的測驗問題？</h2>
      <div class="scale" role="radiogroup" aria-label="心力耗費，1到9分">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(v => `<label><input type="radio" name="effort" value="${v}" required>${v}</label>`).join("")}
      </div>
      <div class="scale-ends"><span>1 非常非常少</span><span>9 非常非常多</span></div>
    </div>`,
    button_label: "下一步",
    data: { task: "effort" },
    on_finish: data => {
      const i = exam.effortFor;
      Object.assign(store[i], { effort: Number(data.response.effort), effortRtMs: data.rt });
      data.set_id = sets[i].set_id;
      exam.effortFor = null;
      upload(i);
      exam.cur = firstOpen();
      refreshProgress();
    }
  };

  /* ---------- 6b. 全部送出後的總覽：可回去檢查，按「結束作答」才交卷 ---------- */
  const reviewPage = {
    type: jsPsychHtmlButtonResponse,
    stimulus: () => `<div class="panel">
      <h2>所有題組都已作答</h2>
      <p>你可以回到任何一個題組檢查或修改答案。確認沒問題後，按「結束作答」交卷；交卷後就不能再修改。</p>
      <ul class="tight">${sets.map((set, k) => {
        const n = set.items.filter(it => store[k].responses[it.id] != null).length;
        return `<li>題組 ${k + 1}：已作答 ${n} / ${set.items.length} 題</li>`;
      }).join("")}</ul></div>`,
    choices: () => [...sets.map((_, k) => `回到題組 ${k + 1}`), "結束作答"],
    data: { task: "review" },
    on_finish: data => {
      if (data.response === sets.length) exam.done = true;
      else exam.cur = data.response;
    }
  };

  /* ---------- 7. 完成 ---------- */
  async function finish() {
    monitor.ended = true;
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
    const app = document.getElementById("app");
    app.innerHTML = `<div class="panel"><h1>正在儲存作答資料…</h1><p class="muted">請先不要關閉這個頁面。</p></div>`;
    send(API.complete, pid, { total_ms: Math.round(performance.now() - tStart), copy_attempts: copyLog.length });
    // 失敗的上傳再重試一次
    const results = await Promise.all(pending);
    const failed = results.filter(r => r && r.failed);
    const retry = await Promise.all(failed.map(f => f.fn(...f.args).then(() => true).catch(() => false)));
    const ok = retry.every(Boolean);
    app.innerHTML = `<div class="panel">
      <h1>${ok ? "作答完成，謝謝你的參與" : "作答完成，但部分資料未能儲存"}</h1>
      ${ok ? "" : "<p>請不要關閉頁面，並聯絡研究人員，告知下方的受試者編碼。</p>"}
      ${CFG.REWARD_FORM_URL ? `<p>請到 <a href="${esc(CFG.REWARD_FORM_URL)}" target="_blank" rel="noopener">酬謝領取表單</a> 填寫聯絡方式（與作答資料分開保存）。</p>` : ""}
      <p class="muted">受試者編碼：<span style="font-family:var(--f-num)">${pid}</span></p>
      ${API.demo ? '<p class="muted">示範模式：資料存在這台電腦的瀏覽器，可到 <a href="admin.html">管理者頁</a>（密碼 demo）查看。</p>' : ""}
    </div>`;
  }

  /* ---------- 組合流程 ---------- */
  // exam.cur：要顯示的題組；-1＝總覽頁。每一輪依狀態決定顯示題組頁、心力量表或總覽頁
  const examLoop = {
    timeline: [
      { timeline: [setPage], conditional_function: () => exam.cur >= 0 && exam.effortFor == null },
      { timeline: [effortPage], conditional_function: () => exam.effortFor != null },
      { timeline: [reviewPage], conditional_function: () => exam.cur < 0 && exam.effortFor == null }
    ],
    loop_function: () => !exam.done
  };
  jsPsych.run([consent, deviceBlock, background, instructions, examLoop]);
})();
