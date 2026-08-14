window.APP_API = (function () {
  var S = window.STRINGS;
  var isUnsaved = false;
  var saveStatus, nameInp, dateInp;

  function checkJSZip() {
    if (typeof JSZip === 'undefined') { alert(S.err_jszip_missing); return false; }
    return true;
  }

  function dataUrlToUint8(dataUrl) {
    var base64 = dataUrl.split(',')[1];
    var binary = atob(base64);
    var arr = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
  }

  function uint8ToDataUrl(uint8, mimeType) {
    var binary = '';
    for (var i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
    return 'data:' + mimeType + ';base64,' + btoa(binary);
  }

  function getMimeFromName(name) {
    var ext = name.split('.').pop().toLowerCase();
    var map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' };
    return map[ext] || 'image/jpeg';
  }

  function collectGlobalState() {
    var notesState = window.NOTES_API ? window.NOTES_API.collectState() : { text: '', imagesMeta: [] };
    return {
      respondentName: nameInp ? nameInp.value : '',
      examDate: dateInp ? dateInp.value : '',
      ess: window.ESS_API ? window.ESS_API.collectState() : [],
      cit: window.CIT_API ? window.CIT_API.collectState() : [],
      notes: notesState.text || '',
      imagesMeta: notesState.imagesMeta || []
    };
  }

  function performSave() {
    try {
      localStorage.setItem('polygraph_suite_data', JSON.stringify(collectGlobalState()));
      isUnsaved = false;
      if (saveStatus) { saveStatus.classList.remove('unsaved'); saveStatus.textContent = S.status_saved; }
    } catch (e) {
      if (saveStatus) { saveStatus.classList.add('unsaved'); saveStatus.textContent = S.status_error; }
    }
  }

  function loadData() {
    try {
      var raw = localStorage.getItem('polygraph_suite_data');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.tests && !parsed.ess) parsed.ess = parsed.tests;
        if (parsed.respondentName !== undefined && nameInp) nameInp.value = parsed.respondentName;
        if (parsed.examDate !== undefined && dateInp) dateInp.value = parsed.examDate;

        if (window.ESS_API) window.ESS_API.restoreState(parsed.ess || []);
        if (window.CIT_API) window.CIT_API.restoreState(parsed.cit || []);
        if (window.NOTES_API) window.NOTES_API.restoreState({ text: parsed.notes || '', imagesMeta: parsed.imagesMeta || [] });
      } else {
        if (window.ESS_API) window.ESS_API.restoreState([]);
        if (window.CIT_API) window.CIT_API.restoreState([]);
        if (window.NOTES_API) window.NOTES_API.restoreState({ text: '', imagesMeta: [] });
      }
    } catch (err) {
      console.error('loadData Error:', err);
    }
  }

  function handleJsonLoad(parsed) {
    if (parsed.tests && !parsed.ess) parsed.ess = parsed.tests;
    var cleanState = {
      respondentName: parsed.respondentName || '',
      examDate: parsed.examDate || '',
      ess: parsed.ess || [],
      cit: parsed.cit || [],
      notes: parsed.notes || '',
      imagesMeta: parsed.imagesMeta || []
    };
    localStorage.setItem('polygraph_suite_data', JSON.stringify(cleanState));
    location.reload();
  }

  function handleZipLoad(file) {
    if (!checkJSZip()) return;
    JSZip.loadAsync(file).then(function (zip) {
      var jsonFile = zip.file('data.json');
      if (!jsonFile) { alert(S.err_zip_no_json); return; }
      jsonFile.async('string').then(function (jsonStr) {
        var parsed;
        try { parsed = JSON.parse(jsonStr); } catch (e) { alert(S.err_zip_bad_json); return; }
        if (parsed.tests && !parsed.ess) parsed.ess = parsed.tests;
        var cleanState = {
          respondentName: parsed.respondentName || '',
          examDate: parsed.examDate || '',
          ess: parsed.ess || [],
          cit: parsed.cit || [],
          notes: parsed.notes || '',
          // навмисно порожній: реальні id призначаються в restoreImagesFromZip
          // після reload, щоб уникнути дублювання зображень
          imagesMeta: []
        };
        localStorage.setItem('polygraph_suite_data', JSON.stringify(cleanState));

        var imageFiles = [];
        var folder = zip.folder('images');
        if (folder) folder.forEach(function (relativePath, f) { imageFiles.push({ name: relativePath, file: f }); });
        if (imageFiles.length === 0) { location.reload(); return; }

        var pending = imageFiles.length;
        var imagesForRestore = [];
        imageFiles.forEach(function (item) {
          item.file.async('uint8array').then(function (data) {
            var mime = getMimeFromName(item.name);
            var dataUrl = uint8ToDataUrl(data, mime);
            imagesForRestore.push({ name: item.name, dataUrl: dataUrl });
            pending--;
            if (pending === 0) {
              sessionStorage.setItem('polygraph_zip_images', JSON.stringify(imagesForRestore));
              location.reload();
            }
          });
        });
      });
    }).catch(function (e) {
      alert(S.err_zip_read + ': ' + e.message);
    });
  }

  function restoreZipImagesIfNeeded() {
    var raw = sessionStorage.getItem('polygraph_zip_images');
    if (!raw) return;
    sessionStorage.removeItem('polygraph_zip_images');
    if (!window.NOTES_API) return;
    try {
      var images = JSON.parse(raw);
      if (images && images.length > 0) {
        window.NOTES_API.restoreImagesFromZip(images, function () { performSave(); });
      }
    } catch (e) {}
  }

  function exportJson(state, safeResp, dateStr) {
    var filename = 'polygraph-suite-' + safeResp + dateStr + '.json';
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportZip(state, safeResp, dateStr) {
    if (!checkJSZip()) return;
    window.NOTES_API.getAllImageData(function (err, images) {
      var zip = new JSZip();
      zip.file('data.json', JSON.stringify(state, null, 2));
      var imgFolder = zip.folder('images');
      images.forEach(function (img) {
        try {
          var uint8 = dataUrlToUint8(img.dataUrl);
          imgFolder.file(img.name, uint8, { binary: true });
        } catch (e) {}
      });
      zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }).then(function (blob) {
        var filename = 'polygraph-suite-' + safeResp + dateStr + '.zip';
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
      });
    });
  }

  return {
    init: function () {
      saveStatus = document.getElementById('g-status');
      nameInp = document.getElementById('global-resp-name');
      dateInp = document.getElementById('global-exam-date');

      if (nameInp) nameInp.addEventListener('input', this.markUnsaved.bind(this));
      if (dateInp) dateInp.addEventListener('change', this.markUnsaved.bind(this));

      var btnSave = document.getElementById('g-save');
      if (btnSave) btnSave.addEventListener('click', function () { performSave(); });

      var btnSaveJson = document.getElementById('g-save-json');
      if (btnSaveJson) btnSaveJson.addEventListener('click', function () {
        performSave();
        var state = collectGlobalState();
        var resp = nameInp ? nameInp.value.trim() : '';
        var safeResp = resp ? resp.replace(/[^a-zа-яієїґ0-9]/gi, '_') + '-' : '';
        var dateStr = (dateInp && dateInp.value) ? dateInp.value : new Date().toISOString().slice(0, 10);

        if (window.NOTES_API && window.NOTES_API.hasImages()) {
          if (confirm(S.confirm_export_zip)) exportZip(state, safeResp, dateStr);
          else exportJson(state, safeResp, dateStr);
        } else {
          exportJson(state, safeResp, dateStr);
        }
      });

      var fileInput = document.getElementById('file-import');
      if (fileInput) {
        var btnOpen = document.getElementById('g-open');
        if (btnOpen) btnOpen.addEventListener('click', function () { fileInput.click(); });
        fileInput.addEventListener('change', function (e) {
          var file = e.target.files[0];
          if (!file) return;
          var name = file.name.toLowerCase();
          if (name.endsWith('.json')) {
            var reader = new FileReader();
            reader.onload = function (evt) {
              try { handleJsonLoad(JSON.parse(evt.target.result)); }
              catch (err) { alert(S.err_json_read); }
            };
            reader.readAsText(file);
          } else if (name.endsWith('.zip')) {
            handleZipLoad(file);
          } else {
            alert(S.err_unsupported_format);
          }
          fileInput.value = '';
        });
      }

      window.addEventListener('dragover', function (e) { e.preventDefault(); document.body.style.backgroundColor = '#e3f2fd'; });
      window.addEventListener('dragleave', function (e) { e.preventDefault(); document.body.style.backgroundColor = '#f5f5f5'; });
      window.addEventListener('drop', function (e) {
        e.preventDefault();
        document.body.style.backgroundColor = '#f5f5f5';
        var file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (!file) return;
        var name = file.name.toLowerCase();
        if (name.endsWith('.json')) {
          var reader = new FileReader();
          reader.onload = function (evt) {
            try { handleJsonLoad(JSON.parse(evt.target.result)); }
            catch (err) { alert(S.err_json_read); }
          };
          reader.readAsText(file);
        } else if (name.endsWith('.zip')) {
          handleZipLoad(file);
        } else {
          alert(S.err_unsupported_format);
        }
      });

      var btnPrint = document.getElementById('g-print');
      if (btnPrint) btnPrint.addEventListener('click', function () { window.print(); });

      var btnClear = document.getElementById('g-clear');
      if (btnClear) btnClear.addEventListener('click', function () {
        if (!confirm(S.confirm_clear_all)) return;
        ['polygraph_suite_data', 'ess_polygraph_data', 'cit_standalone_data', 'polygraph_suite_master_data']
          .forEach(function (k) { localStorage.removeItem(k); });
        if (window.NOTES_API) window.NOTES_API.clearAll(function () { location.reload(); });
        else location.reload();
      });

      var btnHelp = document.getElementById('g-help');
      if (btnHelp) btnHelp.addEventListener('click', function () { window.open('info.html', '_blank'); });

      var btnMarkdown = document.getElementById('g-markdown');
      if (btnMarkdown) btnMarkdown.addEventListener('click', function () {
        var respName = (nameInp && nameInp.value.trim()) ? nameInp.value.trim() : S.md_unknown;
        var dateVal = (dateInp && dateInp.value) ? dateInp.value : new Date().toISOString().slice(0, 10);
        var safeResp = respName !== S.md_unknown ? respName.replace(/[^a-zа-яієїґ0-9]/gi, '_') + '-' : '';

        var md = '---\n';
        md += 'tags:\n  - polygraph_report\n  - suite\n';
        md += 'date: ' + dateVal + '\n';
        md += 'respondent: ' + respName + '\n';
        md += '---\n\n';
        md += '# ' + S.md_report_title + '\n\n';
        md += '**' + S.md_respondent + ':** ' + respName + '\n';
        md += '**' + S.md_date + ':** [[' + dateVal + ']]\n\n---\n\n';

        if (window.ESS_API) {
          var essMd = window.ESS_API.getMarkdown();
          if (essMd) md += '## 1. ' + S.md_ess_title + '\n\n' + essMd + '\n\n---\n\n';
        }
        if (window.CIT_API) {
          var citMd = window.CIT_API.getMarkdown();
          if (citMd) md += '## 2. ' + S.md_cit_title + '\n\n' + citMd + '\n\n---\n\n';
        }
        if (window.NOTES_API) {
          var notesMd = window.NOTES_API.getMarkdown();
          if (notesMd) md += '## 3. ' + S.md_notes_title + '\n\n' + notesMd + '\n\n---\n\n';
        }

        var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'polygraph-suite-' + safeResp + dateVal + '.md';
        a.click();
        URL.revokeObjectURL(url);
      });
    },

    collectGlobalState: collectGlobalState,

    markUnsaved: function () {
      if (!isUnsaved) {
        isUnsaved = true;
        if (saveStatus) { saveStatus.classList.add('unsaved'); saveStatus.textContent = S.status_unsaved; }
      }
    },

    performSave: performSave,
    loadData: loadData,
    restoreZipImagesIfNeeded: restoreZipImagesIfNeeded
  };
})();

