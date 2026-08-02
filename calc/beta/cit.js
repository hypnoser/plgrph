window.CIT_API = (function() {
  
  var citAppRoot, blocksContainer, addBlockBtn;
  var blockCounter = 0;

  var escapeHtml = function(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; });
  };

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
    
    block.querySelectorAll('.cit-score').forEach(function(inp) {
      inp.classList.remove('artifact');
      var v = inp.value.trim();
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

    block.querySelector('.val-count').textContent = validCount;
    block.querySelector('.val-score').textContent = totalScore;
    var decEl = block.querySelector('.val-decision');
    var statusEl = block.querySelector('.matrix-status');
    var conclusionEl = block.querySelector('.cit-conclusion-text');
    var matrixTable = block.querySelector('.cit-matrix-table');
    
    var cells = block.querySelectorAll('.cit-matrix-cell');
    cells.forEach(function(c) { 
      c.classList.remove('cit-cell-active', 'res-ri', 'res-nri'); 
    });
    matrixTable.classList.remove('has-data');

    if(validCount === 0) {
      decEl.textContent = 'N/A'; decEl.className = 'cit-dash-value val-no';
      statusEl.textContent = 'Введіть дані'; statusEl.style.color = '#3a7cfd';
      conclusionEl.innerHTML = 'Недостатньо даних для формування висновку. Для роботи матриці Ліккена необхідно мінімум 3 запитання.';
    } else if(validCount < 3) {
      decEl.textContent = 'NO'; decEl.className = 'cit-dash-value val-no';
      statusEl.textContent = 'Мін. 3 тести (Зараз: '+validCount+')'; statusEl.style.color = '#666';
      conclusionEl.innerHTML = '<b>NO OPINION:</b> Недостатня кількість придатних тестів. Введено балів: <b>'+validCount+'</b>. Для роботи таблиці ймовірностей (CIT) необхідно щонайменше <b>3</b> запитання.';
    } else {
      matrixTable.classList.add('has-data');

      var isRI = totalScore >= validCount;
      decEl.textContent = isRI ? 'RI' : 'NRI';
      decEl.className = 'cit-dash-value ' + (isRI ? 'val-ri' : 'val-nri');
      statusEl.textContent = isRI ? 'Впізнання (RI)' : 'Немає впізнання (NRI)';
      statusEl.style.color = isRI ? '#d32f2f' : '#2e7d32';

      var probStr = "";
      var probPercent = "";
      if(validCount <= 8) {
        var targetCell = block.querySelector('.cit-matrix-cell[data-t="'+validCount+'"][data-s="'+totalScore+'"]');
        if(targetCell) {
          targetCell.classList.add('cit-cell-active');
          targetCell.classList.add(isRI ? 'res-ri' : 'res-nri');
          probStr = probData[validCount][totalScore] || "";
          if (probStr !== "" && probStr !== "-") {
            probPercent = probStr === "0.00" ? "< 1%" : Math.round(parseFloat(probStr) * 100) + '%';
          }
        }
      } else {
        statusEl.textContent = decEl.textContent + ' (Макс. 8 у матриці)';
      }

      if (isRI) {
        conclusionEl.innerHTML = 'За результатами тесту зафіксовано сумарний бал <b>' + totalScore + '</b> при <b>' + validCount + '</b> придатних тестах. Висновок: <b>RI (Recognition Indicated)</b> — наявні ознаки впізнання/знання деталей досліджуваної події.' + (probPercent ? ' Ймовірність того, що обстежуваний є наївним (не знає деталей), становить приблизно <b>' + probPercent + '</b>.' : '');
      } else {
        conclusionEl.innerHTML = 'За результатами тесту зафіксовано сумарний бал <b>' + totalScore + '</b> при <b>' + validCount + '</b> придатних тестах. Висновок: <b>NRI (No Recognition Indicated)</b> — ознаки впізнання прихованої інформації відсутні.' + (probPercent ? ' Ймовірність того, що обстежуваний є наївним відносно деталей, становить приблизно <b>' + probPercent + '</b>.' : '');
      }
    }
  }

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
            '<div class="cit-dash-box"><div class="cit-dash-label">Рішення</div><div class="cit-dash-value val-decision">N/A</div></div>' +
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

    var existingTests = (data.tests && data.tests.length > 0) ? data.tests.length : 0;
    if(existingTests > 0) {
      data.tests.forEach(function(t) { addRow(t.key, t.score); });
    }
    
    // СУВОРЕ ПРАВИЛО: Добиваємо порожніми рядками, щоб завжди було мінімум 4 питання
    var currentRows = block.querySelectorAll('.cit-test-row').length;
    while(currentRows < 4) {
      addRow("", "");
      currentRows++;
    }
  }

  return {
    init: function() {
      citAppRoot = document.getElementById("cit-app");
      if (!citAppRoot) return;

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
      if(Array.isArray(data) && data.length > 0) {
        data.forEach(function(b) { createCitBlock(b); });
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
