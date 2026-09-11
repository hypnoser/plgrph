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
    if (d.q && e.type !== "mark"){ current = d.q; target(d.q); if (d.hot) el("mo-dot").classList.add("hot"); }
    if (d.end) { stop(); finishPanel(); }
  }

  function target(qid){
    var qmeta = el("mo-qid"), qtext = el("mo-qtext");
    if (!qid){ qmeta.textContent = "—"; qtext.textContent = "Очікую перший дотик"; return; }
    qmeta.textContent = qid; qtext.textContent = PI_FILL.textOf(qid);
    document.querySelectorAll("#mo-marks-up button, #mo-marks-down button").forEach(function(b){ b.disabled = false; });
  }

  function buildMarks(){
    var up = el("mo-marks-up"), down = el("mo-marks-down");
    up.innerHTML = ""; down.innerHTML = "";
    MARKS_UP.forEach(function(m){
      var b = document.createElement("button"); b.type = "button"; b.textContent = T(m.key); b.title = T(m.tip); b.disabled = true;
      b.addEventListener("click", function(){ if (!current) return; PI_FILL.mark(current, MARK_TEXT[m.key]); });
      up.appendChild(b);
    });
    MARKS_DOWN.forEach(function(m){
      var b = document.createElement("button"); b.type = "button"; b.className = "damp"; b.textContent = T(m.key); b.title = T(m.tip); b.disabled = true;
      b.addEventListener("click", function(){ if (!current) return; PI_FILL.mark(current, MARK_TEXT[m.key]); el("mo-dot").classList.remove("hot"); });
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
el("mo-end").addEventListener("click", async function(){
  if (!confirm("Завершити анкетування? Зібрані відповіді буде збережено.")) return;
  await PI_FILL.complete("completed");
  PI_MON.finishPanel();
});
el("mo-finish-go").addEventListener("click", function(){ PI_MON.finish(true); });
el("mo-finish-skip").addEventListener("click", function(){ PI_MON.finish(false); });
el("mo-show-pw").addEventListener("change", function(){ el("mo-finish-pw").type = this.checked ? "text" : "password"; });
