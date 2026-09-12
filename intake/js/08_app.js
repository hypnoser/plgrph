/* ======================================================================
   Intake v4.1 — 08_app.js
   Порядок кроків на стартовому екрані: спершу ПІБ респондента і
   збереження справи (це і створює файл сесії), потім Згода/Анкета.
   Картка "Анкета" заблокована, доки справу не збережено — вона пише
   в файл сесії. Картка "Згода" завжди доступна незалежно від справи:
   це лише бланк для перегляду, підпису чи друку.
   ====================================================================== */
"use strict";

function updateStartCard(){
  var consentDone = !!(PI_CONSENT.current() && PI_CONSENT.current().ink);
  var questDone = !!STATE.data;
  var caseDone = !!CASE.label;

  var cBadge = el("step-consent-badge"), cSub = el("step-consent-sub"), cAction = el("step-consent-action");
  cBadge.className = "badge " + (consentDone ? "done" : "todo");
  cBadge.innerHTML = consentDone ? checkIcon() : "1";
  cSub.textContent = consentDone ? "Оформлено" : "Натисніть, щоб оформити згоду на анкетування";
  cAction.textContent = consentDone ? "Змінити" : "Оформити";

  var questCard = el("step-quest"), qBadge = el("step-quest-badge"), qSub = el("step-quest-sub"), qAction = el("step-quest-action");
  questCard.disabled = !caseDone;
  qBadge.className = "badge " + (questDone ? "done" : "todo");
  qBadge.innerHTML = questDone ? checkIcon() : "2";
  qSub.textContent = !caseDone ? "Спочатку збережіть справу" : (questDone ? ((STATE.data.meta||{}).title || "Анкету завантажено") : "Не завантажена");
  qAction.textContent = !caseDone ? "" : (questDone ? "Змінити" : "Завантажити");

  var goBtn = el("start-go"), hint = el("start-hint");
  goBtn.disabled = !questDone || !caseDone;
  hint.textContent = !caseDone ? "Спершу збережіть справу" : (questDone ? "" : "Завантажте анкету, щоб почати");
  hint.classList.toggle("hidden", questDone && caseDone);

  var caseLine = el("case-line");
  if (CASE.label){
    caseLine.classList.remove("hidden");
    el("case-line-text").textContent = CASE.label + (PI_SAVE.casePath() ? " · " + PI_SAVE.casePath() : "");
  } else {
    caseLine.classList.add("hidden");
  }
  var S = PI_FILL.session();
  el("case-report-btn").classList.toggle("hidden", !(S && S.finished));
  el("case-answersheet-btn").classList.toggle("hidden", !(S && S.finished));
}
function checkIcon(){
  return '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>';
}

/* Крок 1 — справа: вводимо ПІБ, тиснемо збереження, система пропонує
   обрати файл сесії. Із цього моменту файл існує і в нього одразу
   пишеться все — консент (якщо вже намальований), а далі й анкета.
   PI_FILL.initEmpty() створює мінімальний об'єкт сесії ще без анкети
   і PI_SAVE.bind+now() пише його на диск одразу — інакше файл,
   обраний через showSaveFilePicker, лишається 0 байт до натискання
   "Почати анкетування", і аварійне закриття сторінки між збереженням
   справи й стартом анкетування означає повну втрату файлу справи. */
el("case-save").addEventListener("click", async function(){
  var name = el("case-pib").value.trim();
  if (!name){ el("case-pib").focus(); return; }
  CASE = { id: newId(), label: name, created: new Date().toISOString() };
  await PI_SAVE.prepareCase(CASE);
  if (!PI_SAVE.hasHandle() && window.showSaveFilePicker && !PI_SAVE.casePath()){
    try { await PI_SAVE.chooseFile(CASE.id); } catch(e){ CASE = { id:null, label:"", created:null }; updateStartCard(); return; }
  }
  PI_FILL.initEmpty(CASE);
  PI_SAVE.bind(function(){ return PI_FILL.session(); });
  /* Якщо до створення справи вже намальована згода — переносимо її
     чернетку у щойно створений об'єкт сесії одразу, без очікування
     старту заповнення. */
  if (PI_CONSENT.current()) PI_CONSENT.attachToCase();
  PI_SAVE.touched();
  await PI_SAVE.now();
  updateStartCard();
});

