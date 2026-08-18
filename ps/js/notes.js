// notes.js — NOTES_API
// Вкладка нотаток: Markdown-редактор + зображення в IndexedDB
// Мовний шар: window.STRINGS (без i18n / data-i18n)

window.NOTES_API = (function () {
  'use strict';
  var S = window.STRINGS;

  // ── IndexedDB ──────────────────────────────────────────────
  var DB_NAME = 'polygraph_notes_db';
  var DB_VERSION = 1;
  var STORE_NAME = 'images';
  var db = null;

  function openDB(callback) {
    if (db) { callback(null, db); return; }
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) { e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' }); };
    req.onsuccess  = function(e) { db = e.target.result; callback(null, db); };
    req.onerror    = function(e) { callback('IndexedDB error: ' + e.target.errorCode); };
  }

  function dbSaveImage(imgObj, callback) {
    openDB(function(err, database) {
      if (err) { callback(err); return; }
      var tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(imgObj);
      tx.oncomplete = function() { callback(null); };
      tx.onerror    = function(e) { callback('Write error: ' + e.target.errorCode); };
    });
  }

  function dbGetImage(id, callback) {
    openDB(function(err, database) {
      if (err) { callback(err); return; }
      var tx = database.transaction(STORE_NAME, 'readonly');
      var req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = function() { callback(null, req.result || null); };
      req.onerror   = function(e) { callback('Read error: ' + e.target.errorCode); };
    });
  }

  function dbDeleteImage(id, callback) {
    openDB(function(err, database) {
      if (err) { if (callback) callback(err); return; }
      var tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = function() { if (callback) callback(null); };
    });
  }

  function dbGetAllImages(ids, callback) {
    if (!ids || ids.length === 0) { setTimeout(function() { callback(null, []); }, 0); return; }
    openDB(function(err, database) {
      if (err) { callback(err, []); return; }
      var results = [], pending = ids.length;
      var tx = database.transaction(STORE_NAME, 'readonly');
      ids.forEach(function(id) {
        var req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = function() {
          if (req.result) results.push(req.result);
          if (--pending === 0) callback(null, results);
        };
        req.onerror = function() { if (--pending === 0) callback(null, results); };
      });
    });
  }

  function dbClearAllImages(ids, callback) {
    if (!ids || ids.length === 0) { if (callback) callback(); return; }
    openDB(function(err, database) {
      if (err) { if (callback) callback(); return; }
      var tx = database.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      ids.forEach(function(id) { store.delete(id); });
      tx.oncomplete = function() { if (callback) callback(); };
    });
  }

  // ── Стан ───────────────────────────────────────────────────
  var state = { text: '', imagesMeta: [] };
  var editMode = true;
  var elements = {};
  var renderThumbnails; // замикання, присвоюється в buildUI

  var triggerUnsaved = function() { if (window.APP_API) window.APP_API.markUnsaved(); };

  // ── Markdown ────────────────────────────────────────────────
  function renderMarkdown(text) {
    if (!window.snarkdown) return '<p>' + text.replace(/\n/g, '<br>') + '</p>';
    return window.snarkdown(text);
  }

  // ── Lightbox ────────────────────────────────────────────────
  var lightbox = null;
  function openLightbox(imgId, imgName) {
    dbGetImage(imgId, function(err, imgObj) {
      if (err || !imgObj) return;
      if (!lightbox) {
        lightbox = document.createElement('div');
        lightbox.id = 'notes-lightbox';
        lightbox.innerHTML =
          '<div id="notes-lightbox-bg"></div>' +
          '<div id="notes-lightbox-inner">' +
            '<img id="notes-lightbox-img" src="" alt="">' +
            '<div id="notes-lightbox-caption"></div>' +
            '<button id="notes-lightbox-close"><svg class="ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
          '</div>';
        document.body.appendChild(lightbox);
        document.getElementById('notes-lightbox-bg').addEventListener('click', closeLightbox);
        document.getElementById('notes-lightbox-close').addEventListener('click', closeLightbox);
        document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeLightbox(); });
      }
      document.getElementById('notes-lightbox-img').src = imgObj.dataUrl;
      document.getElementById('notes-lightbox-img').alt = imgName;
      document.getElementById('notes-lightbox-caption').textContent = imgName;
      lightbox.style.display = 'flex';
    });
  }
  function closeLightbox() { if (lightbox) lightbox.style.display = 'none'; }

  // ── Зображення ─────────────────────────────────────────────
  var MAX_FILE_SIZE = 5 * 1024 * 1024;
  var MAX_FILES = 20;

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' ' + S.notes_unit_b;
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' ' + S.notes_unit_kb;
    return (bytes / 1024 / 1024).toFixed(1) + ' ' + S.notes_unit_mb;
  }

  function showToast(msg, type) {
    var toast = document.createElement('div');
    toast.className = 'notes-toast notes-toast-' + (type || 'info');
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      setTimeout(function() { toast.remove(); }, 400);
    }, 3000);
  }

  function processImageFiles(files) {
    var reserved = 0; // скільки слотів вже "заброньовано" в межах цього виклику (до завершення асинхронного запису)
    Array.from(files).forEach(function(file) {
      if (!file.type.startsWith('image/')) { showToast('«' + file.name + '» ' + S.notes_toast_not_image, 'warn'); return; }
      if (file.size > MAX_FILE_SIZE) { showToast('«' + file.name + '» ' + S.notes_toast_too_big, 'warn'); return; }
      if (state.imagesMeta.length + reserved >= MAX_FILES) { showToast(S.notes_toast_limit + ' ' + MAX_FILES + '.', 'warn'); return; }
      reserved++;
      var reader = new FileReader();
      reader.onload = function(evt) {
        var id = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        dbSaveImage({ id: id, dataUrl: evt.target.result }, function(err) {
          reserved--;
          if (err) { showToast(S.notes_toast_save_error + ': ' + err, 'error'); return; }
          state.imagesMeta.push({ id: id, name: file.name, size: file.size, type: file.type, added: new Date().toISOString() });
          renderThumbnails();
          triggerUnsaved();
          // Явне збереження одразу після додавання зображення
          if (window.APP_API) window.APP_API.performSave();
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Edit / Preview ──────────────────────────────────────────
  function setMode(mode) {
    editMode = (mode === 'edit');
    if (!elements.textarea || !elements.preview) return;
    if (editMode) {
      elements.textarea.style.display = 'block';
      elements.preview.style.display  = 'none';
      elements.btnEdit.classList.add('active');
      elements.btnPreview.classList.remove('active');
      elements.textarea.focus();
    } else {
      state.text = elements.textarea.value;
      elements.preview.innerHTML = renderMarkdown(state.text) ||
        '<p style="color:#aaa;font-style:italic;">' + S.notes_preview_empty + '</p>';
      elements.textarea.style.display = 'none';
      elements.preview.style.display  = 'block';
      elements.btnEdit.classList.remove('active');
      elements.btnPreview.classList.add('active');
    }
  }

  // ── CSS ─────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('notes-styles')) return;
    var style = document.createElement('style');
    style.id = 'notes-styles';
    style.textContent = [
      '.notes-container{max-width:880px;margin:0 auto;width:100%;padding-bottom:30px;}',
      '.notes-mode-bar{display:flex;align-items:center;gap:6px;margin-bottom:10px;}',
      '.notes-mode-btn{padding:5px 14px;font-size:12px;font-weight:700;border:1px solid #ccc;border-radius:4px;background:#f5f5f5;color:#555;cursor:pointer;transition:all .15s;}',
      '.notes-mode-btn.active{background:#3a7cfd;color:#fff;border-color:#3a7cfd;}',
      '.notes-mode-btn:hover:not(.active){background:#e8eef8;border-color:#3a7cfd;color:#3a7cfd;}',
      '.notes-mode-label{font-size:11px;color:#888;margin-left:auto;}',
      '.notes-textarea{width:100%;min-height:280px;padding:14px;font-size:14px;font-family:"SFMono-Regular",Consolas,monospace;line-height:1.6;border:1px solid #ccc;border-radius:6px;resize:vertical;outline:none;box-sizing:border-box;background:#fafafa;color:#222;transition:border-color .2s;}',
      '.notes-textarea:focus{border-color:#3a7cfd;background:#fff;box-shadow:0 0 0 2px rgba(58,124,253,.1);}',
      '.notes-preview{min-height:280px;padding:14px 18px;border:1px solid #e2e8f0;border-radius:6px;background:#fff;font-size:14px;line-height:1.7;color:#222;box-sizing:border-box;}',
      '.notes-preview h1{font-size:1.5em;margin:.5em 0 .3em;border-bottom:2px solid #e2e8f0;padding-bottom:.2em;}',
      '.notes-preview h2{font-size:1.25em;margin:.5em 0 .3em;border-bottom:1px solid #e2e8f0;padding-bottom:.2em;}',
      '.notes-preview h3{font-size:1.1em;margin:.4em 0 .2em;}',
      '.notes-preview blockquote{border-left:3px solid #3a7cfd;margin:8px 0;padding:4px 12px;background:rgba(58,124,253,.05);color:#444;border-radius:0 4px 4px 0;}',
      '.notes-preview code{background:#f1f5f9;padding:1px 5px;border-radius:3px;font-family:monospace;font-size:.9em;}',
      '.notes-preview pre{background:#1e293b;color:#e2e8f0;padding:12px;border-radius:6px;overflow-x:auto;}',
      '.notes-preview pre code{background:transparent;color:inherit;padding:0;}',
      '.notes-preview ul,.notes-preview ol{padding-left:20px;}',
      '.notes-preview hr{border:0;border-top:2px solid #e2e8f0;margin:12px 0;}',
      '.notes-images-section{margin-top:20px;padding:14px;background:#fff;border:1px solid #ddd;border-radius:6px;}',
      '.notes-images-header{display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;}',
      '.notes-images-title{font-size:13px;font-weight:700;color:#444;}',
      '.notes-add-btn{padding:4px 12px;font-size:12px;font-weight:700;background:#3a7cfd;color:#fff;border:none;border-radius:4px;cursor:pointer;transition:background .2s;}',
      '.notes-add-btn:hover{background:#2a68e0;}',
      '.notes-images-count{margin-left:auto;font-size:11px;color:#999;}',
      '.notes-drop-zone{border:2px dashed #ccc;border-radius:6px;padding:16px;text-align:center;font-size:12px;color:#999;transition:all .2s;cursor:pointer;margin-bottom:12px;}',
      '.notes-drop-zone.drag-over{border-color:#3a7cfd;background:rgba(58,124,253,.06);color:#3a7cfd;}',
      '.notes-thumb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px;}',
      '.notes-no-images{font-size:12px;color:#aaa;text-align:center;padding:16px;}',
      '.notes-thumb{position:relative;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0;background:#f8fafc;aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:box-shadow .2s;}',
      '.notes-thumb:hover{box-shadow:0 2px 10px rgba(0,0,0,.12);}',
      '.notes-thumb img{width:100%;height:100%;object-fit:cover;display:block;}',
      '.notes-thumb-placeholder{opacity:.3;display:flex;align-items:center;justify-content:center;}',
      '.notes-thumb-placeholder svg{width:36px;height:36px;}',
      '.notes-thumb-caption{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.55);color:#fff;font-size:9px;padding:2px 4px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.notes-thumb-del{position:absolute;top:3px;right:3px;width:18px;height:18px;font-size:12px;line-height:1;font-weight:900;border-radius:50%;background:rgba(255,0,0,.8);color:#fff;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s;}',
      '.notes-thumb:hover .notes-thumb-del{opacity:1;}',
      '#notes-lightbox{display:none;position:fixed;inset:0;z-index:99999;align-items:center;justify-content:center;}',
      '#notes-lightbox-bg{position:absolute;inset:0;background:rgba(0,0,0,.85);}',
      '#notes-lightbox-inner{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;max-width:90vw;max-height:90vh;}',
      '#notes-lightbox-img{max-width:100%;max-height:80vh;border-radius:6px;box-shadow:0 8px 40px rgba(0,0,0,.6);}',
      '#notes-lightbox-caption{color:#ccc;font-size:12px;margin-top:8px;}',
      '#notes-lightbox-close{position:absolute;top:-36px;right:0;background:rgba(255,255,255,.15);border:none;color:#fff;font-size:20px;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
      '#notes-lightbox-close:hover{background:rgba(255,255,255,.3);}',
      '.notes-toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:99998;padding:10px 20px;border-radius:6px;font-size:13px;font-weight:bold;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,.3);transition:opacity .4s;pointer-events:none;}',
      '.notes-toast-info{background:#3a7cfd;}',
      '.notes-toast-warn{background:#f57c00;}',
      '.notes-toast-error{background:#d32f2f;}',
      '@media print{.notes-mode-bar,.notes-images-section,.notes-drop-zone,.notes-add-btn,.notes-thumb-del{display:none!important;}.notes-preview{border:none!important;padding:0!important;}}'
    ].join('');
    document.head.appendChild(style);
  }

  // ── Побудова UI ─────────────────────────────────────────────
  function buildUI(root) {
    var container = document.createElement('div');
    container.className = 'notes-container';

    var modeBar = document.createElement('div');
    modeBar.className = 'notes-mode-bar';

    var btnEdit = document.createElement('button');
    btnEdit.className = 'notes-mode-btn active';
    btnEdit.textContent = S.notes_btn_edit;
    btnEdit.addEventListener('click', function() { setMode('edit'); });

    var btnPreview = document.createElement('button');
    btnPreview.className = 'notes-mode-btn';
    btnPreview.textContent = S.notes_btn_preview;
    btnPreview.addEventListener('click', function() { setMode('preview'); });

    var modeLabel = document.createElement('span');
    modeLabel.className = 'notes-mode-label';
    modeLabel.textContent = S.notes_md_support;

    modeBar.appendChild(btnEdit);
    modeBar.appendChild(btnPreview);
    modeBar.appendChild(modeLabel);

    var textarea = document.createElement('textarea');
    textarea.className = 'notes-textarea';
    textarea.placeholder = S.notes_placeholder;
    textarea.value = state.text;
    textarea.addEventListener('input', function() { state.text = textarea.value; triggerUnsaved(); });

    var preview = document.createElement('div');
    preview.className = 'notes-preview';
    preview.style.display = 'none';

    var imagesSection = document.createElement('div');
    imagesSection.className = 'notes-images-section';

    var imagesHeader = document.createElement('div');
    imagesHeader.className = 'notes-images-header';

    var imagesTitle = document.createElement('span');
    imagesTitle.className = 'notes-images-title';
    imagesTitle.textContent = S.notes_images;

    var addBtn = document.createElement('button');
    addBtn.className = 'notes-add-btn';
    addBtn.textContent = S.notes_add_btn;

    var fileInputHidden = document.createElement('input');
    fileInputHidden.type = 'file';
    fileInputHidden.accept = 'image/*';
    fileInputHidden.multiple = true;
    fileInputHidden.style.display = 'none';
    fileInputHidden.addEventListener('change', function(e) {
      if (e.target.files.length) processImageFiles(e.target.files);
      fileInputHidden.value = '';
    });
    addBtn.addEventListener('click', function() { fileInputHidden.click(); });

    var imagesCount = document.createElement('span');
    imagesCount.className = 'notes-images-count';
    imagesCount.textContent = '0 / ' + MAX_FILES;

    var dropZone = document.createElement('div');
    dropZone.className = 'notes-drop-zone';
    dropZone.textContent = S.notes_drop;
    dropZone.addEventListener('dragover',  function(e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function()  { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) processImageFiles(e.dataTransfer.files);
    });
    dropZone.addEventListener('click', function() { fileInputHidden.click(); });

    var thumbGrid = document.createElement('div');
    thumbGrid.className = 'notes-thumb-grid';

    imagesHeader.appendChild(imagesTitle);
    imagesHeader.appendChild(addBtn);
    imagesHeader.appendChild(fileInputHidden);
    imagesHeader.appendChild(imagesCount);
    imagesSection.appendChild(imagesHeader);
    imagesSection.appendChild(dropZone);
    imagesSection.appendChild(thumbGrid);

    container.appendChild(modeBar);
    container.appendChild(textarea);
    container.appendChild(preview);
    container.appendChild(imagesSection);
    root.appendChild(container);

    elements.textarea    = textarea;
    elements.preview     = preview;
    elements.btnEdit     = btnEdit;
    elements.btnPreview  = btnPreview;
    elements.thumbGrid   = thumbGrid;
    elements.imagesCount = imagesCount;

    renderThumbnails = function() {
      imagesCount.textContent = state.imagesMeta.length + ' / ' + MAX_FILES;
      thumbGrid.innerHTML = '';
      if (state.imagesMeta.length === 0) {
        var noImg = document.createElement('div');
        noImg.className = 'notes-no-images';
        noImg.textContent = S.notes_no_images;
        thumbGrid.appendChild(noImg);
        return;
      }
      var ids = state.imagesMeta.map(function(m) { return m.id; });
      dbGetAllImages(ids, function(err, imgs) {
        thumbGrid.innerHTML = '';
        var imgMap = {};
        imgs.forEach(function(img) { imgMap[img.id] = img; });
        state.imagesMeta.forEach(function(meta) {
          var imgObj = imgMap[meta.id];
          var thumb = document.createElement('div');
          thumb.className = 'notes-thumb';
          if (imgObj && imgObj.dataUrl) {
            var imgEl = document.createElement('img');
            imgEl.src = imgObj.dataUrl;
            imgEl.alt = meta.name;
            imgEl.title = meta.name + '\n' + formatBytes(meta.size);
            imgEl.addEventListener('click', function() { openLightbox(meta.id, meta.name); });
            thumb.appendChild(imgEl);
          } else {
            var ph = document.createElement('div');
            ph.className = 'notes-thumb-placeholder';
            ph.innerHTML = '<svg class="ic-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5L5 20"/></svg>';
            thumb.appendChild(ph);
          }
          var caption = document.createElement('div');
          caption.className = 'notes-thumb-caption';
          caption.textContent = meta.name;
          thumb.appendChild(caption);
          var delBtn = document.createElement('button');
          delBtn.className = 'notes-thumb-del';
          delBtn.innerHTML = '×';
          delBtn.title = S.notes_delete_img_title;
          delBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (confirm(S.notes_confirm_delete_img + ' «' + meta.name + '»?')) {
              dbDeleteImage(meta.id, function() {
                state.imagesMeta = state.imagesMeta.filter(function(m) { return m.id !== meta.id; });
                renderThumbnails();
                triggerUnsaved();
                // Явне збереження одразу після видалення зображення
                if (window.APP_API) window.APP_API.performSave();
              });
            }
          });
          thumb.appendChild(delBtn);
          thumbGrid.appendChild(thumb);
        });
      });
    };

    renderThumbnails();
  }

  // ── Публічний API ───────────────────────────────────────────
  return {
    init: function() {
      var root = document.getElementById('notes-app');
      if (!root) return;
      injectStyles();
      buildUI(root);
    },

    collectState: function() {
      var currentText = elements.textarea ? elements.textarea.value : state.text;
      return { text: currentText, imagesMeta: state.imagesMeta.slice() };
    },

    restoreState: function(data) {
      if (!data) return;
      state.text = data.text || '';
      state.imagesMeta = Array.isArray(data.imagesMeta) ? data.imagesMeta : [];
      if (elements.textarea) elements.textarea.value = state.text;
      if (renderThumbnails) renderThumbnails();
    },

    clearAll: function(callback) {
      var ids = state.imagesMeta.map(function(m) { return m.id; });
      dbClearAllImages(ids, function() {
        state.text = '';
        state.imagesMeta = [];
        if (elements.textarea) elements.textarea.value = '';
        if (elements.preview)  elements.preview.innerHTML = '';
        setMode('edit');
        if (renderThumbnails) renderThumbnails();
        if (callback) callback();
      });
    },

    hasImages: function() { return state.imagesMeta.length > 0; },

    getAllImageData: function(callback) {
      var ids = state.imagesMeta.map(function(m) { return m.id; });
      dbGetAllImages(ids, function(err, imgs) {
        var result = imgs.map(function(img) {
          var meta = state.imagesMeta.find(function(m) { return m.id === img.id; });
          return { id: img.id, name: meta ? meta.name : img.id, dataUrl: img.dataUrl };
        });
        callback(err, result);
      });
    },

    restoreImagesFromZip: function(imagesArray, callback) {
      var pending = imagesArray.length;
      if (pending === 0) { if (callback) callback(); return; }
      imagesArray.forEach(function(item) {
        var id = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        dbSaveImage({ id: id, dataUrl: item.dataUrl }, function() {
          state.imagesMeta.push({
            id: id,
            name: item.name,
            size: Math.round((item.dataUrl.length * 3) / 4),
            type: 'image/' + (item.name.split('.').pop() || 'jpeg'),
            added: new Date().toISOString()
          });
          if (--pending === 0) {
            if (renderThumbnails) renderThumbnails();
            if (callback) callback();
          }
        });
      });
    },

    getMarkdown: function() {
      var text = elements.textarea ? elements.textarea.value : state.text;
      if (!text && state.imagesMeta.length === 0) return '';
      var md = text ? text + '\n\n' : '';
      if (state.imagesMeta.length > 0) {
        md += '### ' + S.notes_images + '\n\n';
        state.imagesMeta.forEach(function(m) { md += '- ' + m.name + ' (' + formatBytes(m.size) + ')\n'; });
      }
      return md;
    }
  };
})();
