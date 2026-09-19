/* ======================================================================
   Intake v4 — 04_stat.js
   Аналітика поведінкових патернів. Логіка ідентична 3.2 — переносимо
   як є, оскільки це "двигун", який свідомо не чіпаємо. Результат
   analyse(S).points[] містить score і why[] для кожного питання —
   саме звідси в звіті береться рівень значущості (перефарбування
   замість типу події виконано у 05_report.js, не тут).
   ====================================================================== */
"use strict";

var PI_STAT = (function(){
  var FLOOR = 0.35;

  function median(a){
    if (!a.length) return 0;
    var b = a.slice().sort(function(x,y){ return x-y; });
    var m = b.length >> 1;
    return b.length % 2 ? b[m] : (b[m-1]+b[m])/2;
  }
  function mad(a, med){
    if (a.length < 3) return 0;
    var d = []; for (var i=0;i<a.length;i++) d.push(Math.abs(a[i]-med));
    return median(d) * 1.4826;
  }

  /* Індивідуальна нормалізація за B0: перетин (моторна підлога) і мс/символ
     з калібрувального блоку. Лінійна регресія since ~ intercept + rate*len
     по калібрувальних питаннях (kind:"plain") з валідним timing. Якщо точок
     менше двох або рахунок вироджений — повертає null, і виклик норми
     відкочується на стару формулу Math.max(24,len). */
  function calibrationFit(S){
    var Q = S.questionnaire, ix = index(Q), map = ix.map;
    var xs = [], ys = [];
    for (var i=0;i<S.events.length;i++){
      var e = S.events[i];
      if (e.type!=="answer") continue;
      var q = map[e.q]; if (!q || q.kind!=="plain") continue;
      if (e.timingValid===false || !e.since) continue;
      xs.push(q.text.length); ys.push(e.since);
    }
    if (xs.length < 2) return null;
    var n = xs.length, sx=0, sy=0, sxx=0, sxy=0;
    for (i=0;i<n;i++){ sx+=xs[i]; sy+=ys[i]; sxx+=xs[i]*xs[i]; sxy+=xs[i]*ys[i]; }
    var denom = n*sxx - sx*sx;
    if (Math.abs(denom) < 1e-6) return null;
    var rate = (n*sxy - sx*sy) / denom;
    var intercept = (sy - rate*sx) / n;
    if (rate <= 0 || intercept < 0) return null;
    return { intercept:intercept, rate:rate, n:n };
  }

  function index(Q){
    var map = {}, order = [], blockOf = {};
    for (var i=0;i<Q.blocks.length;i++){
      var b = Q.blocks[i], j, k;
      function put(q, kind, gate){
        map[q.id] = { id:q.id, text:q.text, kind:kind, block:b.id, blockIndex:i, gate:gate||null,
          baseline:q.baseline_yes||(kind==="gate"?"medium":"high"), relevant:!!q.relevant_candidate,
          loadProfile:q.load_profile||null };
        blockOf[q.id] = b.id; order.push(q.id);
      }
      if (b.questions) for (j=0;j<b.questions.length;j++) put(b.questions[j],"plain");
      if (b.gates) for (j=0;j<b.gates.length;j++){
        put(b.gates[j],"gate");
        for (k=0;k<b.gates[j].expansion.length;k++) put(b.gates[j].expansion[k],"expansion",b.gates[j].id);
      }
      if (b.anchors) for (j=0;j<b.anchors.length;j++) put(b.anchors[j],"anchor");
      if (b.closing) put(b.closing,"closing");
    }
    return { map:map, order:order, blockOf:blockOf };
  }

  var ACTIVE = { answer:1, change:1, write:1, write_end:1, erase:1, expand:1, collapse:1, review:1, attention:1, block_return:1 };
  function activeUntil(S){
    var t = 0;
    for (var i=0;i<S.events.length;i++)
      if (ACTIVE[S.events[i].type] && !(S.events[i].type==="block_return" && S.events[i].initiator!=="respondent") && S.events[i].t>t) t = S.events[i].t;
    return t;
  }
  function lastEvent(S){ var t=0; for (var i=0;i<S.events.length;i++) if (S.events[i].t>t) t=S.events[i].t; return t; }
  function countValue(rec,v){ var n=0; for (var k in rec) if (rec[k].value===v) n++; return n; }
  function countChanges(rec){ var n=0; for (var k in rec) n+=rec[k].changes; return n; }
  function countAfter(rec){ var n=0; for (var k in rec) if (rec[k].afterExpand) n++; return n; }
  function countCollapsedEmpty(c){ var n=0; for (var k in c) if (!c[k].answered) n++; return n; }

  /* Ефективний spread бази з поправкою на малу вибірку — див. коментар
     біля першого використання в analyse(). Винесено в спільну функцію,
     щоб points[] і sequence[] завжди рахували z однаково. */
  function effectiveSpread(bl){
    var sampleCorrection = 1 - 3/(4*bl.n - 5);
    return bl.spread / Math.max(sampleCorrection, 0.5);
  }

  function analyse(S){
    var Q = S.questionnaire, ix = index(Q), map = ix.map;
    var rec = {}, expandAt = {}, collapsed = {}, marks = {}, damped = {}, attention = {}, returns = {};
    var seq = [], blanks = {}, firstOfBlock = {};

    for (var mi=0; mi<(S.marks||[]).length; mi++){
      var mk = S.marks[mi]; if (mk.withdrawn_at) continue;
      (marks[mk.q] = marks[mk.q]||[]).push(mk.mark);
      if (mk.kind==="noise" || mk.kind==="technical" || mk.mark==="перешкода" || mk.mark==="заминка з технікою") damped[mk.q] = true;
    }

    for (var i=0;i<S.events.length;i++){
      var e = S.events[i];
      if (e.type==="answer" || e.type==="change"){
        var r = rec[e.q] || (rec[e.q] = { value:null, since:0, at:0, changes:0, afterExpand:false });
        r.value = e.value; r.at = r.firstAt===undefined ? e.t : r.firstAt; r.lastAt = e.t;
        if (e.type==="answer"){
          r.since = e.since||0; r.firstAt = e.t; r.timingValid = e.timingValid!==false; r.damped = !!damped[e.q];
          seq.push(e.q);
          var bq = map[e.q] && map[e.q].block;
          if (bq && !firstOfBlock[bq]){ firstOfBlock[bq] = e.q; r.timingValid = false; }
        } else {
          r.changes++; r.timingValid = false;
          var g = map[e.q] && map[e.q].kind==="gate" ? e.q : (map[e.q] ? map[e.q].gate : null);
          if (g && expandAt[g]!==undefined && e.t>expandAt[g]) r.afterExpand = true;
        }
      }
      else if (e.type==="expand") expandAt[e.q] = e.t;
      else if (e.type==="collapse") collapsed[e.q] = { answered:e.answered, wrote:e.wrote, t:e.t };
      else if (e.type==="no_explanation"){
        for (var k=0;k<(e.gates||[]).length;k++) if (blanks[e.gates[k]]!=="before") blanks[e.gates[k]] = e.afterReminder ? "after" : "before";
      }
      else if (e.type==="attention" && map[e.q]) (attention[e.q]=attention[e.q]||[]).push(e);
      else if (e.type==="block_return" && e.initiator==="respondent" && map[e.q]) (returns[e.q]=returns[e.q]||[]).push(e);
    }

    var fit = calibrationFit(S);
    var norm = {};
    for (var qid in rec){
      var q = map[qid]; if (!q) continue;
      if (!rec[qid].timingValid || damped[qid]){ norm[qid] = 0; continue; }
      if (fit) {
        var expected = fit.intercept + fit.rate * q.text.length;
        norm[qid] = rec[qid].since / Math.max(expected, fit.intercept*FLOOR + 1, 1);
      } else {
        norm[qid] = rec[qid].since / Math.max(24, q.text.length);
      }
    }
    var base = {};
    for (var bi=0;bi<Q.blocks.length;bi++){
      var bid = Q.blocks[bi].id, vals = [];
      for (var qq in rec){
        if (!map[qq] || map[qq].block!==bid) continue;
        if (rec[qq].value!=="no" || damped[qq] || firstOfBlock[bid]===qq) continue;
        if (norm[qq]>0) vals.push(norm[qq]);
      }
      var med = median(vals), spread = mad(vals, med);
      base[bid] = { median:med, spread:Math.max(spread, med*FLOOR, 0.02), n:vals.length };
    }
    var jumps = {};
    for (var si=1;si<seq.length;si++){
      var a = ix.order.indexOf(seq[si-1]), b2 = ix.order.indexOf(seq[si]);
      if (b2<a) jumps[seq[si]] = true;
    }
    /* Виявлення "автоматичного клацання ні поспіль" після першого
       розкриття блоку. Раніше: (а) спрацьовувало лише коли АБСОЛЮТНО
       всі залишкові шлюзи блоку до єдиного стали "ні" — часткова серія
       (респондент почав клацати автоматично не з першого, а, скажімо,
       з п'ятого залишкового питання) взагалі не виявлялась; (б) навіть
       коли спрацьовувало, позначало бал і причину лише на ПЕРШОМУ
       питанні знайденої серії, хоча однаковою мірою бездумною
       поведінка була на кожному питанні цієї серії. Тепер: шукаємо
       найдовшу підряд послідовність "ні" довжиною від MIN_RUN і
       позначаємо runFlag на КОЖНОМУ її питанні, зі спільною довжиною
       серії в поясненні. */
    var MIN_RUN = 4;
    var runFlag = {};
    Q.blocks.forEach(function(blk){
      if (!blk.gates) return;
      var expandIndex = S.events.findIndex(function(e){ return e.type==="expand" && map[e.q] && map[e.q].block===blk.id; });
      if (expandIndex<0) return;
      var remaining = blk.gates.filter(function(g){ return !S.events.slice(0,expandIndex+1).some(function(e){ return e.type==="answer" && e.q===g.id; }); });
      if (remaining.length<MIN_RUN) return;
      var responses = S.events.slice(expandIndex+1).filter(function(e){ return e.type==="answer" && remaining.some(function(g){ return g.id===e.q; }); });
      var run = [];
      for (var ri=0; ri<=responses.length; ri++){
        var isNo = ri<responses.length && responses[ri].value==="no" && rec[responses[ri].q] && rec[responses[ri].q].value==="no";
        if (isNo) run.push(responses[ri].q);
        else {
          if (run.length>=MIN_RUN) run.forEach(function(qid){ runFlag[qid] = run.length; });
          run = [];
        }
      }
    });
    /* База порівняння для кожного питання: медіана+MAD часу реакції на
       попередні "ні"-відповіді того самого блоку. Раніше змішувала
       шлюзи й уточнення будь-якого навантаження в одну вибірку —
       всупереч власній документації поля load_profile ("зіставляти
       шлюзи за навантаженням, а не порівнювати шлюзи різної
       складності напряму"). Тепер: спершу пробуємо вузьку базу з тим
       самим answer_effort (floor/low в одну групу, medium/high — в
       іншу, бо перша пара — короткі, майже автоматичні відповіді,
       друга — ті, що вимагають реального читання чи пригадування);
       якщо звужена вибірка замала (n<3, той самий поріг довіри, що
       вже застосований у dataQuality.lowBaseQuestions), відкочуємось
       на повну базу блоку без фільтра — це і є поведінка "до
       виправлення", лишена як безпечний резерв, а не спроба видавати
       ненадійну вузьку вибірку за кращу. */
    function effortGroup(qid){
      var lp = (map[qid] && map[qid].loadProfile) || null;
      var e = lp && lp.answer_effort;
      if (e==="floor" || e==="low") return "light";
      if (e==="medium" || e==="high") return "heavy";
      return null;
    }
    var bases = {};
    var BASE_WINDOW = 9; /* Ковзне вікно останніх N "ні"-відповідей блоку.
       Це інженерне, не наукове число: мета — стабілізувати базу проти
       дрейфу готовності відповідати всередині довгого (до 10 шлюзів)
       блоку за 20-30-хвилинну сесію, не даючи базі "розмиватись"
       відповідями з початку блоку, коли усереднення за ВСІМА
       попередніми відповідями. Наукового обґрунтування саме числа 9 в
       літературі з RT-CIT/аналізу поведінкових даних не знайдено —
       якщо накопичиться достатньо реальних сесій, це число варто
       підібрати емпірично (порівнюючи стабільність z-показника при
       різних розмірах вікна), а не лишати як довільну константу. */
    Object.keys(rec).forEach(function(id){
      var m = map[id]; if (!m) return;
      var eg = effortGroup(id);
      function collect(matchEffort){
        return Object.keys(rec).filter(function(k){
          if (!map[k] || map[k].block!==m.block) return false;
          if (matchEffort && effortGroup(k)!==eg) return false;
          return rec[k].firstAt<rec[id].firstAt && rec[k].value==="no" && rec[k].timingValid && !damped[k] && norm[k]>0;
        }).sort(function(a,b){ return rec[a].firstAt-rec[b].firstAt; }).slice(-BASE_WINDOW).map(function(k){ return norm[k]; });
      }
      var vals = eg ? collect(true) : [];
      if (vals.length < 3) vals = collect(false);
      var med = median(vals);
      bases[id] = { median:med, spread:Math.max(mad(vals,med), med*FLOOR, 0.02), n:vals.length };
    });

    var out = [];
    for (var id in rec){
      var m = map[id]; if (!m || m.kind==="anchor") continue;
      /* kind==="plain" (звичайне калібрувальне питання B0, не шлюз) —
         свідомо виключене з поведінкового аналізу: калібрувальні питання
         нейтральні за задумом і не мають ставати "точками уваги" через
         латентність чи зміну відповіді. Але якщо респондент натиснув
         "?" саме на такому питанні — цей факт не про поведінковий
         аналіз, а про якість самої формулировки в конкретному пункті
         B0, і мовчки губити його тут (як робилось раніше, суцільним
         continue на plain) означало б, що частина сигналів "не
         зрозумів" ніколи не долетить до поліграфолога залежно від
         типу питання, на якому респондент її поставив — довільна,
         не мотивована різниця з погляду самого функціоналу кнопки.
         Тому: plain-питання без confused пропускаються як і раніше;
         plain-питання З confused проходять напряму в "тиху" картку
         нижче, минаючи всю решту (латентність/зміни/бали), яка для
         plain і не мала рахуватись. */
      if (m.kind === "plain"){
        if (S.confused && S.confused[id])
          out.push({ id:id, text:m.text, block:m.block, blockIndex:m.blockIndex, at:rec[id].at, kind:m.kind, gate:null,
            value:rec[id].value, score:0, machine:0, damped:false, why:[], marks:[], relevantCandidate:false, confused:true });
        continue;
      }
      var r = rec[id], why = [], score = 0, machine = 0, ov = null;
      /* maxSingle: найбільший ОДИН внесок серед усіх спрацьованих
         причин цього питання — потрібен нижче, щоб відрізнити "одне
         сильне, зосереджене вагання" від "кілька дрібних сигналів, що
         випадково зійшлися". Формула цього раніше не розрізняла:
         питання з одним w_lat_high (+3, реальна тривала пауза — сильний,
         зосереджений сигнал) і питання з трьома незалежними +1 (кожен
         окремо міг бути шумом — стилус торкнувся екрана, зміна порядку,
         повернення до блоку) отримували однаковий підсумковий machine=3,
         хоча перше набагато довірливіше. add() трекає це прозоро для
         кожного виклику, не змінюючи саму суму machine. */
      var maxSingle = 0;
      function add(delta, key, params){ machine += delta; if (delta > maxSingle) maxSingle = delta; why.push(T(key, params)); }

      if (damped[id]){
        out.push({ id:id, text:m.text, block:m.block, blockIndex:m.blockIndex, at:r.at, kind:m.kind, gate:m.gate,
          value:r.value, score:0, machine:0, damped:true, why:[T("w_damped",{m:marks[id].join(", ")})], marks:marks[id]||[] });
        continue;
      }
      var bl = bases[id], z = 0;
      if (bl && bl.n>=3 && norm[id]>0){
        /* MAD на малих вибірках систематично занижує справжню дисперсію
           (Akinshin, 2022; Rousseeuw & Croux, 1993) — константа 1.4826
           асимптотична, коректна лише для великих n. З заниженим spread
           z-показник виходить завищеним саме там, де база найменш
           надійна (n тільки-но перетнуло поріг 3) — це системно підвищує
           хибнопозитивні спрацювання на бідній базі. Компенсуємо
           за аналогією з поправкою Хеджа на малу вибірку (той самий
           клас систематичного зміщення, що й у стандартизованої різниці
           середніх): ділимо на (1 - 3/(4n-5)), що для n=3 збільшує
           ефективний spread на ~23%, а до n≈15 ефект стає малопомітним. */
        var effSpread = effectiveSpread(bl);
        z = (norm[id]-bl.median)/effSpread;
        var first = firstOfBlock[m.block]===id;
        if (first){ if (z>=2.5) add(1, "w_block_pause", {z:z.toFixed(1)}); }
        else if (z>=2.5) add(3, "w_lat_high", {z:z.toFixed(1)});
        else if (z>=1.5) add(2, "w_lat", {z:z.toFixed(1)});
      }
      /* w_change: раніше фіксований +2 незалежно від r.changes, хоча
         текст пояснення й так показував реальне число ("змінював
         відповідь {n} раз") — тобто респондент, що передумав 1 раз, і
         той, що передумав 5 разів, отримували однаковий внесок у бал,
         а текст обіцяв градацію, якої не було в самій математиці.
         Тепер перша зміна важить найбільше (+2, сам факт передумати
         вже сигнал), кожна наступна додає менше (+1, спадна гранична
         вага — друга й треті зміни підтверджують перше вагання, не
         є настільки ж новою інформацією кожна окремо) до стелі +5:
         далі це вже, найімовірніше, технічна незручність інтерфейсу
         чи звичка респондента "передумувати", а не зростаюча стратегічна
         вага, і необмежене накопичення бала за це було б нічим не
         обґрунтованим. */
      if (r.changes>0){
        if (r.afterExpand) add(4, "w_change_after");
        else add(Math.min(2 + (r.changes-1), 5), "w_change", {n:r.changes});
      }
      if (m.kind==="gate" && collapsed[id] && !collapsed[id].answered) add(3, "w_collapsed");
      if (m.kind==="gate" && r.value==="explain" && blanks[id]==="before") add(2, "w_blank");
      if (jumps[id]) add(1, "w_jump");
      if (attention[id] && attention[id].length) add(1, "w_attention", {n:attention[id].length});
      if (returns[id] && returns[id].length) add(1, "w_return");
      if (runFlag[id]) add(2, "w_run", {n:runFlag[id]});
      /* w_yes: "так" на шлюзі, де це не було очікуваним ЗА РІВНЕМ
         ОЧІКУВАНОСТІ САМОЇ ВІДПОВІДІ (baseline_yes), а не за тим, чи
         питання окремо позначене relevant_candidate — це дві РІЗНІ
         методичні властивості: перша про рідкість конкретної відповіді
         (узгоджено з теорією конфлікту реакції в RT-CIT дослідженнях,
         Verschuere et al.; огляд Suchotzki et al., 2017 — затримка й
         реактивність зростають там, де відповідь суперечить очікуваній
         нормі), друга — про важливість самого питання для тесту на
         поліграфі, незалежно від того, наскільки очікуваною була
         відповідь на нього. Раніше m.relevant теж розблоковував цю
         умову напряму — тобто на "так" питання з baseline_yes:"high"
         (де "так" за визначенням очікуване, жодного конфлікту реакції
         немає) однаково нараховувався w_yes лише через relevant_candidate,
         а потім ще +1 окремо через w_relevant нижче — той самий факт
         релевантності рахувався двічі різними формулюваннями в тому
         самому звіті. Тепер: relevant_candidate впливає ЛИШЕ через
         w_relevant нижче, w_yes — лише через реальну рідкість відповіді. */
      if (r.value==="yes" && (m.baseline!=="high" || m.kind==="closing")){
        if (m.baseline==="low") add(2, "w_yes_rare");
        else add(1, "w_yes");
      }
      /* w_relevant: сам факт relevant_candidate додавав бал лише коли
         вже є інший сигнал (machine>0) — якщо відповідь на релевантне
         питання минула зовсім спокійно, факт релевантності повністю
         зникав із звіту, хоча промпт генерації прямо позначає такі
         шлюзи як методично важливі кандидати для самого тесту на
         поліграфі. Лишаємо бал умовним (не додаємо бали "нізвідки"
         для спокійної відповіді — це і далі методичний вибір, не
         помилка), але тепер separately фіксуємо сам факт у полі
         relevantCandidate точки, щоб поліграфолог бачив позначку
         навіть за відсутності інших сигналів. */
      if (m.relevant && machine>0) add(1, "w_relevant");
      if (r.value==="declined" || r.value==="na"){ machine=0; maxSingle=0; why=[]; }
      /* Стеля на АВТОМАТИЧНУ частину бала (machine), до override і
         ручних міток поліграфолога нижче: раніше сума незалежних
         сигналів не мала верхньої межі, тоді як теплова шкала карти
         (06_report.js, HEAT_MAX=8) і найвищий рівень бейджа
         ("Критично значуще" з score>=8) насичуються значно раніше.
         Питання з machine=9 і питання з machine=25 виглядали б
         однаково темно-червоними на карті — різниця масштабу губилася
         саме там, де вона могла б бути найкориснішою: у найгостріших
         випадках.
         MACHINE_CAP=16, не 20: перша спроба (20) виявилась практично
         недосяжною під час unit-тестування — w_lat_high (+3) і
         w_change_after (+4), два найважчі окремі внески, СТРУКТУРНО
         взаємовиключні на одному питанні (зміна відповіді ставить
         r.timingValid=false, після чого norm[id]=0 і вся гілка
         латентності вимкнена для цього id назавжди в цьому проході —
         не збіг тестових даних, а властивість самої формули). Реальний
         теоретичний максимум однієї сумісної комбінації (w_change_after
         АБО w_lat_high, не обидва одразу, плюс усе інше: collapsed,
         blank, jump, attention, return, run, yes_rare, relevant) — 17.
         16 — трохи нижче цього стелі, щоб вона реально могла іноді
         спрацьовувати на справді екстремальному, але досяжному збігу,
         а не бути суто теоретичною гарантією, яка ніколи не активується.
         Ручне рішення поліграфолога (override, мітки нижче) — свідоме
         судження людини, не автоматична сума, тому воно НЕ обмежується
         цією стелею: якщо поліграфолог зважено підняв питання вище,
         це не те саме, що формула, яка просто накопичила багато
         дрібниць. */
      var MACHINE_CAP = 16;
      if (machine > MACHINE_CAP) machine = MACHINE_CAP;
      score = machine;

      /* concentrated: чи підсумковий бал зібраний переважно ОДНИМ
         сильним сигналом, а не кількома дрібними, що випадково зійшлися.
         Поріг 60% — інженерний вибір, не каліброване число (як і
         BASE_WINDOW вище): при machine=3 з одного w_lat_high (+3) це
         100% від одного джерела — явно концентровано; при machine=3 з
         трьох незалежних +1 (jump, attention, return) кожен окремо дає
         лише 33% — явно розмазано. Респондент, застряглий рівно
         посередині (наприклад один сигнал +2 із загальних +3, 67%),
         має свідомо піти в "концентровано": коли одна причина вже сама
         по собі становить більшість бала, застереження про "можливо
         випадковий збіг" тут менш доречне, ніж коли жодна причина
         поодинці навіть не наближається до половини. Це нова, суто
         інформаційна позначка для деталь-картки — не впливає ні на сам
         score, ні на сортування чи top[]. */
      var concentrated = machine > 0 && (maxSingle / machine) >= 0.6;

      ov = (S.overrides||{})[id];
      if (ov){ score += (ov.dir==="up"?6:-6); why.push(T("o_applied",{dir:T(ov.dir==="up"?"o_up_word":"o_down_word"),why:ov.why})); }

      var mk2 = marks[id]||[];
      if (mk2.length){ score += 3*mk2.length; why.push(T(machine>0?"w_mark_confirm":"w_mark_only",{m:mk2.join(", ")})); }
      if (score<0) score = 0;

      if (score>0 || ov)
        out.push({ id:id, text:m.text, block:m.block, blockIndex:m.blockIndex, at:r.at, kind:m.kind, gate:m.gate,
          value:r.value, score:score, machine:machine, damped:false, why:why, marks:mk2, relevantCandidate:!!m.relevant,
          confused:!!(S.confused && S.confused[id]), concentrated:concentrated });
      else if (m.relevant || (S.confused && S.confused[id]))
        /* Релевантне питання без жодного поведінкового сигналу: раніше
           зникало зі звіту повністю — поліграфолог не міг дізнатися
           навіть постфактум, що анкета вважала цей шлюз кандидатом для
           тесту. score:0 тут навмисний і не впливає на сортування чи
           top[] (обидва фільтрують/сортують за score); картка лишається
           доступною лише через повну карту питань, як нейтральна
           інформація "це кандидат, відповідь минула спокійно".
           Той самий принцип для confused: респондент, який чесно
           попросив уточнення питання (кнопка "?" на 03_fill.js, окрема
           від самої відповіді так/ні/поясню), — це прохання про
           допомогу, не поведінкова аномалія. Додавати йому бал
           значущості було б методично неправильно — карати за чесний
           сигнал незрозумілості. Тому й тут score:0, лише видимість у
           звіті через прапорець confused, щоб поліграфолог знав, яке
           саме формулювання варто буде пояснити в передтестовій
           бесіді, а не намагався вгадувати це заднім числом. */
        out.push({ id:id, text:m.text, block:m.block, blockIndex:m.blockIndex, at:r.at, kind:m.kind, gate:m.gate,
          value:r.value, score:0, machine:0, damped:false, why:[], marks:[], relevantCandidate:!!m.relevant,
          confused:!!(S.confused && S.confused[id]) });
    }

    var scoreOf = {}; for (var pi2=0;pi2<out.length;pi2++) scoreOf[out[pi2].id] = out[pi2];
    var sequence = [];
    for (var sj=0;sj<seq.length;sj++){
      var qid2 = seq[sj], mm = map[qid2]; if (!mm) continue;
      var bb = bases[qid2], zz = 0;
      if (bb && bb.n>=3 && norm[qid2]>0) zz = (norm[qid2]-bb.median)/effectiveSpread(bb);
      var pnt = scoreOf[qid2];
      sequence.push({ id:qid2, block:mm.block, blockIndex:mm.blockIndex, kind:mm.kind, value:rec[qid2].value, at:rec[qid2].at,
        z: firstOfBlock[mm.block]===qid2 ? 0 : zz, timingAvailable: !!bb && bb.n>=3 && norm[qid2]>0,
        score: pnt ? pnt.score : 0, damped: !!damped[qid2], changed: rec[qid2].changes>0,
        expanded: expandAt[qid2]!==undefined, marked: (marks[qid2]||[]).length>0 });
    }
    out.sort(function(a,b){ return b.score-a.score || a.at-b.at; });

    var lonely = [];
    for (var oi=0;oi<out.length;oi++) if (out[oi].marks.length && out[oi].machine===0 && !out[oi].damped) lonely.push(out[oi]);

    var basesLowN = [];
    for (var bnid in bases) if (bases[bnid].n < 3) basesLowN.push(bnid);

    return {
      records:rec, index:map, localBases:bases,
      dataQuality: { calibrationFit: fit ? { intercept:fit.intercept, rate:fit.rate, n:fit.n } : null, lowBaseQuestions: basesLowN },
      sequence:sequence,
      blocks: Q.blocks.map(function(b){
        var gates = (b.gates||[]).map(function(g){
          return { id:g.id, text:g.text, value: rec[g.id]?rec[g.id].value:null, opened: expandAt[g.id]!==undefined,
            expansion: g.expansion.map(function(x){ return { id:x.id, text:x.text, value: rec[x.id]?rec[x.id].value:null }; }) };
        });
        var anchors = (b.anchors||[]).map(function(a){
          return { id:a.id, text:a.text, value: rec[a.id]?rec[a.id].value:null, after_gate:a.after_gate||null };
        });
        return { id:b.id, title:b.title, type:b.type, gates:gates.length, list:gates, anchors:anchors,
          closing: b.closing ? { id:b.closing.id, value: rec[b.closing.id]?rec[b.closing.id].value:null } : null };
      }),
      stats: {
        answered: seq.length,
        reviews: S.events.filter(function(e){ return e.type==="review"; }).length,
        attention: S.events.filter(function(e){ return e.type==="attention"; }).length,
        respondentReturns: S.events.filter(function(e){ return e.type==="block_return" && e.initiator==="respondent"; }).length,
        examinerReturns: S.events.filter(function(e){ return e.type==="block_return" && e.initiator!=="respondent"; }).length,
        declined: countValue(rec,"declined"), na: countValue(rec,"na"),
        yes: countValue(rec,"yes"), explain: countValue(rec,"explain"), no: countValue(rec,"no"),
        expands: Object.keys(expandAt).length, collapsedEmpty: countCollapsedEmpty(collapsed),
        changes: countChanges(rec), changesAfter: countAfter(rec),
        jumps: Object.keys(jumps).length, blanks: Object.keys(blanks).length,
        damped: Object.keys(damped).length, marks: (S.marks||[]).filter(function(m){ return !m.withdrawn_at; }).length,
        duration: S.elapsedMs===undefined ? activeUntil(S) : S.elapsedMs,
        idleTail: Math.max(0, lastEvent(S)-activeUntil(S))
      },
      points: out,
      top: out.filter(function(p){ return !p.damped && p.score>0; }).slice(0,5),
      lonely: lonely, base: base, pen: S.pen||{}, counted: Object.keys(rec).length
    };
  }
  return { analyse:analyse, index:index, calibrationFit:calibrationFit };
})();
