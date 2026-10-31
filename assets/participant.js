/* 受試者版：裝置檢查 → 知情同意 → 背景問卷 → 作答說明（全螢幕）→ 練習題組 →
   正式題組依序作答（按「完成這個題組」並確認 → 心力評定；完成後不能返回）→ 回饋問卷 → 完成頁 */
(async () => {
  const CFG = window.APP_CONFIG;
  const app = document.getElementById("app");
  const SS_KEY = "nstc_progress", DONE_KEY = "nstc_done";
  const ss = {
    get() { try { return JSON.parse(sessionStorage.getItem(SS_KEY) || "null"); } catch (e) { return null; } },
    set(v) { try { sessionStorage.setItem(SS_KEY, JSON.stringify(v)); } catch (e) {} },
    clear() { try { sessionStorage.removeItem(SS_KEY); } catch (e) {} }
  };
  const done = {
    get() { try { return localStorage.getItem(DONE_KEY); } catch (e) { return null; } },
    set() { try { localStorage.setItem(DONE_KEY, new Date().toISOString()); } catch (e) {} },
    clear() { try { localStorage.removeItem(DONE_KEY); } catch (e) {} }
  };
  const show = html => { app.innerHTML = html; window.scrollTo(0, 0); };
  const nextClick = sel => new Promise(res => app.querySelector(sel).addEventListener("click", res, { once: true }));
  const formSubmit = form => new Promise(res => form.addEventListener("submit", e => {
    e.preventDefault();
    res(Object.fromEntries(new FormData(form)));
  }));
  const goFullscreen = () => { try { const p = document.documentElement.requestFullscreen?.(); if (p) p.catch(() => {}); } catch (e) {} };

  /* ---------- 載入題目、頁面文字、圖片 ---------- */
  let content;
  try { content = await API.getContent(); }
  catch (e) {
    show(`<div class="panel"><h2>目前無法開始作答</h2><p>題目載入失敗，請稍後重新整理頁面；若持續發生，請聯絡研究人員。</p><p class="muted">${esc(e.message)}</p></div>`);
    return;
  }
  const T = { ...DEFAULT_TEXTS, ...content.texts };
  const images = content.images || {};
  const practice = content.sets.find(s => String(s.booklet) === PRACTICE_BOOKLET && s.active !== false) || DEFAULT_PRACTICE;
  const formal = content.sets.filter(s => String(s.booklet) !== PRACTICE_BOOKLET);
  const setsOf = b => formal.filter(s => String(s.booklet) === String(b)).sort((x, y) => (x.order || 0) - (y.order || 0));
  let V = textVars(CFG, { DEMO: API.demo, N_SETS: setsOf(formal[0]?.booklet).length || "" });

  /* ---------- 同一台電腦已完成過：不再作答 ---------- */
  if (done.get()) {
    show(PAGE_HTML.already_done(T, V));
    app.querySelector("[data-reset]")?.addEventListener("click", () => { done.clear(); ss.clear(); location.reload(); });
    return;
  }

  /* ---------- 作答狀態（存在 sessionStorage，重新整理後接續）----------
     store：每個題組的作答、畫記、離開紀錄與累計時間。時間一律是「停留在該題組的累計時間」：
     rt_ms＝停留時間總和；log 裡的 t、離開的 at_ms 都以累計時間計。 */
  let S = ss.get();
  let sets = S ? setsOf(S.booklet) : [];
  let store = S ? S.store : [];
  let visit = null;                                   // 目前題組頁：{ i, start(performance), st, practice }
  const away = { active: false, open: null, lastFs: -1e9, leaves: [], fsExits: 0, t0: 0 };
  const saveState = () => {
    if (!S) return;
    if (visit && !visit.practice) {
      const s = store[visit.i];
      S.curActive = s.activeMs + (performance.now() - visit.start);
      s.runs = visit.st.runs;
      S.openLeave = away.open ? { via: away.open.via, at_ms: Math.round(away.open.start - away.t0), wall: Date.now() - (performance.now() - away.open.start) } : null;
    }
    S.store = store; S.savedAt = Date.now();
    ss.set(S);
  };
  window.addEventListener("pagehide", saveState);
  document.addEventListener("visibilitychange", () => { if (document.hidden) saveState(); });
  setInterval(() => { if (visit && !visit.practice) saveState(); }, 2000);
  // 作答期間離開頁面前提醒（瀏覽器多半只顯示固定的提醒文字）
  window.addEventListener("beforeunload", e => { if (S && S.stage !== "done") { e.preventDefault(); e.returnValue = T.leave_warning; } });

  /* ---------- 監測：複製、離開視窗、全螢幕（只在正式題組頁計算離開）---------- */
  const testing = () => S && ["practice", "set", "effort"].includes(S.stage);
  ["copy", "cut", "contextmenu"].forEach(ev => document.addEventListener(ev, e => {
    if (!testing()) return;
    e.preventDefault();
    S.copyN = (S.copyN || 0) + 1;
  }));
  // 切換全螢幕後 1.5 秒內的失焦不計
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
  document.addEventListener("fullscreenchange", () => {
    away.lastFs = performance.now();
    if (away.active && !document.fullscreenElement) away.fsExits++;
    updateFsBar();
  });

  /* ---------- 退出全螢幕提示列：按一下回到全螢幕 ---------- */
  const fsbar = document.getElementById("fsbar");
  fsbar.textContent = T.fullscreen_bar;
  fsbar.addEventListener("click", goFullscreen);
  const updateFsBar = () => { fsbar.hidden = !(testing() && document.fullscreenEnabled && !document.fullscreenElement); };

  /* ---------- 左上角已用時間：正式題組的累計作答時間（評定心力時暫停，練習不計）---------- */
  const timer = document.getElementById("timer");
  const fmt = ms => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; };
  const tick = () => {
    const on = CFG.SHOW_TIMER && S && ["set", "effort"].includes(S.stage);
    timer.hidden = !on;
    if (!on) return;
    const ms = store.reduce((a, s) => a + s.activeMs, 0) + (visit && !visit.practice ? performance.now() - visit.start : 0);
    timer.textContent = `已用時間 ${fmt(ms)}`;
  };
  setInterval(tick, 500);

  /* ---------- 上方進度圓圈（只顯示進度，不能點）---------- */
  const stepsEl = document.getElementById("steps");
  let preStage = "consent";
  const drawSteps = () => {
    const n = sets.length || (Number(V.N_SETS) || 0);
    const list = [["consent", "同意"], ["background", "背景"], ["instructions", "說明"], ["practice", "練習"],
      ...Array.from({ length: n }, (_, k) => ["set" + k, `題組 ${k + 1}`]), ["post", "回饋"]];
    const stage = !S ? preStage : ["set", "effort"].includes(S.stage) ? "set" + S.cur : ["finishing", "done"].includes(S.stage) ? "end" : S.stage;
    const at = stage === "end" ? list.length : list.findIndex(([k]) => k === stage);
    stepsEl.innerHTML = list.map(([k, label], i) => {
      const cls = i < at ? "done" : i === at ? "current" : "todo";
      const mark = k.startsWith("set") ? String(+k.slice(3) + 1) : i < at ? "✓" : "";
      return `<li class="step ${cls}"><span class="dot"${i === at ? ' aria-current="step"' : ""}>${mark}</span><span class="lbl">${esc(label)}</span></li>`;
    }).join("");
    updateFsBar(); tick();
  };

  /* ---------- 裝置檢查：只限電腦 ---------- */
  const isComputer = () => {
    const ua = navigator.userAgent;
    const mobile = /Mobi|Android|iPhone|iPad|iPod|Tablet|Silk|Kindle|PlayBook/i.test(ua);
    const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const touchOnly = matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;
    return !mobile && !iPadOS && !touchOnly && window.innerWidth >= CFG.MIN_WIDTH;
  };
  async function deviceCheck() {
    if (isComputer()) return;
    show(PAGE_HTML.device(T, V, API.demo));
    if (API.demo) await nextClick("[data-next]");
    else await new Promise(() => {});                // 正式施測時停在這頁
  }

  async function consent() {
    preStage = "consent"; drawSteps();
    show(PAGE_HTML.consent(T, V));
    await formSubmit(app.querySelector("form"));
  }

  async function background(startWall) {
    preStage = "background"; drawSteps();
    show(PAGE_HTML.background(T, V, CFG));
    const form = app.querySelector("form");
    // 複選題：勾選的值以「、」串起來放進同名隱藏欄位；必答時至少要勾一個
    form.querySelectorAll(".multi").forEach(group => {
      const boxes = [...group.querySelectorAll("input[type=checkbox]")], hidden = form.querySelector(`input[type=hidden][name="${CSS.escape(group.dataset.id)}"]`);
      const sync = () => {
        const picked = boxes.filter(b => b.checked).map(b => b.value);
        hidden.value = picked.join("、");
        if (boxes[0]) boxes[0].setCustomValidity(group.dataset.required === "true" && !picked.length ? "請至少勾選一項" : "");
      };
      boxes.forEach(b => b.addEventListener("change", sync)); sync();
    });
    const raw = await formSubmit(form);
    // 內建題目存在 Sessions 同名欄位；管理者新增的題目放在 bg_extra
    const answers = {}, extra = {};
    Object.entries(raw).forEach(([k, v]) => { (BG_COLUMNS.includes(k) ? answers : extra)[k] = v; });
    if (Object.keys(extra).length) answers.bg_extra = extra;
    const btn = form.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "載入中…";
    let booklet;
    try {
      booklet = await API.assign();
      if (!setsOf(booklet).length) throw new Error("題本中沒有題組");
    } catch (e) {
      show(`<div class="panel"><h2>目前無法開始作答</h2><p>題目分派失敗，請稍後重新整理頁面；若持續發生，請聯絡研究人員。</p><p class="muted">${esc(e.message)}</p></div>`);
      return new Promise(() => {});
    }
    const pid = Math.random().toString(36).slice(2, 12);
    sets = setsOf(booklet);
    store = sets.map(() => ({ responses: {}, ansLog: [], hlLog: [], runs: [], leaves: [], fsExits: 0, visits: [], activeMs: 0, firstRtMs: null, effort: null, effortRtMs: null, uploaded: false, confirmed: false }));
    S = { pid, booklet, stage: "instructions", cur: 0, store, seq: 0, lastSeq: {}, copyN: 0, nReloads: 0, startWall, examStartWall: null, savedAt: Date.now() };
    V = textVars(CFG, { DEMO: API.demo, N_SETS: sets.length });
    saveState();
    send(API.start, { pid, booklet, ...answers, user_agent: navigator.userAgent, screen: `${screen.width}x${screen.height}` });
  }

  async function instructions() {
    S.stage = "instructions"; saveState(); drawSteps();
    show(PAGE_HTML.instructions(T, V));
    await nextClick("[data-next]");
    goFullscreen();
  }

  /* 題組頁（練習與正式共用）。resolve 時題組已完成（按「完成這個題組」並確認） */
  function setPage(set, { i = null, label, startNo }) {
    return new Promise(resolve => {
      const isFormal = i != null;
      const s = isFormal ? store[i] : { responses: {}, ansLog: [], hlLog: [], runs: [], activeMs: 0 };
      show(renderSet(set, { idx: i ?? 0, total: sets.length, startNo, label, showSource: CFG.SHOW_SOURCE_NOTE, images })
        + `<div class="set-actions"><p class="answered"></p><button class="btn" type="button" data-done>完成這個題組</button></div>`);
      const screenEl = app.querySelector(".set-screen");
      set.items.forEach(it => {
        const v = s.responses[it.id];
        const r = v && [...screenEl.querySelectorAll("input[type=radio]")].find(x => x.name === it.id && x.value === v);
        if (r) r.checked = true;                         // 程式設定不會觸發 change，不會寫進 answer_log
      });
      const start = performance.now();
      const t0 = start - s.activeMs;                     // performance.now() - t0 ＝ 在這個題組的累計時間
      const st = attachHighlighter(screenEl, t0, isFormal ? s : null);
      visit = { i, start, st, practice: !isFormal };
      if (isFormal) {
        Object.assign(away, { active: true, open: null, leaves: s.leaves, fsExits: s.fsExits, t0 });
        S.visit = { i, wall: Date.now(), active0: s.activeMs };
        saveState();
      }
      const counter = app.querySelector(".answered");
      const nAns = () => set.items.filter(it => s.responses[it.id] != null).length;
      const update = () => { const n = nAns(); counter.textContent = `已作答 ${n} / ${set.items.length} 題` + (n < set.items.length ? "（不確定的題目可以留空）" : ""); };
      update();
      screenEl.addEventListener("change", e => {
        if (e.target.type !== "radio") return;
        s.responses[e.target.name] = e.target.value;
        s.ansLog.push({ t: Math.round(performance.now() - t0), item: e.target.name, value: e.target.value });
        update();
        if (isFormal) saveState();
      });
      app.querySelector("[data-done]").addEventListener("click", () => {
        // 頁面內的確認視窗（不用瀏覽器的 confirm）；開著的時間仍算在這個題組
        const holder = document.createElement("div");
        holder.innerHTML = PAGE_HTML.confirm(T, { ...V, N: set.items.length - nAns() });
        document.body.appendChild(holder);
        holder.querySelector("[data-ok]").focus();
        const close = () => holder.remove();
        holder.querySelector("[data-cancel]").addEventListener("click", close);
        holder.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
        holder.querySelector("[data-ok]").addEventListener("click", () => {
          close();
          if (isFormal) {
            leaveEnd(); away.active = false;
            const end = performance.now();
            s.activeMs += end - start;
            s.visits.push({ start_ms: Math.round(S.visit.wall - S.examStartWall), duration_ms: Math.round(end - start), via: "done" });
            s.fsExits = away.fsExits;
            s.runs = st.runs;
            s.firstRtMs = Math.round(s.activeMs);        // 完成題組（評定心力前）的累計時間
            S.visit = null; S.openLeave = null;
          }
          visit = null;
          resolve();
        });
      });
    });
  }

  async function effortPage(label) {
    show(PAGE_HTML.effort(T, { ...V, LABEL: label }));
    const shown = performance.now();
    const ans = await formSubmit(app.querySelector("form"));
    return { effort: Number(ans.effort), rt: Math.round(performance.now() - shown) };
  }

  async function practiceRun() {
    S.stage = "practice"; saveState(); drawSteps();
    show(PAGE_HTML.practice_intro(T, V));
    await nextClick("[data-next]");
    goFullscreen();
    await setPage(practice, { label: "練習題組", startNo: 1 });
    await effortPage("練習");
    show(PAGE_HTML.practice_done(T, V));
    await nextClick("[data-next]");
    S.stage = "set"; S.cur = 0; S.examStartWall = Date.now(); saveState();
  }

  // 每個題組評完心力後上傳一次完整資料；save_seq 逐次遞增，後端同一題組只保留最新的一列
  const pending = [];
  const send = (fn, ...args) => { const p = fn(...args).catch(e => ({ failed: true, fn, args, e })); pending.push(p); return p; };
  function upload(i) {
    const s = store[i], set = sets[i];
    s.uploaded = true;
    const seq = (S.lastSeq[set.set_id] = ++S.seq);
    const row = {
      pid: S.pid, booklet: S.booklet, set_id: set.set_id, set_order: i + 1, save_seq: seq,
      rt_ms: Math.round(s.activeMs), first_rt_ms: s.firstRtMs,
      n_visits: s.visits.length, visits: s.visits,
      n_items: set.items.length,
      n_blank: set.items.filter(it => s.responses[it.id] == null).length,
      responses: Object.fromEntries(set.items.map(it => [it.id, s.responses[it.id] ?? null])),
      first_answer_ms: Object.fromEntries(set.items.map(it => [it.id, (s.ansLog.find(a => a.item === it.id) || {}).t ?? null])),
      highlights: s.runs, highlight_log: s.hlLog, answer_log: s.ansLog,
      leaves: s.leaves, n_leaves: s.leaves.length,
      leave_ms: s.leaves.reduce((a, l) => a + l.duration_ms, 0),
      n_fullscreen_exits: s.fsExits,
      effort: s.effort, effort_rt_ms: s.effortRtMs
    };
    send(API.submitSet, JSON.parse(JSON.stringify(row)))
      .then(r => { if (!(r && r.failed) && S.lastSeq[set.set_id] === seq) { s.confirmed = true; saveState(); } });
  }

  async function formalRun() {
    while (S.cur < sets.length) {
      const i = S.cur, s = store[i], set = sets[i];
      drawSteps();
      if (S.stage === "set") {
        await setPage(set, { i, startNo: startNoFor(set, sets) });
        S.stage = "effort"; saveState(); drawSteps();
      }
      const { effort, rt } = await effortPage("");
      s.effort = effort; s.effortRtMs = rt;
      upload(i);
      S.cur = i + 1; S.stage = S.cur < sets.length ? "set" : "post"; saveState();
    }
    S.stage = "post"; saveState();
  }

  async function postSurvey() {
    drawSteps();
    show(PAGE_HTML.post(T, V));
    S.post = await formSubmit(app.querySelector("form"));
    S.stage = "finishing"; saveState();
  }

  async function finish() {
    drawSteps();
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (e) {}
    show(`<div class="panel"><h1>正在儲存作答資料…</h1><p class="muted">請先不要關閉這個頁面。</p></div>`);
    // 還沒確認送達的題組（含重新整理前送出、結果不明的）再上傳一次
    store.forEach((s, k) => { if (s.effort != null && !s.confirmed) upload(k); });
    // 等所有上傳完成，失敗的重試一次；仍失敗的記在 Sessions 的 save_failed，管理者頁預設排除這位受試者
    const results = await Promise.all(pending);
    const failed = results.filter(r => r && r.failed);
    const retry = await Promise.all(failed.map(f => f.fn(...f.args).then(() => null).catch(() => f)));
    const lost = retry.filter(f => f && !(f.fn === API.submitSet && f.args[0].save_seq !== S.lastSeq[f.args[0].set_id]))
      .map(f => f.fn === API.submitSet ? "題組 " + f.args[0].set_id : f.fn === API.start ? "背景資料" : "其他");
    const patch = {
      total_ms: Date.now() - S.startWall, copy_attempts: S.copyN || 0, n_reloads: S.nReloads || 0,
      save_failed: lost.join("、"), ...(S.post || {})
    };
    // 交卷紀錄本身也失敗時，這位受試者會停在「未完成」，同樣不會納入分析
    await API.complete(S.pid, patch).catch(() => API.complete(S.pid, patch)).catch(() => {});
    S.stage = "done"; ss.clear(); done.set();
    drawSteps();
    show(PAGE_HTML.complete(T, V, CFG));
  }

  /* ---------- 重新整理後接續：中斷的這段時間記為一次離開（via: reload），不算作答時間 ---------- */
  async function resume() {
    V = textVars(CFG, { DEMO: API.demo, N_SETS: sets.length });
    S.nReloads = (S.nReloads || 0) + 1;
    drawSteps();
    show(PAGE_HTML.resume(T, V));
    await nextClick("[data-next]");
    if (testing()) goFullscreen();
    if (S.visit) {
      const s = store[S.visit.i];
      s.activeMs = S.curActive;
      s.visits.push({ start_ms: Math.round(S.visit.wall - S.examStartWall), duration_ms: Math.round(S.curActive - S.visit.active0), via: "reload" });
      // 中斷前若已經離開視窗（例如先切走才關掉），從那時起算，整段記成一次離開
      const from = S.openLeave ? { at: S.openLeave.at_ms, wall: S.openLeave.wall } : { at: Math.round(S.curActive), wall: S.savedAt };
      s.leaves.push({ via: "reload", at_ms: from.at, duration_ms: Math.round(Date.now() - from.wall) });
      S.visit = null; S.openLeave = null;
    }
    saveState();
  }

  /* ---------- 流程 ---------- */
  drawSteps();
  if (!S) {
    await deviceCheck();
    const startWall = Date.now();
    await consent();
    await background(startWall);
  } else {
    if (!isComputer() && !API.demo) { show(PAGE_HTML.device(T, V, false)); return; }
    await resume();
  }
  if (S.stage === "instructions") { await instructions(); S.stage = "practice"; }
  if (S.stage === "practice") await practiceRun();
  if (S.stage === "set" || S.stage === "effort") await formalRun();
  if (S.stage === "post") await postSurvey();
  await finish();
})();
