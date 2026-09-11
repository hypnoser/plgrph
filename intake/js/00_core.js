/* ======================================================================
   Intake v4 — 00_core.js
   Базові утиліти, словник текстів, парсер JSON, валідатор схеми анкети.
   Ця частина логіки НЕ змінювалась по суті відносно версії 3.2 —
   тільки перенесена в окремий модуль.
   ====================================================================== */
"use strict";

var el = function(id){ return document.getElementById(id); };

function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function plural(n, one, few, many){
  var a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
function infoLine(root,text,cls){var p=document.createElement('p');p.className=cls||'note';p.textContent=text;root.appendChild(p);return p;}
function tag(name, cls, parent, text){
  var n = document.createElement(name);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  if (text !== undefined) n.textContent = text;
  return n;
}

/* ------------------------------------------------------------------ */
/*  БЕЗПЕКА СТРУКТУР                                                   */
/* ------------------------------------------------------------------ */
function assertSafeTree(v, depth){
  depth = depth || 0;
  if (depth > 40) throw new Error("Надто вкладена структура файла");
  if (v && typeof v === "object") Object.keys(v).forEach(function(k){
    if (["__proto__","prototype","constructor"].indexOf(k) >= 0) throw new Error("Недопустиме ім'я поля");
    assertSafeTree(v[k], depth + 1);
  });
}
function stable(value){
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return "{" + Object.keys(value).filter(function(k){ return value[k] !== undefined; }).sort()
      .map(function(k){ return JSON.stringify(k) + ":" + stable(value[k]); }).join(",") + "}";
  return JSON.stringify(value);
}
async function digest(text){
  var b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(b)).map(function(x){ return x.toString(16).padStart(2, "0"); }).join("");
}

/* ------------------------------------------------------------------ */
/*  МОВА ІНТЕРФЕЙСУ (українська за замовчуванням, без мультимовності —  */
/*  спрощено відносно 3.2: одна мова, менше умовної логіки)             */
/* ------------------------------------------------------------------ */

var DICT = {
  r_yes: "так", r_no: "ні", r_explain: "поясню",
  r_erase: "стерти",
  r_block: "Блок {n} з {of}",
  r_expanded: "Розгортання {id} · відкрито відповіддю «{answer}»",
  r_explanation: "Пояснення до шлюзу {id}",
  r_sign: "Підпис", r_sign_final: "Підпис до анкети в цілому",
  r_block_confirm: "Я підтверджую, що на вищевказані питання мною надані правдиві відповіді.",
  r_next: "Далі", r_finish: "Завершити",
  r_review: "Переглянути попередні відповіді",
  r_review_head: "До якого питання Ви бажаєте повернутися?",
  r_review_body: "Оберіть уже пройдений блок і питання. Повернення буде зафіксовано.",
  r_review_cancel: "Залишитися в поточному блоці",
  r_return_here: "Підтвердити блок і повернутися",
  r_left_one: "Залишилось питання {list}",
  r_left_many: "Залишились питання: {list}",
  r_position: "Посада (за потреби)",
  r_addendum: "Доповнення до блоку (за бажанням)",
  r_fio: "Прізвище, ім'я та по батькові",
  r_birth: "Дата народження",
  r_doc: "Серія і номер документа, що засвідчує особу",
  r_ack: "Я прочитав(-ла) інформацію та бажаю почати анкетування",
  r_brief_1: "Відповідайте стилусом, торкаючись одного з квадратів під питанням.",
  r_brief_2: "«так» — це було. «ні» — цього не було. «поясню» — хочете уточнити усно.",
  r_brief_3: "Після «так» або «поясню» відкриються додаткові питання того самого блоку.",
  r_brief_4: "Якщо питання незрозуміле — запитайте вголос, поліграфолог поруч.",
  r_brief_5: "Поставте парафу наприкінці кожного блоку та підпис наприкінці анкети.",
  r_done_note: "Дякуємо. Передайте планшет поліграфологу.",
  s_end_head: "Анкету завершено",
  s_end_body: "Можна захистити файл сесії паролем. Файл перезапишеться зашифрованим на тому самому місці. Відновлення пароля не існує: втрачений пароль означає втрачений архів.",
  s_end_go: "Зашифрувати файл",
  s_end_skip: "Лишити без пароля",
  s_end_ok: "Файл зашифровано і збережено",
  s_end_plain: "Файл збережено без пароля",
  m_mark_react: "реакція", m_mark_asked: "перепитав", m_mark_self: "сказав сам",
  m_mark_noise: "перешкода", m_mark_tech: "заминка з технікою",
  m_tip_react: "Респондент помітно відреагував: завагався, змінився в обличчі, засміявся, зітхнув",
  m_tip_asked: "Респондент перепитав вас про зміст питання",
  m_tip_self: "Респондент сам додав щось усно, без вашого запитання",
  m_tip_noise: "Завадило щось зовнішнє: шум, хтось зайшов, дзвінок",
  m_tip_tech: "Підвели планшет або стилус — затримка не респондента",
  w_lat: "пауза перед відповіддю довша за звичайну в цьому блоці (відхилення {z})",
  w_lat_high: "помітно довша пауза, ніж на решті блоку (відхилення {z})",
  w_change: "змінював відповідь ({n} раз)",
  w_change_after: "змінив відповідь уже після того, як побачив уточнення",
  w_collapsed: "відкрив уточнення й згорнув, не відповівши на жодне",
  w_blank: "лишив пояснення порожнім до першого нагадування",
  w_jump: "відповів не по порядку, повернувшись назад",
  w_block_pause: "довга пауза на початку блоку, до першої відповіді (відхилення {z})",
  w_run: "після першого розкриття пішли суцільні «ні» ({n} шлюзів поспіль)",
  w_yes: "повідомлена обставина для уточнення",
  w_relevant: "питання позначене як кандидат у релевантні",
  w_attention: "повторно зосереджував стилус на тексті після відповіді ({n} еп.)",
  w_return: "самостійно повернувся до цього питання",
  w_mark_only: "спостереження поліграфолога: {m}",
  w_mark_confirm: "також є спостереження поліграфолога: {m}",
  w_damped: "поведінкову підсвітку знято: {m}. Відповідь збережено",
  o_up_word: "вгору", o_down_word: "вниз",
  o_applied: "ручне перевизначення {dir}: {why}"
};
function fill(str, vars){
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, function(all, k){
    return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : all;
  });
}
function T(key, vars){ return fill(Object.prototype.hasOwnProperty.call(DICT,key)?DICT[key]:key, vars); }
function R(key, vars){ return T(key, vars); }