/* Картка "Згода" відкриває ЛИШЕ друге вікно — жодного show() тут.
   Доступна завжди, незалежно від того, чи збережено справу. */
el("step-consent").addEventListener("click", function(){ PI_CONSENT.open(); });

/* Картка "Анкета": якщо анкета вже завантажена — відкриває переглядач;
   якщо ні — відкриває системний вибір файлу. Неактивна, доки справу
   не збережено (керується атрибутом disabled у updateStartCard). */
el("step-quest").addEventListener("click", function(){
  if (!CASE.label) return;
  if (STATE.data){ QV.open(); return; }
  el("f-quest").click();
});
el("f-quest").addEventListener("change", function(){
  var file = this.files[0]; if (!file) return;
  if (file.size > 5*1024*1024){ alert("Анкета завелика (понад 5 МБ)"); return; }
  var fr = new FileReader();
  fr.onload = function(){ acceptQuestionnaire(fr.result, file.name); };
  fr.onerror = function(){ showIssue("Не вдалося прочитати файл з диска", ""); };
  fr.readAsText(file);
  this.value = "";
});

/* ---------- Відкриття раніше збереженої справи з файлу ----------
   Працює незалежно від того, чи ПІБ/анкета вже щось введено на
   екрані — файл сесії містить усе потрібне сам по собі. Якщо
   session.finished — одразу показуємо звіт (без відкриття другого
   вікна чи монітора). Якщо сесія не завершена — це те саме, що
   раніше вмів лише PI_MON.resume() через Налаштування (set-file-btn),
   тепер доступне одразу зі стартового екрана навіть після повного
   закриття сторінки. */
el("case-open").addEventListener("click", async function(){
  if (window.showOpenFilePicker){
    try {
      var picked = await PI_SAVE.openForResume();
      if (picked) { openCaseFile(picked.file, undefined, picked.handle); return; }
    } catch(e){ if (e.name === "AbortError") return; /* користувач закрив діалог */ }
  }
  el("f-case").click();
});
el("f-case").addEventListener("change", function(){
  var file = this.files[0]; this.value = "";
  if (!file) return;
  openCaseFile(file, undefined, null);
});

