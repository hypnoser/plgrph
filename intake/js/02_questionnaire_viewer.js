/* ======================================================================
   Intake v4 — 02_questionnaire_viewer.js
   Візуальний переглядач структури анкети + редактор (шлюз -> уточнення).
   Замінює колишній екран "Склад обстеження" (s-overview).

   Правила:
   - позначка (чекбокс) шлюзу автоматично позначає всі його уточнення;
   - видалення позначеного шлюзу каскадно видаляє всі його уточнення;
   - нове уточнення додається ЛИШЕ під шлюз, ніколи під інше уточнення —
     структура завжди рівно дворівнева;
   - усі правки зберігаються НАЗАВЖДИ в сам файл анкети (перезапис JSON),
     через кнопку "Зберегти у файл" (явна дія, не автозбереження).
   ====================================================================== */
"use strict";

var QV = (function(){
  var expanded = {};      /* gateId -> bool, чи розкритий список уточнень у переглядачі */
  var selected = {};      /* id (шлюзу або уточнення) -> bool, позначений чекбоксом */
  var editingId = null;   /* id питання, яке зараз редагується інлайн */

  function questionnaire(){ return STATE.data; }

  function allExpansionIds(gate){ return gate.expansion.map(function(x){ return x.id; }); }

  function toggleExpand(gateId){
    expanded[gateId] = !expanded[gateId];
    render();
  }

  function toggleGateSelect(gate, checked){
    selected[gate.id] = checked;
    allExpansionIds(gate).forEach(function(id){ selected[id] = checked; });
    render();
  }
  function toggleExpSelect(id, checked){
    selected[id] = checked;
    render();
  }

  function selectedCount(){
    return Object.keys(selected).filter(function(k){ return selected[k]; }).length;
  }

  function findGateAndBlock(gateId){
    var q = questionnaire();
    for (var bi = 0; bi < q.blocks.length; bi++){
      var b = q.blocks[bi];
      if (!b.gates) continue;
      for (var gi = 0; gi < b.gates.length; gi++)
        if (b.gates[gi].id === gateId) return { block:b, blockIndex:bi, gate:b.gates[gi], gateIndex:gi };
    }
    return null;
  }

  function deleteSelected(){
    if (!selectedCount()) return;
    if (!confirm("Видалити позначені питання? Дію не можна скасувати після збереження у файл.")) return;
    var q = questionnaire();
    q.blocks.forEach(function(b){
      if (!b.gates) return;
      b.gates = b.gates.filter(function(g){
        if (selected[g.id]) return false;               /* видаляємо весь шлюз з уточненнями */
        g.expansion = g.expansion.filter(function(x){ return !selected[x.id]; });
        return true;
      });
    });
    selected = {};
    render();
  }

  function startEdit(id){ editingId = id; render(); }
  function cancelEdit(){ editingId = null; render(); }
  function saveEdit(id, newText){
    var q = questionnaire();
    var found = null;
    q.blocks.forEach(function(b){
      if (b.questions) b.questions.forEach(function(x){ if (x.id === id) found = x; });
      if (b.gates) b.gates.forEach(function(g){
        if (g.id === id) found = g;
        g.expansion.forEach(function(x){ if (x.id === id) found = x; });
      });
      if (b.closing && b.closing.id === id) found = b.closing;
    });
    if (found && newText.trim()) found.text = newText.trim();
    editingId = null;
    render();
  }

  function nextIdSuffix(existingIds, base){
    var n = 1;
    while (existingIds.indexOf(base + "." + n) >= 0) n++;
    return base + "." + n;
  }

  function addGate(blockIndex){
    var q = questionnaire(), b = q.blocks[blockIndex];
    if (!b.gates) b.gates = [];
    var allIds = collectAllIds(q);
    var gateNum = b.gates.length + 1;
    var newId = b.id.replace(/^B/,"") + "." + gateNum;
    while (allIds.indexOf(newId) >= 0){ gateNum++; newId = b.id.replace(/^B/,"") + "." + gateNum; }
    var expId = newId + ".1";
    b.gates.push({
      id: newId, text: "Новий шлюз — відредагуйте текст питання",
      category: "", baseline_yes: "medium", relevant_candidate: false,
      expansion: [{ id: expId, text: "Нове уточнення — відредагуйте текст питання" }]
    });
    expanded[newId] = true;
    render();
  }

  function addExpansion(gateId){
    var found = findGateAndBlock(gateId);
    if (!found) return;
    var allIds = collectAllIds(questionnaire());
    var newId = nextIdSuffix(allIds, gateId);
    found.gate.expansion.push({ id: newId, text: "Нове уточнення — відредагуйте текст питання" });
    expanded[gateId] = true;
    render();
  }

  function collectAllIds(q){
    var ids = [];
    q.blocks.forEach(function(b){
      if (b.questions) b.questions.forEach(function(x){ ids.push(x.id); });
      if (b.gates) b.gates.forEach(function(g){ ids.push(g.id); g.expansion.forEach(function(x){ ids.push(x.id); }); });
      if (b.closing) ids.push(b.closing.id);
    });
    return ids;
  }

  async function saveToFile(){
    var q = questionnaire();
    var text = JSON.stringify(q, null, 2);
    var name = "anketa_" + (q.meta && q.meta.title ? q.meta.title.replace(/[^\wа-яА-ЯіІїЇєЄ-]+/g,"_").slice(0,40) : "edited") + ".json";
    if (window.showSaveFilePicker){
      try {
        var handle = await window.showSaveFilePicker({ suggestedName: name, types:[{ description:"Анкета", accept:{ "application/json":[".json"] } }] });
        var w = await handle.createWritable(); await w.write(text); await w.close();
        el("qv-footer-count").textContent = "Збережено у файл";
        return;
      } catch(e){ if (e.name === "AbortError") return; }
    }
    var blob = new Blob([text], { type:"application/json" }), url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 3000);
  }

  function renderTextOrEdit(idText, id, isGate){
    if (editingId === id){
      var wrap = document.createElement("span");
      wrap.style.flex = "1";
      var input = tag("textarea", "qv-edit-field", wrap);
      input.value = idText;
      input.rows = 2;
      var actions = tag("span", "", wrap);
      var save = tag("button", "mini ghost", actions, "Зберегти");
      save.type = "button";
      var cancel = tag("button", "mini ghost", actions, "Скасувати");
      cancel.type = "button";
      save.addEventListener("click", function(){ saveEdit(id, input.value); });
      cancel.addEventListener("click", cancelEdit);
      return wrap;
    }
    var span = tag("span", "txt", null, idText);
    span.title = idText;
    span.addEventListener("click", function(){ toggleExpand(isGate ? id : null); });
    return span;
  }

  function render(){
    var body = el("qv-body");
    body.innerHTML = "";
    var q = questionnaire();
    if (!q) return;

    el("qv-title").textContent = (q.meta && q.meta.title || "Анкета") + " · " +
      q.blocks.filter(function(b){ return b.type === "topic"; }).length + " тем";

    var bulkbar = el("qv-bulkbar");
    var count = selectedCount();
    bulkbar.classList.toggle("hidden", count === 0);
    el("qv-bulk-count").textContent = "Позначено: " + count;

    q.blocks.forEach(function(b, bi){
      if (b.type === "calibration") return; /* калібрувальний блок у редакторі не показуємо */
      var label = tag("div", "qv-block-label", body);
      tag("span", "", label, b.id + " · " + b.title);
      var addBtn = tag("button", "", label, "+ Новий шлюз");
      addBtn.type = "button";
      addBtn.addEventListener("click", function(){ addGate(bi); });

      (b.gates || []).forEach(function(g){
        var isSel = !!selected[g.id];
        var row = tag("div", "qv-gate" + (isSel ? " selected" : ""), body);
        var cb = tag("input", "", row); cb.type = "checkbox"; cb.checked = isSel;
        cb.addEventListener("change", function(){ toggleGateSelect(g, cb.checked); });

        var chev = tag("span", "chev", row);
        chev.innerHTML = expanded[g.id]
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>';
        chev.addEventListener("click", function(){ toggleExpand(g.id); });

        row.appendChild(renderTextOrEdit(g.id + " · " + g.text, g.id, true));

        var editBtn = tag("button", "icon-btn", row);
        editBtn.type = "button";
        editBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>';
        editBtn.addEventListener("click", function(){ startEdit(g.id); });

        var delBtn = tag("button", "icon-btn", row);
        delBtn.type = "button";
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>';
        delBtn.addEventListener("click", function(){
          selected = {}; selected[g.id] = true; deleteSelected();
        });

        if (expanded[g.id]){
          var list = tag("div", "qv-exp-list", body);
          g.expansion.forEach(function(x){
            var isXSel = !!selected[x.id];
            var xrow = tag("div", "qv-exp" + (isXSel ? " selected" : ""), list);
            var xcb = tag("input", "", xrow); xcb.type = "checkbox"; xcb.checked = isXSel;
            xcb.addEventListener("change", function(){ toggleExpSelect(x.id, xcb.checked); });
            xrow.appendChild(renderTextOrEdit(x.id + " · " + x.text, x.id, false));
            var xEdit = tag("button", "icon-btn", xrow);
            xEdit.type = "button";
            xEdit.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>';
            xEdit.addEventListener("click", function(){ startEdit(x.id); });
            var xDel = tag("button", "icon-btn", xrow);
            xDel.type = "button";
            xDel.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>';
            xDel.addEventListener("click", function(){ selected = {}; selected[x.id] = true; deleteSelected(); });
          });
          var addExp = tag("button", "qv-add-exp", body, "+ Додати уточнення до " + g.id);
          addExp.type = "button";
          addExp.addEventListener("click", function(){ addExpansion(g.id); });
        }
      });
    });

    var totalGates = 0, totalExp = 0;
    q.blocks.forEach(function(b){ if (b.gates){ totalGates += b.gates.length; b.gates.forEach(function(g){ totalExp += g.expansion.length; }); } });
    el("qv-footer-count").textContent = totalGates + " шлюзів, " + totalExp + " уточнень";
  }

  function open(){
    expanded = {}; selected = {}; editingId = null;
    render();
    show("s-quest-viewer", { from:"s-start" });
  }

  return { open: open, render: render, deleteSelected: deleteSelected, saveToFile: saveToFile };
})();

el("qv-back").addEventListener("click", function(){ navBack("s-start"); });
el("qv-bulk-delete").addEventListener("click", function(){ QV.deleteSelected(); });
el("qv-save").addEventListener("click", function(){ QV.saveToFile(); });