function briefing(){
  var out = [];
  for (var i = 1; i <= 5; i++) out.push(R("r_brief_" + i));
  var q = STATE.data || (window.PI_FILL && PI_FILL.session() && PI_FILL.session().questionnaire);
  if (q && q.meta && Array.isArray(q.meta.instructions)) out = out.concat(q.meta.instructions);
  return out;
}

/* ------------------------------------------------------------------ */
/*  ВАЛІДАТОР СХЕМИ 1.x (мажорна версія 1)                             */
/*  Логіка ідентична 3.2. Обов'язкові умови валідності описані в        */
/*  промпті генерації анкети — тут вони лише перевіряються.             */
/* ------------------------------------------------------------------ */

var PI_VALIDATE = (function(){
  var SCHEMA = "1.1";
  var SCHEMA_MAJOR = SCHEMA.split(".")[0];
  var ROOT_KEYS = ["schema_version","meta","consent","blocks"];
  var META_KEYS = ["title","language","created","period","respondent_context","assessment_type","instructions"];
  var BLOCK_TYPES = ["calibration","topic"];
  var BASELINE = ["high","medium","low"];
  var CALIB_ROLES = ["motor_floor","reading_rate","enumeration_load","recall_load","explain_format","engagement_check"];
  var HINT_REGENERATE = "Файл пошкоджено або він не відповідає схемі 1.0. Поверніться до чату, де готувалась анкета, і завантажте файл заново.";
  var HINT_EMPTY = "Файл порожній або майже порожній.";

  function isObj(v){ return v && typeof v === "object" && !Array.isArray(v); }
  function isArr(v){ return Array.isArray(v); }
  function isStr(v){ return typeof v === "string"; }
  function filled(v){ return isStr(v) && v.trim().length > 0; }

  function run(data){
    var errors = [], warnings = [], hint = "";
    var stats = { blocks:0, calibration:0, gates:0, expansions:0, closings:0, relevant:0, blockList:[] };
    var style = { long:[], mark:[], negative:[], vy:[] };
    var ids = {};

    function err(loc, msg){ errors.push({ loc:loc, msg:msg }); }
    function wrn(loc, msg){ warnings.push({ loc:loc, msg:msg }); }

    function claimId(loc, id, label){
      if (!filled(id)){ err(loc, label + " без ідентифікатора"); return; }
      if (ids[id]){ err(loc, "ідентифікатор «" + id + "» уже використано вище (" + ids[id].label + ", " + ids[id].loc + ")"); return; }
      ids[id] = { label: label, loc: loc };
    }

    if (!isObj(data)){
      err("файл", "очікується об'єкт JSON, отримано " + (isArr(data) ? "масив" : typeof data));
      hint = HINT_REGENERATE;
      return finish();
    }
    if (!("schema_version" in data)) err("schema_version", "поле відсутнє");
    else if (!isStr(data.schema_version)) err("schema_version", "має бути рядком");
    else if (data.schema_version.split(".")[0] !== SCHEMA_MAJOR)
      err("schema_version", "файл заявляє схему " + data.schema_version + ", двигун підтримує " + SCHEMA_MAJOR + ".x");

    if (!isObj(data.meta)) err("meta", "розділ відсутній або не є об'єктом");
    else {
      if (!filled(data.meta.title)) err("meta.title", "назва обстеження обов'язкова");
      if (!("created" in data.meta)) wrn("meta.created", "дату створення не вказано");
    }
    if (data.consent && (!isObj(data.consent) || !isArr(data.consent.paragraphs) || data.consent.paragraphs.some(function(p){ return !filled(p); })))
      err("consent", "Потрібен розділ із масивом текстових абзаців paragraphs");

    if (!isArr(data.blocks) || data.blocks.length === 0){ err("blocks", "у файлі немає жодного блоку"); return finish(); }

    var calibAt = [];
    for (var ci = 0; ci < data.blocks.length; ci++) if (data.blocks[ci] && data.blocks[ci].type === "calibration") calibAt.push(ci);
    var topics = 0;
    for (var ti = 0; ti < data.blocks.length; ti++) if (data.blocks[ti] && data.blocks[ti].type === "topic") topics++;
    if (!topics) err("blocks", "в анкеті немає жодного тематичного блоку");
    if (!calibAt.length) wrn("blocks", "немає калібрувального блоку");
    else if (calibAt.length > 1) wrn("blocks", "калібрувальних блоків " + calibAt.length + ", очікується один");
    else if (calibAt[0] !== 0) wrn("blocks[" + calibAt[0] + "]", "калібрувальний блок стоїть не першим");

    var seenBlockIds = Object.create(null);
    for (var i = 0; i < data.blocks.length; i++){
      var b = data.blocks[i], L = "blocks[" + i + "]";
      if (!isObj(b)){ err(L, "блок не є об'єктом"); continue; }
      if (!filled(b.id)) err(L + ".id", "ідентифікатор блоку обов'язковий");
      else if (seenBlockIds[b.id]) err(L + ".id", "ідентифікатор блоку «" + b.id + "» повторюється");
      else seenBlockIds[b.id] = true;
      if (!filled(b.title)) err(L + ".title", "назва блоку обов'язкова");
      if (!filled(b.type)){ err(L + ".type", "тип блоку обов'язковий"); continue; }
      if (BLOCK_TYPES.indexOf(b.type) === -1){ err(L + ".type", "невідомий тип «" + b.type + "»"); continue; }

      var entry = { id: b.id || "?", title: b.title || "(без назви)", type: b.type,
                    context: isStr(b.context) ? b.context : "", gates: 0, exp: 0, plain: 0, closing: 0 };
      stats.blocks++;

      if (b.type === "calibration"){
        if (!isArr(b.questions) || b.questions.length === 0) err(L + ".questions", "калібрувальний блок без питань");
        else for (var q = 0; q < b.questions.length; q++){
          var qu = b.questions[q], QL = L + ".questions[" + q + "]";
          if (!isObj(qu)){ err(QL, "питання не є об'єктом"); continue; }
          claimId(QL + ".id", qu.id, "калібрувальне питання");
          checkText(QL, qu.id, qu.text, false);
          if ("calibration_role" in qu && CALIB_ROLES.indexOf(qu.calibration_role) === -1)
            wrn(QL + ".calibration_role", "значення «" + qu.calibration_role + "» не з очікуваного набору — ігнорується аналізом");
          if ("load_profile" in qu && !isObj(qu.load_profile))
            wrn(QL + ".load_profile", "має бути об'єктом — ігнорується аналізом");
          stats.calibration++; entry.plain++;
        }
      } else {
        if (!isArr(b.gates) || b.gates.length === 0) err(L + ".gates", "тематичний блок без шлюзів");
        else for (var g = 0; g < b.gates.length; g++){
          var ga = b.gates[g], GL = L + ".gates[" + g + "]";
          if (!isObj(ga)){ err(GL, "шлюз не є об'єктом"); continue; }
          claimId(GL + ".id", ga.id, "шлюз");
          checkText(GL, ga.id, ga.text, true);
          if (!("baseline_yes" in ga)) wrn(GL + ".baseline_yes", "вагу не вказано, вважаю medium");
          else if (BASELINE.indexOf(ga.baseline_yes) === -1) err(GL + ".baseline_yes", "значення «" + ga.baseline_yes + "» неприпустиме");
          if (typeof ga.relevant_candidate !== "boolean") wrn(GL + ".relevant_candidate", "ознаку не вказано, вважаю false");
          else if (ga.relevant_candidate) stats.relevant++;
          if ("load_profile" in ga && !isObj(ga.load_profile))
            wrn(GL + ".load_profile", "має бути об'єктом — ігнорується аналізом");
          stats.gates++; entry.gates++;
          if (!isArr(ga.expansion) || ga.expansion.length === 0) err(GL + ".expansion", "шлюз без уточнень");
          else for (var e = 0; e < ga.expansion.length; e++){
            var ex = ga.expansion[e], EL = GL + ".expansion[" + e + "]";
            if (!isObj(ex)){ err(EL, "уточнення не є об'єктом"); continue; }
            claimId(EL + ".id", ex.id, "уточнення");
            checkText(EL, ex.id, ex.text, true);
            stats.expansions++; entry.exp++;
          }
        }
        if (!isObj(b.closing)) err(L + ".closing", "тематичний блок без закриваючого питання");
        else { claimId(L + ".closing.id", b.closing.id, "закриваюче питання"); entry.closing = 1;
               checkText(L + ".closing", b.closing.id, b.closing.text, false); stats.closings++;
               if ("recap" in b.closing && !filled(b.closing.recap)) wrn(L + ".closing.recap", "поле присутнє, але порожнє"); }
        if ("anchors" in b){
          if (!isArr(b.anchors)) wrn(L + ".anchors", "має бути масивом — ігнорується аналізом");
          else for (var a = 0; a < b.anchors.length; a++){
            var an = b.anchors[a], AL = L + ".anchors[" + a + "]";
            if (!isObj(an)){ wrn(AL, "запис не є об'єктом — ігнорується"); continue; }
            claimId(AL + ".id", an.id, "якір");
            checkText(AL, an.id, an.text, true);
            if (!filled(an.after_gate)) wrn(AL + ".after_gate", "не вказано, після якого шлюзу ставити якір");
          }
        }
      }
      stats.blockList.push(entry);
    }
    return finish();

    function checkText(loc, id, text, strict){
      if (!filled(text)){ err(loc + ".text", "текст питання порожній"); return; }
      var t = text.trim();
      if (["__proto__","prototype","constructor"].indexOf(id) >= 0) err(loc, "Зарезервований ідентифікатор");
      if (t.length > 300) style.long.push(filled(id) ? id : loc);
      if (t.slice(-1) !== "?") style.mark.push(filled(id) ? id : loc);
      if (/(^|[?.!\s])(чи\s+не|ви\s+(?:ніколи\s+)?не|вам\s+не|вас\s+не)\s+/i.test(t)) style.negative.push(filled(id) ? id : loc);
      if (strict && !/(^|[^А-Яа-яЁёЇїІіЄєҐґ'])В(и|ам|ас|ами|аш)/.test(t)) style.vy.push(filled(id) ? id : loc);
    }
    function styleWarnings(){
      emit(style.vy, "не звертаються до респондента на «Ви»");
      emit(style.mark, "не закінчуються знаком питання");
      emit(style.long, "довші за 300 символів");
      emit(style.negative, "містять заперечення основної дії; перевірте однозначність «так»/«ні»");
      function emit(list, what){
        if (!list.length) return;
        var head = list.slice(0, 4).join(", ");
        var tail = list.length > 4 ? " та інші" : "";
        wrn("тексти питань", list.length + " " + (list.length === 1 ? "питання " : "питань ") + what + ": " + head + tail);
      }
    }
    function finish(){
      styleWarnings();
      stats.minQuestions = stats.calibration + stats.gates + stats.closings;
      stats.maxQuestions = stats.minQuestions + stats.expansions;
      return { ok: errors.length === 0, errors: errors, warnings: warnings, stats: stats, hint: hint, data: data };
    }
  }
  return { run: run, SCHEMA: SCHEMA };
})();

function parseJson(raw){
  var text = String(raw).replace(/^\uFEFF/, "").trim();
  var fence = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(text);
  if (fence) text = fence[1].trim();
  if (!text) return { ok:false, loc:"файл", msg:"файл порожній" };
  try {
    var parsed = JSON.parse(text); assertSafeTree(parsed); return { ok:true, data: parsed };
  } catch(e){
    var m = /position (\d+)/.exec(e.message || "");
    var loc = "файл", extra = "";
    if (m){ var pos = +m[1], line = text.slice(0, pos).split("\n").length; loc = "рядок " + line;
      extra = " Поруч: " + JSON.stringify(text.substr(Math.max(0, pos - 30), 60)); }
    return { ok:false, loc:loc, msg:"файл не є коректним JSON." + extra };
  }
}

var STATE = { data:null, result:null, fileName:"" };
