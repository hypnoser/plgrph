window.CIT_API = (function() {
  
  var citAppRoot, blocksContainer, addBlockBtn;
  var blockCounter = 0;
  var currentEditBlockId = null;
  var currentEditTestIndex = null;

  var escapeHtml = function(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; });
  };

  var triggerUnsaved = function() {
    if(window.APP_API) window.APP_API.markUnsaved();
  };

  // Алгоритм точної калькуляції ймовірностей (Поліноміальний розподіл).
  // Ідеально підтримує стандартну матрицю Ліккена
  function calculateDynamicPr(testsArray) {
    if (testsArray.length === 0) return [];
    var poly = [1.0];
    for (var i = 0; i < testsArray.length; i++) {
      var k = testsArray[i].optionsCount;
      if (k < 3) k = 3; 
      var p2 = 1 / k;
      var p1 = 1 / k;
      var p0 = (k - 2) / k;
      
      var next_poly = new Array(poly.length + 2).fill(0);
      for (var j = 0; j < poly.length; j++) {
        next_poly[j] += poly[j] * p0;
        next_poly[j+1] += poly[j] * p1;
        next_poly[j+2] += poly[j] * p2;
      }
      poly = next_poly;
    }
    
    var cumulative = new Array(poly.length).fill(0);
    var sum = 0;
    for (var m = poly.length - 1; m >= 0; m--) {
      sum += poly[m];
      cumulative[m] = sum;
    }
    return cumulative;
  }

  function formatPr(prValue) {
    if (prValue >= 0.995) return "> 99%";
    if (prValue <= 0.005) return "< 1%";
    return Math.round(prValue * 100) + "%";
  }

  function calcBlock(block) {
    var validCount = 0;
    var totalScore = 0;
    var validTestsParams = [];
    
    block.querySelectorAll('.cit-test-row').forEach(function(row) {
      var inp = row.querySelector('.cit-score');
      var optsCount = parseInt(row.getAttribute('data-options-count') || "4", 10);
      inp.classList.remove('artifact');
      var v = inp.value.trim().toUpperCase();
      
      if (v === 'А' || v === 'A') {
        inp.classList.add('artifact');
      } else if (v !== '') {
        var n = parseInt(v, 10);
        if (!isNaN(n)) { 
          validCount++; 
          totalScore += n;
          validTestsParams.push({ optionsCount: optsCount });
        }
      }
    });

    var valCountEl = block.querySelector('.val-count');
    var valScoreEl = block.querySelector('.val-score');
    var decEl = block.querySelector('.val-decision');
    var probEl = block.querySelector('.val-prob');
    var matrixWrapper = block.querySelector('.cit-matrix-wrapper');
    var conclusionEl = block.querySelector('.cit-conclusion-text');
    
    if(valCountEl) valCountEl.textContent = validCount;
    if(valScoreEl) valScoreEl.textContent = totalScore;

    if(validCount === 0) {
      if(decEl) { decEl.textContent = 'N/A'; decEl.className = 'cit-dash-value val-decision val-no'; }
      if(probEl) { probEl.textContent = '-'; probEl.style.color = '#222'; }
      if(matrixWrapper) matrixWrapper.innerHTML = '<div style="color:#666; font-size:11px;">Введіть бали для розрахунку матриці...</div>';
      if(conclusionEl) conclusionEl.innerHTML = 'Недостатньо даних для формування висновку.';
    } else if(validCount < 3) {
      if(decEl) { decEl.textContent = 'NO'; decEl.className = 'cit-dash-value val-decision val-no'; }
      if(probEl) { probEl.textContent = '-'; probEl.style.color = '#222'; }
      if(matrixWrapper) matrixWrapper.innerHTML = '<div style="color:#d32f2f; font-size:11px;"><b>Увага:</b> Для роботи статистичної матриці необхідно щонайменше <b>3</b> придатних тести.</div>';
      if(conclusionEl) conclusionEl.innerHTML = '<b>NO OPINION:</b> Недостатня кількість придатних тестів (Введено: <b>'+validCount+'</b>).';
    } else {
      var isRI = totalScore >= validCount;
      if(decEl) {
        decEl.textContent = isRI ? 'RI' : 'NRI';
        decEl.className = 'cit-dash-value val-decision ' + (isRI ? 'val-ri' : 'val-nri');
      }

      var cumulativePr = calculateDynamicPr(validTestsParams);
      var currentPr = (totalScore < cumulativePr.length) ? cumulativePr[totalScore] : 0;
      var probDisplay = formatPr(currentPr);

      if(probEl) {
        probEl.textContent = probDisplay;
        probEl.style.color = isRI ? '#d32f2f' : '#2e7d32';
      }

      // ГЕНЕРАЦІЯ МУЛЬТИ-РЯДКОВОЇ ТАБЛИЦІ
      var baseTests = validTestsParams;
      var startRow = Math.max(3, validCount - 2);
      var endRow = Math.max(startRow + 4, validCount + 2); // Гарантує мінімум 5 рядків

      var maxPossibleScore = endRow * 2;
      var tableHtml = '<div class="cit-matrix-title">Динамічна матриця ймовірностей (Pr)</div>';
      tableHtml += '<table class="cit-matrix-table has-data"><thead><tr><th>Кількість тестів \\ Бал</th>';
      for(var s = 0; s <= maxPossibleScore; s++) {
        tableHtml += '<th>' + s + '</th>';
      }
      tableHtml += '</tr></thead><tbody>';

      for (var r = startRow; r <= endRow; r++) {
        var rowTests = [];
        for (var i = 0; i < r; i++) {
          if (i < baseTests.length) {
            rowTests.push(baseTests[i]);
          } else {
            // Для теоретичних майбутніх рядків припускаємо структуру останнього придатного тесту
            rowTests.push(baseTests[baseTests.length - 1]);
          }
        }
        
        var rowPr = calculateDynamicPr(rowTests);
        
        tableHtml += '<tr><th>' + r + '</th>';
        for(var sc = 0; sc <= maxPossibleScore; sc++) {
          var pVal = (sc < rowPr.length) ? rowPr[sc] : 0;
          var pStr = formatPr(pVal);
          
          if (sc > r * 2) pStr = ""; // Ховаємо неможливі бали

          // Щоб відповідати Ліккену, високі ймовірності в початкових стовпцях візуалізуються як >.99
          if (sc < 3 && pStr === "> 99%") pStr = ">.99"; 
          
          var activeClass = (r === validCount && sc === totalScore) ? ('cit-cell-active ' + (isRI ? 'res-ri' : 'res-nri')) : 'cit-cell-dimmed';
          tableHtml += '<td class="' + activeClass + '">' + pStr + '</td>';
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';
      
      if(matrixWrapper) matrixWrapper.innerHTML = tableHtml;

      if(conclusionEl) {
        if (isRI) {
          conclusionEl.innerHTML = 'Зафіксовано сумарний бал <b>' + totalScore + '</b> при <b>' + validCount + '</b> придатних тестах. Висновок: <b>RI (Впізнання)</b> — наявні ознаки знання деталей події. Ймовірність того, що обстежуваний є наївним (не знає деталей), становить <b>' + probDisplay + '</b>.';
        } else {
          conclusionEl.innerHTML = 'Зафіксовано сумарний бал <b>' + totalScore + '</b> при <b>' + validCount + '</b> придатних тестах. Висновок: <b>NRI (Немає впізнання)</b> — ознаки прихованої інформації відсутні. Ймовірність того, що обстежуваний є наївним, становить <b>' + probDisplay + '</b>.';
        }
      }
    }
  }

  function getTestState(row) {
    var opts = [];
    try { opts = JSON.parse(row.getAttribute('data-options')); } catch(e) {}
    if(!opts || opts.length < 4) opts = ["", "", "", ""];
    var keyIdx = parseInt(row.getAttribute('data-key-index') || "0", 10);
    var score = row.querySelector('.cit-score').value;
    return { options: opts, keyIndex: keyIdx, score: score };
  }

  function renderTestRow(block, testData, index) {
    var r = document.createElement('div');
    r.className = 'cit-test-row';
    
    var opts = testData.options;
    var keyIdx = testData.keyIndex;
    var keyText = opts[keyIdx] || "...";
    
    r.setAttribute('data-options', JSON.stringify(opts));
    r.setAttribute('data-key-index', keyIdx);
    r.setAttribute('data-options-count', opts.length);

    r.innerHTML = 
      '<button class="ess-btn cit-btn-edit" style="width:28px; height:28px; font-size:14px; padding:0; display:flex; align-items:center; justify-content:center; border:1px solid #ccc; background:#fff; color:#555;" title="Редагувати питання">📝</button>' +
      '<span class="cit-test-name" style="flex:1; font-size:13px; font-weight:700; color:#333; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-left:8px;">Тест №<span class="t-num">' + (index+1) + '</span>: <span style="color:#3a7cfd;">' + escapeHtml(keyText) + '</span></span>' +
      '<input type="text" class="cit-score" placeholder="-" maxlength="1" value="' + escapeHtml(testData.score || '') + '" title="Допустимо: 0, 1, 2, А">' +
      '<button class="ess-delete-btn btn-del-row" style="width:28px; height:28px; font-size:16px; line-height:1; margin-left:4px;">×</button>';
    
    block.querySelector('.cit-rows').appendChild(r);

    r.querySelector('.cit-btn-edit').addEventListener('click', function() {
      openModal(block.id, index, r);
    });

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
      if(confirm('Видалити цей тест?')) {
        r.remove();
        updateRowNames(block);
        calcBlock(block);
        triggerUnsaved();
      }
    });

    return r;
  }

  function updateRowNames(block) {
    block.querySelectorAll('.cit-test-row').forEach(function(r, i) {
      r.querySelector('.t-num').textContent = (i+1);
    });
  }

  function createCitBlock(data) {
    blockCounter++;
    var bId = 'cit-block-' + blockCounter;
    data = data || { title: "Дослідження CIT №" + blockCounter, tests: [] };

    var block = document.createElement('div');
    block.className = 'cit-block';
    block.id = bId;

    var gridStyle = 'display: grid; grid-template-columns: 35% 1fr; gap: 15px; align-items: start;';

    block.innerHTML = 
      '<div class="cit-block-header">' +
        '<input type="text" class="cit-block-title" value="' + escapeHtml(data.title || '') + '" placeholder="Назва дослідження...">' +
        '<button class="ess-btn ess-delete-btn btn-del-block" title="Видалити дослідження">×</button>' +
      '</div>' +
      '<div class="cit-layout" style="' + gridStyle + '">' +
        '<div class="cit-tests-wrapper">' +
          '<div style="display:flex; gap:6px; font-size:10px; font-weight:bold; color:#666; margin-bottom:6px; border-bottom:1px solid #eee; padding-bottom:4px;">' +
            '<div style="width:28px;"></div><div style="flex:1; margin-left:8px;">ТЕСТ / КЛЮЧ</div><div style="width:40px; text-align:center;">ЕДА</div><div style="width:32px;"></div>' +
          '</div>' +
          '<div class="cit-rows"></div>' +
          '<button class="ess-btn cit-btn-add-row" style="width:100%; margin-top:10px; justify-content:center; background:rgba(58,124,253,0.06); color:#3a7cfd; border:1px solid #3a7cfd;">+ Додати тест</button>' +
        '</div>' +
        '<div class="cit-results-wrapper">' +
          '<div class="cit-dashboard">' +
            '<div class="cit-dash-box"><div class="cit-dash-label">Придатних</div><div class="cit-dash-value val-count">-</div></div>' +
            '<div class="cit-dash-box"><div class="cit-dash-label">Заг. бал</div><div class="cit-dash-value val-score">-</div></div>' +
            '<div class="cit-dash-box"><div class="cit-dash-label">Рішення</div><div class="cit-dash-value val-decision val-no">N/A</div></div>' +
            '<div class="cit-dash-box"><div class="cit-dash-label">Pr (Наївність)</div><div class="cit-dash-value val-prob">-</div></div>' +
          '</div>' +
          '<div class="cit-matrix-wrapper"></div>' +
          '<div class="cit-conclusion-box">' +
            '<b>Висновок:</b> <span class="cit-conclusion-text">Недостатньо даних для формування висновку.</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    blocksContainer.appendChild(block);

    block.querySelector('.cit-block-title').addEventListener('input', triggerUnsaved);
    block.querySelector('.btn-del-block').addEventListener('click', function() {
      if(confirm('Видалити це дослідження повністю?')) { block.remove(); triggerUnsaved(); }
    });

    var btnAddRow = block.querySelector('.cit-btn-add-row');
    btnAddRow.addEventListener('click', function() { 
      var newIndex = block.querySelectorAll('.cit-test-row').length;
      var newRow = renderTestRow(block, {options:["","","",""], keyIndex:0, score:""}, newIndex);
      calcBlock(block);
      triggerUnsaved();
      openModal(block.id, newIndex, newRow);
    });

    var existingTests = 0;
    if(data.tests && data.tests.length > 0) {
      data.tests.forEach(function(t, i) { 
        if(t.key !== undefined && !t.options) t = { options: [t.key, "", "", ""], keyIndex:0, score: t.score };
        renderTestRow(block, t, i); 
        existingTests++;
      });
    }
    
    while(existingTests < 4) {
      renderTestRow(block, {options:["","","",""], keyIndex:0, score:""}, existingTests);
      existingTests++;
    }

    calcBlock(block);
  }

  // ==========================================
  // ЛОГІКА МОДАЛЬНОГО ВІКНА
  // ==========================================
  var modalEl, modalOptsContainer;

  function initModal() {
    modalEl = document.createElement('div');
    modalEl.id = 'cit-global-modal';
    modalEl.className = 'ess-modal-overlay';
    modalEl.innerHTML = 
      '<div class="ess-modal" style="max-width:500px;">' +
        '<div class="ess-modal-header">' +
          '<h3 id="cit-modal-title">Питання для Тесту</h3>' +
          '<button class="ess-modal-close" id="cit-modal-close-x">&times;</button>' +
        '</div>' +
        '<div style="font-size:11px; color:#666; margin-bottom:10px;">Введіть усі варіанти відповідей (мінімум 4). Відмітьте радіокнопкою те питання, яке є Ключем.</div>' +
        '<div class="ess-modal-body" id="cit-modal-options-list" style="max-height:50vh; overflow-y:auto; padding-right:5px;"></div>' +
        '<button class="ess-btn" id="cit-modal-add-btn" style="width:100%; margin-top:10px; background:rgba(58,124,253,0.06); color:#3a7cfd; border:1px dashed #3a7cfd; justify-content:center;">+ Додати варіант відповіді</button>' +
        '<div class="ess-modal-footer" style="margin-top:15px; padding-top:10px; border-top:1px solid #eee;">' +
          '<button class="ess-btn ess-modal-save" id="cit-modal-save">💾 Зберегти</button>' +
          '<button class="ess-btn ess-modal-cancel" id="cit-modal-cancel">Скасувати</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modalEl);

    modalOptsContainer = document.getElementById('cit-modal-options-list');

    var closeFn = function() { modalEl.classList.remove('active'); currentEditBlockId = null; currentEditTestIndex = null; };
    document.getElementById('cit-modal-close-x').addEventListener('click', closeFn);
    document.getElementById('cit-modal-cancel').addEventListener('click', closeFn);
    
    document.getElementById('cit-modal-add-btn').addEventListener('click', function() {
      renderModalOption("", false);
    });

    document.getElementById('cit-modal-save').addEventListener('click', function() {
      if(!currentEditBlockId) return;
      var block = document.getElementById(currentEditBlockId);
      if(!block) return;
      var rows = block.querySelectorAll('.cit-test-row');
      if(currentEditTestIndex >= rows.length) return;
      var targetRow = rows[currentEditTestIndex];

      var opts = [];
      var keyIdx = 0;
      modalOptsContainer.querySelectorAll('.cit-modal-opt-row').forEach(function(r, idx) {
        opts.push(r.querySelector('.cit-modal-opt-input').value.trim());
        if(r.querySelector('input[type="radio"]').checked) keyIdx = idx;
      });

      if(opts.length < 4) {
        alert("Мінімум 4 варіанти відповідей!");
        return;
      }

      targetRow.setAttribute('data-options', JSON.stringify(opts));
      targetRow.setAttribute('data-key-index', keyIdx);
      targetRow.setAttribute('data-options-count', opts.length);
      
      var keyText = opts[keyIdx] || "...";
      targetRow.querySelector('.cit-test-name').innerHTML = 'Тест №<span class="t-num">' + (currentEditTestIndex+1) + '</span>: <span style="color:#3a7cfd;">' + escapeHtml(keyText) + '</span>';

      calcBlock(block);
      triggerUnsaved();
      closeFn();
    });
  }

  function renderModalOption(val, isKey) {
    var r = document.createElement('div');
    r.className = 'cit-modal-opt-row';
    r.style.cssText = 'display:flex; gap:10px; align-items:center; margin-bottom:8px; background:#f9f9f9; padding:6px; border:1px solid #ddd; border-radius:4px;';
    
    r.innerHTML = 
      '<input type="radio" name="cit-modal-key" style="cursor:pointer; width:16px; height:16px;" ' + (isKey ? 'checked' : '') + ' title="Позначити як Ключ">' +
      '<input type="text" class="cit-modal-opt-input" style="flex:1; padding:6px; border:1px solid #ccc; border-radius:3px; font-size:13px;" value="' + escapeHtml(val) + '" placeholder="Варіант відповіді...">' +
      '<button class="ess-delete-btn cit-modal-opt-del" style="width:24px; height:24px; font-size:14px; padding:0; flex-shrink:0;">×</button>';
    
    modalOptsContainer.appendChild(r);

    r.querySelector('.cit-modal-opt-del').addEventListener('click', function() {
      if(modalOptsContainer.querySelectorAll('.cit-modal-opt-row').length <= 4) {
        alert("Дослідження CIT вимагає мінімум 4 варіанти відповідей (з них 1 ключ).");
        return;
      }
      var wasChecked = r.querySelector('input[type="radio"]').checked;
      r.remove();
      if(wasChecked) {
        var firstRadio = modalOptsContainer.querySelector('input[type="radio"]');
        if(firstRadio) firstRadio.checked = true;
      }
    });
  }

  function openModal(blockId, testIndex, rowEl) {
    currentEditBlockId = blockId;
    currentEditTestIndex = testIndex;
    
    document.getElementById('cit-modal-title').textContent = "Питання для Тесту №" + (testIndex + 1);
    modalOptsContainer.innerHTML = '';

    var state = getTestState(rowEl);
    state.options.forEach(function(opt, idx) {
      renderModalOption(opt, idx === state.keyIndex);
    });

    modalEl.classList.add('active');
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
        
        .cit-layout { display: grid; grid-template-columns: 35% 1fr; gap: 15px; align-items: start; }
        @media (max-width: 768px) { .cit-layout { grid-template-columns: 1fr; } }
        
        .cit-test-row { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; background: #f8fafc; padding: 4px 6px; border-radius: 4px; border: 1px solid #e2e8f0; transition: background 0.2s; }
        .cit-test-row:hover { background: #f1f5f9; }
        .cit-score { width: 40px; text-align: center; font-weight: 800; font-size: 13px; border: 1px solid #ccc; border-radius: 3px; padding: 5px; outline: none; }
        .cit-score:focus { border-color: #3a7cfd; }
        .cit-score.artifact { background: #fff7ed; border-color: #f97316; color: #ea580c; }
        
        .cit-dashboard { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
        .cit-dash-box { background: rgba(128,128,128,0.06); border: 1px solid #ddd; border-radius: 4px; padding: 6px 4px; text-align: center; }
        .cit-dash-label { font-size: 8.5px; font-weight: bold; color: #666; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cit-dash-value { font-size: 15px; font-weight: 900; color: #222; margin-top: 2px; }
        .val-ri { color: #d32f2f !important; }
        .val-nri { color: #2e7d32 !important; }
        .val-no { color: #757575 !important; }
        
        .cit-matrix-wrapper { background: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 8px; overflow-x: auto; margin-bottom:10px; }
        .cit-matrix-title { font-size: 11px; font-weight: bold; margin-bottom: 8px; color: #333; text-align:center; border-bottom:1px solid #eee; padding-bottom:4px; }
        .cit-matrix-table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: center; }
        .cit-matrix-table th, .cit-matrix-table td { border: 1px solid #ccc; padding: 4px 2px; }
        .cit-matrix-table th { background: rgba(128,128,128,0.15); color: #222; font-weight: 800; }
        .cit-cell-dimmed { opacity: 0.3; background: #fafafa; }
        .cit-cell-active { background-color: #3a7cfd !important; color: #fff !important; font-weight: 900 !important; transform: scale(1.05); box-shadow: 0 2px 6px rgba(0,0,0,0.2); position: relative; z-index: 5; border:1px solid #fff; }
        .cit-cell-active.res-ri { background-color: #d32f2f !important; }
        .cit-cell-active.res-nri { background-color: #2e7d32 !important; }
        
        .cit-conclusion-box { padding: 8px 10px; background: rgba(128,128,128,0.04); border: 1px solid #ddd; border-radius: 4px; font-size: 12px; line-height: 1.4; color: #333; }
        .cit-add-block-btn { width: 100%; padding: 8px; font-size: 13px; font-weight: bold; border: 1px solid #3a7cfd; background: rgba(58,124,253,0.08); color: #3a7cfd; border-radius: 5px; cursor: pointer; transition: 0.2s; margin-top: 10px; }
        .cit-add-block-btn:hover { background: rgba(58,124,253,0.18); }
        
        @media print {
          .cit-add-block-btn, .btn-del-block, .btn-del-row, .cit-btn-add-row, .cit-btn-edit { display: none !important; }
          .cit-block { border: none !important; box-shadow: none !important; margin-bottom: 20px !important; padding: 0 !important; }
          .cit-layout { display: block !important; }
          .cit-cell-active { transform: none !important; box-shadow: none !important; border: 2px solid #000 !important; color: #000 !important; background: transparent !important; }
          .cit-cell-dimmed { opacity: 1 !important; color: #666 !important; }
        }
      `;
      document.head.appendChild(citStyles);

      initModal();

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
          tests.push(getTestState(r));
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
        
        var validCount = 0; var totScore = 0; var validParams = [];
        
        md += '| № | Ключ | Фойли (Інші варіанти) | Бал ЕДА |\n';
        md += '| :---: | :--- | :--- | :---: |\n';

        b.tests.forEach(function(t, i) {
          var s = t.score === '' ? '-' : t.score;
          var keyText = t.options[t.keyIndex] || "-";
          var foils = t.options.filter(function(opt, fi) { return fi !== t.keyIndex; }).join(", ");
          
          md += '| ' + (i+1) + ' | **' + keyText + '** | ' + foils + ' | **' + s + '** |\n';
          
          if(s!=='А' && s!=='A' && s!=='-') {
            validCount++; 
            totScore += parseInt(s, 10);
            validParams.push({ optionsCount: t.options.length });
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
          
          var cumulativePr = calculateDynamicPr(validParams);
          var prVal = (totScore < cumulativePr.length) ? cumulativePr[totScore] : 0;
          md += '- **Ймовірність наївності (Pr):** ~' + formatPr(prVal) + '\n';
        }
        md += '\n---\n';
      });
      return md;
    }
  };
})();