var PENDING_CASE_FILE = null, PENDING_CASE_HANDLE = null;
async function openCaseFile(file, pw, handle){
  try {
    var saved = await PI_SAVE.read(file, pw);
    el("case-pw-veil").classList.add("hidden");
    PENDING_CASE_FILE = null; PENDING_CASE_HANDLE = null;
    if (saved.finished){
      PI_SAVE.setTarget(null); /* завершена справа відкрита лише для перегляду, дозаписувати нема чого */
      CASE = { id: saved.session_id, label: (saved.case_info && saved.case_info.label) || "Відкрита справа", created: saved.started || new Date().toISOString() };
      el("case-pib").value = CASE.label;
      PI_FILL.load(saved);
      updateStartCard();
      renderReport();
      /* "До монітора" веде на живий монітор поточної сесії — тут немає
         сенсу: сесію відкрито з файлу лише для перегляду, друге вікно
         заповнення для неї не відкривалось у цій вкладці. */
      el("rp-back-monitor").classList.add("hidden");
      show("s-report", { from:"s-start" });
    } else {
      /* Продовження заповнення пише автоматично назад у ЦЕЙ ЖЕ файл,
         якщо його відкрито через showOpenFilePicker (handle є). Якщо
         відкрито через input[type=file] (handle=null, старий браузер
         без showOpenFilePicker) — запис не прив'язаний нікуди, і
         Налаштування · "Файл для запису" лишається способом це задати. */
      if (handle) PI_SAVE.setTarget(handle); else PI_SAVE.setTarget(null);
      CASE = { id: saved.session_id, label: (saved.case_info && saved.case_info.label) || "Відкрита справа", created: saved.started || new Date().toISOString() };
      el("case-pib").value = CASE.label;
      if (saved.questionnaire && saved.status !== "draft"){
        /* Анкету вже завантажено, І тестування вже реально розпочиналось
           (status стає "active" лише в PI_FILL.start(), яку викликає
           beginQuestions() по кліку "Почати анкетування" — не сам факт
           наявності анкети). Це справжнє продовження заповнення після
           аварійного закриття посеред тесту — відкриваємо монітор і
           друге вікно, як і мало бути. */
        STATE.data = saved.questionnaire; STATE.result = null; STATE.fileName = "";
        updateStartCard();
        PI_MON.resume(saved);
      } else {
        /* Або анкету ще не завантажено (questionnaire:null), або вона
           вже прикріплена (attachQuestionnaire), але тестування ще НЕ
           починалось (status лишається "draft" — respondent жодного разу
           не натиснув "Почати анкетування"). В обох випадках це не
           "продовження заповнення", а стан ДО старту: поліграфолог мав
           побачити стартовий екран (ПІБ, теку, картки Згода/Анкета,
           кнопку "Почати анкетування") і сам вирішити, коли починати —
           а не миттєво потрапляти в монітор/друге вікно respondent'а.
           НЕ можна викликати PI_MON.resume()/PI_FILL.resume() тут: вони
           самі відкривають друге вікно ДО перевірки стану, і воно
           лишається порожнім, а resume() для questionnaire:null однаково
           поверне false. Просто завантажуємо S у PI_FILL і лишаємось на
           стартовому екрані — картки "Анкета"/"Почати анкетування"
           стають доступними за фактичним станом S. */
        PI_FILL.load(saved);
        PI_SAVE.bind(function(){ return PI_FILL.session(); });
        STATE.data = saved.questionnaire || null; STATE.result = null; STATE.fileName = "";
        updateStartCard();
      }
    }
  } catch(e){
    if (e.message === "no_password"){
      PENDING_CASE_FILE = file; PENDING_CASE_HANDLE = handle;
      el("case-pw-input").value = ""; el("case-pw-why").textContent = "";
      el("case-pw-veil").classList.remove("hidden");
      el("case-pw-input").focus();
      return;
    }
    if (e.message === "bad_password"){
      el("case-pw-why").textContent = "Неправильний пароль";
      el("case-pw-input").focus();
      return;
    }
    showIssue("Не вдалося відкрити файл справи", e.message || "");
  }
}
el("case-pw-go").addEventListener("click", function(){
  if (!PENDING_CASE_FILE) return;
  openCaseFile(PENDING_CASE_FILE, el("case-pw-input").value, PENDING_CASE_HANDLE);
});
el("case-pw-input").addEventListener("keydown", function(e){ if (e.key === "Enter") el("case-pw-go").click(); });
el("case-pw-cancel").addEventListener("click", function(){
  PENDING_CASE_FILE = null;
  el("case-pw-veil").classList.add("hidden");
});

/* Кнопка "Звіт" на стартовому екрані — активна лише коли зараз
   відкрита (в пам'яті) сесія, і саме вона finished. Не показується
   для щойно розпочатої чи взагалі відсутньої справи. */
el("case-report-btn").addEventListener("click", function(){
  var S = PI_FILL.session();
  if (!S || !S.finished) return;
  renderReport();
  el("rp-back-monitor").classList.add("hidden"); /* перегляд з головного екрана — живого монітора немає */
  show("s-report", { from:"s-start" });
});

el("case-answersheet-btn").addEventListener("click", function(){
  var S = PI_FILL.session();
  if (!S || !S.finished) return;
  renderAnswerSheet();
  show("s-answersheet", { from:"s-start" });
});

