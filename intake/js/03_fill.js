/* ======================================================================
   Intake v4 — 03_fill.js
   Заповнення анкети респондентом. Логіка ідентична 3.2, ЗІ ЗМІНОЮ:
   питання РОЗГОРТАННЯ (уточнення під шлюзом) тепер мають лише
   так/ні — без "поясню". Поле "Пояснення" лишається ОДНИМ спільним
   полем на весь блок розгортання (це вже так у наявному коді:
   exp_<gate.id> — один ключ на шлюз, не по одному на уточнення).

   Згода тепер частина об'єднаного файлу сесії (S.consent_record),
   а не окремий файл — інтеграція з PI_CONSENT нижче.
   ====================================================================== */
"use strict";

var VERSION = "4.0";
var ANALYTICS_VERSION = "2.1";
var PEN_INK = "#5B2C8F";
function penWidth(e){ return 0.5 + (e.pressure || 0.5) * 2.25; }
function newId(){
  var d = new Date(), day = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  return day + "_" + crypto.randomUUID();
}
var CASE = { id:null, label:"", created:null };

var PI_FILL = (function(){
  var D = document;
  var Q = null, S = null;
  var pads = {}, nodes = { gates:[], subs:{}, closing:null };
  var blockIdx = 0, t0 = 0, lastTouch = 0;
  var penSeen = false;
  var closing = false, lockedFill = false, lastNow = 0, timingInvalid = false;
  var attentionCleanups = [];
  var onEvent = null;

  function LB(kind){ return R("r_" + kind); }
  function now(){ var n = Date.now() - t0; lastNow = Math.max(lastNow, n); return lastNow; }

  function scaleFill(){
    var w = D.defaultView ? D.defaultView.innerWidth : 1000;
    var fs = Math.max(17, Math.min(24, Math.round(w / 62)));
    if (D.documentElement) D.documentElement.style.setProperty("--fill-fs", fs + "px");
  }
  function fillShow(id){
    scaleFill();
    var all = D.querySelectorAll(".screen");
    for (var i = 0; i < all.length; i++) all[i].classList.remove("on");
    var t = D.getElementById(id);
    if (t) t.classList.add("on");
    if (D.defaultView) D.defaultView.scrollTo(0, 0);
  }

  function ev(type, data){
    var e = { t: now(), type: type };
    for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) e[k] = data[k];
    S.events.push(e);
    if (["answer","change","write","write_end","erase","block_open","review","attention"].indexOf(type) >= 0 ||
        (type === "block_return" && e.initiator === "respondent")) S.lastInteraction = e.t;
    if (onEvent){ try { onEvent(e); } catch(x){} }
    PI_SAVE.touched();
    return e;
  }

  /* ---------- рукописні поля ---------- */
  function makePad(canvas, key){
    var ctx = canvas.getContext("2d");
    var strokes = 0, drawing = false, lx = 0, ly = 0, dpr = D.defaultView.devicePixelRatio || 1;
    var activeId = null;
    var box = canvas.closest(".padbox");

    function clearStored(){
      if (key.indexOf("exp_") === 0) delete S.explanations[key.slice(4)];
      else if (key.indexOf("sig_") === 0) delete S.signatures[key.slice(4)];
      else if (key.indexOf("pad_") === 0) delete S.identity[key.slice(4)];
    }
    function updateInkClass(){ if (box) box.classList.toggle("has-ink", strokes > 0); }

    var tries = 0;
    function size(){
      var r = canvas.getBoundingClientRect();
      if (!r.width){ if (tries++ < 60) D.defaultView.requestAnimationFrame(size); return; }
      var keep = strokes ? canvas.toDataURL() : null;
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = PEN_INK;
      if (keep){ var img = new (D.defaultView.Image)(); img.onload = function(){ ctx.drawImage(img,0,0,r.width,r.height); }; img.src = keep; }
    }
    size();

    function pt(e){ var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function ignore(e){ if (e.pointerType === "pen"){ penSeen = true; return false; } return penSeen; }

    canvas.addEventListener("pointerdown", function(e){
      if (ignore(e) || lockedFill || closing || !S || S.finished) return;
      if (drawing && activeId !== null && e.pointerId !== activeId) return;
      try { canvas.setPointerCapture(e.pointerId); } catch(x){}
      if (key.indexOf("exp_") === 0) invalidateSignature(key.slice(4));
      activeId = e.pointerId; drawing = true;
      var p = pt(e); lx = p.x; ly = p.y;
      if (!strokes) ev("write", { field:key });
      timingInvalid = true; mark(e); touch();
    });
    canvas.addEventListener("pointermove", function(e){
      if (!drawing || ignore(e) || e.pointerId !== activeId || S.finished || lockedFill) return;
      var p = pt(e); ctx.lineWidth = penWidth(e);
      ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(p.x,p.y); ctx.stroke();
      if (Math.hypot(p.x-lx,p.y-ly) > 0.2){ strokes++; updateInkClass(); }
      touch(); lx = p.x; ly = p.y; mark(e);
    });
    function stop(e){
      if (e.pointerId !== activeId) return;
      if (drawing && strokes && !S.finished){ stash(key, canvas.toDataURL("image/png")); ev("write_end",{field:key}); touch(); PI_SAVE.touched(); }
      drawing = false; activeId = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch(x){}
    }
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener("pointerleave", function(e){ if (e.pointerId === activeId && !canvas.hasPointerCapture(e.pointerId)) stop(e); });
    D.defaultView.addEventListener("resize", size);

    function hasInk(){
      if (!strokes) return false;
      var a = ctx.getImageData(0,0,canvas.width,canvas.height).data, n = 0;
      for (var i=3;i<a.length;i+=4){ if (a[i]>0 && ++n>=12) return true; }
      return false;
    }
    var pad = {
      key:key, element:canvas, forgetUndo:function(){}, has:hasInk,
      dispose:function(){ D.defaultView.removeEventListener("resize", size); },
      clear:function(invalidated){
        if (S.finished || lockedFill || closing) return;
        if (!invalidated && strokes && key.indexOf("exp_") === 0) invalidateSignature(key.slice(4));
        ctx.clearRect(0,0,canvas.width,canvas.height);
        if (strokes) ev("erase", { field:key });
        touch(); timingInvalid = true; strokes = 0; updateInkClass(); PI_SAVE.touched();
        clearStored();
      },
      image:function(){ return hasInk() ? canvas.toDataURL("image/png") : null; },
      restore:function(url){
        if (!url) return;
        var img = new (D.defaultView.Image)();
        img.onload = function(){ var r = canvas.getBoundingClientRect(); ctx.drawImage(img,0,0,r.width,r.height); };
        img.src = url; strokes = 1; updateInkClass();
      }
    };
    pads[key] = pad;
    return pad;
  }

  function mark(e){
    var s = S.pen;
    s.types[e.pointerType] = (s.types[e.pointerType] || 0) + 1;
    if (e.pointerType === "pen"){
      var p = e.pressure;
      if (p < s.pressureMin) s.pressureMin = p;
      if (p > s.pressureMax) s.pressureMax = p;
      if (e.tiltX || e.tiltY) s.tilt = true;
    }
  }
  function touch(){ lastTouch = now(); }

  function lastAnswerAt(id){
    for (var i = S.events.length - 1; i >= 0; i--){ var e = S.events[i]; if (e.q === id && (e.type==="answer"||e.type==="change")) return e.t; }
    return -Infinity;
  }
  function wireAttention(target, id){
    var active=false, started=0, last=0, moves=0, entries=0, timer=null;
    function isHover(e){ return e.pointerType==="pen" && e.buttons===0 && (!e.pressure||e.pressure===0); }
    function begin(e){
      if (!isHover(e) || !S || S.finished || lockedFill || closing) return;
      if (!S.answers[id] || now()-lastAnswerAt(id)<700) return;
      S.pen.hoverObserved = true; PI_SAVE.touched();
      if (timer){ D.defaultView.clearTimeout(timer); timer=null; } else { started=now(); moves=0; entries=0; }
      active = true; entries++; last = now();
    }
    function move(e){ if (!isHover(e)) return; if (!active) begin(e); if (active){ last=now(); moves++; } }
    function finish(){
      if (timer){ D.defaultView.clearTimeout(timer); timer=null; }
      var duration = Math.max(0, last-started);
      if (started && duration>=1500 && moves>=2){ ev("attention",{q:id,duration:Math.round(duration),entries:entries,moves:moves,source:"pen_hover"}); timingInvalid=true; touch(); }
      active=false; started=0; last=0; moves=0; entries=0;
    }
    function leave(e){ if (!active || e.pointerType!=="pen") return; active=false; timer=D.defaultView.setTimeout(finish,500); }
    target.addEventListener("pointerenter", begin);
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerleave", leave);
    target.addEventListener("pointercancel", leave);
    attentionCleanups.push(function(){ if (active||timer) finish(); });
  }

  function questionText(id){
    for (var i = 0; i < Q.blocks.length; i++){
      var b = Q.blocks[i], j, k;
      if (b.questions) for (j=0;j<b.questions.length;j++) if (b.questions[j].id===id) return b.questions[j].text;
      if (b.gates) for (j=0;j<b.gates.length;j++){
        if (b.gates[j].id===id) return b.gates[j].text;
        for (k=0;k<b.gates[j].expansion.length;k++) if (b.gates[j].expansion[k].id===id) return b.gates[j].expansion[k].text;
      }
      if (b.closing && b.closing.id===id) return b.closing.text;
    }
    return "";
  }

  function addMark(qid, markText){
    if (!S || !qid || PI_SAVE.isReadOnly() || !questionText(qid)) return null;
    var kind = ({"реакція":"reaction","перепитав":"asked","сказав сам":"volunteered","перешкода":"noise","заминка з технікою":"technical"})[markText] || markText;
    if (["reaction","asked","volunteered","noise","technical"].indexOf(kind) < 0) return null;
    var added = { id:crypto.randomUUID(), q:qid, mark:markText, kind:kind, t:S.finished?null:now(), added_at:new Date().toISOString() };
    if (S.finished) added.phase = "post_session";
    S.marks.push(added);
    if (S.finished){ S.analysis_current = PI_STAT.analyse(S); S.analysis_updated = added.added_at; }
    else ev("mark", { q:qid, mark:markText, mark_id:added.id });
    PI_SAVE.touched();
    return added;
  }
  function withdrawMark(index){
    if (!S || PI_SAVE.isReadOnly()) return false;
    var m = S.marks[index]; if (!m || m.withdrawn_at) return false;
    m.withdrawn_at = new Date().toISOString();
    if (S.finished){ S.analysis_current = PI_STAT.analyse(S); S.analysis_updated = m.withdrawn_at; }
    PI_SAVE.touched();
    return true;
  }

  /* ---------- побудова питання (без "поясню" на уточненнях) ---------- */
  function questionNode(q, kinds, onPick){
    var wrap = tag("div", "q"); wrap.dataset.question = q.id; wrap.tabIndex = -1;
    var num = tag("span", "qnum", wrap); num.textContent = q.id;
    var txt = tag("span", "qtext", wrap); txt.textContent = q.text;
    wireAttention(txt, q.id);

    var row = tag("span", "opts", wrap);
    var boxes = {};
    var all = ["yes","no","explain"];
    for (var i = 0; i < all.length; i++){
      (function(kind){
        var active = kinds.indexOf(kind) !== -1;
        var b = tag("button", "opt" + (active ? "" : " void"), row);
        var mark = tag("i", null, b);
        mark.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
        if (!active){ b.disabled = true; b.setAttribute("aria-hidden","true"); return; }
        b.type = "button"; b.title = LB(kind);
        b.setAttribute("aria-label", q.id + " — " + LB(kind));
        b.setAttribute("aria-pressed", String(!!S.answers[q.id] && S.answers[q.id].value===kind));
        boxes[kind] = b;
        if (S.answers[q.id] && S.answers[q.id].value === kind) b.classList.add("on");
        b.addEventListener("click", function(){
          var prev = S.answers[q.id] ? S.answers[q.id].value : null;
          if (S.finished || closing || lockedFill) return;
          if (prev === kind){ ev("review", { q:q.id }); touch(); return; }
          for (var k in boxes){ boxes[k].classList.toggle("on", k===kind); boxes[k].setAttribute("aria-pressed", String(k===kind)); }
          var rec = S.answers[q.id] || (S.answers[q.id] = { value:null, first:null, changes:0 });
          rec.value = kind;
          if (rec.first === null) rec.first = now(); else rec.changes++;
          ev(prev===null?"answer":"change", { q:q.id, value:kind, from:prev, since:now()-lastTouch, timingValid:!timingInvalid });
          timingInvalid = false; invalidateSignature(q.id); touch();
          if (onPick) onPick(kind);
        });
      })(all[i]);
    }
    return wrap;
  }

  function confirmNode(parent, key){
    var wrap = tag("label", "block-confirm", parent);
    var cb = tag("input", null, wrap); cb.type = "checkbox";
    var span = tag("span", null, wrap); span.textContent = R("r_block_confirm");
    if (S.signatures[key]) cb.checked = true;
    cb.addEventListener("change", function(){
      if (S.finished || lockedFill || closing) return;
      if (cb.checked){ S.signatures[key] = new Date().toISOString(); ev("block_confirm", { block:key }); }
      else { delete S.signatures[key]; ev("block_confirm_undo", { block:key }); }
      touch(); PI_SAVE.touched();
    });
    return { key:key, has:function(){ return !!S.signatures[key]; }, element:cb };
  }

  function invalidateSignature(cause){
    if (!Q || blockIdx < 0) return;
    var key = blockIdx===Q.blocks.length-1 ? "final" : Q.blocks[blockIdx].id, pad = pads["sig_"+key], changed=false;
    if (pad && pad.has()){ pad.forgetUndo(); pad.clear(true); changed = true; }
    else if (S.signatures[key]){ delete S.signatures[key]; changed = true; }
    if (nodes.confirmBox && nodes.confirmBox.key === key) nodes.confirmBox.element.checked = false;
    if (blockIdx !== Q.blocks.length-1 && S.signatures.final){ delete S.signatures.final; ev("signature_invalidated",{scope:"final",q:cause||null}); }
    if (changed) ev("signature_invalidated", { scope:key, q:cause||null });
  }

  function headRow(){
    var h = tag("div","qhead"); tag("span",null,h); tag("span",null,h);
    var cols = tag("span","cols",h);
    [R("r_yes"),R("r_no"),R("r_explain")].forEach(function(name){ tag("span",null,cols).textContent = name; });
    return h;
  }

  /* ---------- екран блоку ---------- */
  function renderBlock(i){
    blockIdx = i;
    var b = Q.blocks[i];
    D.getElementById("fq-step").textContent = R("r_block", { n:i+1, of:Q.blocks.length });
    D.getElementById("fq-name").textContent = b.title;
    var ctxEl = D.getElementById("fq-ctx");
    ctxEl.textContent = b.context || ""; ctxEl.style.display = b.context ? "" : "none";
    fillShow("s-block");

    var prog = D.getElementById("fq-prog"); prog.innerHTML = "";
    for (var pb = 0; pb < Q.blocks.length; pb++) tag("span", pb<i?"done":(pb===i?"now":""), prog);

    var head = D.getElementById("fq-head"); head.innerHTML = ""; head.appendChild(headRow());
    var list = D.getElementById("fq-list"); list.innerHTML = "";
    nodes = { gates:[], subs:{}, closing:null };

    if (b.type === "calibration"){
      for (var k = 0; k < b.questions.length; k++){
        var qn = questionNode(b.questions[k], ["yes","no","explain"]);
        list.appendChild(qn);
        nodes.gates.push({ q:b.questions[k], node:qn, branch:null, pad:null });
      }
    } else {
      var anchorsAfter = {};
      (b.anchors||[]).forEach(function(a){ (anchorsAfter[a.after_gate] = anchorsAfter[a.after_gate]||[]).push(a); });
      for (var g = 0; g < b.gates.length; g++){
        list.appendChild(gateNode(b.gates[g]));
        var afterId = b.gates[g].id;
        if (anchorsAfter[afterId]) anchorsAfter[afterId].forEach(function(anchor){
          var an = questionNode(anchor, ["yes","no","explain"]);
          list.appendChild(an);
          nodes.gates.push({ q:anchor, node:an, branch:null, pad:null });
        });
      }
      if (b.closing && b.closing.recap){
        var recapEl = tag("div", "fq-recap", list); recapEl.textContent = b.closing.recap;
      }
      var cl = questionNode(b.closing, ["yes","no"]);
      list.appendChild(cl); nodes.closing = b.closing;
      nodes.closingPad = padNode(list, R("r_addendum"), "wide", "exp_"+b.closing.id);
      if (S.explanations[b.closing.id]) nodes.closingPad.restore(S.explanations[b.closing.id]);
    }

    var last = (i === Q.blocks.length - 1);
    if (last){
      nodes.signPad = padNode(list, R("r_sign_final"), "sign", "sig_final");
      var storedSign = S.signatures.final; if (storedSign) nodes.signPad.restore(storedSign);
      nodes.confirmBox = null;
    } else {
      nodes.signPad = null;
      nodes.confirmBox = confirmNode(list, b.id);
    }
    var returning = S.return_context && blockIdx !== S.return_context.returnTo;
    D.getElementById("fq-next").textContent = returning ? R("r_return_here") : (last ? R("r_finish") : R("r_next"));
    var reviewButton = D.getElementById("fq-review");
    if (reviewButton){ reviewButton.textContent = R("r_review"); reviewButton.classList.toggle("hidden", blockIdx<=0 || !!S.finished); }

    why("");
    S.blockIdx = i;
    ev("block_open", { block:b.id, index:i });
    timingInvalid = true; touch();
    D.defaultView.scrollTo(0,0);
  }

  function blockQuestions(block){
    var out = [];
    (block.questions||[]).forEach(function(q){ if (S.answers[q.id]) out.push(q); });
    (block.gates||[]).forEach(function(g){
      if (S.answers[g.id]) out.push(g);
      (g.expansion||[]).forEach(function(q){ if (S.answers[q.id]) out.push(q); });
    });
    if (block.closing && S.answers[block.closing.id]) out.push(block.closing);
    return out;
  }
  function gotoBlock(i, initiator, qid){
    if (!S || S.finished || closing || lockedFill || !Number.isInteger(i) || i<0 || i>=Q.blocks.length || i===blockIdx) return false;
    if (!S.events.some(function(e){ return e.type==="block_open" && e.block===Q.blocks[i].id; })){
      alert("Цей блок ще не відкривався. Пройдіть попередні блоки кнопкою «Далі»."); return false;
    }
    var from = blockIdx;
    collectPads();
    if (i < from && !S.return_context) S.return_context = { returnTo:from, initiator:initiator||"examiner", started:now() };
    ev("block_return", { from:Q.blocks[from].id, to:Q.blocks[i].id, q:qid||null, initiator:initiator||"examiner" });
    renderBlock(i);
    if (qid) D.defaultView.requestAnimationFrame(function(){
      var n = D.querySelector('[data-question="'+qid+'"]');
      if (n){ n.classList.add("needs-attention"); n.scrollIntoView({block:"center",behavior:"auto"}); n.focus({preventScroll:true}); }
    });
    return true;
  }
  function openReview(){
    if (!S || S.finished || closing || lockedFill || blockIdx<=0) return;
    var limit = S.return_context ? S.return_context.returnTo : blockIdx;
    var visited = [];
    for (var i=0;i<limit;i++) if (S.events.some(function(e){ return e.type==="block_open" && e.block===Q.blocks[i].id; })) visited.push(i);
    if (!visited.length) return;
    var veil = tag("div","veil"), box = tag("div","box review-box",veil), head = tag("h2",null,box), body = tag("p",null,box);
    var list = tag("div","review-list",box), row = tag("div","row",box);
    head.textContent = R("r_review_head"); body.textContent = R("r_review_body");
    visited.forEach(function(index){
      var block = Q.blocks[index], fold = tag("details","review-block",list), summary = tag("summary",null,fold);
      summary.textContent = block.id + " · " + block.title;
      blockQuestions(block).forEach(function(q){
        var b = tag("button","review-question",fold), idn = tag("b",null,b), label = tag("span",null,b);
        b.type = "button"; idn.textContent = q.id; label.textContent = q.text + " · «" + LB(S.answers[q.id].value) + "»";
        b.addEventListener("click", function(){ D.body.removeChild(veil); gotoBlock(index,"respondent",q.id); });
      });
    });
    var cancel = tag("button","ghost",row); cancel.type = "button"; cancel.textContent = R("r_review_cancel");
    cancel.addEventListener("click", function(){ D.body.removeChild(veil); });
    D.body.appendChild(veil);
    if (veil.querySelector("details")) veil.querySelector("details").open = true;
  }

  /* Шлюз відкриває розгортання — питання уточнень тепер лише так/ні,
     без "поясню". Спільне поле "Пояснення" одне на весь блок розгортання
     (ключ exp_<gate.id>), відкрите завжди, під останнім уточненням. */
  function gateNode(gate){
    var holder = tag("div");
    var branch = null, subs = [];

    function openBranch(kind, silent){
      branch = tag("div","branch"); subs = [];
      var lab = tag("div","blabel",branch);
      lab.textContent = R("r_expanded", { id:gate.id, answer:LB(kind) });
      for (var e = 0; e < gate.expansion.length; e++){
        branch.appendChild(questionNode(gate.expansion[e], ["yes","no"]));
        subs.push(gate.expansion[e]);
      }
      var pad = padNode(branch, R("r_explanation", { id:gate.id }), "wide", "exp_"+gate.id);
      if (S.explanations[gate.id]) pad.restore(S.explanations[gate.id]);
      holder.appendChild(branch);
      nodes.subs[gate.id] = subs;
      if (!silent) ev("expand", { q:gate.id, count:subs.length, trigger:kind });
    }

    var qn = questionNode(gate, ["yes","no","explain"], function(kind){
      var open = (kind === "yes" || kind === "explain");
      if (open && !branch) openBranch(kind, false);
      else if (!open && branch){
        PI_FILL.snapshot();
        var answered = 0;
        for (var s = 0; s < subs.length; s++) if (S.answers[subs[s].id]) answered++;
        var pad = pads["exp_"+gate.id];
        ev("collapse", { q:gate.id, answered:answered, wrote: !!(pad && pad.has()) });
        holder.removeChild(branch); branch = null; delete nodes.subs[gate.id];
      }
    });
    holder.appendChild(qn);
    nodes.gates.push({ q:gate, node:qn });
    var had = S.answers[gate.id];
    if (had && (had.value === "yes" || had.value === "explain")) openBranch(had.value, true);
    return holder;
  }

  function padNode(parent, label, kind, key){
    var pad = tag("div", "pad " + kind, parent);
    var box = tag("div","padbox",pad);
    if (kind === "wide") tag("div","rules",box);
    var cv = tag("canvas",null,box);
    var ph = tag("div","placeholder",box); ph.textContent = label;
    var btn = tag("button","clear",box); btn.setAttribute("aria-label", R("r_erase")); btn.title = R("r_erase");
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19"/><path d="M22 21H7"/></svg>';
    var made = makePad(cv, key);
    btn.addEventListener("click", function(){ made.clear(); });
    return made;
  }

  function revealMissing(id){
    D.querySelectorAll(".needs-attention").forEach(function(n){ n.classList.remove("needs-attention"); });
    var target = id.indexOf("sig_")===0 ? (pads[id]&&pads[id].element) : id.indexOf("pad_")===0 ? (pads[id]&&pads[id].element)
      : Array.from(D.querySelectorAll("[data-question]")).find(function(n){ return n.dataset.question===id; });
    if (!target) return;
    var row = target.closest(".pad") || target;
    row.classList.add("needs-attention"); row.scrollIntoView({block:"center",behavior:"auto"}); row.tabIndex = -1; row.focus({preventScroll:true});
  }
  function why(text){ var e = D.getElementById(blockIdx===-1 ? "fb-why" : "fq-why"); if (e) e.textContent = text || ""; }

  function missing(){
    var out = [], i, s;
    for (i=0;i<nodes.gates.length;i++) if (!S.answers[nodes.gates[i].q.id]) out.push(nodes.gates[i].q.id);
    for (var gid in nodes.subs){ var subs = nodes.subs[gid]; for (s=0;s<subs.length;s++) if (!S.answers[subs[s].id]) out.push(subs[s].id); }
    if (nodes.closing && !S.answers[nodes.closing.id]) out.push(nodes.closing.id);
    return out;
  }

  function next(){
    if (closing || S.finished || lockedFill) return;
    var miss = missing();
    if (miss.length){
      why(miss.length===1 ? R("r_left_one",{list:miss[0]}) : R("r_left_many",{list:miss.slice(0,6).join(", ")}));
      revealMissing(miss[0]); return;
    }
    if (nodes.signPad && !nodes.signPad.has()){ why("Поставте підпис унизу сторінки"); revealMissing(nodes.signPad.key); return; }
    if (nodes.confirmBox && !nodes.confirmBox.has()){ why("Підтвердіть відповіді цього блоку"); nodes.confirmBox.element.closest(".block-confirm").classList.add("needs-attention"); return; }
    return closeBlock();
  }

  async function closeBlock(){
    if (closing || S.finished) return;
    closing = true;
    var b = Q.blocks[blockIdx]; collectPads(); ev("block_done", { block:b.id });
    if (S.return_context && blockIdx !== S.return_context.returnTo){
      var backTo = S.return_context.returnTo, initiator = S.return_context.initiator;
      ev("return_complete", { from:b.id, to:Q.blocks[backTo].id, initiator:initiator }); delete S.return_context;
      closing = false; renderBlock(backTo); await PI_SAVE.now(); return;
    }
    if (blockIdx+1 < Q.blocks.length){ closing = false; renderBlock(blockIdx+1); await PI_SAVE.now(); return; }
    closing = false; await complete("completed");
  }
  async function complete(status){
    if (!S || S.finished || closing) return false;
    closing = true; snapshot();
    if (status !== "aborted"){
      for (var bi = 0; bi < Q.blocks.length; bi++){
        var b = Q.blocks[bi], required = (b.questions||b.gates||[]).slice(); if (b.closing) required.push(b.closing);
        if (b.anchors) required = required.concat(b.anchors);
        (b.gates||[]).forEach(function(g){ var a = S.answers[g.id]; if (a && (a.value==="yes"||a.value==="explain")) required = required.concat(g.expansion); });
        var miss = required.some(function(q){ return !S.answers[q.id]; });
        if (miss || !S.signatures[bi===Q.blocks.length-1 ? "final" : b.id]){
          closing = false; collectPads(); renderBlock(bi); why(miss ? "Заповніть усі відповіді цього блоку." : "Поставте підпис цього блоку.");
          return false;
        }
      }
    }
    S.finished = new Date().toISOString(); S.status = status||"completed"; S.elapsedMs = now(); S.integrity_version = 2;
    ev("session_end", { status:S.status });
    S.analysis_snapshot = PI_STAT.analyse(S); S.analysis_version = ANALYTICS_VERSION;
    S.analysis_created = new Date().toISOString(); PI_SAVE.touched();
    D.querySelector("#s-done h1").textContent = S.status==="aborted" ? "Анкетування припинено" : "Анкету заповнено";
    D.getElementById("fd-note").textContent = S.status==="aborted" ? "Анкетування припинено. Передайте планшет поліграфологові." : R("r_done_note");
    fillShow("s-done");
    var ok = await PI_SAVE.now();
    scheduleAutoClose();
    return ok;
  }

  /* Вікно респондента закривається автоматично через кілька секунд
     після завершення анкети — так у респондента не лишається спокуси
     чи потреби закривати його вручну (саме ручне закриття й провокує
     втрату вікна на боці поліграфолога). Якщо вікно D — це головний
     документ (друге вікно не відкрилось), автозакриття не виконується. */
  function scheduleAutoClose(){
    if (D === document || !D.defaultView || D.defaultView === window) return;
    var seconds = 5;
    var note = D.getElementById("fd-autoclose");
    function tick(){
      if (!note) return;
      note.textContent = seconds > 0 ? "Вікно закриється автоматично через " + seconds + " с…" : "";
      if (seconds <= 0){ try { D.defaultView.close(); } catch(e){} return; }
      seconds--;
      D.defaultView.setTimeout(tick, 1000);
    }
    tick();
  }

  function collectPads(){
    attentionCleanups.splice(0).forEach(function(done){ try { done(); } catch(e){} });
    for (var key in pads) stash(key, pads[key].image());
    for (var k2 in pads) if (k2.indexOf("pad_") !== 0){ pads[k2].dispose(); delete pads[k2]; }
  }

  function sessionId(){ return CASE.id || newId(); }

  /* Мінімальний об'єкт сесії — створюється одразу після збереження
     справи (ПІБ), ще ДО завантаження анкети. Файл на диску мусить
     містити реальний вміст із першої секунди, а не лишатись 0 байт
     до натискання "Почати анкетування" — інакше аварійне закриття
     сторінки між збереженням справи і стартом анкетування означає
     втрату справи (файл порожній, відкрити нічого). */
  function initEmpty(caseInfo){
    S = {
      schema_version: "2.0", app_version:VERSION, analysis_version:ANALYTICS_VERSION, integrity_version:2,
      status: "draft", case_info: JSON.parse(JSON.stringify(caseInfo)),
      consent_record: null,
      session_id: caseInfo.id || newId(), started: new Date().toISOString(), startedAt: Date.now(), finished: null,
      questionnaire: null, identity:{}, answers:{}, explanations:{}, signatures:{},
      events:[], marks:[], reminder:{ shown:false, at:null, gates:[] },
      pen:{ types:{}, pressureMin:1, pressureMax:0, tilt:false }
    };
    ev("case_created", { label: caseInfo.label || "" });
    return S;
  }

  /* Викликається, коли анкету завантажено, а S вже існує (створено
     initEmpty при збереженні справи) — вписує questionnaire у той
     самий об'єкт, не створюючи нову сесію й не втрачаючи session_id/
     started, які вже могли бути записані на диск. */
  function attachQuestionnaire(data){
    if (!S) return false;
    S.questionnaire = data;
    PI_SAVE.touched();
    return true;
  }

  /* Об'єднаний файл сесії: анкета, згода (consent_record), відповіді,
     аналітика — все в одному об'єкті S. Якщо S вже існує (створений
     initEmpty і, можливо, вже має consent_record від чернетки згоди) —
     ДОПОВНЮЄ його, зберігаючи session_id/started, а не перестворює. */
  function start(data, consentRecord){
    Q = data; t0 = Date.now(); lastNow = 0; lockedFill = false; closing = false; timingInvalid = true; attentionCleanups = [];
    if (S && S.session_id){
      S.status = "active"; S.questionnaire = Q;
      if (consentRecord) S.consent_record = JSON.parse(JSON.stringify(consentRecord));
      S.startedAt = t0;
    } else {
      S = {
        schema_version: "2.0", app_version:VERSION, analysis_version:ANALYTICS_VERSION, integrity_version:2,
        status: "active", case_info: JSON.parse(JSON.stringify(CASE)),
        consent_record: consentRecord ? JSON.parse(JSON.stringify(consentRecord)) : null,
        session_id: sessionId(), started: new Date().toISOString(), startedAt: t0, finished: null,
        questionnaire: Q, identity:{}, answers:{}, explanations:{}, signatures:{},
        events:[], marks:[], reminder:{ shown:false, at:null, gates:[] },
        pen:{ types:{}, pressureMin:1, pressureMax:0, tilt:false }
      };
    }
    pads = {}; blockIdx = -1; penSeen = false;
    ev("session_start", { title: (Q.meta||{}).title || "" });
    if (D.defaultView) D.defaultView.addEventListener("resize", scaleFill);
    startScreen();
  }

  function startScreen(){
    fillShow("s-brief");
    var brief = D.getElementById("fb-brief"); brief.innerHTML = "";
    var lines = briefing();
    var ct = D.getElementById("fb-consent-text"); ct.textContent = "";
    var paragraphs = (Q.consent && Q.consent.paragraphs) || ["Участь добровільна. Ви можете попросити пояснення, відмовитися від окремої відповіді або припинити анкетування."];
    paragraphs.forEach(function(text){ tag("p",null,ct).textContent = text; });
    D.getElementById("fb-ack").checked = !!S.intake_ack;
    lines.forEach(function(line){ tag("p",null,brief).textContent = line; });
    paintStatic();
    makePad(D.getElementById("pad-fio"), "pad_fio");
    makePad(D.getElementById("pad-birth"), "pad_birth");
    makePad(D.getElementById("pad-doc"), "pad_doc");
    makePad(D.getElementById("pad-position"), "pad_position");
  }

  function paintStatic(){
    function set(sel, text){ var n = D.querySelector(sel); if (n) n.textContent = text; }
    set('.pad [data-lab="fio"]', R("r_fio")||"Прізвище, ім'я та по батькові");
    set('.pad [data-lab="birth"]', R("r_birth")||"Дата народження");
    set('.pad [data-lab="doc"]', R("r_doc")||"Серія і номер документа, що засвідчує особу");
    set("#fb-go", "Почати");
    set("#fb-ack-label", R("r_ack"));
    var cl = D.querySelectorAll("#s-brief .clear");
    for (var i=0;i<cl.length;i++){
      cl[i].setAttribute("aria-label", R("r_erase")); cl[i].title = R("r_erase");
      (function(btn){
        if (btn.__wired) return; btn.__wired = true;
        btn.addEventListener("click", function(){ var key = "pad_"+btn.getAttribute("data-clear").replace("pad-",""); if (pads[key]) pads[key].clear(); });
      })(cl[i]);
    }
  }

  function stash(key, img){
    if (!S || !img) return;
    if (key.indexOf("exp_")===0) S.explanations[key.slice(4)] = img;
    else if (key.indexOf("sig_")===0) S.signatures[key.slice(4)] = img;
    else if (key.indexOf("pad_")===0) S.identity[key.slice(4)] = img;
  }
  function snapshot(){ if (!S || S.finished) return; for (var key in pads) stash(key, pads[key].image()); }

  function remount(){
    if (!S) return;
    attentionCleanups.splice(0).forEach(function(done){ try { done(); } catch(e){} }); pads = {};
    if (S.finished){ fillShow("s-done"); return; }
    if (blockIdx < 0){
      startScreen();
      for (var k in S.identity){ var pd = pads["pad_"+k]; if (pd) pd.restore(S.identity[k]); }
    } else {
      renderBlock(blockIdx);
    }
  }

  function resume(saved){
    if (!saved || !saved.questionnaire) return false;
    S = saved; S.status = "active"; S.integrity_version = 2; S.app_version = VERSION; S.analysis_version = ANALYTICS_VERSION;
    closing = false; lockedFill = false; Q = saved.questionnaire;
    if (!S.marks) S.marks = [];
    S.reminder = S.reminder || { shown:false, at:null, gates:[] };
    S.pen = S.pen || { types:{}, pressureMin:1, pressureMax:0 };
    var last = 0;
    for (var i=0;i<S.events.length;i++) if (S.events[i].t > last) last = S.events[i].t;
    last = Math.max(last, Number.isFinite(S.elapsedMs) ? S.elapsedMs : 0);
    t0 = Date.now() - last; lastNow = last; timingInvalid = true; S.startedAt = t0; lastTouch = last;
    pads = {}; penSeen = false;
    blockIdx = (typeof S.blockIdx === "number") ? S.blockIdx : -1;
    ev("resume", { block:blockIdx });
    remount();
    return true;
  }

  function beginQuestions(){
    if (S.finished || lockedFill || closing) return;
    if (!D.getElementById("fb-ack").checked){ why("Підтвердіть ознайомлення перед початком"); return; }
    S.intake_ack = { at:new Date().toISOString(), paragraphs:(Q.consent&&Q.consent.paragraphs)||[] };
    if (!pads.pad_fio.has() || !pads.pad_birth.has() || !pads.pad_doc.has()){
      why("Заповніть усі три поля вгорі");
      revealMissing(["pad_fio","pad_birth","pad_doc"].find(function(k){ return !pads[k].has(); }));
      return;
    }
    collectPads();
    renderBlock(0);
  }

  return {
    start:start, complete:complete, currentBlock:function(){ return blockIdx; },
    clearSession:function(){ S=null; Q=null; pads={}; nodes={gates:[],subs:{},closing:null}; attentionCleanups=[]; blockIdx=-1; },
    goto:function(i){ return gotoBlock(i,"examiner",null); },
    begin:beginQuestions, next:next, session:function(){ return S; },
    setDocument:function(doc){ D = doc; }, onEvent:function(fn){ onEvent = fn; },
    mark:addMark, withdrawMark:withdrawMark, textOf:questionText, lock:function(on){
      if (!S || S.finished) return;
      snapshot(); lockedFill = !!on; timingInvalid = true; touch();
    },
    resume:resume,
    load:function(saved){ S = saved; Q = saved.questionnaire; if (!S.marks) S.marks = []; return true; },
    initEmpty:initEmpty, attachQuestionnaire:attachQuestionnaire,
    snapshot:snapshot, remount:remount,
    wire:function(){
      var go = D.getElementById("fb-go"), nx = D.getElementById("fq-next"), review = D.getElementById("fq-review");
      if (go && !go.__wired){ go.__wired = true; go.addEventListener("click", beginQuestions); }
      if (nx && !nx.__wired){ nx.__wired = true; nx.addEventListener("click", next); }
      if (review && !review.__wired){ review.__wired = true; review.addEventListener("click", openReview); }
    }
  };
})();
