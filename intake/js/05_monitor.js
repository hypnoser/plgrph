/* ======================================================================
   Intake v4.1 — 05_monitor.js
   ВИПРАВЛЕНО відносно v4: childHtml() тепер копіює вміст тега <style>
   у друге вікно (раніше шукав неіснуючий <link rel=stylesheet> —
   друге вікно відкривалось без жодного стилю).
   ====================================================================== */
"use strict";

var PI_MON = (function(){
  var win = null, tick = null;
  var current = null;

  var MARKS_UP = [
    { key:"m_mark_react", tip:"m_tip_react" },
    { key:"m_mark_asked", tip:"m_tip_asked" },
    { key:"m_mark_self", tip:"m_tip_self" }
  ];
  var MARKS_DOWN = [
    { key:"m_mark_noise", tip:"m_tip_noise" },
    { key:"m_mark_tech", tip:"m_tip_tech" }
  ];
  var MARK_TEXT = { m_mark_react:"реакція", m_mark_asked:"перепитав", m_mark_self:"сказав сам", m_mark_noise:"перешкода", m_mark_tech:"заминка з технікою" };
  /* Той самий мапінг тексту мітки на внутрішній kind, що й у addMark()
     (03_fill.js) — потрібен тут лише для data-kind атрибута кнопки,
     щоб target() міг звірити активні мітки на питанні з конкретною
     кнопкою без окремого виклику через PI_FILL. */
  var MARK_TO_KIND = { m_mark_react:"reaction", m_mark_asked:"asked", m_mark_self:"volunteered", m_mark_noise:"noise", m_mark_tech:"technical" };

  function styleContent(){
    var s = document.querySelector("style");
    return s ? s.textContent : "";
  }
  function childHtml(ids){
    var body = "";
    for (var i=0;i<ids.length;i++){
      var n = document.getElementById(ids[i]);
      if (n) body += n.outerHTML;
    }
    return "<!DOCTYPE html><html lang=\"uk\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
      "<title>Передтестове анкетування · Intake</title>" +
      "<style>" + styleContent() + "</style></head><body>" + body + "</body></html>";
  }
  function spawn(ids, name){
    var w;
    try { w = window.open("", name || "intake_doc", "width=1200,height=900"); } catch(e){ w = null; }
    if (!w) return null;
    w.document.open(); w.document.write(childHtml(ids)); w.document.close();
    return w;
  }
  function openWindow(){ return spawn(["s-brief","s-block","s-done"], "intake_fill"); }

  function guardWindowClose(w){
    w.addEventListener("beforeunload", function(e){
      PI_FILL.snapshot();
      var S = PI_FILL.session();
      if (S && !S.finished){ e.preventDefault(); e.returnValue = "Анкетування ще не завершено."; return e.returnValue; }
    });
    w.addEventListener("unload", function(){
      var S = PI_FILL.session();
      /* Одразу при реальному закритті вікна повертаємо PI_FILL на
         головний document. document.defaultView того вікна не завжди
         стає null негайно після unload (залежить від рушія) — покладатись
         на це постфактум у complete()/renderBlock() ненадійно й раніше
         давало необроблений виняток ("Cannot read properties of null
         (reading 'scrollTo')"), що обривав mo-end на середині виконання.
         Тут маємо стовідсотково надійний сигнал самої події закриття —
         відкочуємо D одразу, а не чекаємо, поки хтось спробує писати в
         мертвий DOM і впаде. */
      PI_FILL.setDocument(document);
      if (S && !S.finished) noteWindowLost();
    });
  }
  function noteWindowLost(){
    var btn = el("mo-reopen");
    if (btn) btn.classList.remove("hidden");
    var text = el("mo-savestate-text");
    if (text) text.textContent = "Вікно респондента закрито — натисніть «Перевідкрити вікно»";
  }

  function begin(data, consentRecord){
    PI_SAVE.bind(function(){ return PI_FILL.session(); });
    win = openWindow();
    if (win){ PI_FILL.setDocument(win.document); guardWindowClose(win); }
    else { PI_FILL.setDocument(document); alert("Друге вікно заблоковано. Дозвольте спливні вікна для цього файла; заповнення тимчасово відкрито тут."); }
    PI_FILL.onEvent(onEvent);
    PI_FILL.start(data, consentRecord);
    PI_FILL.wire();

    el("mo-blockname").textContent = (data.meta||{}).title || "Анкетування";
    el("mo-qid").textContent = "—";
    el("mo-qtext").textContent = "Очікую перший дотик";
    el("mo-dot").classList.remove("hot");
    el("mo-reopen").classList.add("hidden");
    var pauseBtn = el("mo-pause");
    if (pauseBtn){ pauseBtn.textContent = "Пауза"; pauseBtn.classList.remove("on"); }
    var monCard = document.querySelector(".mon-card");
    if (monCard) monCard.classList.remove("paused");
    buildMarks();
    target(null);

    if (tick) clearInterval(tick);
    tick = setInterval(saveStatus, 800);
    PI_SAVE.now();

    /* Монітор показуємо завжди — незалежно від того, чи вдалось
       відкрити друге вікно. Якщо вікно заблоковане, респондент
       заповнює у ГОЛОВНОМУ вікні (D=document), і поліграфологу
       водночас потрібен доступ до монітора — тому в такому разі
       показуємо попередження, а не ховаємо монітор. */
    show("s-monitor", { from:"s-start" });
  }

  function resumeSession(saved){
    PI_SAVE.bind(function(){ return PI_FILL.session(); });
    win = openWindow();
    PI_FILL.setDocument(win ? win.document : document);
    if (win) guardWindowClose(win);
    PI_FILL.onEvent(onEvent);
    if (!PI_FILL.resume(saved)) return false;
    PI_FILL.wire();
    el("mo-blockname").textContent = (saved.questionnaire.meta||{}).title || "Анкетування";
    buildMarks();
    target(null);
    if (tick) clearInterval(tick);
    tick = setInterval(saveStatus, 800);
    show("s-monitor", { from:"s-start" });
    return true;
  }

  function saveStatus(){
    var st = PI_SAVE.status();
    var box = el("mo-savestate"), text = el("mo-savestate-text");
    box.classList.toggle("dirty", st.dirty && !st.error);
    box.classList.toggle("bad", !!st.error);
    if (!el("mo-reopen").classList.contains("hidden")) return; /* повідомлення про втрачене вікно має пріоритет */
    text.textContent = st.error ? "Помилка запису" : st.busy ? "Запис…" : st.dirty ? "Незбережені зміни" : (st.encrypted ? "Збережено · зашифровано" : "Збережено");
    updateProgress();
  }

  /* Раніше монітор показував лише назву анкети (встановлену один раз
     при старті) і поточне питання — поліграфолог не бачив, на якому
     блоці з скількох перебуває респондент, скільки основних питань уже
     відповіджено, чи скільки часу триває сесія, і мусив зазирати через
     плече на екран респондента, щоб це зрозуміти — саме те, чого
     окремий монітор мав позбавити. Рахуємо тут ЛИШЕ основні питання
     кожного блоку (questions/gates + closing) як знаменник: розгортання
     (expansion) з'являються динамічно залежно від відповідей і не
     мають фіксованої кількості наперед, тому в прогрес не входять —
     інакше "скільки лишилось" стрибало б щоразу, коли респондент
     відповідає "так" на новий шлюз. */
  function updateProgress(){
    var box = el("mo-progress"); if (!box) return;
    var S = PI_FILL.session(); if (!S || !S.questionnaire){ box.textContent = ""; return; }
    var Q = S.questionnaire, blockIdx = PI_FILL.currentBlock();
    if (blockIdx == null || blockIdx < 0){ box.textContent = ""; return; }
    var total = 0, done = 0;
    Q.blocks.forEach(function(b){
      var core = (b.questions || b.gates || []).slice();
      if (b.closing) core.push(b.closing);
      total += core.length;
      core.forEach(function(q){ if (S.answers[q.id]) done++; });
    });
    var elapsedMin = S.startedAt ? Math.max(0, Math.round((Date.now() - S.startedAt) / 60000)) : 0;
    box.textContent = "Блок " + (blockIdx + 1) + " з " + Q.blocks.length +
      " · питання " + done + " з " + total + " · " + elapsedMin + " хв";
  }

  function describeEvent(e){
    switch (e.type){
      case "answer": return { q:e.q, hot:false };
      case "change": return { q:e.q, hot:true };
      case "expand": return { q:e.q, hot:false };
      case "collapse": return { q:e.q, hot:true };
      case "attention": return { q:e.q, hot:true };
      case "block_return": return { q:e.q||"", hot:e.initiator==="respondent" };
      case "session_end": return { q:"", hot:false, end:true };
      default: return { q:"", hot:false };
    }
  }
  function onEvent(e){
    var d = describeEvent(e);
    /* Раніше mo-dot.classList.add("hot") лишався засвіченим до кінця
       сесії — знімався лише при старті (begin/resume) і при кліку на
       мітку-перешкоду, тобто сигнал спрацьовував один раз і потім
       нічого не означав аж до завершення анкети. target(d.q) уже
       викликається на кожен перехід до нового питання (кожна відповідь
       генерує подію з новим q) — саме тут, ДО того, як (можливо) знову
       додати "hot" для НОВОЇ події, знімаємо клас від попередньої: тоді
       крапка відображає стан лише поточного питання, як і задумано. */
    if (d.q && e.type !== "mark"){
      el("mo-dot").classList.remove("hot");
      current = d.q; target(d.q);
      if (d.hot) el("mo-dot").classList.add("hot");
    }
    if (d.end) { stop(); finishPanel(); }
  }

  function target(qid){
    var qmeta = el("mo-qid"), qtext = el("mo-qtext");
    if (!qid){ qmeta.textContent = "—"; qtext.textContent = "Очікую перший дотик"; return; }
    qmeta.textContent = qid; qtext.textContent = PI_FILL.textOf(qid);
    /* Кнопка мітки стає disabled, якщо на ЦЕ питання вже стоїть активна
       (не відкликана) мітка того самого kind — узгоджено з тим, що
       addMark() у 03_fill.js тепер відмовляє в такому дублі на рівні
       даних (див. коментар там); тут лише синхронізуємо видимий стан
       кнопки з фактичним станом S.marks, щоб поліграфолог одразу бачив,
       що саме вже позначено на поточному питанні. */
    var S = PI_FILL.session();
    var activeKinds = {};
    if (S) S.marks.forEach(function(m){ if (m.q === qid && !m.withdrawn_at) activeKinds[m.kind] = true; });
    document.querySelectorAll("#mo-marks-up button, #mo-marks-down button").forEach(function(b){
      b.disabled = !!activeKinds[b.getAttribute("data-kind")];
    });
  }

  function buildMarks(){
    var up = el("mo-marks-up"), down = el("mo-marks-down");
    up.innerHTML = ""; down.innerHTML = "";
    MARKS_UP.forEach(function(m){
      var b = document.createElement("button"); b.type = "button"; b.textContent = T(m.key); b.title = T(m.tip); b.disabled = true;
      b.setAttribute("data-kind", MARK_TO_KIND[m.key]);
      b.addEventListener("click", function(){ if (!current) return; if (PI_FILL.mark(current, MARK_TEXT[m.key])) target(current); });
      up.appendChild(b);
    });
    MARKS_DOWN.forEach(function(m){
      var b = document.createElement("button"); b.type = "button"; b.className = "damp"; b.textContent = T(m.key); b.title = T(m.tip); b.disabled = true;
      b.setAttribute("data-kind", MARK_TO_KIND[m.key]);
      b.addEventListener("click", function(){ if (!current) return; if (PI_FILL.mark(current, MARK_TEXT[m.key])){ el("mo-dot").classList.remove("hot"); target(current); } });
      down.appendChild(b);
    });
  }

  function finishPanel(){
    var box = el("mo-finish");
    el("mo-finish-head").textContent = T("s_end_head");
    el("mo-finish-body").textContent = T("s_end_body");
    el("mo-finish-go").textContent = T("s_end_go");
    el("mo-finish-skip").textContent = T("s_end_skip");
    box.classList.remove("hidden");
    el("mo-finish-go").disabled = false; el("mo-finish-skip").disabled = false;
    el("mo-finish-pw").value = ""; el("mo-finish-pw").type = "password"; el("mo-show-pw").checked = false;
  }
  async function finish(encrypt){
    var box = el("mo-finish"), pw = el("mo-finish-pw").value, go = el("mo-finish-go"), skip = el("mo-finish-skip");
    go.disabled = skip.disabled = true;
    try {
      if (!await PI_SAVE.now()) throw new Error(PI_SAVE.status().error || "Не вдалося зберегти");
      await PI_SAVE.usePassword(encrypt ? pw : "");
      PI_SAVE.touched();
      if (!await PI_SAVE.now()) throw new Error(PI_SAVE.status().error || "Не вдалося зберегти");
      box.classList.add("hidden"); el("mo-finish-pw").value = "";
      renderReport();
      el("rp-back-monitor").classList.remove("hidden"); /* тут монітор живий — кнопка доречна */
      show("s-report", { from:"s-monitor" });
      saveStatus();
    } catch(e){ el("finish-save-state").textContent = e.message || "Не вдалося зберегти"; }
    finally { go.disabled = skip.disabled = false; }
  }
  function stop(){ if (tick){ clearInterval(tick); tick = null; } }

  function reopen(){
    var S = PI_FILL.session();
    if (!S) return;
    win = openWindow();
    if (!win){ alert("Браузер заблокував друге вікно. Дозвольте спливні вікна й спробуйте ще раз."); return; }
    PI_FILL.snapshot();
    PI_FILL.setDocument(win.document);
    guardWindowClose(win);
    PI_FILL.remount();
    PI_FILL.wire();
    el("mo-reopen").classList.add("hidden");
    saveStatus();
  }

  return { begin:begin, resume:resumeSession, spawn:spawn, finish:finish, finishPanel:finishPanel,
    refreshStatus:saveStatus, stop:stop, reopen:reopen, window:function(){ return win; } };
})();