document.addEventListener('DOMContentLoaded', function () {
  var S = window.STRINGS;

  var authOverlay = document.getElementById('auth-overlay');
  var mainAppContainer = document.getElementById('main-app-container');
  var passInput = document.getElementById('auth-password');
  var authBtn = document.getElementById('auth-submit-btn');
  var authError = document.getElementById('auth-error');
  var forgotLink = document.getElementById('auth-forgot-link');
  var backToLoginLink = document.getElementById('quiz-back-to-login');

  var isAuthorized = false;
  try { isAuthorized = localStorage.getItem('suite_auth') === 'true'; } catch (e) {}

  var quizQuestions = S.quiz_questions;
  var currentQuizQuestions = [];
  var quizState = { attemptsPerQuestion: [0, 0, 0], totalAttempts: 0 };
  var MAX_ATTEMPTS_PER_QUESTION = 3;
  var MAX_TOTAL_ATTEMPTS = 9;

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = a[i]; a[i] = a[j]; a[j] = tmp; }
    return a;
  }

  function generateQuiz() {
    var shuffled = shuffleArray(quizQuestions);
    currentQuizQuestions = shuffled.slice(0, 3);
    for (var i = 0; i < 3; i++) {
      var q = currentQuizQuestions[i];
      var stepNum = i + 1;
      var textEl = document.getElementById('quiz-q-text-' + stepNum);
      if (textEl) textEl.textContent = stepNum + '. ' + q.text;
      var shuffledOpts = shuffleArray(q.options);
      var optsContainer = document.getElementById('quiz-q-options-' + stepNum);
      if (optsContainer) {
        optsContainer.innerHTML = '';
        shuffledOpts.forEach(function (opt) {
          var btn = document.createElement('button');
          btn.className = 'auth-quiz-option';
          btn.setAttribute('data-q', stepNum);
          btn.setAttribute('data-correct', opt.correct ? 'true' : 'false');
          btn.textContent = opt.text;
          optsContainer.appendChild(btn);
        });
      }
    }
  }

  function showAuthStep(stepId) {
    authOverlay.querySelectorAll('.auth-step').forEach(function (s) { s.classList.remove('active'); });
    var target = document.getElementById(stepId);
    if (target) target.classList.add('active');
  }

  function resetQuizState() {
    quizState.attemptsPerQuestion = [0, 0, 0];
    quizState.totalAttempts = 0;
    authOverlay.querySelectorAll('.auth-quiz-option').forEach(function (btn) { btn.classList.remove('correct', 'wrong'); btn.disabled = false; });
    ['quiz-error-q1', 'quiz-error-q2', 'quiz-error-q3'].forEach(function (id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; });
    ['quiz-attempts-q1', 'quiz-attempts-q2', 'quiz-attempts-q3'].forEach(function (id) { var el = document.getElementById(id); if (el) { el.textContent = S.quiz_attempt_1_of_3; el.classList.remove('danger'); } });
    authOverlay.querySelectorAll('.auth-quiz-dot').forEach(function (dot) { dot.classList.remove('active', 'correct'); });
    generateQuiz();
  }

  function unlockApp(saveToLocal) {
    if (authOverlay) authOverlay.style.display = 'none';
    if (mainAppContainer) mainAppContainer.style.display = 'block';
    if (saveToLocal) { try { localStorage.setItem('suite_auth', 'true'); } catch (e) {} }
  }

  function handleWrongAnswer(qNum) {
    var qIndex = qNum - 1;
    quizState.attemptsPerQuestion[qIndex]++;
    quizState.totalAttempts++;
    var remaining = MAX_ATTEMPTS_PER_QUESTION - quizState.attemptsPerQuestion[qIndex];
    var errEl = document.getElementById('quiz-error-q' + qNum);
    var attEl = document.getElementById('quiz-attempts-q' + qNum);
    if (errEl) { errEl.textContent = S.quiz_wrong_prefix + remaining; errEl.style.display = 'block'; }
    if (attEl) { attEl.textContent = S.quiz_attempt_prefix + (quizState.attemptsPerQuestion[qIndex] + 1) + S.quiz_attempt_of_3; if (remaining === 1) attEl.classList.add('danger'); }
    if (remaining <= 0 || quizState.totalAttempts >= MAX_TOTAL_ATTEMPTS) {
      try { sessionStorage.setItem('suite_auth_blocked', 'true'); } catch (e) {}
      setTimeout(function () { showAuthStep('auth-step-blocked'); }, 600);
    } else {
      setTimeout(function () {
        var options = authOverlay.querySelectorAll('.auth-quiz-option[data-q="' + qNum + '"]');
        options.forEach(function (btn) { btn.classList.remove('wrong'); btn.disabled = false; });
        if (errEl) errEl.style.display = 'none';
      }, 1200);
    }
  }

  function handleCorrectAnswer(qNum) {
    authOverlay.querySelectorAll('.auth-quiz-option[data-q="' + qNum + '"]').forEach(function (btn) { btn.disabled = true; });
    authOverlay.querySelectorAll('#auth-step-q' + qNum + ' .auth-quiz-dot').forEach(function (dot) { if (dot.classList.contains('active')) dot.classList.add('correct'); });
    setTimeout(function () { if (qNum === 3) showAuthStep('auth-step-success'); else showAuthStep('auth-step-q' + (qNum + 1)); }, 500);
  }

  function checkPassword() {
    if (!passInput) return;
    var val = passInput.value.trim().toLowerCase();
    if (val === 'plgrph' || val === 'здікзр') unlockApp(true);
    else {
      if (authError) authError.style.display = 'block';
      var modal = authOverlay ? authOverlay.querySelector('.auth-modal') : null;
      if (modal) { modal.style.animation = 'none'; setTimeout(function () { modal.style.animation = 'shake 0.4s'; }, 10); }
    }
  }

  var isSessionBlocked = false;
  try { isSessionBlocked = sessionStorage.getItem('suite_auth_blocked') === 'true'; } catch (e) {}

  if (isSessionBlocked) showAuthStep('auth-step-blocked');
  else if (isAuthorized) unlockApp(false);
  else showAuthStep('auth-step-login');

  if (authBtn) authBtn.addEventListener('click', checkPassword);
  if (passInput) passInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') checkPassword(); });
  if (forgotLink) {
    forgotLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (passInput) passInput.value = '';
      if (authError) authError.style.display = 'none';
      resetQuizState();
      showAuthStep('auth-step-q1');
    });
  }
  if (backToLoginLink) {
    backToLoginLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (passInput) passInput.value = '';
      if (authError) authError.style.display = 'none';
      resetQuizState();
      showAuthStep('auth-step-login');
    });
  }

  authOverlay.addEventListener('click', function (e) {
    var btn = e.target.closest('.auth-quiz-option');
    if (!btn || btn.disabled) return;
    var qNum = parseInt(btn.getAttribute('data-q'), 10);
    var isCorrect = btn.getAttribute('data-correct') === 'true';
    btn.disabled = true;
    if (isCorrect) { btn.classList.add('correct'); handleCorrectAnswer(qNum); }
    else { btn.classList.add('wrong'); handleWrongAnswer(qNum); }
  });

  var quizUnlockBtn = document.getElementById('auth-quiz-unlock-btn');
  if (quizUnlockBtn) quizUnlockBtn.addEventListener('click', function () { unlockApp(true); });

  try {
    if (window.ESS_API) window.ESS_API.init();
    if (window.CIT_API) window.CIT_API.init();
    if (window.NOTES_API) window.NOTES_API.init();
    if (window.APP_API) {
      window.APP_API.init();
      window.APP_API.loadData();
      window.APP_API.restoreZipImagesIfNeeded();
    }
  } catch (error) {
    console.error('Init error:', error);
    alert(S.err_init + ': ' + error.message);
  }

  var tabBtns = document.querySelectorAll('.suite-tab-btn');
  var tabContents = document.querySelectorAll('.suite-tab-content');
  tabBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabBtns.forEach(function (b) { b.classList.remove('active'); });
      tabContents.forEach(function (c) { c.style.display = 'none'; c.classList.remove('active'); });
      btn.classList.add('active');
      var targetEl = document.getElementById(btn.getAttribute('data-target'));
      if (targetEl) { targetEl.style.display = 'block'; targetEl.classList.add('active'); }
    });
  });
});
