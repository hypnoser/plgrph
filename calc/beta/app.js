document.addEventListener('DOMContentLoaded', function() {
  
  // ==========================================
  // 1. СИСТЕМА АВТОРИЗАЦІЇ
  // ==========================================
  var authOverlay = document.getElementById('auth-overlay');
  var mainAppContainer = document.getElementById('main-app-container');
  var passInput = document.getElementById('auth-password');
  var authBtn = document.getElementById('auth-submit-btn');
  var authError = document.getElementById('auth-error');

  var isAuthorized = false;
  try { isAuthorized = localStorage.getItem('polygraph_suite_auth') === 'true'; } catch(e) {}

  var unlockApp = function(saveToLocal) {
    if(authOverlay) authOverlay.style.display = 'none';
    if(mainAppContainer) mainAppContainer.style.display = 'block';
    if (saveToLocal) {
      try { localStorage.setItem('polygraph_suite_auth', 'true'); } catch(e) {}
    }
    loadFromLocalStorage(); // Завантажуємо дані після входу
  };

  if (isAuthorized) {
    unlockApp(false);
  } else {
    var checkPassword = function() {
      var val = passInput.value.trim().toLowerCase();
      // Підтримка англійської та української розкладки
      if (val === 'plgrph' || val === 'здікзр') {
        unlockApp(true);
      } else {
        if(authError) authError.style.display = 'block';
        if(authOverlay) {
          var modal = authOverlay.querySelector('.auth-modal');
          if(modal) {
            modal.style.animation = 'none';
            setTimeout(function() { modal.style.animation = 'shake 0.4s'; }, 10);
          }
        }
      }
    };
    
    if(authBtn) authBtn.addEventListener('click', checkPassword);
    if(passInput) passInput.addEventListener('keydown', function(e) { 
      if (e.key === 'Enter') checkPassword(); 
    });
  }

  // ==========================================
  // 2. ПЕРЕМИКАННЯ ВКЛАДОК (TABS)
  // ==========================================
  var tabButtons = document.querySelectorAll('.tab-btn');
  var tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      // Знімаємо active з усіх
      tabButtons.forEach(function(b) { b.classList.remove('active'); });
      tabContents.forEach(function(c) { c.classList.remove('active'); });
      
      // Додаємо active на натиснуту
      btn.classList.add('active');
      var targetId = btn.getAttribute('data-tab');
      var targetContent = document.getElementById(targetId);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // ==========================================
  // 3. ГЛОБАЛЬНИЙ ОБ'ЄКТ (API ДЛЯ МОДУЛІВ)
  // ==========================================
  // Створюємо "мости" для модулів ess.js та cit.js
  window.PolygraphApp.ess = {
    collectState: function() { return []; },
    restoreState: function(data) {},
    getMarkdown: function() { return ""; },
    clearAll: function() {}
  };
  
  window.PolygraphApp.cit = {
    collectState: function() { return []; },
    restoreState: function(data) {},
    getMarkdown: function() { return ""; },
    clearAll: function() {}
  };

  var saveStatus = document.getElementById("save-status");
  var respondentInput = document.getElementById("respondent-name");
  var dateInput = document.getElementById("exam-date");
  
  var autoSaveTimeout;

  window.PolygraphApp.markUnsaved = function() {
    if (!window.PolygraphApp.isUnsaved) { 
      window.PolygraphApp.isUnsaved = true; 
      if(saveStatus) saveStatus.classList.add("unsaved"); 
    }
    if(saveStatus) saveStatus.textContent = "🟠 Є незбережені зміни!";
    
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(window.PolygraphApp.performSave, 5000); // Автозбереження кожні 5 сек
  };

  // Реєструємо зміни в загальних полях
  if(respondentInput) respondentInput.addEventListener("input", window.PolygraphApp.markUnsaved);
  if(dateInput) dateInput.addEventListener("change", window.PolygraphApp.markUnsaved);

  // ==========================================
  // 4. ГЛОБАЛЬНЕ ЗБЕРЕЖЕННЯ ТА ЗАВАНТАЖЕННЯ
  // ==========================================
  var collectGlobalState = function() {
    return {
      respondentName: respondentInput ? respondentInput.value : "",
      examDate: dateInput ? dateInput.value : "",
      essData: window.PolygraphApp.ess.collectState(),
      citData: window.PolygraphApp.cit.collectState()
    };
  };

  window.PolygraphApp.performSave = function() {
    try {
      var state = collectGlobalState();
      localStorage.setItem("polygraph_suite_data", JSON.stringify(state));
      window.PolygraphApp.isUnsaved = false;
      if(saveStatus) {
        saveStatus.classList.remove("unsaved");
        saveStatus.textContent = "🟢 Дані збережено";
      }
    } catch (error) {
      if(saveStatus) {
        saveStatus.textContent = "❌ Помилка запису!";
        saveStatus.classList.add("unsaved");
      }
    }
  };

  var loadFromLocalStorage = function() {
    try {
      var raw = localStorage.getItem("polygraph_suite_data");
      if (raw) {
        var data = JSON.parse(raw);
        restoreGlobalState(data);
      } else {
        // Якщо даних немає, ініціалізуємо пусті модулі
        window.PolygraphApp.ess.restoreState(null);
        window.PolygraphApp.cit.restoreState(null);
      }
    } catch (e) {
      console.error("Помилка завантаження кешу");
    }
  };

  var restoreGlobalState = function(data) {
    if (!data) return;
    if (respondentInput) respondentInput.value = data.respondentName || "";
    if (dateInput) dateInput.value = data.examDate || "";
    
    // Передаємо дані у відповідні модулі
    window.PolygraphApp.ess.restoreState(data.essData);
    window.PolygraphApp.cit.restoreState(data.citData);
    
    // Оновлюємо статус
    window.PolygraphApp.performSave();
  };

  // ==========================================
  // 5. ЕКСПОРТ (JSON)
  // ==========================================
  document.getElementById("btn-save").addEventListener("click", window.PolygraphApp.performSave);

  document.getElementById("btn-save-json").addEventListener("click", function() {
    var state = collectGlobalState();
    var resp = state.respondentName.trim();
    var safeResp = resp ? resp.replace(/[^a-zа-яієїґ0-9]/gi, '_').replace(/_+/g, '_') + "-" : "";
    var dateStr = state.examDate || new Date().toISOString().slice(0,10);
    var filename = "polygraph-" + safeResp + dateStr + ".json";
    
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    
    window.PolygraphApp.performSave();
  });

  // Імпорт (JSON)
  var fileInput = document.getElementById("file-import");
  document.getElementById("btn-open").addEventListener("click", function() { fileInput.click(); });
  fileInput.addEventListener("change", function(e) { 
    if (e.target.files[0]) {
      var reader = new FileReader();
      reader.onload = function(evt) {
        try {
          var data = JSON.parse(evt.target.result);
          restoreGlobalState(data);
          alert("Дані успішно завантажено!");
        } catch (err) { alert("Помилка завантаження файлу. Невірний формат."); }
      };
      reader.readAsText(e.target.files[0]);
    }
    e.target.value = ""; 
  });

  // ==========================================
  // 6. ЕКСПОРТ У MARKDOWN (ОБ'ЄДНАНИЙ ЗВІТ)
  // ==========================================
  document.getElementById("btn-markdown").addEventListener("click", function() {
    var state = collectGlobalState();
    var respName = state.respondentName.trim() || 'Невідомо';
    var dateVal = state.examDate || new Date().toISOString().slice(0,10);
    
    var md = '---\n';
    md += 'tags:\n  - polygraph_report\n  - ess_m\n  - cit\n';
    md += 'date: ' + dateVal + '\n';
    md += 'respondent: ' + respName + '\n';
    md += '---\n\n';
    md += '# Комплексний звіт поліграфолога\n\n';
    md += '**Респондент:** ' + respName + '\n';
    md += '**Дата проведення:** [[' + dateVal + ']]\n\n';
    md += '---\n\n';
    
    // Додаємо звіт ESS-M
    var essMd = window.PolygraphApp.ess.getMarkdown();
    if (essMd && essMd.trim() !== "") {
      md += '## 1. Скринінг / Діагностика (ESS-M)\n\n';
      md += essMd + '\n\n---\n\n';
    }
    
    // Додаємо звіт CIT
    var citMd = window.PolygraphApp.cit.getMarkdown();
    if (citMd && citMd.trim() !== "") {
      md += '## 2. Тест на приховану інформацію (CIT)\n\n';
      md += citMd + '\n\n---\n\n';
    }
    
    if (!essMd && !citMd) {
      md += '*Немає даних для відображення.*\n';
    }

    var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); 
    var safeResp = respName ? respName.replace(/[^a-zа-яієїґ0-9]/gi, '_') + "-" : "";
    a.href = url; 
    a.download = 'report-' + safeResp + dateVal + '.md'; 
    a.click();
    URL.revokeObjectURL(url);
  });

  // ==========================================
  // 7. ДОДАТКОВІ ІНСТРУМЕНТИ
  // ==========================================
  document.getElementById("btn-print").addEventListener("click", function() { window.print(); });
  
  document.getElementById("btn-clear-all").addEventListener("click", function() {
    if (confirm("УВАГА! Ви впевнені, що хочете повністю очистити всі тести (ESS-M та CIT) і почати нове дослідження?")) {
      if(respondentInput) respondentInput.value = "";
      if(dateInput) dateInput.value = "";
      window.PolygraphApp.ess.clearAll();
      window.PolygraphApp.cit.clearAll();
      window.PolygraphApp.markUnsaved();
    }
  });

});