el("mo-reopen").addEventListener("click", function(){ PI_MON.reopen(); });
/* Пауза зупиняє відлік латентності (t0 зсувається на тривалість паузи
   в PI_FILL.resumeTiming(), див. коментар у 03_fill.js) і блокує ввід
   респондента на час, доки поліграфолог не зніме її — інакше клацання
   під час відволікання (респондента покликали, технічна заминка)
   потрапило б у ту саму латентність, яку аналіз потім порівнює з
   базою блоку, спотворюючи саме той сигнал, заради якого вимірювання
   часу взагалі існує. */
el("mo-pause").addEventListener("click", function(){
  var btn = el("mo-pause"), card = document.querySelector(".mon-card");
  if (PI_FILL.isPaused()){
    PI_FILL.resumeTiming();
    btn.textContent = "Пауза"; btn.classList.remove("on");
    if (card) card.classList.remove("paused");
  } else {
    PI_FILL.pauseTiming();
    btn.textContent = "Продовжити"; btn.classList.add("on");
    if (card) card.classList.add("paused");
  }
});
el("mo-end").addEventListener("click", async function(){
  if (!confirm("Завершити анкетування? Зібрані відповіді буде збережено.")) return;
  await PI_FILL.complete("completed");
  PI_MON.finishPanel();
});
el("mo-finish-go").addEventListener("click", function(){ PI_MON.finish(true); });
el("mo-finish-skip").addEventListener("click", function(){ PI_MON.finish(false); });
el("mo-show-pw").addEventListener("change", function(){ el("mo-finish-pw").type = this.checked ? "text" : "password"; });
