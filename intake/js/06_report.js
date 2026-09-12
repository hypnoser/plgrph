/* ======================================================================
   Intake v4 — 06_report.js
   Звіт: текст-висновок (3-5 речень) -> карта питань, кольори за рівнем
   ЗНАЧУЩОСТІ (не типом події, як у 3.2) -> компактна деталь-картка
   з таблетками патернів (кольорова шкала за вагою) -> "Повний звіт"
   розгортає сирий журнал подій.

   Рівень значущості (sev 1..4) виводиться з того самого score, який
   вже рахує PI_STAT.analyse() — тут тільки перефарбування показу,
   формула ваги не змінена.
   ====================================================================== */
"use strict";

var REPORT_STATE = { analysis:null, session:null, selectedId:null };

function severityOf(score){
  if (score >= 8) return 4;
  if (score >= 5) return 3;
  if (score >= 2) return 2;
  if (score > 0) return 1;
  return 0;
}
function severityLabel(sev){
  return { 4:"Критично значуще", 3:"Значуще", 2:"Помітне", 1:"Незначне", 0:"Без подій" }[sev];
}

/* Позначки подій на плашці питання (rp-map) — розпізнаються з текстових
   причин point.why[], без зміни самої аналітики 04_stat.js. Чотири типи,
   узгоджені з попередньою версією програми (легенда під картою). */
function eventFlags(point){
  var flags = [];
  if (!point) return flags;
  var why = point.why || [];
  if (why.some(function(w){ return /зміню?вав відповідь|змінив відповідь|повернувся/.test(w); })) flags.push("route");
  if (why.some(function(w){ return /стилус/.test(w); })) flags.push("attention");
  if (why.some(function(w){ return /пауза/.test(w); })) flags.push("time");
  if ((point.marks||[]).length) flags.push("observer");
  return flags;
}
/* Тепловий фон плашки: плавний градієнт по вже наявній 4-рівневій шкалі
   значущості програми (--sev-1..--sev-4, та сама, що й у .rep-sev-badge
   деталь-картки) — не окремий довільний колір, а продовження вже
   узгодженого дизайну (жовто-оливковий → червоний). Верхня межа шкали —
   поріг "критично" (8 балів), вище — колір більше не темнішає. */
var HEAT_MAX = 8;
var HEAT_STOPS = [
  { t:0,    c:[246,246,241] }, /* --card-подібний, майже нейтральний */
  { t:0.15, c:[245,246,232] }, /* --sev-1-bg */
  { t:0.4,  c:[138,143,46] },  /* --sev-1 */
  { t:0.65, c:[179,105,11] },  /* --sev-2 */
  { t:0.85, c:[163,32,23] },   /* --sev-3 */
  { t:1,    c:[122,30,20] }    /* --sev-4 */
];
function heatStyle(score){
  if (!score) return "";
  var t = Math.min(1, score / HEAT_MAX);
  var stops = HEAT_STOPS;
  for (var i = 0; i < stops.length-1; i++){
    if (t >= stops[i].t && t <= stops[i+1].t){
      var span = stops[i+1].t - stops[i].t || 1;
      var f = (t - stops[i].t) / span;
      var c1 = stops[i].c, c2 = stops[i+1].c;
      var r = Math.round(c1[0]+(c2[0]-c1[0])*f), g = Math.round(c1[1]+(c2[1]-c1[1])*f), b = Math.round(c1[2]+(c2[2]-c1[2])*f);
      /* Контраст рахується з реального яскравості отриманого кольору
         (формула відносної яскравості), не з абстрактного t — інтерполяція
         між контрольними точками нелінійна, тому "температура" й
         "яскравість" розходяться (жовто-оливковий --sev-1 вже досить
         темний для чорного тексту, хоча t для нього невеликий). Поріг
         0.6 — стандартна межа "темний фон" для WCAG-подібного контрасту. */
      var luminance = (0.299*r + 0.587*g + 0.114*b) / 255;
      return "background:rgb(" + r + "," + g + "," + b + ")" + (luminance < 0.6 ? ";color:#fff" : "");
    }
  }
  return "";
}

