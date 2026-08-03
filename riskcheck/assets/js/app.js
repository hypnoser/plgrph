// RiskCheck 2.0 — PLGRPH by Serhii Korzhov
(function(){
'use strict';

// ===== STATE =====
var state={mode:null,pos:null,answers:[],path:[],qIndex:0,currentQ:null,tree:null,calc:{}};
var CURRENCY={USD:'$',EUR:'€',UAH:'₴'};

// ===== TREES (embedded for zero CORS issues on GitHub Pages) =====
var TREES={
CFO:{
start:'cfo_r1',
questions:{
cfo_r1:{text:"Чи є в резюме розрив у стажі більше 6 місяців?",cluster:0,strength:'moderate',opts:{yes:{next:'cfo_r2',scores:[8,0,0,0,0]},no:{next:'cfo_r3',scores:[0,0,0,0,0]},unsure:{next:'cfo_r3',scores:[3,0,0,0,0]}}},
cfo_r2:{text:"Чи пояснення розриву підтверджене документально (довідка, запис у трудовій)?",cluster:0,strength:'strong',opts:{yes:{next:'cfo_f1',scores:[2,0,0,0,0]},no:{next:'cfo_r4',scores:[12,0,0,0,0]},unsure:{next:'cfo_r4',scores:[8,0,0,0,0]}}},
cfo_r3:{text:"Чи всі дати та посади в резюме збігаються з LinkedIn або іншими джерелами?",cluster:0,strength:'strong',opts:{yes:{next:'cfo_f1',scores:[0,0,0,0,0]},no:{next:'cfo_f1',scores:[15,0,0,0,0]},unsure:{next:'cfo_f1',scores:[6,0,0,0,0]}}},
cfo_r4:{text:"Чи пояснення розриву звучить шаблонно ('подорожував', 'час для себе', 'навчався')?",cluster:0,strength:'moderate',opts:{yes:{next:'cfo_f1',scores:[10,0,0,0,0]},no:{next:'cfo_f1',scores:[4,0,0,0,0]},unsure:{next:'cfo_f1',scores:[5,0,0,0,0]}}},
cfo_f1:{text:"Коли ви запитали про фінансову дисципліну на попередній посаді, чи змінився тон голосу кандидата?",cluster:1,strength:'weak',opts:{yes:{next:'cfo_f2',scores:[0,14,0,0,0]},no:{next:'cfo_f2',scores:[0,0,0,0,0]},unsure:{next:'cfo_f2',scores:[0,5,0,0,0]}}},
cfo_f2:{text:"Чи кандидат уникав прямої відповіді на питання про причини звільнення, роблячи паузу >2 сек?",cluster:1,strength:'moderate',opts:{yes:{next:'cfo_b1',scores:[0,10,0,5,0]},no:{next:'cfo_b1',scores:[0,0,0,0,0]},unsure:{next:'cfo_b1',scores:[0,4,0,2,0]}}},
cfo_b1:{text:"Чи кандидат реагував емоційно (дратівливо, агресивно) на питання про внутрішній аудит?",cluster:3,strength:'moderate',opts:{yes:{next:'cfo_s1',scores:[0,8,0,12,0]},no:{next:'cfo_s1',scores:[0,0,0,0,0]},unsure:{next:'cfo_s1',scores:[0,3,0,5,0]}}},
cfo_s1:{text:"Чи кандидат проявляв зацікавленість у доступі до банківських рахунків чи підпису ще до оферу?",cluster:4,strength:'strong',opts:{yes:{next:'cfo_rep1',scores:[0,0,0,0,18]},no:{next:'cfo_rep1',scores:[0,0,0,0,0]},unsure:{next:'cfo_rep1',scores:[0,0,0,0,6]}}},
cfo_rep1:{text:"Чи референси, які надав кандидат — це лише підлеглі, а не керівники чи партнери?",cluster:2,strength:'strong',opts:{yes:{next:'END',scores:[0,0,10,0,0]},no:{next:'END',scores:[0,0,0,0,0]},unsure:{next:'END',scores:[0,0,4,0,0]}}}
}
},
CEO:{
start:'ceo_r1',
questions:{
ceo_r1:{text:"Чи біографія кандидата виглядає 'надто ідеально' — жодних провалів, лише успіхи?",cluster:0,strength:'moderate',opts:{yes:{next:'ceo_r2',scores:[12,0,0,0,0]},no:{next:'ceo_f1',scores:[0,0,0,0,0]},unsure:{next:'ceo_r2',scores:[5,0,0,0,0]}}},
ceo_r2:{text:"Чи кандидат не міг назвати конкретні метрики досягнень (виручка, EBITDA, зростання команди)?",cluster:0,strength:'strong',opts:{yes:{next:'ceo_f1',scores:[10,0,0,0,0]},no:{next:'ceo_f1',scores:[0,0,0,0,0]},unsure:{next:'ceo_f1',scores:[4,0,0,0,0]}}},
ceo_f1:{text:"Чи кандидат уникав обговорення невдач, перекладаючи провину на зовнішні обставини?",cluster:1,strength:'moderate',opts:{yes:{next:'ceo_b1',scores:[0,8,0,10,0]},no:{next:'ceo_b1',scores:[0,0,0,0,0]},unsure:{next:'ceo_b1',scores:[0,3,0,4,0]}}},
ceo_b1:{text:"Чи кандидат робив мікропаузи перед відповідями на питання про стратегічні рішення?",cluster:3,strength:'weak',opts:{yes:{next:'ceo_s1',scores:[0,0,0,8,0]},no:{next:'ceo_s1',scores:[0,0,0,0,0]},unsure:{next:'ceo_s1',scores:[0,0,0,3,0]}}},
ceo_s1:{text:"Чи є у кандидата зв'язки з компаніями-конкурентами, які могли б створити конфлікт інтересів?",cluster:4,strength:'strong',opts:{yes:{next:'ceo_rep1',scores:[0,0,0,0,15]},no:{next:'ceo_rep1',scores:[0,0,0,0,0]},unsure:{next:'ceo_rep1',scores:[0,0,0,0,5]}}},
ceo_rep1:{text:"Чи є у публічних джерелах судові справи, скарги або банкрутства, пов'язані з кандидатом?",cluster:2,strength:'strong',opts:{yes:{next:'END',scores:[0,0,18,0,0]},no:{next:'END',scores:[0,0,0,0,0]},unsure:{next:'END',scores:[0,0,6,0,0]}}}
}
}
};

// Generic fallback for other positions
['COMM','PROC','HRD','CTO'].forEach(function(p){TREES[p]=TREES.CFO;});

// ===== COSTS =====
var COST_RANGES={
CFO:[180000,420000],CEO:[220000,520000],COMM:[110000,260000],PROC:[140000,330000],HRD:[90000,220000],CTO:[120000,280000]
};
var BASE_MULTIPLIERS={CFO:2.8,CEO:3.2,COMM:2.2,PROC:2.5,HRD:1.8,CTO:2.0};
var POLY_COST={USD:'$800–1500',EUR:'€750–1400',UAH:'₴32000–60000'};

// ===== ROUTING =====
function goTo(id){
document.querySelectorAll('.rc-step').forEach(function(s){s.classList.remove('active');});
var t=document.getElementById('rc-'+id);if(t)t.classList.add('active');
window.scrollTo(0,0);
}
document.querySelectorAll('[data-goto]').forEach(function(el){
el.addEventListener('click',function(){goTo(this.getAttribute('data-goto'));});
});

// ===== CALCULATOR =====
document.getElementById('btn-calc').addEventListener('click',function(){
var pos=document.getElementById('calc-pos').value;
var salary=parseInt(document.getElementById('calc-salary').value)||0;
var ind=parseFloat(document.getElementById('calc-ind').value)||1;
var team=parseInt(document.getElementById('calc-team').value)||0;
var currency=document.getElementById('calc-currency').value;
var travel=document.getElementById('calc-travel').checked;
var sym=CURRENCY[currency]||'$';

var teamFactor=1+(team*0.015);
var low=Math.round(salary*(BASE_MULTIPLIERS[pos]||2)*0.7*ind*teamFactor);
var high=Math.round(salary*(BASE_MULTIPLIERS[pos]||2)*1.4*ind*teamFactor);
var mid=Math.round((low+high)/2);

var polyText=POLY_COST[currency]||POLY_COST.USD;
var roi=(mid/1150).toFixed(0); // using mid-point of poly cost

document.getElementById('calc-total').textContent=sym+low.toLocaleString()+' – '+sym+high.toLocaleString();
document.getElementById('calc-context').textContent='Для посади '+pos+' з річним фондом '+sym+salary.toLocaleString()+' та командою '+team+' осіб. Діапазон залежить від швидкості виявлення проблеми та галузевих ризиків.';
document.getElementById('poly-cost').textContent=polyText;
document.getElementById('calc-roi').textContent='ROI захисту (середня оцінка): '+roi+'x';
document.getElementById('calc-travel-note').style.display=travel?'block':'none';

state.calc={pos:pos,low:low,high:high,mid:mid,roi:roi,currency:currency,sym:sym,salary:salary,travel:travel};
goTo('s2');
});

document.getElementById('btn-calc-to-assess').addEventListener('click',function(){goTo('s4');});

// ===== POSITION SELECT =====
document.querySelectorAll('[data-pos]').forEach(function(card){
card.addEventListener('click',function(){
var pos=this.getAttribute('data-pos');
state.pos=pos;state.answers=[];state.path=[];state.qIndex=0;
state.tree=TREES[pos];
state.currentQ=state.tree.start;
document.querySelectorAll('.rc-pos-card').forEach(function(c){c.classList.remove('selected');});
this.classList.add('selected');
setTimeout(function(){goTo('s5');renderQ();},200);
});
});

document.getElementById('btn-reset-assess').addEventListener('click',function(){
state={mode:null,pos:null,answers:[],path:[],qIndex:0,currentQ:null,tree:null,calc:state.calc};
goTo('s4');
});

// ===== QUESTIONS =====
function renderQ(){
var q=state.tree.questions[state.currentQ];
if(!q||state.currentQ==='END'){showReport();return;}
var totalQ=6;
var pct=Math.min(95,Math.round((state.qIndex/totalQ)*100));
document.getElementById('q-bar').style.width=pct+'%';
var clusters=['Резюме-ризик','Фінансовий ризик','Репутаційний ризик','Поведінковий ризик','Безпековий ризик'];
var strengthLabels={strong:'Сильний маркер',moderate:'Середній маркер',weak:'Додатковий маркер'};
var strengthClasses={strong:'rc-signal-strong',moderate:'rc-signal-moderate',weak:'rc-signal-weak'};
var container=document.getElementById('q-container');
container.innerHTML='<div class="rc-q-card"><div class="rc-q-meta">Питання '+(state.qIndex+1)+' · '+clusters[q.cluster]+'<span class="rc-signal-badge '+strengthClasses[q.strength]+'">'+strengthLabels[q.strength]+'</span></div><div class="rc-q-text">'+q.text+'</div><div class="rc-opt-row"><button class="rc-opt-btn" data-ans="yes">Так</button><button class="rc-opt-btn" data-ans="no">Ні</button><button class="rc-opt-btn" data-ans="unsure">Не впевнений</button></div></div>';
container.querySelectorAll('[data-ans]').forEach(function(btn){
btn.addEventListener('click',function(){
var val=this.getAttribute('data-ans');
var opt=q.opts[val];
state.answers.push({q:state.currentQ,val:val,scores:opt.scores,strength:q.strength,cluster:q.cluster});
state.path.push(state.currentQ);state.qIndex++;
state.currentQ=opt.next;renderQ();
});
});
}

// ===== REPORT =====
function showReport(){
goTo('s6');
var scores=[0,0,0,0,0];
for(var i=0;i<state.answers.length;i++){
var a=state.answers[i];
for(var j=0;j<5;j++)scores[j]+=a.scores[j];
}
var maxima=[45,45,40,40,45];
var norm=scores.map(function(s,idx){return Math.min(100,Math.round((s/maxima[idx])*100));});
var total=Math.round(norm.reduce(function(a,b){return a+b;},0)/5);

// Radar
var angles=[-Math.PI/2,-Math.PI/2+2*Math.PI/5,-Math.PI/2+4*Math.PI/5,-Math.PI/2+6*Math.PI/5,-Math.PI/2+8*Math.PI/5];
var pts=norm.map(function(v,idx){
var r=(v/100)*80;
return(Math.cos(angles[idx])*r)+','+(Math.sin(angles[idx])*r);
});
document.getElementById('r-poly').setAttribute('points',pts.join(' '));
norm.forEach(function(v,idx){
var r=(v/100)*80;
document.getElementById('r-d'+(idx+1)).setAttribute('cx',Math.cos(angles[idx])*r);
document.getElementById('r-d'+(idx+1)).setAttribute('cy',Math.sin(angles[idx])*r);
});

document.getElementById('l-v1').textContent=norm[0]+'%';
document.getElementById('l-v2').textContent=norm[1]+'%';
document.getElementById('l-v3').textContent=norm[2]+'%';
document.getElementById('l-v4').textContent=norm[3]+'%';
document.getElementById('l-v5').textContent=norm[4]+'%';

var totalEl=document.getElementById('r-total');
totalEl.textContent=total;
var verdict=document.getElementById('r-verdict');
var tag=document.getElementById('r-tag');
if(total>60){
totalEl.style.color='var(--kimi-color-danger)';
verdict.textContent='Високий ризик · Поліграф настійно рекомендований';
verdict.style.color='var(--kimi-color-danger)';
tag.innerHTML='<span class="rc-tag rc-tag-red">Критичний рівень</span>';
}else if(total>35){
totalEl.style.color='var(--kimi-color-warning)';
verdict.textContent='Середній ризик · Додаткова верифікація рекомендована';
verdict.style.color='var(--kimi-color-warning)';
tag.innerHTML='<span class="rc-tag rc-tag-yel">Потребує уваги</span>';
}else{
totalEl.style.color='var(--kimi-color-positive)';
verdict.textContent='Низький ризик · Стандартна перевірка достатня';
verdict.style.color='var(--kimi-color-positive)';
tag.innerHTML='<span class="rc-tag rc-tag-grn">Прийнятний рівень</span>';
}

// Patterns
var patternsHtml='';
var hasStrongResume=state.answers.some(function(a){return a.cluster===0&&a.val==='yes'&&(a.strength==='strong'||a.strength==='moderate');});
var hasBehaviorStress=state.answers.some(function(a){return a.cluster===3&&a.val==='yes'&&(a.strength==='strong'||a.strength==='moderate');});
var hasFinanceAvoid=state.answers.some(function(a){return a.cluster===1&&a.val==='yes'&&(a.strength==='strong'||a.strength==='moderate');});
var hasSecurityInterest=state.answers.some(function(a){return a.cluster===4&&a.val==='yes'&&a.strength==='strong';});

if(hasStrongResume&&hasBehaviorStress){
patternsHtml+='<div class="rc-pattern rc-pattern-strong"><div class="rc-pattern-title">Виявлено патерн: «Лакована могила» <span class="rc-signal-badge rc-signal-strong">СИЛЬНИЙ</span></div><div class="rc-pattern-text">Поєднання розбіжностей у резюме з поведінковими маркерами стресу. За практикою поліграфолога Сергія Коржова (5000+ досліджень з 2013 року) такий профіль часто має приховані провали, які виходять на поліграфі. Рекомендується блок питань про бюджетну дисципліну та причини звільнення.</div></div>';
}
if(hasFinanceAvoid&&hasSecurityInterest){
patternsHtml+='<div class="rc-pattern rc-pattern-moderate"><div class="rc-pattern-title">Виявлено патерн: «Фінансовий туман» <span class="rc-signal-badge rc-signal-moderate">СЕРЕДНІЙ</span></div><div class="rc-pattern-text">Уникання аудиту плюс зацікавленість у фінансових повноваженнях до офіційного працевлаштування. Рекомендується перевірка через незалежні референси та блок питань про закупівлі/тендери на поліграфі.</div></div>';
}
if(patternsHtml===''){
patternsHtml='<div style="font-size:13px;color:var(--kimi-color-text-secondary);padding:10px 0">Специфічних патернів високого ризику не виявлено. Розподіл ризиків відносно рівномірний. Сильних маркерів (кореляція >70%) у відповідях немає.</div>';
}
document.getElementById('r-patterns').innerHTML=patternsHtml;

// Economics
var sym=state.calc.sym||'$';
var range=COST_RANGES[state.pos]||[150000,350000];
var adjustedLow=Math.round(range[0]*(1+(total/250)));
var adjustedHigh=Math.round(range[1]*(1+(total/250)));
var mid=Math.round((adjustedLow+adjustedHigh)/2);
document.getElementById('e-cost').textContent=sym+adjustedLow.toLocaleString()+' – '+sym+adjustedHigh.toLocaleString();
document.getElementById('e-roi').textContent=(mid/1150).toFixed(0)+'x';
document.getElementById('e-opt').textContent='~'+sym+Math.round(mid*0.15).toLocaleString();
document.getElementById('e-real').textContent='~'+sym+Math.round(mid*0.4).toLocaleString();
document.getElementById('e-pess').textContent=sym+adjustedHigh.toLocaleString()+'+';

// Blinds
var blinds=[];
var hasUnsure=false;
for(var k=0;k<state.answers.length;k++)if(state.answers[k].val==='unsure')hasUnsure=true;
if(hasUnsure)blinds.push({text:"Ви відповіли «Не впевнений» на кілька питань. Це означає, що співбесіда не була структурованою для фіксації поведінкових маркерів.",sub:"Рекомендація: наступного разу делегуйте колезі фіксацію невербалики."});
if(norm[2]<30)blinds.push({text:"Репутаційний ризик не досліджено достатньо. Ви не перевірили публічні джерела та референси незалежно від кандидата.",sub:"Рекомендація: перевірте судові рішення через відкриті реєстри (вручну, за назвою компанії)."});
if(norm[3]<30)blinds.push({text:"Поведінкові маркери не зафіксовані. Мікропаузи, зміна тону та емоційні реакції — безкоштовні індикатори стресу.",sub:"Рекомендація: проведіть повторну співбесіду з фокусом на чутливі теми та фіксацією часу відповідей."});
if(blinds.length===0)blinds.push({text:"Основні зони верифікації покриті. Продовжуйте фіксувати поведінкові маркери на всіх етапах найму.",sub:""});
document.getElementById('r-blinds').innerHTML=blinds.map(function(b,idx){
return'<div class="rc-blind-item"><div class="rc-blind-num">'+(idx+1)+'</div><div class="rc-blind-text">'+b.text+'<span>'+b.sub+'</span></div></div>';
}).join('');

// Checks
var checks=[];
if(total>60){
checks.push("Провести поліграфну перевірку з фокусом на фінансову дисципліну та причини звільнення");
checks.push("Отримати референси незалежно від кандидата (через LinkedIn-колег, а не надані контакти)");
}
if(norm[0]>40)checks.push("Перевірити диплом через Міністерство освіти (за номером)");
if(norm[1]>40)checks.push("Запитати колишнього CFO про ставлення кандидата до внутрішнього аудиту");
if(norm[2]>40)checks.push("Перевірити наявність судових справ через відкриті реєстри (вручну, за назвою компанії)");
if(norm[4]>40)checks.push("Перевірити наявність ФОП або ТОВ, заснованих кандидатом чи родичами");
checks.push("Провести кейс-інтерв'ю з перевіркою на плагіат рішення");
checks.push("Підготувати додаткову угоду про перевірку на поліграфі до підписання контракту");
document.getElementById('r-checks').innerHTML=checks.map(function(c){
return'<div class="rc-check-item"><div class="rc-check-box"></div><div>'+c+'</div></div>';
}).join('');

// Show consult CTA if high risk
if(total>35){
document.getElementById('consult-cta').style.display='block';
}
}

// ===== EMAIL GATE =====
document.getElementById('btn-email-submit').addEventListener('click',function(){
var email=document.getElementById('user-email').value;
var status=document.getElementById('email-status');
if(!email||!email.includes('@')){status.textContent='Введіть коректний email';status.style.color='var(--kimi-color-danger)';return;}
status.textContent='Надсилаємо...';status.style.color='var(--kimi-color-text-tertiary)';

// Google Apps Script placeholder — replace URL after setup
var APPS_SCRIPT_URL='https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec';

fetch(APPS_SCRIPT_URL,{
method:'POST',
mode:'no-cors',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({email:email,pos:state.pos,score:document.getElementById('r-total').textContent,date:new Date().toISOString()})
}).then(function(){
status.textContent='✓ Звіт надіслано. Перевірте пошту (та папку Спам).';status.style.color='var(--kimi-color-positive)';
document.getElementById('email-cta').style.display='none';
}).catch(function(){
// Fallback if Apps Script not configured
status.textContent='Помилка надсилання. Напишіть напряму: plgrph@protonmail.com';status.style.color='var(--kimi-color-warning)';
});
});

})();
