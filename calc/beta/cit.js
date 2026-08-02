window.CIT_API = (function() {
  
  var citAppRoot, blocksContainer, addBlockBtn;
  var blockCounter = 0;

  var escapeHtml = function(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; });
  };

  // База ймовірностей для CIT
  const probData = {
    3: { 3:"0.28", 4:"0.13", 5:"0.03", 6:"0.01" },
    4: { 3:"0.44", 4:"0.25", 5:"0.10", 6:"0.04", 7:"0.01", 8:"0.00" },
    5: { 3:"0.58", 4:"0.38", 5:"0.20", 6:"0.09", 7:"0.03", 8:"0.01", 9:"0.00", 10:"0.00" },
    6: { 3:"0.69", 4:"0.50", 5:"0.31", 6:"0.17", 7:"0.08", 8:"0.03", 9:"0.00", 10:"0.00", 11:"0.00", 12:"0.00" },
    7: { 3:"0.78", 4:"0.61", 5:"0.42", 6:"0.26", 7:"0.14", 8:"0.07", 9:"0.03", 10:"0.01", 11:"0.00", 12:"0.00", 13:"0.00", 14:"0.00" },
    8: { 3:"0.84", 4:"0.70", 5:"0.53", 6:"0.36", 7:"0.22", 8:"0.12", 9:"0.06", 10:"0.03", 11:"0.01", 12:"0.00", 13:"0.00", 14:"0.00", 15:"0.00", 16:"0.00" }
  };

  var triggerUnsaved = function() {
    if(window.APP_API) window.APP_API.markUnsaved();
  };

  function updateRowNums(block) {
    block.querySelectorAll('.cit-test-row').forEach(function(r, i) {
      r.querySelector('.row-num').textContent = (i+1)+'.';
    });
  }

  function calcBlock(block) {
    var validCount = 0;
    var totalScore = 0;
    
    // Підрахунок балів
    block.querySelectorAll('.cit-score').forEach(function(inp) {
      inp.classList.remove('artifact');
      var v = inp.value.trim().toUpperCase();
      if (v === 'А' || v === 'A') {
        inp.classList.add('artifact');
      } else if (v !== '') {
        var n = parseInt(v, 10);
        if (!isNaN(n)) { 
          validCount++; 
          totalScore += n; 
        }
      }
    });

    var valCountEl = block.querySelector('.val-count');
    var valScoreEl = block.querySelector('.val-score');
    var decEl = block.querySelector('.val-decision');
    var probEl = block.querySelector('.val-prob');
    var statusEl = block.querySelector('.matrix-status');
    var conclusionEl = block.querySelector('.cit-conclusion-text');
    var matrixTable = block.querySelector('.cit-matrix-table');
    
    if(valCountEl) valCountEl.textContent = validCount;
    if(valScoreEl) valScoreEl.textContent = totalScore;

    // Очищення матриці
    var cells = block.querySelectorAll('.cit-matrix-cell');
    cells.forEach(function(c) { 
      c.classList.remove('cit-cell-active', 'res-ri', 'res-nri'); 
    });
    if(matrixTable) matrixTable.classList.remove('has-data');

    // Логіка рішень
    if(validCount === 0) {
      if(decEl) { decEl.textContent = 'N/A'; decEl.className = 'cit-dash-value val-decision val-no'; }
      if(probEl) { probEl.textContent = '-'; }
      if(statusEl) { statusEl.textContent = 'Введіть дані'; statusEl.style.color = '#3a7cfd'; }
      if(conclusionEl) conclusionEl.innerHTML = 'Недостатньо даних для формування висновку.';
    } else if(validCount < 3) {
      if(decEl) { decEl.textContent = 'NO'; decEl.className = 'cit-dash-value val-decision val-no'; }
      if(probEl) { probEl.textContent = '-'; }
      if(statusEl) { statusEl.textContent = 'Мін. 3 тести (Введено: '+validCount+')'; statusEl.style.color = '#666'; }
      if(conclusionEl) conclusionEl.innerHTML = '<b>NO OPINION:</b> Недостатня кількість придатних тестів. Введено балів: <b>'+validCount+'</b>. Для роботи таблиці ймовірностей (CIT) необхідно щонайменше <b>3</b> запитання.';
    } else {
      if(matrixTable) matrixTable.classList.add('has-data');

      var isRI = totalScore >= validCount;
      if(decEl) {
        decEl.textContent = isRI ? 'RI' : 'NRI';
        // Важливо: зберігаємо базовий клас val-decision, щоб не втратити доступ до елемента
        decEl.className = 'cit-dash-value val-decision ' + (isRI ? 'val-ri' : 'val-nri');
      }
      if(statusEl) {
        statusEl.textContent = isRI ? 'Впізнання (RI)' : 'Немає впізнання (NRI)';
        statusEl.style.color = isRI ? '#d32f2f' : '#2e7d32';
      }

      var probStr = "";
      var probPercent = "";
      var probDisplay = "-";
      
      if(validCount <= 8) {
        // Підсвітка клітинки
        var targetCell = block.querySelector('.cit-matrix-cell[data-t="'+validCount+'"][data-s="'+totalScore+'"]');
        if(targetCell) {
          targetCell.classList.add('cit-cell-active');
          targetCell.classList.add(isRI ? 'res-ri' : 'res-nri');
          
          // Витягуємо ймовірність безпечно
          var pData = probData[validCount];
          if (pData && pData[totalScore]) {
            probStr = pData[totalScore];
          } else if (totalScore < 3) {
            probStr = ">.9";
          }
          
          if (probStr !== "" && probStr !== "-" && probStr !== ">.9") {
            probPercent = probStr === "0.00" ? "< 1%" : Math.round(parseFloat(probStr) * 100) + '%';
            probDisplay = "~ " + probPercent;
          } else if (probStr === ">.9") {
            probPercent = "> 90%";
            probDisplay = probPercent;
          }
        }
      } else {
        if(statusEl) statusEl.textContent = (isRI ? 'RI' : 'NRI') + ' (Макс. 8 у матриці)';
      }

      if(probEl) {
        probEl.textContent = probDisplay;
        probEl.style.color = isRI ? '#d32f2f' : '#222';
      }

      if(conclusionEl) {
        if (isRI) {
          conclusionEl.innerHTML = 'За результатами тесту зафіксовано сумарний бал <b>' + totalScore + '</b> при <b>' + validCount + '</b> придатних тестах. Висновок: <b>RI (Recognition Indicated)</b> — наявні ознаки впізнання/знання деталей досліджуваної події.' + (probPercent ? ' Ймовірність того, що обстежуваний є наївним (не знає деталей), становить <b>' + probPercent + '</b>.' : '');
        } else {
          conclusionEl.innerHTML = 'За результатами тесту зафіксовано сумарний бал <b>' + totalScore + '</b> при <b>' + validCount + '</b> придатних тестах. Висновок: <b>NRI (No Recognition Indicated)</b> — ознаки впізнання прихованої інформації відсутні.' + (probPercent ? ' Ймовірність того, що обстежуваний є наївним відносно деталей, становить <b>' + probPercent + '</b>.' : '');
        }
      }
    }
  }

  function createCitBlock(data) {
    blockCounter++;
    data = data || { title: "Дослідження CIT №" + blockCounter, tests: [] };

    var block = document.createElement('div');
    block.className = 'cit-block';
    
    // Генерація таблиці
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

    // Зміна пропорції на 35%
    var gridStyle = 'display: grid; grid-template-columns: 35% 1fr; gap: 15px; align-items: start;';

    block.innerHTML = 
      '<div class="cit-block-header">' +
        '<input type="text" class="cit-block-title" value="' + escapeHtml(data.title || '') + '" placeholder="Назва дослідження...">' +
        '<button class="ess-btn ess-delete-btn btn-del-block" title="Видалити дослідження">×</button>' +
      '</div>' +
      '<div class="cit-layout" style="' + gridStyle + '">' +
        '<div class="cit-tests-wrapper">' +
          '<div style="display:flex; gap:6px; font-size:10px; font-weight:bold; color:#666; padding-left:18px; margin-bottom:4px;">' +
            '<div style="flex:1;">КЛЮЧ</div><div style="width:40px; text-align:center;">ЕДА</div><div style="width:24px;"></div>' +
          '</div>' +
          '<div class="cit-rows"></div>' +
          '<button class="ess-btn cit-btn-add-row" style="width:100%; margin-top:6px; justify-content:center; background:rgba(58,124,253,0.06); color:#3a7cfd; border:1px solid #3a7cfd;">+ Додати запитання</button>' +
        '</div>' +
        '<div class="cit-results-wrapper">' +
          '<div class="cit-dashboard">' +
            '<div class="cit-dash-box"><div class="cit-dash-label">Кількість</div><div class="cit-dash-value val-count">-</div></div>' +
            '<div class="cit-dash-box"><div class="cit-dash-label">Заг. бал</div><div class="cit-dash-value val-score">-</div></div>' +
            '<div class="cit-dash-box"><div class="cit-dash-label">Рішення</div><div class="cit-dash-value val-decision val-no">N/A</div></div>' +
            '<div class="cit-dash-box"><div class="cit-dash-label">Pr (Наївність)</div><div class="cit-dash-value val-prob">-</div></div>' +
          '</div>' +
          '<div class="cit-matrix-wrapper">' +
            '<div class="cit-matrix-title"><span>Матриця ймовірностей (Pr)</span><span class="matrix-status" style="color:#3a7cfd;">Введіть дані</span></div>' +
            matrixHtml +
          '</div>' +
          '<div class="cit-conclusion-box">' +
            '<b>Висновок:</b> <span class="cit-conclusion-text">Недостатньо даних для формування висновку.</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    blocksContainer.appendChild(block);

    block.querySelector('.cit-block-title').addEventListener('input', triggerUnsaved);
    block.querySelector('.btn-del-block').addEventListener('click', function() {
      if(confirm('Видалити це дослідження?')) { block.remove(); triggerUnsaved(); }
    });

    var rowsContainer = block.querySelector('.cit-rows');
    var btnAddRow = block.querySelector('.cit-btn-add-row');
    
    function addRow(key, score) {
      var r = document.createElement('div');
      r.className = 'cit-test-row';
      r.innerHTML = 
        '<span style="font-size:11px; font-weight:bold; color:#888; width:12px;" class="row-num"></span>' +
        '<input type="text" class="cit-key" placeholder="Ключ..." value="' + escapeHtml(key || '') + '">' +
        '<input type="text" class="cit-score" placeholder="-" maxlength="1" value="' + escapeHtml(score || '') + '">' +
        '<button class="ess-delete-btn btn-del-row" style="width:22px; height:22px; font-size:14px; line-height:1;">×</button>';
      
      rowsContainer.appendChild(r);

      r.querySelector('.cit-key').addEventListener('input', triggerUnsaved);
      var scoreInp = r.querySelector('.cit-score');
      
      scoreInp.addEventListener('input', function(e) {
        var v = e.target.value.toUpperCase();
        if(v==='F' || v==='Ф' || v==='∅') v='А';
        if(v!=='' && v!=='0' && v!=='1' && v!=='2' && v!=='А' && v!=='A') e.target.value='';
        else e.target.value = (v==='A') ? 'А' : v;
        calcBlock(block);
        triggerUnsaved();
      });

      r.querySelector('.btn-del-row').addEventListener('click', function() {
        r.remove();
        updateRowNums(block);
        calcBlock(block);
        triggerUnsaved();
      });

      updateRowNums(block);
      calcBlock(block);
    }

    btnAddRow.addEventListener('click', function() { addRow(); triggerUnsaved(); });

    // Додаємо збережені питання, якщо є
    var existingTests = 0;
    if(data.tests && data.tests.length > 0) {
      data.tests.forEach(function(t) { 
        addRow(t.key, t.score); 
        existingTests++;
      });
    }
    
    // Суворе правило 4 питань: якщо введено менше 4, добиваємо порожніми рядками
    while(existingTests < 4) {
      addRow("", "");
      existingTests++;
    }
  }

  return {
    init: function() {
      citAppRoot = document.getElementById("cit-app");
      if (!citAppRoot) return;

      var citStyles = document.createElement('style');
      citStyles.innerHTML = `
        .cit-container { max-width: 880px; margin: 0 auto; width: 100%; padding-bottom: 30px; font-family: inherit; }
        .cit-block { background: #fff; padding: 15px; border-radius: 6px; border: 1px solid #ccc; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
        .cit-block-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px dashed #ccc; padding-bottom: 8px; }
        .cit-block-title { border: none; font-size: 14px; font-weight: 700; color: #222; outline: none; width: 100%; max-width: 350px; background: transparent; }
        .cit-block-title:focus { border-bottom: 2px solid #3a7cfd; }
        
        /* Пропорція 35% для ключів і 65% для таблиці */
        .cit-layout { display: grid; grid-template-columns: 35% 1fr; gap: 15px; align-items: start; }
        @media (max-width: 768px) { .cit-layout { grid-template-columns: 1fr; } }
        
        .cit-test-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; background: #f8fafc; padding: 4px 6px; border-radius: 4px; border: 1px solid #e2e8f0; }
        .cit-test-row input[type="text"] { border: 1px solid #ccc; border-radius: 3px; padding: 5px; font-size: 12px; outline: none; font-family: inherit; }
        .cit-test-row input[type="text"]:focus { border-color: #3a7cfd; }
        .cit-theme, .cit-key { flex-grow: 1; width: 100%; }
        .cit-score { width: 40px; text-align: center; font-weight: 800; font-size: 13px; }
        .cit-score.artifact { background: #fff7ed; border-color: #f97316; color: #ea580c; }
        
        /* 4 колонки в дашборді */
        .cit-dashboard { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
        .cit-dash-box { background: rgba(128,128,128,0.06); border: 1px solid #ddd; border-radius: 4px; padding: 6px 4px; text-align: center; }
        .cit-dash-label { font-size: 8.5px; font-weight: bold; color: #666; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cit-dash-value { font-size: 15px; font-weight: 900; color: #222; margin-top: 2px; }
        .val-ri { color: #d32f2f !important; }
        .val-nri { color: #2e7d32 !important; }
        .val-no { color: #757575 !important; }
        
        .cit-matrix-wrapper { background: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 8px; overflow-x: auto; }
        .cit-matrix-title { font-size: 11px; font-weight: bold; margin-bottom: 6px; color: #333; display: flex; justify-content: space-between; }
        .cit-matrix-table { width: 100%; border-collapse: collapse; font-size: 9.5px; text-align: center; }
        .cit-matrix-table th, .cit-matrix-table td { border: 1px solid #ccc; padding: 3px 1px; }
        .cit-matrix-table th { background: rgba(128,128,128,0.15); color: #222; font-weight: 800; }
        .cit-matrix-table.has-data .cit-matrix-cell:not(.cit-cell-active) { opacity: 0.25; background: #fafafa; }
        .cit-cell-active { background-color: #3a7cfd !important; color: #fff !important; font-weight: 900 !important; transform: scale(1.1); box-shadow: 0 2px 6px rgba(0,0,0,0.2); position: relative; z-index: 5; border:none; }
        .cit-cell-active.res-ri { background-color: #d32f2f !important; }
        .cit-cell-active.res-nri { background-color: #2e7d32 !important; }
        
        .cit-conclusion-box { margin-top: 10px; padding: 8px 10px; background: rgba(128,128,128,0.04); border: 1px solid #ddd; border-radius: 4px; font-size: 11.5px; line-height: 1.4; color: #333; }
        .cit-conclusion-box b { color: #111; }
        
        .cit-add-block-btn { width: 100%; padding: 8px; font-size: 13px; font-weight: bold; border: 1px solid #3a7cfd; background: rgba(58,124,253,0.08); color: #3a7cfd; border-radius: 5px; cursor: pointer; transition: 0.2s; margin-top: 10px; }
        .cit-add-block-btn:hover { background: rgba(58,124,253,0.18); }
        
        @media print {
          .cit-add-block-btn, .btn-del-block, .btn-del-row, .cit-btn-add-row { display: none !important; }
          .cit-block { border: none !important; box-shadow: none !important; margin-bottom: 20px !important; padding: 0 !important; }
          .cit-layout { display: block !important; }
          .cit-cell-active { transform: none !important; box-shadow: none !important; border: 2px solid #000 !important; color: #000 !important; background: transparent !important; }
          .cit-matrix-table.has-data .cit-matrix-cell:not(.cit-cell-active) { opacity: 1 !important; color: #666 !important; }
        }
      `;
      document.head.appendChild(citStyles);

      var citContainer = document.createElement('div');
      citContainer.className = 'cit-container';
      
      blocksContainer = document.createElement('div');
      blocksContainer.id = 'cit-blocks-container';

      addBlockBtn = document.createElement('button');
      addBlockBtn.className = 'cit-add-block-btn';
      addBlockBtn.textContent = '+ Додати дослідження CIT';
      addBlockBtn.addEventListener('click', function() { 
        createCitBlock(); 
        triggerUnsaved();
      });

      citContainer.appendChild(blocksContainer);
      citContainer.appendChild(addBlockBtn);
      citAppRoot.appendChild(citContainer);
    },

    collectState: function() {
      var blocks = [];
      if(!blocksContainer) return blocks;
      blocksContainer.querySelectorAll('.cit-block').forEach(function(b) {
        var tests = [];
        b.querySelectorAll('.cit-test-row').forEach(function(r) {
          tests.push({
            key: r.querySelector('.cit-key').value,
            score: r.querySelector('.cit-score').value
          });
        });
        blocks.push({
          title: b.querySelector('.cit-block-title').value,
          tests: tests
        });
      });
      return blocks;
    },

    restoreState: function(data) {
      if(!blocksContainer) return;
      blocksContainer.innerHTML = '';
      blockCounter = 0;
      
      var validData = null;
      if (Array.isArray(data)) validData = data;
      else if (data && Array.isArray(data.blocks)) validData = data.blocks;
      
      if(validData && validData.length > 0) {
        validData.forEach(function(b) { createCitBlock(b); });
      } else {
        createCitBlock(null);
      }
    },

    clearAll: function() {
      if(!blocksContainer) return;
      blocksContainer.innerHTML = '';
      blockCounter = 0;
      createCitBlock(null);
    },

    getMarkdown: function() {
      var data = this.collectState();
      if(data.length === 0) return "";
      var md = "";
      data.forEach(function(b, idx) {
        md += '### ' + (b.title || 'Дослідження CIT №' + (idx+1)) + '\n\n';
        md += '| № | Ключ | Бал ЕДА |\n';
        md += '| :---: | :--- | :---: |\n';
        
        var validCount = 0; var totScore = 0;
        b.tests.forEach(function(t, i) {
          var s = t.score === '' ? '-' : t.score;
          md += '| ' + (i+1) + ' | ' + (t.key || '-') + ' | **' + s + '** |\n';
          if(s!=='А' && s!=='A' && s!=='-') {
            validCount++; totScore += parseInt(s, 10);
          }
        });

        md += '\n**Результат дослідження:**\n';
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
            md += '- **Ймовірність наївності (Pr):** ~' + probPercent + '\n';
          }
        }
        md += '\n---\n';
      });
      return md;
    }
  };
})();