function buildSummaryText(A){
  var byId = {}; A.points.forEach(function(p){ byId[p.id] = p; });
  var top = A.top.filter(function(p){ return p.score > 0; }).slice(0, 5);
  if (!top.length) return "За поточними правилами немає точок, які варто окремо обговорити. Заповнення пройшло рівно від початку до кінця.";
  var byBlock = {};
  top.forEach(function(p){ (byBlock[p.block] = byBlock[p.block] || []).push(p.id); });
  var parts = [];
  Object.keys(byBlock).forEach(function(block){
    var ids = byBlock[block];
    var reasons = {};
    ids.forEach(function(id){ (byId[id].why||[]).forEach(function(w){ reasons[shortReason(w)] = true; }); });
    var reasonList = Object.keys(reasons).slice(0,2).join(" та ");
    parts.push("Помітна активність на питанні " + ids.join(", ") + (reasonList ? " — " + reasonList : "") + ".");
  });
  return parts.join(" ") + " Решта блоків без відхилень від очікуваного.";
}
function shortReason(w){
  if (/після того, як побачив/.test(w)) return "зміна після уточнення";
  if (/зміню?вав відповідь|змінив відповідь/.test(w)) return "зміна відповіді";
  if (/довга пауза на початку блоку/.test(w)) return "пауза на старті блоку";
  if (/помітно довша пауза/.test(w)) return "довга пауза";
  if (/пауза/.test(w)) return "уповільнення";
  if (/відкрив уточнення й згорнув/.test(w)) return "відкрив і згорнув без відповіді";
  if (/лишив пояснення порожнім/.test(w)) return "порожнє пояснення";
  if (/відповів не по порядку/.test(w)) return "відповідь не по порядку";
  if (/суцільні «ні»/.test(w)) return "серія автоматичних «ні»";
  if (/повідомлена обставина для уточнення/.test(w)) return "повідомив обставину";
  if (/позначене як кандидат у релевантні/.test(w)) return "кандидат у релевантні";
  if (/повторно зосереджував стилус/.test(w)) return "повторна увага";
  if (/стилус/.test(w)) return "повторна увага";
  if (/самостійно повернувся|повернувся/.test(w)) return "самостійне повернення";
  if (/також є спостереження поліграфолога|спостереження поліграфолога/.test(w)) return "ваша мітка";
  if (/поведінкову підсвітку знято/.test(w)) return "підсвітку знято";
  return w.length > 40 ? w.slice(0, 40).trim() + "…" : w;
}