function acceptQuestionnaire(raw, name){
  STATE.fileName = name || "";
  var parsed = parseJson(raw);
  if (!parsed.ok){
    showIssue(parsed.msg, "Перевірте, що файл — це один валідний JSON, від першої фігурної дужки до останньої.");
    return;
  }
  var result = PI_VALIDATE.run(parsed.data);
  if (!result.ok){
    var msgs = result.errors.slice(0,5).map(function(e){ return e.loc + ": " + e.msg; }).join("\n");
    showIssue(result.errors.length + " " + plural(result.errors.length,"помилка","помилки","помилок") + " у файлі анкети", msgs);
    return;
  }
  STATE.result = result;
  STATE.data = result.data || parsed.data;
  /* Якщо справу вже збережено (S існує від initEmpty у case-save) —
     вписуємо анкету одразу в файл сесії на диску, а не лишаємо це
     до натискання "Почати анкетування". PI_SAVE.now() одразу (не
     покладаючись на debounce touched() у 1с) — аварійне закриття
     сторінки за секунду після завантаження анкети не повинно
     означати втрату щойно доданої анкети з файлу. */
  if (PI_FILL.session()){ PI_FILL.attachQuestionnaire(STATE.data); PI_SAVE.now(); }
  updateStartCard();
  show("s-start", { pushBack:false });
}
function showIssue(message, details){
  el("issue-message").textContent = message;
  el("issue-details").textContent = details || "";
  el("issue-details-wrap").classList.toggle("hidden", !details);
  show("s-issue", { from:"s-start" });
}
el("issue-back").addEventListener("click", function(){ navBack("s-start"); });
el("rp-back").addEventListener("click", function(){ navBack("s-start"); });
/* "До старту" з монітора — НЕ завершує анкетування (на відміну від
   mo-end) і НЕ закриває друге вікно респондента: PI_MON.stop() лише
   припиняє опитування статусу на екрані поліграфолога. Дані вже
   постійно пишуться в PI_SAVE незалежно від того, який екран відкрито,
   тож нічого не втрачається. Поліграфолог повертається на стартовий
   екран (ПІБ/тека/картки Згода-Анкета вже заповнені за фактичним
   станом), може там, наприклад, ще раз відкрити Згоду, і повернутись
   до монітора пізніше через "Відкрити справу" (questionnaire+status
   вже "active" на цей момент, тому відкриється саме монітор, не
   стартовий екран знову — розгалуження в openCaseFile). */
el("mo-back").addEventListener("click", function(){
  PI_MON.stop();
  updateStartCard();
  navBack("s-start");
});

el("start-go").addEventListener("click", async function(){
  if (!STATE.data || !CASE.label) return;
  /* Якщо тест уже реально розпочато (status "active") — це не перший
     старт, а повернення після "До старту" на моніторі. PI_MON.begin()
     викликає PI_FILL.start(), який для сесії без blockIdx веде на
     startScreen() (екран підпису) і візуально скидає прогрес на "з
     нуля", хоча відповіді фізично лишаються в S.answers. Замість
     цього — resumeSession(), яка викликає PI_FILL.resume() і повертає
     респондента рівно туди, де він зупинився. */
  var S = PI_FILL.session();
  if (S && S.status === "active" && !S.finished){ PI_MON.resume(S); return; }
  PI_MON.begin(STATE.data, PI_CONSENT.current());
});

/* ---------- Налаштування ---------- */
el("b-settings").addEventListener("click", function(){
  var current = document.querySelector(".screen.on");
  openSettings(current ? current.id : "s-start");
  fillBlockSelect();
});
function fillBlockSelect(){
  var sel = el("set-block-select");
  sel.innerHTML = "";
  var S = PI_FILL.session();
  if (!S || !S.questionnaire){ sel.disabled = true; el("set-block-go").disabled = true; return; }
  sel.disabled = false; el("set-block-go").disabled = false;
  S.questionnaire.blocks.forEach(function(b, i){
    var o = document.createElement("option"); o.value = i; o.textContent = b.id + " · " + b.title;
    sel.appendChild(o);
  });
}
el("settings-gate-back").addEventListener("click", function(){ navBack("s-start"); });
el("settings-pin-go").addEventListener("click", trySettingsPin);
el("settings-pin-input").addEventListener("keydown", function(e){ if (e.key === "Enter") trySettingsPin(); });
el("settings-back").addEventListener("click", function(){ navBack("s-start"); });

el("set-dir-btn").addEventListener("click", async function(){
  var h = await PI_SAVE.chooseDir();
  el("set-dir-state").textContent = h ? h.name : "не обрано";
});
el("set-pin").addEventListener("input", function(){
  SETTINGS_PIN = this.value.replace(/\D/g,"").slice(0,8);
  try { localStorage.setItem("intake_settings_pin", SETTINGS_PIN); } catch(e){}
});
el("set-file-btn").addEventListener("click", async function(){
  var S = PI_FILL.session(); if (!S) return;
  try { await PI_SAVE.chooseFile(S.session_id); PI_SAVE.touched(); await PI_SAVE.now(); PI_MON.refreshStatus(); } catch(e){}
});
el("set-block-go").addEventListener("click", function(){
  var S = PI_FILL.session(); if (!S || S.finished) return;
  PI_FILL.goto(Number(el("set-block-select").value));
  navBack("s-monitor");
});
el("set-print-btn").addEventListener("click", function(){ renderReport(); window.print(); });
el("set-clear-data").addEventListener("click", async function(){
  if (!confirm("Видалити всі дані цієї програми з браузера? Дію не можна скасувати.")) return;
  try { localStorage.clear(); } catch(e){}
  try { indexedDB.deleteDatabase("intake_fs"); } catch(e){}
  location.reload();
});

