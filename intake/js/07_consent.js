/* ======================================================================
   Intake v4.1 — 07_consent.js
   Точний текст документа "ЗГОДА" (з бланкованими полями ПІБ, дати
   народження, документа, умов) відновлено з попередньої версії 3.2 —
   він фіксований у розмітці (body.html, #cs-doc), не генерується з
   consent.paragraphs анкети.

   Перо пише, палець гортає сторінку: touch-action:none на canvas
   потрібен, щоб перо не смикало сторінку під час письма, тому
   прокрутку пальцем робимо вручну через pointerType==="touch".

   Відкривається ЛИШЕ у другому вікні. Головний документ (де перебуває
   поліграфолог) залишається на s-start без перемикання. Плашка "Згода"
   на стартовому екрані позначається виконаною автоматично, коли
   з'явилось чорнило — через періодичну перевірку.

   Дані згоди зберігаються як CONSENT_DRAFT до старту сесії, а після
   старту — прямо в S.consent_record (частина об'єднаного файлу сесії,
   без окремого файлу zgoda_*.json).
   ====================================================================== */
"use strict";

var CONSENT_DRAFT = null; /* { paragraphs, ink, savedAt } */

var PI_CONSENT = (function(){
  var PEN = "#6E3FB5";
  var D = document;
  var win = null, ctx = null, canvas = null;
  var strokes = 0, drawing = false, activeId = null, lx = 0, ly = 0, eraser = false;
  var pollTimer = null;
  var scrollFrom = null, scrollAt = 0; /* палець гортає, перо малює — рахуємо прокрутку вручну, бо touch-action:none на canvas вимкнув би й системну прокрутку пальцем */

  function mount(doc, saved){
    D = doc;
    canvas = D.getElementById("cs-canvas");
    var page = D.getElementById("cs-page");
    ctx = canvas.getContext("2d");
    strokes = 0; drawing = false; activeId = null;
    /* Текст документа фіксований у розмітці (cs-doc) — так само, як
       у попередній версії програми. Тут його не підмінюємо. */

    var tries = 0;
    function size(){
      var r = page.getBoundingClientRect();
      if (!r.width || !r.height){ if (tries++ < 60) D.defaultView.requestAnimationFrame(size); return; }
      var dpr = D.defaultView.devicePixelRatio || 1;
      var keep = strokes ? canvas.toDataURL() : (saved && saved.ink) || null;
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = PEN;
      if (keep){
        var img = new (D.defaultView.Image)();
        img.onload = function(){ ctx.drawImage(img, 0, 0, r.width, r.height); };
        img.src = keep;
        if (saved && saved.ink) strokes = 1;
        saved = null;
      }
    }
    size();
    D.defaultView.addEventListener("resize", size);

    function pt(e){ var r = canvas.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }
    function brush(e){
      if (eraser || e.buttons === 32){ ctx.globalCompositeOperation = "destination-out"; ctx.lineWidth = 26; }
      else { ctx.globalCompositeOperation = "source-over"; ctx.strokeStyle = PEN; ctx.lineWidth = penWidth(e); }
    }

    canvas.addEventListener("pointerdown", function(e){
      if (e.pointerType === "pen"){
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch(x){}
        activeId = e.pointerId; drawing = true;
        var p = pt(e); lx = p.x; ly = p.y; strokes++;
        brush(e);
        ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx+0.1,ly); ctx.stroke();
        return;
      }
      if (e.pointerType === "touch" && scrollFrom === null){
        scrollFrom = e.clientY; scrollAt = D.defaultView.scrollY;
      }
    });
    canvas.addEventListener("pointermove", function(e){
      if (e.pointerType === "pen"){
        if (!drawing || e.pointerId !== activeId) return;
        var p = pt(e); brush(e);
        ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(p.x,p.y); ctx.stroke();
        lx = p.x; ly = p.y;
        return;
      }
      if (e.pointerType === "touch" && scrollFrom !== null)
        D.defaultView.scrollTo(0, scrollAt + (scrollFrom - e.clientY));
    });
    function stop(e){
      if (e.pointerType === "touch"){ scrollFrom = null; return; }
      if (e.pointerId !== activeId) return;
      drawing = false; activeId = null; ctx.globalCompositeOperation = "source-over";
      try { canvas.releasePointerCapture(e.pointerId); } catch(x){}
      saveDraft();
    }
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);

    var bPen = D.getElementById("cs-pen"), bEr = D.getElementById("cs-eraser");
    if (bPen && bEr){
      bPen.addEventListener("click", function(){ setEraser(false); });
      bEr.addEventListener("click", function(){ setEraser(true); });
      setEraser(false);
    }
    function setEraser(on){
      eraser = on;
      if (!bPen || !bEr) return;
      bPen.classList.toggle("on", !on); bEr.classList.toggle("on", on);
      canvas.style.cursor = on ? "cell" : "crosshair";
    }
    var clearBtn = D.getElementById("cs-clear");
    if (clearBtn) clearBtn.addEventListener("click", clearAll);
    var printBtn = D.getElementById("cs-print");
    if (printBtn) printBtn.addEventListener("click", printHere);
  }

  function ink(){
    if (!strokes || !canvas) return null;
    var a = ctx.getImageData(0,0,canvas.width,canvas.height).data, n = 0;
    for (var i=3;i<a.length;i+=4){ if (a[i]>0 && ++n>=12) return canvas.toDataURL("image/png"); }
    return null;
  }

  var LS_KEY = "intake_consent_draft";

  /* До того, як створено файл сесії (введено ПІБ і збережено справу),
     чернетка тримається в localStorage браузера — переживає перезавантаження
     сторінки й закриття вкладки. Щойно з'являється файл сесії, чернетка
     переноситься туди (attachToCase) і локальна копія більше не потрібна. */
  function saveDraft(){
    var img = ink();
    CONSENT_DRAFT = { paragraphs:(STATE.data && STATE.data.consent && STATE.data.consent.paragraphs)||[], ink:img, savedAt:new Date().toISOString() };
    var S = PI_FILL.session();
    if (S && !S.finished){
      S.consent_record = JSON.parse(JSON.stringify(CONSENT_DRAFT));
      PI_SAVE.touched();
    } else {
      try { localStorage.setItem(LS_KEY, JSON.stringify(CONSENT_DRAFT)); } catch(e){}
    }
  }
  function loadDraftFromBrowser(){
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) CONSENT_DRAFT = JSON.parse(raw);
    } catch(e){}
  }
  /* Викликається одразу після створення файлу сесії (case-save): якщо
     на той момент уже є чернетка згоди в localStorage/пам'яті — записує
     її у щойно створений файл сесії й прибирає локальну копію. */
  function attachToCase(){
    if (!CONSENT_DRAFT) return;
    var S = PI_FILL.session();
    if (S && !S.finished){
      S.consent_record = JSON.parse(JSON.stringify(CONSENT_DRAFT));
      PI_SAVE.touched();
      try { localStorage.removeItem(LS_KEY); } catch(e){}
    }
  }

  /* Відкриває ЛИШЕ друге вікно. Головний документ (де перебуває
     поліграфолог) залишається на екрані s-start без перемикання. */
  function open(){
    win = PI_MON.spawn(["s-consent"]);
    if (!win){ alert("Браузер заблокував друге вікно. Дозвольте спливні вікна й спробуйте ще раз."); return; }
    mount(win.document, CONSENT_DRAFT);
    win.document.getElementById("s-consent").classList.add("on");
    if (!pollTimer) pollTimer = setInterval(updateStartCard, 700);
    win.addEventListener("beforeunload", function(){
      if (pollTimer){ clearInterval(pollTimer); pollTimer = null; }
      setTimeout(updateStartCard, 50);
    });
  }
  /* "Очистити" (кнопка в самому бланку) — на відміну від інструмента
     "Стерти" (точкове стирання стилусом під час письма), повністю
     скидає статус згоди до "не заповнено": очищає полотно, прибирає
     CONSENT_DRAFT, чернетку з localStorage і consent_record з файлу
     сесії, якщо він уже створений. */
  function clearAll(){
    if (ctx && canvas) ctx.clearRect(0,0,canvas.width,canvas.height);
    strokes = 0;
    CONSENT_DRAFT = null;
    try { localStorage.removeItem(LS_KEY); } catch(e){}
    var S = PI_FILL.session();
    if (S && !S.finished && S.consent_record){ S.consent_record = null; PI_SAVE.touched(); }
    updateStartCard();
  }

  function printHere(){ if (win && !win.closed) win.print(); }

  loadDraftFromBrowser();

  return { open:open, print:printHere, current:function(){ return CONSENT_DRAFT; }, attachToCase:attachToCase,
    reset:function(){ CONSENT_DRAFT = null; canvas = null; ctx = null; try { localStorage.removeItem(LS_KEY); } catch(e){} if (pollTimer){ clearInterval(pollTimer); pollTimer=null; } if (win && !win.closed) win.close(); } };
})();
