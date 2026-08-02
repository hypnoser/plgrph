document.addEventListener('DOMContentLoaded', function() {
  
  var citAppRoot = document.getElementById("cit-app");
  if (!citAppRoot) return;

  // ==========================================
  // 1. ІН'ЄКЦІЯ СТИЛІВ ДЛЯ CIT (Ізоляція)
  // ==========================================
  var citStyles = document.createElement('style');
  citStyles.innerHTML = `
    .cit-container { max-width: 880px; margin: 0 auto; width: 100%; padding-bottom: 30px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    .cit-toolbar { display: flex; align-items: center; gap: 6px; margin-bottom: 15px; background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 6px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .cit-btn { padding: 6px 12px; font-size: 12px; font-weight: bold; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; background: #f8fafc; color: #333; transition: all 0.2s; }
    .cit-btn:hover { background: #e2e8f0; }
    .cit-btn-primary { background: #3a7cfd; color: #fff; border-color: #3a7cfd; }
    .cit-btn-primary:hover { background: #2a68e0; }
    .cit-btn-danger { color: #ff0000; border-color: #ff0000; background: transparent; }
    .cit-btn-danger:hover { background: rgba(255,0,0,0.1); }
    .cit-save-status { margin-left: auto; font-size: 12px; font-weight: bold; padding: 4px 8px; border-radius: 4px; background: #2e7d32; color: #fff; }
    .cit-save-status.unsaved { background: #f57c00; }
    
    .cit-respondent-area { display: flex; gap: 15px; background: #fff; padding: 12px 16px; border-radius: 6px; border: 1px solid #ccc; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); flex-wrap: wrap; }
    .cit-input-group { display: flex; align-items: center; gap: 10px; flex-grow: 1; }
    .cit-label { font-size: 13px; font-weight: 700; color: #555; white-space: nowrap; }
    .cit-input { flex-grow: 1; border: none; border-bottom: 2px solid transparent; background: transparent; font-size: 15px; font-weight: 700; padding: 2px 4px; outline: none; transition: border-color 0.2s; }
    .cit-input:focus { border-bottom-color: #3a7cfd; background: rgba(128,128,128,0.05); }
    
    .cit-block { background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #ccc; margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.03); }
    .cit-block-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px; }
    .cit-block-title { border: none; font-size: 16px; font-weight: 800; color: #222; outline: none; width: 100%; max-width: 400px; background: transparent; }
    .cit-block-title:focus { border-bottom: 2px solid #3a7cfd; }
    
    .cit-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; align-items: start; }
    @media (max-width: 768px) { .cit-layout { grid-template-columns: 1fr; } }
    
    .cit-test-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; background: #f8fafc; padding: 6px; border-radius: 4px; border: 1px solid #eee; }
    .cit-test-row input[type="text"] { border: 1px solid #ccc; border-radius: 3px; padding: 6px; font-size: 13px; outline: none; }
    .cit-test-row input[type="text"]:focus { border-color: #3a7cfd; }
    .cit-theme, .cit-key { flex-grow: 1; width: 100%; }
    .cit-score { width: 45px; text-align: center; font-weight: bold; }
    .cit-score.artifact { background: #fff7ed; border-color: #f97316; color: #ea580c; }
    
    .cit-dashboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 15px; }
    .cit-dash-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center; }
    .cit-dash-label { font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase; }
    .cit-dash-value { font-size: 18px; font-weight: 900; color: #1e293b; margin-top: 4px; }
    .val-ri { color: #d32f2f !important; }
    .val-nri { color: #2e7d32 !important; }
    .val-no { color: #757575 !important; }
    
    .cit-matrix-wrapper { background: #fff; border: 1px solid #eee; border-radius: 6px; padding: 10px; overflow-x: auto; }
    .cit-matrix-title { font-size: 12px; font-weight: bold; margin-bottom: 10px; color: #333; display: flex; justify-content: space-between; }
    .cit-matrix-table { width: 100%; border-collapse: collapse; font-size: 10px; text-align: center; }
    .cit-matrix-table th, .cit-matrix-table td { border: 1px solid #ddd; padding: 4px 2px; }
    .cit-matrix-table th { background: #f1f5f9; color: #475569; }
    .cit-cell-dimmed { opacity: 0.3; }
    .cit-cell-active { background: #3a7cfd !important; color: #fff !important; font-weight: bold; transform: scale(1.1); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
    .cit-cell-active.res-ri { background: #d32f2f !important; }
    .cit-cell-active.res-nri { background: #2e7d32 !important; }
    
    .cit-add-block-btn { width: 100%; padding: 12px; font-size: 14px; font-weight: bold; border: 2px dashed #a5b4fc; background: #e0e7ff; color: #3730a3; border-radius: 6px; cursor: pointer; transition: 0.2s; }
    .cit-add-block-btn:hover { background: #c7d2fe; }
    
    @media print {
      .cit-toolbar, .cit-add-block-btn, .cit-btn-danger, .cit-btn { display: none !important; }
      .cit-block { border: none !important; box-shadow: none !important; margin-bottom: 30px !important; }
      .cit-layout { display: block !important; }
      .cit-cell-active { transform: none !important; box-shadow: none !important; border: 2px solid #000 !important; color: #000 !important; background: transparent !important; }
      .cit-cell-dimmed { opacity: 1 !important; color: #999 !important; }
    }
  `;
  document.head.appendChild(citStyles);

  // ==========================================
  // 2. БАЗА ДАНИХ (ТАБЛИЦЯ 1 CIT)
  // ==========================================
  const probData = {
    3: { 3:"0.28", 4:"0.13", 5:"0.03", 6:"0.01" },
    4: { 3:"0.44", 4:"0.25", 5:"0.10", 6:"0.04", 7:"0.01", 8:"0.00" },
    5: { 3:"0.58", 4:"0.38", 5:"0.20", 6:"0.09", 7:"0.03", 8:"0.01", 9:"0.00", 10:"0.00" },
    6: { 3:"0.69", 4:"0.50", 5:"0.31", 6:"0.17", 7:"0.08", 8:"0.03", 9:"0.00", 10:"0.00", 11:"0.00", 12:"0.00" },
    7: { 3:"0.78", 4:"0.61", 5:"0.42", 6:"0.26", 7:"0.14", 8:"0.07", 9:"0.03", 10:"0.01", 11:"0.00", 12:"0.00", 13:"0.00", 14:"0.00" },
    8: { 3:"0.84", 4:"0.70", 5:"0.53", 6:"0.36", 7:"0.22", 8:"0.12", 9:"0.06", 10:"0.03", 11:"0.01", 12:"0.00", 13:"0.00", 14:"0.00", 15:"0.00", 16:"0.00" }
  };

  // ==========================================
  // 3. СТРУКТУРА ІНТЕРФЕЙСУ
  // ==========================================
  var citContainer = document.createElement('div');
  citContainer.className = 'cit-container';

  var toolbar = document.createElement('div');
  toolbar.className = 'cit-toolbar';
  toolbar.innerHTML = `
    <button class="cit-btn cit-btn-primary" id="cit-btn-save">💾 Зберегти</button>
    <button class="cit-btn" id="cit-btn-md">📝 Експорт Markdown</button>
    <button class="cit-btn" id="cit-btn-print">🖨️ Друк</button>
    <button class="cit-btn cit-btn-danger" id="cit-btn-clear" style="margin-left: auto;">🗑️ Очистити</button>
    <div class="cit-save-status" id="cit-save-status">🟢 Збережено</div>
  `;

  var respondentArea = document.createElement('div');
  respondentArea.className = 'cit-respondent-area';
  respondentArea.innerHTML = `
    <div class="cit-input-group">
      <span class="cit-label">П.І.Б.:</span>
      <input type="text" class="cit-input" id="cit-resp-name" placeholder="Введіть дані...">
    </div>
    <div class="cit-input-group" style="flex-grow: 0;">
      <span class="cit-label">Дата:</span>
      <input type="date" class="cit-input" id="cit-resp-date">
    </div>
  `;

  var blocksContainer = document.createElement('div');
  blocksContainer.id = 'cit-blocks-container';

  var addBlockBtn = document.createElement('button');
  addBlockBtn.className = 'cit-add-block-btn';
  addBlockBtn.textContent = '+ Додати дослідження CIT';

  citContainer.appendChild(toolbar);
  citContainer.appendChild(respondentArea);
  citContainer.appendChild(blocksContainer);
  citContainer.appendChild(addBlockBtn);
  citAppRoot.appendChild(citContainer);

  var isUnsaved = false;
  var saveStatusEl = document.getElementById('cit-save-status');
  var nameInput = document.getElementById('cit-resp-name');
  var dateInput = document.getElementById('cit-resp-date');

  function markUnsaved() {
    isUnsaved = true;
    saveStatusEl.className = 'cit-save-status unsaved';
    saveStatusEl.textContent = '🟠 Є незбережені зміни';
  }

  nameInput.addEventListener('input', markUnsaved);
  dateInput.addEventListener('change', markUnsaved);

  // ==========================================
  // 4. ЛОГІКА БЛОКІВ ДОСЛІДЖЕННЯ
  // ==========================================
  var blockCounter = 0;

  function createCitBlock(data) {
    blockCounter++;
    data = data || { title: "Дослідження CIT №" + blockCounter, tests: [] };

    var block = document.createElement('div');
    block.className = 'cit-block';
    
    var matrixHtml = '<table class="cit-matrix-table"><thead><tr><th>CIT\\Score</th>';
    for(var s=0; s<=16; s++) matrixHtml += '<th>'+s+'</th>';
    matrixHtml += '</tr></thead><tbody>';
    for(var t=3; t<=8; t++) {
      matrixHtml += '<tr><th>'+t+'</th>';
      for(var s=0; s<=16; s++) {
        var p = (probData[t] && probData[t][s]) ? probData[t][s] : "-";
        if (s<3 && p==="-") p=">.9";
        if (s>t*2) p="";
        matrixHtml += '<td class="cit-matrix-cell" data-t="'+t+'" data-s="'+s+'">'+p+'</td>';
      }
      matrixHtml += '</tr>';
    }
    matrixHtml += '</tbody></table>';

    block.innerHTML = `
      <div class="cit-block-header">
        <input type="text" class="cit-block-title" value="${data.title}" placeholder="Назва дослідження...">
        <button class="cit-btn cit-btn-danger btn-del-block">Видалити блок</button>
      </div>
      <div class="cit-layout">
        <div class="cit-tests-wrapper">
          <div style="display:flex; gap:8px; font-size:10px; font-weight:bold; color:#888; padding-left:20px; margin-bottom:4px;">
            <div style="flex:1;">ТЕМА</div><div style="flex:1;">КЛЮЧ</div><div style="width:45px; text-align:center;">ЕДА</div><div style="width:24px;"></div>
          </div>
          <div class="cit-rows"></div>
          <button class="cit-btn" style="width:100%; margin-top:8px;" class="btn-add-row">+ Додати запитання</button>
        </div>
        <div class="cit-results-wrapper">
          <div class="cit-dashboard">
            <div class="cit-dash-box"><div class="cit-dash-label">Кількість</div><div class="cit-dash-value val-count">-</div></div>
            <div class="cit-dash-box"><div class="cit-dash-label">Заг. бал</div><div class="cit-dash-value val-score">-</div></div>
            <div class="cit-dash-box"><div class="cit-dash-label">Рішення</div><div class="cit-dash-value val-decision">N/A</div></div>
          </div>
          <div class="cit-matrix-wrapper">
            <div class="cit-matrix-title"><span>Матриця ймовірностей (Pr)</span><span class="matrix-status" style="color:#3a7cfd;">Введіть дані</span></div>
            ${matrixHtml}
          </div>
        </div>
      </div>
    `;

    blocksContainer.appendChild(block);

    block.querySelector('.cit-block-title').addEventListener('input', markUnsaved);
    block.querySelector('.btn-del-block').addEventListener('click', function() {
      if(confirm('Видалити це дослідження?')) { block.remove(); markUnsaved(); }
    });

    var rowsContainer = block.querySelector('.cit-rows');
    var btnAddRow = block.querySelectorAll('.cit-btn')[1]; // Second button in block
    
    function addRow(theme, key, score) {
      var r = document.createElement('div');
      r.className = 'cit-test-row';
      r.innerHTML = `
        <span style="font-size:11px; font-weight:bold; color:#999; width:12px;" class="row-num"></span>
        <input type="text" class="cit-theme" placeholder="Тема..." value="${theme || ''}">
        <input type="text" class="cit-key" placeholder="Ключ..." value="${key || ''}">
        <input type="text" class="cit-score" placeholder="-" maxlength="1" value="${score || ''}">
        <button class="cit-btn cit-btn-danger btn-del-row" style="padding:4px 8px; font-size:14px; line-height:1;">×</button>
      `;
      rowsContainer.appendChild(r);

      r.querySelector('.cit-theme').addEventListener('input', markUnsaved);
      r.querySelector('.cit-key').addEventListener('input', markUnsaved);
      var scoreInp = r.querySelector('.cit-score');
      
      scoreInp.addEventListener('input', function(e) {
        var v = e.target.value.toUpperCase();
        if(v==='F' || v==='Ф' || v==='∅') v='А';
        if(v!=='' && v!=='0' && v!=='1' && v!=='2' && v!=='А' && v!=='A') e.target.value='';
        else e.target.value = (v==='A') ? 'А' : v;
        calcBlock(block);
        markUnsaved();
      });

      r.querySelector('.btn-del-row').addEventListener('click', function() {
        r.remove();
        updateRowNums(block);
        calcBlock(block);
        markUnsaved();
      });

      updateRowNums(block);
      calcBlock(block);
    }

    btnAddRow.addEventListener('click', function() { addRow(); markUnsaved(); });

    if(data.tests && data.tests.length > 0) {
      data.tests.forEach(function(t) { addRow(t.theme, t.key, t.score); });
    } else {
      for(var i=0; i<3; i++) addRow();
    }
  }

  function updateRowNums(block) {
    block.querySelectorAll('.cit-test-row').forEach(function(r, i) {
      r.querySelector('.row-num').textContent = (i+1)+'.';
    });
  }

  function calcBlock(block) {
    var validCount = 0;
    var totalScore = 0;
    
    block.querySelectorAll('.cit-score').forEach(function(inp) {
      inp.classList.remove('artifact');
      var v = inp.value;
      if (v==='А' || v==='A') {
        inp.classList.add('artifact');
      } else if (v!=='') {
        var n = parseInt(v, 10);
        if(!isNaN(n)) { validCount++; totalScore += n; }
      }
    });

    block.querySelector('.val-count').textContent = validCount;
    block.querySelector('.val-score').textContent = totalScore;
    var decEl = block.querySelector('.val-decision');
    var statusEl = block.querySelector('.matrix-status');
    
    var cells = block.querySelectorAll('.cit-matrix-cell');
    cells.forEach(function(c) { c.className = 'cit-matrix-cell'; });
    block.querySelector('.cit-matrix-table').classList.remove('has-data');

    if(validCount === 0) {
      decEl.textContent = 'N/A'; decEl.className = 'cit-dash-value val-no';
      statusEl.textContent = 'Введіть дані'; statusEl.style.color = '#3a7cfd';
    } else if(validCount < 3) {
      decEl.textContent = 'NO'; decEl.className = 'cit-dash-value val-no';
      statusEl.textContent = 'Мін. 3 тести'; statusEl.style.color = '#666';
    } else {
      block.querySelector('.cit-matrix-table').classList.add('has-data');
      cells.forEach(function(c) { c.classList.add('cit-cell-dimmed'); });

      var isRI = totalScore >= validCount;
      decEl.textContent = isRI ? 'RI' : 'NRI';
      decEl.className = 'cit-dash-value ' + (isRI ? 'val-ri' : 'val-nri');
      statusEl.textContent = isRI ? 'Впізнання (RI)' : 'Немає впізнання (NRI)';
      statusEl.style.color = isRI ? '#d32f2f' : '#2e7d32';

      if(validCount <= 8) {
        var targetCell = block.querySelector('.cit-matrix-cell[data-t="'+validCount+'"][data-s="'+totalScore+'"]');
        if(targetCell) {
          targetCell.classList.remove('cit-cell-dimmed');
          targetCell.classList.add('cit-cell-active');
          targetCell.classList.add(isRI ? 'res-ri' : 'res-nri');
        }
      } else {
        statusEl.textContent = decEl.textContent + ' (Макс. 8 у матриці)';
      }
    }
  }

  // ==========================================
  // 5. ЕКСПОРТ ТА ЗБЕРЕЖЕННЯ
  // ==========================================
  function collectData() {
    var state = { respondentName: nameInput.value, examDate: dateInput.value, blocks: [] };
    blocksContainer.querySelectorAll('.cit-block').forEach(function(b) {
      var tests = [];
      b.querySelectorAll('.cit-test-row').forEach(function(r) {
        tests.push({
          theme: r.querySelector('.cit-theme').value,
          key: r.querySelector('.cit-key').value,
          score: r.querySelector('.cit-score').value
        });
      });
      state.blocks.push({
        title: b.querySelector('.cit-block-title').value,
        tests: tests
      });
    });
    return state;
  }

  function performSave() {
    try {
      localStorage.setItem("cit_standalone_data", JSON.stringify(collectData()));
      isUnsaved = false;
      saveStatusEl.className = 'cit-save-status';
      saveStatusEl.textContent = '🟢 Збережено';
    } catch(e) {}
  }

  function loadData() {
    try {
      var raw = localStorage.getItem("cit_standalone_data");
      if(raw) {
        var data = JSON.parse(raw);
        nameInput.value = data.respondentName || '';
        dateInput.value = data.examDate || '';
        if(data.blocks && data.blocks.length > 0) {
          data.blocks.forEach(function(b) { createCitBlock(b); });
        } else {
          createCitBlock();
        }
      } else {
        createCitBlock();
      }
    } catch(e) { createCitBlock(); }
    performSave();
  }

  document.getElementById('cit-btn-save').addEventListener('click', performSave);
  
  document.getElementById('cit-btn-print').addEventListener('click', function() { window.print(); });
  
  document.getElementById('cit-btn-clear').addEventListener('click', function() {
    if(confirm('Очистити всі дослідження CIT?')) {
      nameInput.value = ''; dateInput.value = '';
      blocksContainer.innerHTML = ''; blockCounter = 0;
      createCitBlock();
      markUnsaved();
    }
  });

  addBlockBtn.addEventListener('click', function() { createCitBlock(); markUnsaved(); });

  document.getElementById('cit-btn-md').addEventListener('click', function() {
    var data = collectData();
    var respName = data.respondentName.trim() || 'Невідомо';
    var dateVal = data.examDate || new Date().toISOString().slice(0,10);
    
    var md = '---\n';
    md += 'tags:\n  - polygraph_report\n  - cit\n';
    md += 'date: ' + dateVal + '\n';
    md += 'respondent: ' + respName + '\n';
    md += '---\n\n';
    md += '# Звіт: Тест на приховану інформацію (CIT)\n\n';
    md += '**Респондент:** ' + respName + '\n';
    md += '**Дата проведення:** [[' + dateVal + ']]\n\n---\n\n';

    if(data.blocks.length === 0) md += '*Немає даних.*\n';

    data.blocks.forEach(function(b, idx) {
      md += '### ' + (b.title || 'Дослідження CIT №' + (idx+1)) + '\n\n';
      md += '| № | Тема | Ключ | Бал ЕДА |\n';
      md += '| :---: | :--- | :--- | :---: |\n';
      
      var validCount = 0; var totScore = 0;
      b.tests.forEach(function(t, i) {
        var s = t.score === '' ? '-' : t.score;
        md += '| ' + (i+1) + ' | ' + (t.theme || '-') + ' | ' + (t.key || '-') + ' | **' + s + '** |\n';
        if(s!=='А' && s!=='A' && s!=='-') {
          validCount++; totScore += parseInt(s, 10);
        }
      });

      md += '\n**Результат:**\n';
      md += '- **Придатних тестів:** ' + validCount + '\n';
      md += '- **Загальний бал:** ' + totScore + '\n';

      if(validCount < 3) {
        md += '- **Висновок:** **NO OPINION** (Менше 3 придатних тестів).\n';
      } else {
        var isRI = totScore >= validCount;
        md += '- **Висновок:** **' + (isRI ? 'RI (Впізнання виявлено)' : 'NRI (Ознаки впізнання відсутні)') + '**\n';
        if(validCount <= 8) {
          var probDec = probData[validCount][totScore] || "N/A";
          var probPercent = (probDec !== "N/A" && probDec !== "-") ? Math.round(parseFloat(probDec) * 100) + '%' : "N/A";
          if (probDec === "0.00") probPercent = "< 1%";
          md += '- **Ймовірність наївності (Pr):** ~' + probPercent + ' (Шанс, що опитуваний не знає деталей)\n';
        }
      }
      md += '\n---\n';
    });

    var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); 
    a.href = url; 
    a.download = 'cit-' + (respName ? respName.replace(/[^a-zа-яієїґ0-9]/gi, '_') + "-" : "") + dateVal + '.md'; 
    a.click();
    URL.revokeObjectURL(url);
  });

  // Запуск
  loadData();
});