/* ---------- Довідка ---------- */
var HELP_STEPS = [
  { h:"1. Оформіть згоду", p:"На стартовому екрані відкрийте картку «Згода» — відкриється друге вікно для респондента (на планшеті). Респондент підписує документ пером. Ви весь цей час лишаєтесь на стартовому екрані; плашка «Згода» позначиться виконаною автоматично, щойно в документі з'явиться підпис." },
  { h:"2. Завантажте анкету", p:"У картці «Анкета» оберіть JSON-файл, підготовлений заздалегідь. Клікнувши на назву вже завантаженої анкети, можна переглянути й відредагувати її структуру — шлюзи та уточнення, з можливістю видаляти чи додавати питання." },
  { h:"3. Почніть анкетування", p:"Кнопка «Почати анкетування» стає активною, щойно анкета завантажена. Згода не є обов'язковою умовою — можна почати і без неї." },
  { h:"4. Ведіть сесію", p:"На моніторі видно поточне питання респондента. Кольорова крапка в куті картки засвічується, коли на цьому питанні щось помічено автоматично. Кнопками під питанням додавайте власні мітки: три «Спостереження» підсилюють увагу до питання, дві «Перешкоди» — гасять хибний сигнал." },
  { h:"5. Якщо вікно респондента закрилось", p:"Якщо друге вікно було випадково закрито (браузер завжди попереджає про незавершену сесію, але дозволяє підтвердити), на моніторі з'явиться кнопка «Перевідкрити вікно» — вона відновить сесію рівно з того місця, де респондент зупинився." },
  { h:"6. «До старту» посеред тесту", p:"Кнопка «До старту» вгорі монітора повертає вас на стартовий екран, НЕ завершуючи анкетування — дані й далі пишуться, друге вікно респондента лишається відкритим. Щоб продовжити сесію звідти, натисніть «Почати анкетування» ще раз — програма сама впізнає незавершену сесію і поверне на той блок, де респондент зупинився, а не почне заново." },
  { h:"7. Завершіть і перегляньте звіт", p:"Кнопка «Завершити анкетування» відкриває вибір: зашифрувати файл сесії паролем чи лишити відкритим. Вікно респондента закриється автоматично. Після цього одразу показується звіт." },
  { h:"8. Читайте звіт", p:"Зверху — короткий висновок, на що звернути увагу. Нижче — карта питань кольором за рівнем значущості: чим темніший колір, тим важливіше. Пунктирні картки — нейтральні контрольні питання (якорі), вони не оцінюються за значущістю. Клік по питанню відкриває розбір патернів, які сформували цю оцінку." },
  { h:"9. Налаштування", p:"Кнопка з шестернею в шапці веде в розділ «Налаштування» — робоча тека, файл для запису, друк, видалення даних. Якщо задано PIN, розділ запитає його при вході." }
];
function renderHelp(){
  var body = el("help-body"); body.innerHTML = "";
  HELP_STEPS.forEach(function(s){
    var sec = tag("div", "hsec", body);
    tag("h2", "", sec, s.h);
    tag("p", "", sec, s.p);
  });
}
el("b-help").addEventListener("click", function(){
  renderHelp();
  show("s-help", { from: document.querySelector(".screen.on").id });
});
el("help-back").addEventListener("click", function(){ navBack("s-start"); });

/* ---------- ініціалізація ---------- */
PI_SAVE.loadDir().then(function(st){
  el("set-dir-state").textContent = st === "granted" ? PI_SAVE.dirName() : "не обрано";
});
if (SETTINGS_PIN) el("set-pin").value = SETTINGS_PIN;
updateStartCard();
setInterval(function(){
  var st = PI_SAVE.status();
  el("start-save-state").textContent = st.error ? "Помилка запису" : st.dirty ? "Незбережені зміни" : "Дані збережено локально";
}, 1200);

window.PI = {
  validate: PI_VALIDATE, parse: parseJson, fill: PI_FILL, mon: PI_MON, save: PI_SAVE,
  stat: PI_STAT, report: renderReport, consent: PI_CONSENT, state: STATE, version: VERSION,
  hash: sessionHash, validateSaved: validateSaved
};
