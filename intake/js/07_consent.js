/* ======================================================================
   Intake v4.1 — 07_consent.js
   Точний текст документа "ЗГОДА"/"СОГЛАСИЕ" (з бланкованими полями ПІБ,
   дати народження, документа, умов) — дві повні, наперед написані мовні
   версії, фіксовані в розмітці (body.html, #cs-doc-uk / #cs-doc-ru),
   перемикаються за RESPONDENT_LANG (той самий тумблер, що для екрана
   заповнення анкети), не генеруються з consent.paragraphs анкети.

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

   Навмисно НЕМАЄ кнопки масштабу тексту (на відміну від екрана
   заповнення анкети, 03_fill.js, де вона є через CSS-змінну --fill-fs):
   підпис тут малюється на ОДНОМУ спільному canvas поверх усього листа,
   абсолютними координатами — не на окремому полі під кожним рядком, як
   ПІБ/дата народження/документ у 03_fill.js. Спроба масштабувати текст
   документа через transform:scale() на .cdoc показала на практиці
   (реальний UI-тест з підписом і повторним відкриттям), що transform
   не розширює layout контейнера .cpage — він лише малює вміст більшим
   ПОВЕРХ того самого простору. Наслідок: текст виїжджав за межі
   видимого аркуша, рядок "Особистий підпис" опинявся поза canvas, а
   при повторному відкритті збереженого запису чорнило губилося
   повністю. Безпечна реалізація вимагала б переписати підпис на окремі
   поля з власними canvas під кожен рядок документа (той самий підхід,
   що вже працює для ПІБ/дати народження/документа) — це вихід за межі
   точкової правки, тому свідомо не зроблено тут. Якщо респонденту
   потрібен більший текст саме на екрані згоди — наразі єдиний робочий
   шлях це системний масштаб самого пристрою/браузера ДО відкриття
   вікна згоди, а не внутрішній перемикач застосунку. */
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
    /* Текст документа фіксований у розмітці (cs-doc-uk / cs-doc-ru) —
       дві повні, наперед написані мовні версії, не переклад "на льоту".
       Якщо для цього запису вже є збережене чорнило (saved.lang) —
       показуємо САМЕ ТУ версію, якою respondent реально підписував,
       незалежно від поточного стану тумблера (див. довгий коментар у
       saveDraft() — обидві версії різної довжини тексту, і показ не тією
       версією зсуває рядок підпису відносно вже намальованого чорнила).
       Лише для ще непідписаного документа орієнтуємось на поточний
       RESPONDENT_LANG — це саме та мова, яку респондент побачить, коли
       почне підписувати щойно зараз. */
    var docUk = D.getElementById("cs-doc-uk"), docRu = D.getElementById("cs-doc-ru");
    if (docUk && docRu){
      var ru = (saved && saved.lang) ? saved.lang === "ru" : getRespondentLang() === "ru";
      docUk.classList.toggle("hidden", ru);
      docRu.classList.toggle("hidden", !ru);
    }
    var bPenLbl = D.getElementById("cs-pen"), bErLbl = D.getElementById("cs-eraser"),
        bClLbl = D.getElementById("cs-clear"), bPrLbl = D.getElementById("cs-print");
    if (bPenLbl){ bPenLbl.title = R_R("r_cs_pen"); bPenLbl.setAttribute("aria-label", R_R("r_cs_pen")); }
    if (bErLbl){ bErLbl.title = R_R("r_cs_eraser"); bErLbl.setAttribute("aria-label", R_R("r_cs_eraser")); }
    if (bClLbl){ bClLbl.title = R_R("r_cs_clear"); bClLbl.setAttribute("aria-label", R_R("r_cs_clear")); }
    if (bPrLbl){ bPrLbl.title = R_R("r_cs_print"); bPrLbl.setAttribute("aria-label", R_R("r_cs_print")); }

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

  /* Джерело правди для того, "яка згода зараз оформлена": якщо активна
     сесія вже існує — це ЗАВЖДИ S.consent_record цієї сесії, ніколи
     CONSENT_DRAFT. CONSENT_DRAFT — лише тимчасовий місток для єдиного
     сценарію "підписали до того, як справу взагалі створено" (тоді
     сесії ще немає, консент нікуди прикріпити, крім localStorage).
     Без цього розрізнення відкриття іншого файлу сесії (іншого
     респондента) в тій самій вкладці браузера показувало чорнило
     ОСТАННЬОЇ сесії, з якою реально працювали в цій вкладці, — не
     того респондента, чий файл щойно відкрито: CONSENT_DRAFT
     оновлюється лише зсередини pointerup/saveDraft() і ніколи не
     скидається чи не підміняється при завантаженні чужого S. */
  function activeConsent(){
    var S = PI_FILL.session();
    if (S) return S.consent_record || null;
    return CONSENT_DRAFT;
  }

  var LS_KEY = "intake_consent_draft";

  /* До того, як створено файл сесії (введено ПІБ і збережено справу),
     чернетка тримається в localStorage браузера — переживає перезавантаження
     сторінки й закриття вкладки. Щойно з'являється файл сесії, чернетка
     переноситься туди (attachToCase) і локальна копія більше не потрібна. */
  function saveDraft(){
    var img = ink();
    /* record.lang фіксує, ЯКОЮ мовною версією тексту документа малювалось
       це чорнило (RESPONDENT_LANG у момент mount()/малювання) — не поточний
       стан тумблера, а те, що фактично бачив respondent на екрані. Обидві
       версії ("ЗГОДА"/"СОГЛАСИЕ") мають різну довжину тексту (переклад
       ніколи не рівно той самий обсяг символів), тому позиція рядка
       "Особистий підпис"/"Личная подпись" відрізняється між ними по
       вертикалі. Canvas із чорнилом — ОДИН спільний прозорий шар поверх
       усього листа (не окреме поле під кожен рядок, як у 03_fill.js), і
       координати штриха записуються абсолютно, у пікселях поточного
       layout. Якщо тумблер мови перемкнути ПІСЛЯ підписання (навіть не
       чіпаючи саму сесію — просто готуючи наступного респондента чи
       випадково), а потім знову відкрити той самий запис — довший/коротший
       текст іншою мовою зсуває рядок "Особистий підпис" вище чи нижче
       того місця, де respondent реально розписався, і підпис "з'їжджає"
       відносно тексту. Зберігаючи мову разом із чорнилом, ми завжди
       показуємо саме ту версію документа, для якої це чорнило й малювалось
       — незалежно від того, що з тумблером сталось після. */
    var record = { paragraphs:(STATE.data && STATE.data.consent && STATE.data.consent.paragraphs)||[], ink:img, savedAt:new Date().toISOString(), lang:getRespondentLang() };
    var S = PI_FILL.session();
    if (S && !S.finished){
      /* CONSENT_DRAFT свідомо НЕ оновлюємо тут: коли сесія активна,
         S.consent_record — єдине джерело правди (activeConsent() вище
         його й читає), і залишати паралельний, застарілий запис у
         CONSENT_DRAFT — це рівно той стан, що спричиняв плутанину між
         респондентами (наступне відкриття іншого файлу бачило б чуже
         щойно намальоване чорнило, якби якийсь код колись знову почав
         читати CONSENT_DRAFT напряму, як open() робив раніше). */
      S.consent_record = record;
      PI_SAVE.touched();
    } else {
      CONSENT_DRAFT = record;
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
    mount(win.document, activeConsent());
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

  return { open:open, print:printHere, current:activeConsent, attachToCase:attachToCase,
    reset:function(){ CONSENT_DRAFT = null; canvas = null; ctx = null; try { localStorage.removeItem(LS_KEY); } catch(e){} if (pollTimer){ clearInterval(pollTimer); pollTimer=null; } if (win && !win.closed) win.close(); } };
})();
