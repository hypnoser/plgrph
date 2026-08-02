window.APP_API = (function() {
  var isUnsaved = false;
  var saveStatus, nameInp, dateInp;

  return {
    init: function() {
      saveStatus = document.getElementById('g-status');
      nameInp = document.getElementById('global-resp-name');
      dateInp = document.getElementById('global-exam-date');

      nameInp.addEventListener('input', this.markUnsaved.bind(this));
      dateInp.addEventListener('change', this.markUnsaved.bind(this));

      document.getElementById('g-save').addEventListener('click', this.performSave.bind(this));
      
      document.getElementById('g-save-json').addEventListener('click', function() {
        this.performSave();
        var state = this.collectGlobalState();
        var resp = nameInp.value.trim();
        var safeResp = resp ? resp.replace(/[^a-zа-яієїґ0-9]/gi, '_') + "-" : "";
        var dateStr = dateInp.value || new Date().toISOString().slice(0,10);
        var filename = "polygraph-suite-" + safeResp + dateStr + ".json";

        var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a"); a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      }.bind(this));

      var fileInput = document.getElementById('file-import');
      document.getElementById('g-open').addEventListener('click', function() { fileInput.click(); });
      
      fileInput.addEventListener('change', function(e) {
        if(e.target.files[0]) {
          var reader = new FileReader();
          reader.onload = function(evt) {
            try {
              var parsed = JSON.parse(evt.target.result);
              if(parsed.respondentName !== undefined) nameInp.value = parsed.respondentName;
              if(parsed.examDate !== undefined) dateInp.value = parsed.examDate;
              if(parsed.ess) window.ESS_API.restoreState(parsed.ess);
              if(parsed.cit) window.CIT_API.restoreState(parsed.cit);
              
              this.performSave();
              alert('Дані успішно завантажено!');
            } catch(err) { alert('Помилка читання файлу JSON.'); }
          }.bind(this);
          reader.readAsText(e.target.files[0]);
        }
        fileInput.value = '';
      }.bind(this));

      document.getElementById('g-print').addEventListener('click', function() { window.print(); });

      document.getElementById('g-clear').addEventListener('click', function() {
        if(confirm('Очистити всі дані в обох вкладках (Нова сесія)?')) {
          nameInp.value = ''; dateInp.value = '';
          window.ESS_API.clearAll();
          window.CIT_API.clearAll();
          this.markUnsaved();
        }
      }.bind(this));

      document.getElementById('g-help').addEventListener('click', function() { window.open('info.html', '_blank'); });

      document.getElementById('g-markdown').addEventListener('click', function() {
        var respName = nameInp.value.trim() || 'Невідомо';
        var dateVal = dateInp.value || new Date().toISOString().slice(0,10);
        
        var md = '---\n';
        md += 'tags:\n  - polygraph_report\n  - suite\n';
        md += 'date: ' + dateVal + '\n';
        md += 'respondent: ' + respName + '\n';
        md += '---\n\n';
        md += '# Комплексний звіт поліграфолога\n\n';
        md += '**Респондент:** ' + respName + '\n';
        md += '**Дата проведення:** [[' + dateVal + ']]\n\n---\n\n';

        var essMd = window.ESS_API.getMarkdown();
        if(essMd) md += '## 1. Скринінг / Діагностика (ESS-M)\n\n' + essMd + '\n\n---\n\n';
        
        var citMd = window.CIT_API.getMarkdown();
        if(citMd) md += '## 2. Тест на приховану інформацію (CIT)\n\n' + citMd + '\n\n---\n\n';

        var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a"); 
        var safeResp = respName ? respName.replace(/[^a-zа-яієїґ0-9]/gi, '_') + "-" : "";
        a.href = url; a.download = 'polygraph-suite-' + safeResp + dateVal + '.md'; a.click();
        URL.revokeObjectURL(url);
      }.bind(this));
    },

    collectGlobalState: function() {
      return {
        respondentName: nameInp.value,
        examDate: dateInp.value,
        ess: window.ESS_API.collectState(),
        cit: window.CIT_API.collectState()
      };
    },

    markUnsaved: function() {
      if(!isUnsaved) {
        isUnsaved = true;
        if(saveStatus) { saveStatus.classList.add('unsaved'); saveStatus.textContent = '🟠 Є незбережені зміни'; }
      }
    },

    performSave: function() {
      try {
        localStorage.setItem('polygraph_suite_data', JSON.stringify(this.collectGlobalState()));
        isUnsaved = false;
        if(saveStatus) { saveStatus.classList.remove('unsaved'); saveStatus.textContent = '🟢 Дані збережено'; }
      } catch(e) {
        if(saveStatus) { saveStatus.classList.add('unsaved'); saveStatus.textContent = '❌ Помилка запису'; }
      }
    },

    loadData: function() {
      try {
        var raw = localStorage.getItem('polygraph_suite_data');
        if(raw) {
          var parsed = JSON.parse(raw);
          if(parsed.respondentName !== undefined) nameInp.value = parsed.respondentName;
          if(parsed.examDate !== undefined) dateInp.value = parsed.examDate;
          if(parsed.ess) window.ESS_API.restoreState(parsed.ess);
          if(parsed.cit) window.CIT_API.restoreState(parsed.cit);
        } else {
          window.ESS_API.restoreState(null);
          window.CIT_API.restoreState(null);
        }
      } catch(e) {
        window.ESS_API.restoreState(null);
        window.CIT_API.restoreState(null);
      }
    }
  };
})();

document.addEventListener('DOMContentLoaded', function() {
  window.ESS_API.init();
  window.CIT_API.init();
  window.APP_API.init();
  window.APP_API.loadData();

  var tabBtns = document.querySelectorAll('.suite-tab-btn');
  var tabContents = document.querySelectorAll('.suite-tab-content');
  tabBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      tabBtns.forEach(function(b) { b.classList.remove('active'); });
      tabContents.forEach(function(c) { c.style.display = 'none'; c.classList.remove('active'); });
      btn.classList.add('active');
      var targetEl = document.getElementById(btn.getAttribute('data-target'));
      if(targetEl) { targetEl.style.display = 'block'; targetEl.classList.add('active'); }
    });
  });

  var authOverlay = document.getElementById('auth-overlay');
  var mainAppContainer = document.getElementById('main-app-container');
  var passInput = document.getElementById('auth-password');
  var authBtn = document.getElementById('auth-submit-btn');
  var authError = document.getElementById('auth-error');

  var isAuthorized = false;
  try { isAuthorized = localStorage.getItem('suite_auth') === 'true'; } catch(e) {}

  var unlockApp = function(saveToLocal) {
    authOverlay.style.display = 'none';
    mainAppContainer.style.display = 'block';
    if (saveToLocal) { try { localStorage.setItem('suite_auth', 'true'); } catch(e) {} }
  };

  if (isAuthorized) { unlockApp(false); } 
  else {
    var checkPassword = function() {
      var val = passInput.value.trim().toLowerCase();
      if (val === 'plgrph' || val === 'здікзр') unlockApp(true);
      else {
        authError.style.display = 'block';
        var modal = authOverlay.querySelector('.auth-modal');
        modal.style.animation = 'none';
        setTimeout(function() { modal.style.animation = 'shake 0.4s'; }, 10);
      }
    };
    authBtn.addEventListener('click', checkPassword);
    passInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') checkPassword(); });
  }
});
