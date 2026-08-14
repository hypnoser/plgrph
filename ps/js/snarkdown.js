// snarkdown.js — мінімальний Markdown парсер (локальна копія, без CDN)
// Підтримує: заголовки h1-h3, жирний, курсив, inline-код, блок-код,
// невпорядковані списки, впорядковані списки, цитати, горизонтальну лінію,
// параграфи, переноси рядків.
// Санітизація XSS вбудована: небезпечні теги і атрибути не пропускаються.

window.snarkdown = (function() {
  'use strict';

  // Дозволені HTML-теги після рендеру (allowlist)
  var ALLOWED_TAGS = /^(p|br|strong|em|h[1-3]|ul|ol|li|blockquote|pre|code|hr)$/i;

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Парсер рядкового Markdown (inline) — жирний, курсив, код
  function parseInline(text) {
    return text
      // Inline-код (виконується першим, щоб вміст не парсився далі)
      .replace(/`([^`]+)`/g, function(_, c) { return '<code>' + escHtml(c) + '</code>'; })
      // Жирний **text** або __text__
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      // Курсив *text* або _text_
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>');
  }

  function parse(md) {
    if (!md) return '';

    var lines = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var html = '';
    var i = 0;
    var inUl = false;
    var inOl = false;
    var inBlockquote = false;
    var inParagraph = false;

    function closeLists() {
      if (inUl) { html += '</ul>\n'; inUl = false; }
      if (inOl) { html += '</ol>\n'; inOl = false; }
    }

    function closeBlockquote() {
      if (inBlockquote) { html += '</blockquote>\n'; inBlockquote = false; }
    }

    function closeParagraph() {
      if (inParagraph) { html += '</p>\n'; inParagraph = false; }
    }

    while (i < lines.length) {
      var line = lines[i];

      // --- Блок коду (``` ... ```) ---
      if (/^```/.test(line)) {
        closeLists();
        closeBlockquote();
        closeParagraph();
        var codeLines = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) {
          codeLines.push(escHtml(lines[i]));
          i++;
        }
        html += '<pre><code>' + codeLines.join('\n') + '</code></pre>\n';
        i++;
        continue;
      }

      // --- Горизонтальна лінія ---
      if (/^[-*_]{3,}\s*$/.test(line)) {
        closeLists();
        closeBlockquote();
        closeParagraph();
        html += '<hr>\n';
        i++;
        continue;
      }

      // --- Заголовки h1-h3 ---
      var headMatch = line.match(/^(#{1,3})\s+(.+)/);
      if (headMatch) {
        closeLists();
        closeBlockquote();
        closeParagraph();
        var level = headMatch[1].length;
        html += '<h' + level + '>' + parseInline(escHtml(headMatch[2])) + '</h' + level + '>\n';
        i++;
        continue;
      }

      // --- Цитата ---
      if (/^>\s?/.test(line)) {
        closeLists();
        closeParagraph();
        if (!inBlockquote) { html += '<blockquote>\n'; inBlockquote = true; }
        html += '<p>' + parseInline(escHtml(line.replace(/^>\s?/, ''))) + '</p>\n';
        i++;
        continue;
      } else {
        closeBlockquote();
      }

      // --- Невпорядкований список ---
      var ulMatch = line.match(/^[-*+]\s+(.+)/);
      if (ulMatch) {
        closeParagraph();
        if (inOl) { html += '</ol>\n'; inOl = false; }
        if (!inUl) { html += '<ul>\n'; inUl = true; }
        html += '<li>' + parseInline(escHtml(ulMatch[1])) + '</li>\n';
        i++;
        continue;
      }

      // --- Впорядкований список ---
      var olMatch = line.match(/^\d+\.\s+(.+)/);
      if (olMatch) {
        closeParagraph();
        if (inUl) { html += '</ul>\n'; inUl = false; }
        if (!inOl) { html += '<ol>\n'; inOl = true; }
        html += '<li>' + parseInline(escHtml(olMatch[1])) + '</li>\n';
        i++;
        continue;
      }

      // --- Порожній рядок ---
      if (line.trim() === '') {
        closeLists();
        closeBlockquote();
        closeParagraph();
        i++;
        continue;
      }

      // --- Звичайний параграф ---
      closeLists();
      closeBlockquote();
      if (!inParagraph) { html += '<p>'; inParagraph = true; }
      else { html += '<br>'; }
      html += parseInline(escHtml(line));
      i++;
    }

    closeLists();
    closeBlockquote();
    closeParagraph();

    return html;
  }

  return parse;
})();