function renderDataQuality(A){
  var box = el("rp-dataquality"); if (!box) return;
  box.innerHTML = "";
  var notes = [];
  var dq = A.dataQuality || {};
  if (!dq.calibrationFit) notes.push("Індивідуальну норму читання не вдалося визначити з калібрувального блоку — латентність оцінюється за спрощеною формулою.");
  if (dq.lowBaseQuestions && dq.lowBaseQuestions.length >= 3)
    notes.push("У кількох блоках недостатньо відповідей «ні» для порівняння часу реакції (потрібно щонайменше 3) — латентнісний аналіз там вимкнений.");
  var straightLine = (A.sequence||[]).length >= 6 && A.sequence.every(function(p){ return p.value === "no"; });
  if (straightLine) notes.push("Усі відповіді — «ні» поспіль; перевірте, чи респондент читав питання уважно.");
  if (!notes.length){ box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  tag("div", "label", box, "Якість даних");
  var text = tag("div", "text", box);
  text.textContent = notes.join(" ");
}

function renderReport(){
  var S = PI_FILL.session(); if (!S) return;
  var A = (S.finished && (S.analysis_current || S.analysis_snapshot)) || PI_STAT.analyse(S);
  REPORT_STATE.analysis = A; REPORT_STATE.session = S;

  el("rp-title").textContent = "Звіт" + (S.case_info && S.case_info.label ? " · " + S.case_info.label : "");
  el("rp-summary-text").textContent = buildSummaryText(A);
  renderDataQuality(A);

  var byId = {}; A.points.forEach(function(p){ byId[p.id] = p; });
  var map = A.index;

  var mapRoot = el("rp-map"); mapRoot.innerHTML = "";
  S.questionnaire.blocks.forEach(function(block){
    var qs = block.type === "calibration"
      ? (block.questions||[])
      : (block.gates||[]).concat(block.anchors||[]).concat(block.closing ? [block.closing] : []);
    var row = tag("div", "rep-row", mapRoot);
    tag("div", "rep-topic", row, block.id + " · " + block.title);
    var cells = tag("div", "rep-cells", row);
    qs.forEach(function(q){
      var p = byId[q.id];
      var isAnchor = (block.anchors||[]).indexOf(q) !== -1;
      var cell = tag("button", "rep-cell" + (isAnchor ? " rep-cell-anchor" : ""), cells);
      cell.type = "button";
      cell.setAttribute("data-qid", q.id);
      cell.setAttribute("aria-label", q.id + " — " + q.text + (isAnchor ? " (якір, нейтральна контрольна точка)" : ""));
      if (!isAnchor && p && p.score) cell.setAttribute("style", heatStyle(p.score));
      tag("span", "rep-cell-id", cell, q.id);
      if (!isAnchor){
        var flags = eventFlags(p);
        if (flags.length){
          var dots = tag("span", "rep-cell-dots", cell);
          flags.forEach(function(f){ tag("i", "rep-dot rep-dot-"+f, dots); });
        }
      }
      cell.addEventListener("click", function(){ selectQuestion(q.id); });
    });
  });
  var legend = tag("div", "rep-map-legend", mapRoot);
  [["route","Зміна / повернення"],["attention","Увага стилусом"],["time","Часова подія"],["observer","Ваше спостереження"]].forEach(function(pair){
    var item = tag("span", "", legend);
    tag("i", "rep-dot rep-dot-"+pair[0], item);
    item.appendChild(document.createTextNode(pair[1]));
  });

  var initial = REPORT_STATE.selectedId && byId[REPORT_STATE.selectedId] ? REPORT_STATE.selectedId :
    (A.top.length ? A.top[0].id : (map && Object.keys(map)[0]));
  if (initial) selectQuestion(initial, true);
  else el("rp-detail").innerHTML = "";

  el("rp-fulllog").classList.add("hidden");
}

function selectQuestion(id, silent){
  REPORT_STATE.selectedId = id;
  var S = REPORT_STATE.session, A = REPORT_STATE.analysis;
  if (!S || !A) return;
  var map = A.index, meta = map[id];
  if (!meta) return;
  var byId = {}; A.points.forEach(function(p){ byId[p.id] = p; });
  var point = byId[id];
  var isAnchor = meta.kind === "anchor";
  var sev = point ? severityOf(point.score) : 0;

  document.querySelectorAll(".rep-cell").forEach(function(c){ c.classList.remove("selected"); });
  document.querySelectorAll(".rep-cell[data-qid='" + id + "']").forEach(function(c){ c.classList.add("selected"); });

  var root = el("rp-detail"); root.innerHTML = "";
  var card = tag("div", "rep-detail", root);
  var head = tag("div", "head", card);
  tag("span", "qid", head, id);
  /* Якір — нейтральна контрольна точка (Рівень 3 калібрування), не
     шлюз: вона свідомо не потрапляє в аналіз значущості (analyse()
     виключає kind:"anchor" з points), тому звичайний бейдж 1..4
     тут показував би оманливе "Без подій", ніби якір міг мати
     значущість, просто не отримав. Окрема нейтральна позначка. */
  if (isAnchor) tag("span", "rep-sev-badge sev-anchor", head, "Контрольне питання");
  else tag("span", "rep-sev-badge sev-"+(sev||1), head, severityLabel(sev));
  tag("div", "qtext", card, meta.text);
  var answerText = S.answers[id] ? S.answers[id].value : null;
  var answerLabel = { yes:"так", no:"ні", explain:"поясню", declined:"відмова", na:"не стосується" }[answerText] || "—";
  var ans = tag("div", "answer", card);
  ans.appendChild(document.createTextNode("Відповідь: "));
  tag("b", "", ans, answerLabel);

  if (isAnchor){
    tag("div", "foot-row", card, "Нейтральне контрольне питання — не оцінюється за значущістю, використовується двигуном лише для порівняння часу реакції всередині блоку.");
  } else if (point && point.why && point.why.length){
    var pills = tag("div", "rep-pills", card);
    point.why.forEach(function(w){
      var weight = reasonWeight(w);
      var pill = tag("span", "rep-pill w-"+weight, pills, shortReason(w) + " +" + weight);
    });
    if (point.marks && point.marks.length){
      point.marks.forEach(function(m){
        tag("span", "rep-pill manual", pills, "Ваша мітка: " + m);
      });
    }
    var footRow = tag("div", "foot-row", card);
    var related = (meta.kind === "expansion" && meta.gate) ? meta.gate : null;
    var relatedPoint = related ? byId[related] : null;
    tag("span", "", footRow, "Разом " + point.score + " · поріг критичного — 8" + (relatedPoint ? " · пов'язане " + related + " (+" + relatedPoint.score + ")" : ""));
    var fullBtn = tag("button", "mini ghost", footRow, "Повний звіт");
    fullBtn.type = "button";
    fullBtn.addEventListener("click", toggleFullLog);
  } else {
    tag("div", "foot-row", card, "За поточними правилами на цьому питанні немає точок уваги.");
  }
  buildMarkControls(card, id);
}
/* Мітки поліграфолога прямо в звіті — той самий PI_FILL.mark(), що на
   моніторі; MARK_LABELS продубльовано тут, бо оригінальний список у
   05_monitor.js приватний всередині IIFE PI_MON. Дві групи кнопок, як
   у попередній версії програми (MARKS_UP/MARKS_DOWN): підсилюючі
   спостереження окремим рядком від "заспокійливих"/помилкових.
   Кожен тип мітки можна додати на питання лише РАЗ, доки є активна
   (не відкликана) мітка цього типу — повторний клік на ту саму кнопку
   нічого не робить (кнопка стає неактивною). Уже додані мітки
   показуються списком з кнопкою "Відкликати" для кожної. */
var REPORT_MARKS_UP = [
  { text:"реакція", label:"Реакція" }, { text:"перепитав", label:"Перепитав" }, { text:"сказав сам", label:"Сказав сам" }
];
var REPORT_MARKS_DOWN = [
  { text:"перешкода", label:"Перешкода" }, { text:"заминка з технікою", label:"Заминка з технікою" }
];
function buildMarkControls(card, id){
  var S = REPORT_STATE.session;
  var activeMarks = (S.marks||[]).filter(function(m){ return m.q === id && !m.withdrawn_at; });

  if (activeMarks.length){
    var list = tag("div", "rep-mark-list", card);
    activeMarks.forEach(function(m){
      var row = tag("div", "rep-mark-row", list);
      var label = m.mark + (m.phase === "post_session" ? " · додано після анкетування" : "");
      tag("span", "", row, label);
      var undoBtn = tag("button", "mini ghost", row, "Відкликати");
      undoBtn.type = "button";
      undoBtn.addEventListener("click", function(){
        var idx = S.marks.indexOf(m);
        if (PI_FILL.withdrawMark(idx)){ renderReport(); }
      });
    });
  }

  var wrap = tag("div", "rep-mark-controls", card);
  tag("span", "rep-mark-caption", wrap, "Мітки поліграфолога");
  function markRow(list){
    var row = tag("div", "rep-mark-buttons", wrap);
    list.forEach(function(m){
      var already = activeMarks.some(function(am){ return am.mark === m.text; });
      var btn = tag("button", "mini ghost", row, m.label);
      btn.type = "button";
      btn.disabled = already;
      btn.addEventListener("click", function(){
        if (!PI_FILL.mark(id, m.text)) return;
        renderReport();
      });
    });
  }
  markRow(REPORT_MARKS_UP);
  markRow(REPORT_MARKS_DOWN);
  if (S && S.finished){
    tag("span", "rep-mark-hint", wrap, "Нові мітки позначаються як додані після анкетування.");
  }
}
function reasonWeight(w){
  if (/після того, як побачив/.test(w)) return 4;
  if (/помітно довша/.test(w)) return 3;
  if (/змінював відповідь/.test(w)) return 2;
  return 1;
}

function toggleFullLog(){
  var root = el("rp-fulllog");
  if (!root.classList.contains("hidden")){ root.classList.add("hidden"); return; }
  var S = REPORT_STATE.session;
  root.innerHTML = "";
  var box = tag("div", "rep-full-log", root);
  tag("div", "name", box, "Повний журнал подій");
  S.events.forEach(function(e){
    var row = tag("div", "row", box);
    tag("span", "at", row, mmss(e.t));
    tag("span", "", row, e.q || e.block || "—");
    tag("span", "", row, e.type);
  });
  root.classList.remove("hidden");
}
function mmss(ms){ var s = Math.round(ms/1000); return Math.floor(s/60) + ":" + (s%60<10?"0":"") + (s%60); }

el("rp-back-monitor").addEventListener("click", function(){ show("s-monitor", { pushBack:false }); });
el("rp-print").addEventListener("click", function(){ window.print(); });
el("rp-answersheet").addEventListener("click", function(){ renderAnswerSheet(); show("s-answersheet", { from:"s-report" }); });

/* ======================================================================
   Друкована "Анкета" — питання й відповіді у форматі, схожому на згоду:
   ПІБ/дата народження/документ (рукописні поля як зображення) -> блоки
   з усіма питаннями (шлюз + розгортання-уточнення + закриваюче) текстом
   "питання — так/ні/поясню", з поясненням під шлюзом якщо воно є ->
   підпис до анкети в цілому (sig_final) в самому кінці. Підписи окремих
   блоків (чекбокси-підтвердження) у цей документ не виводяться — вони
   існують лише як внутрішня позначка проходження блоку.
   ====================================================================== */
function answerLabel(v){ return { yes:"так", no:"ні", explain:"поясню" }[v] || "—"; }

function renderAnswerSheet(){
  var S = PI_FILL.session(); if (!S) return;
  var root = el("as-doc"); root.innerHTML = "";
  tag("h1", null, root, "АНКЕТА");
  tag("p", null, root, "передтестового опитування з використанням поліграфа");

  var ident = tag("div", "as-ident", root);
  function identRow(label, imgSrc){
    var p = tag("p", null, ident);
    tag("span", null, p, label + ": ");
    if (imgSrc){ var img = tag("img", "as-identimg", p); img.src = imgSrc; }
    else tag("span", "ln", p);
  }
  identRow("Прізвище, ім'я та по батькові", S.identity.fio);
  identRow("Дата народження", S.identity.birth);
  identRow("Документ, що засвідчує особу", S.identity.doc);
  if (S.identity.position) identRow("Посада", S.identity.position);

  S.questionnaire.blocks.forEach(function(block){
    var wrap = tag("div", "as-block", root);
    tag("div", "as-block-title", wrap, block.id + " · " + block.title);

    function renderQuestion(q, indent){
      var a = S.answers[q.id];
      var p = tag("p", "as-q" + (indent ? " as-sub" : ""), wrap);
      p.textContent = q.text + " — ";
      var ans = tag("span", "as-ans", p); ans.textContent = a ? answerLabel(a.value) : "не відповів(-ла)";
    }

    if (block.type === "calibration"){
      (block.questions||[]).forEach(function(q){ renderQuestion(q, false); });
    } else {
      var anchorsAfter = {};
      (block.anchors||[]).forEach(function(a){ (anchorsAfter[a.after_gate] = anchorsAfter[a.after_gate]||[]).push(a); });
      (block.gates||[]).forEach(function(g){
        renderQuestion(g, false);
        var ga = S.answers[g.id];
        if (ga && (ga.value === "yes" || ga.value === "explain")){
          (g.expansion||[]).forEach(function(eq){ renderQuestion(eq, true); });
        }
        var exp = S.explanations[g.id];
        if (exp){
          var e = tag("p", "as-exp", wrap); e.textContent = "Пояснення:";
          var eimg = tag("img", null, e); eimg.src = exp; eimg.style.display = "block"; eimg.style.maxWidth = "100%"; eimg.style.maxHeight = "4em";
        }
        if (anchorsAfter[g.id]) anchorsAfter[g.id].forEach(function(a){ renderQuestion(a, false); });
      });
      if (block.closing) renderQuestion(block.closing, false);
    }
  });

  var signWrap = tag("div", "as-sign", root);
  tag("p", null, signWrap, "Підпис до анкети в цілому:");
  if (S.signatures.final){ var img = tag("img", null, signWrap); img.src = S.signatures.final; }
  else tag("span", "ln", signWrap);
}

el("as-back").addEventListener("click", function(){ navBack("s-start"); });
el("as-print").addEventListener("click", function(){ window.print(); });
