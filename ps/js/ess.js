window.ESS_API = (function() {
  var S = window.STRINGS;

  var appRoot, container, testsContainer, addBtnBottom;

  var TEST_FORMATS = [ S.ess_format_default, "DLST", "DLDT", "LEPET", "AFMGQT (2RQ)", "AFMGQT (3RQ)", "AFMGQT (4RQ)", "BOST", "FEDERAL (BI-ZONE)", "FEDERAL ZCT", "UTAH ZCT", "UTAH MGQT" ];

  var formatConfig = {};
  formatConfig[S.ess_format_default] = { cols: 0, forceDiag: false };
  formatConfig["DLST"] = { cols: 2, forceDiag: false };
  formatConfig["DLDT"] = { cols: 2, forceDiag: true };
  formatConfig["LEPET"] = { cols: 3, forceDiag: false };
  formatConfig["AFMGQT (2RQ)"] = { cols: 2, forceDiag: false };
  formatConfig["AFMGQT (3RQ)"] = { cols: 3, forceDiag: false };
  formatConfig["AFMGQT (4RQ)"] = { cols: 4, forceDiag: false };
  formatConfig["BOST"] = { cols: 2, forceDiag: true };
  formatConfig["FEDERAL (BI-ZONE)"] = { cols: 2, forceDiag: true };
  formatConfig["FEDERAL ZCT"] = { cols: 3, forceDiag: true };
  formatConfig["UTAH ZCT"] = { cols: 3, forceDiag: true };
  formatConfig["UTAH MGQT"] = { cols: 4, forceDiag: true };

  var colors = { tot: "#424242", 1: "#0072B2", 2: "#D55E00", 3: "#009E73", 4: "#CC79A7" };

  var escapeHtml = function(str) {
    if (str === null || str === undefined) return "";
    return String(str).replace(/[&<>"']/g, function(m) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];
    });
  };

  var triggerUnsaved = function() { if(window.APP_API) window.APP_API.markUnsaved(); };

  var updateTestNumbers = function() {
    testsContainer.querySelectorAll(".ess-test-wrapper").forEach(function(w, idx) {
        var num = idx + 1;
        var label = w.querySelector(".ess-test-num-label");
        if (label) label.textContent = S.test_num + num + ':';
        var h3 = w.querySelector(".ess-modal-header h3");
        if (h3) h3.textContent = S.ess_questions_modal_title + num;
    });
  };

  var colorizeStatus = function(statusText) {
      if(statusText.indexOf("NSR") !== -1) return '<span style="color:#2e7d32; font-weight:bold;">' + statusText + '</span>';
      if(statusText.indexOf("SR") !== -1 && statusText.indexOf("NSR") === -1) return '<span style="color:#ff0000; font-weight:bold;">' + statusText + '</span>';
      if(statusText.indexOf("INC") !== -1) return '<span style="color:#000000; font-weight:bold;">' + statusText + '</span>';
      if(statusText.indexOf("NO") !== -1) return '<span style="color:#000000; font-weight:bold;">' + statusText + '</span>';
      return statusText;
  };

  var padR = function(str, len) {
      str = String(str);
      while(str.length < len) str += ' ';
      return str;
  };

  var isArt = function(val) {
    if (val === null || val === undefined) return false;
    var v = String(val).trim().toLowerCase();
    return v === "∅" || v === "а" || v === "a";
  };

  var updateDynamicsChart = function(wrapper, chartDataArray, ce, highArtifacts, testArtPercent, hasAnyNO) {
    var svg = ce.dynamicsSvg;
    var textDiv = ce.dynamicsText;

    var elTot = wrapper.querySelector('input[id^="dyn_tot_"]');
    var elR1 = wrapper.querySelector('input[id^="dyn_r1_"]');
    var elR2 = wrapper.querySelector('input[id^="dyn_r2_"]');
    var elR3 = wrapper.querySelector('input[id^="dyn_r3_"]');
    var elR4 = wrapper.querySelector('input[id^="dyn_r4_"]');

    var showTot = elTot ? elTot.checked : true;
    var showR1 = elR1 ? elR1.checked : false;
    var showR2 = elR2 ? elR2.checked : false;
    var showR3 = elR3 ? elR3.checked : false;
    var showR4 = elR4 ? elR4.checked : false;

    if (!svg) return;
    svg.innerHTML = '';

    var width = svg.clientWidth > 100 ? svg.clientWidth : 800;
    var height = 90;
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    var paddingX = 25, paddingY = 15;
    var profileWidth = 80;
    var profileStartX = width - profileWidth;
    var chartWidth = profileStartX - paddingX * 2;
    var chartHeight = height - paddingY * 2;
    var centerY = height / 2;
    var profCenterX = profileStartX + (profileWidth / 2);

    var maxAbs = 6;
    chartDataArray.forEach(function(d) {
      if (showTot && Math.abs(d.total) > maxAbs) maxAbs = Math.abs(d.total);
      if (showR1 && d.spots[1] !== undefined && Math.abs(d.spots[1]) > maxAbs) maxAbs = Math.abs(d.spots[1]);
      if (showR2 && d.spots[2] !== undefined && Math.abs(d.spots[2]) > maxAbs) maxAbs = Math.abs(d.spots[2]);
      if (showR3 && d.spots[3] !== undefined && Math.abs(d.spots[3]) > maxAbs) maxAbs = Math.abs(d.spots[3]);
      if (showR4 && d.spots[4] !== undefined && Math.abs(d.spots[4]) > maxAbs) maxAbs = Math.abs(d.spots[4]);
    });
    maxAbs = Math.ceil(maxAbs / 2) * 2;

    var getY = function(val) { return centerY - (val / maxAbs) * (chartHeight / 2); };
    var getX = function(idx, len) { return paddingX + (len > 1 ? idx * (chartWidth / (len - 1)) : chartWidth / 2); };

    var incZoneTop = getY(3);
    var incZoneBottom = getY(-3);
    var incRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    incRect.setAttribute("x", paddingX); incRect.setAttribute("y", incZoneTop);
    incRect.setAttribute("width", chartWidth); incRect.setAttribute("height", incZoneBottom - incZoneTop);
    incRect.setAttribute("fill", "rgba(0,0,0,0.04)");
    svg.appendChild(incRect);

    var zeroLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    zeroLine.setAttribute("x1", paddingX); zeroLine.setAttribute("y1", centerY);
    zeroLine.setAttribute("x2", profileStartX); zeroLine.setAttribute("y2", centerY);
    zeroLine.setAttribute("stroke", "#ccc"); zeroLine.setAttribute("stroke-width", "1");
    zeroLine.setAttribute("stroke-dasharray", "2,2");
    svg.appendChild(zeroLine);

    var labelPos = document.createElementNS("http://www.w3.org/2000/svg", "text");
    labelPos.setAttribute("x", paddingX + chartWidth/2); labelPos.setAttribute("y", 10); labelPos.setAttribute("text-anchor", "middle"); labelPos.setAttribute("font-size", "9.5"); labelPos.setAttribute("fill", "#aaa"); labelPos.textContent = S.ess_chart_label_pos;
    svg.appendChild(labelPos);

    var labelNeg = document.createElementNS("http://www.w3.org/2000/svg", "text");
    labelNeg.setAttribute("x", paddingX + chartWidth/2); labelNeg.setAttribute("y", height - 4); labelNeg.setAttribute("text-anchor", "middle"); labelNeg.setAttribute("font-size", "9.5"); labelNeg.setAttribute("fill", "#aaa"); labelNeg.textContent = S.ess_chart_label_neg;
    svg.appendChild(labelNeg);

    if (chartDataArray.length === 0) {
      textDiv.innerHTML = "<ul><li>" + S.ess_no_data + "</li></ul>";
      return;
    }

    var spotAverages = {1:0, 2:0, 3:0, 4:0};
    var counts = {1:0, 2:0, 3:0, 4:0};

    chartDataArray.forEach(function(d) {
      for(var col=1; col<=4; col++) {
        if(d.spots[col] !== undefined) { spotAverages[col] += d.spots[col]; counts[col]++; }
      }
    });
    for(var c=1; c<=4; c++) { if(counts[c] > 0) spotAverages[c] = spotAverages[c] / counts[c]; }

    var drawLine = function(key, dataSelector, color, isTotal) {
      var pathD = ""; var pointCount = 0;
      chartDataArray.forEach(function(d, i) {
        var val = dataSelector(d);
        if (val !== undefined) {
          var x = getX(i, chartDataArray.length); var y = getY(val);
          if (pointCount === 0) pathD += 'M ' + x + ' ' + y; else pathD += ' L ' + x + ' ' + y;

          if (isTotal && d.hasArtifact) {
            var tri = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            tri.setAttribute("points", x + ',' + (y-6) + ' ' + (x-5) + ',' + (y+4) + ' ' + (x+5) + ',' + (y+4));
            tri.setAttribute("fill", "#f57c00"); tri.setAttribute("stroke", "#fff"); tri.setAttribute("stroke-width", "1");
            svg.appendChild(tri);
          } else {
            var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", x); circle.setAttribute("cy", y); circle.setAttribute("r", isTotal ? "3.5" : "3");
            circle.setAttribute("fill", color); circle.setAttribute("stroke", "#fff"); circle.setAttribute("stroke-width", "1");
            svg.appendChild(circle);
          }
          pointCount++;
        }
      });
      if (pointCount > 1) {
        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", pathD); path.setAttribute("fill", "none"); path.setAttribute("stroke", color); path.setAttribute("stroke-width", isTotal ? "2" : "1.5");
        if(!isTotal) path.setAttribute("stroke-dasharray", "4,2");
        svg.insertBefore(path, svg.firstChild);
      }
    };

    if (showR1) drawLine("R1", function(d) { return d.spots[1]; }, colors[1], false);
    if (showR2) drawLine("R2", function(d) { return d.spots[2]; }, colors[2], false);
    if (showR3) drawLine("R3", function(d) { return d.spots[3]; }, colors[3], false);
    if (showR4) drawLine("R4", function(d) { return d.spots[4]; }, colors[4], false);
    if (showTot) {
      drawLine("Tot", function(d) { return d.total; }, colors.tot, true);
      chartDataArray.forEach(function(d, i) {
        var x = getX(i, chartDataArray.length);
        var label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", x); label.setAttribute("y", centerY + 4); label.setAttribute("text-anchor", "middle"); label.setAttribute("font-size", "9"); label.setAttribute("fill", "#999"); label.setAttribute("font-weight", "bold");
        label.textContent = "C" + d.chart;
        if(d.total !== 0 || d.hasArtifact) svg.appendChild(label);
      });
    }

    var divLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    divLine.setAttribute("x1", profileStartX); divLine.setAttribute("y1", 10);
    divLine.setAttribute("x2", profileStartX); divLine.setAttribute("y2", height - 10);
    divLine.setAttribute("stroke", "#ddd"); divLine.setAttribute("stroke-width", "1");
    svg.appendChild(divLine);

    var profZero = document.createElementNS("http://www.w3.org/2000/svg", "line");
    profZero.setAttribute("x1", profCenterX); profZero.setAttribute("y1", 20);
    profZero.setAttribute("x2", profCenterX); profZero.setAttribute("y2", height - 20);
    profZero.setAttribute("stroke", "#ccc"); profZero.setAttribute("stroke-width", "1"); profZero.setAttribute("stroke-dasharray", "1,1");
    svg.appendChild(profZero);

    var profLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
    profLabel.setAttribute("x", profCenterX); profLabel.setAttribute("y", 12); profLabel.setAttribute("text-anchor", "middle"); profLabel.setAttribute("font-size", "9.5"); profLabel.setAttribute("fill", "#666"); profLabel.setAttribute("font-weight", "bold");
    profLabel.textContent = S.ess_profile_label;
    svg.appendChild(profLabel);

    var drawProfileBar = function(col, yPos, color) {
      if (counts[col] === 0) return;
      var avg = spotAverages[col];
      var maxBarW = 25;
      var barW = Math.abs(avg / maxAbs) * maxBarW;
      var barX = avg < 0 ? profCenterX - barW : profCenterX;

      var bar = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bar.setAttribute("x", barX); bar.setAttribute("y", yPos);
      bar.setAttribute("width", barW); bar.setAttribute("height", "6");
      bar.setAttribute("fill", color); bar.setAttribute("rx", "1");
      svg.appendChild(bar);

      var txtX = avg < 0 ? profCenterX + 3 : profCenterX - 3;
      var txtAnchor = avg < 0 ? "start" : "end";
      var lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
      lbl.setAttribute("x", txtX); lbl.setAttribute("y", yPos + 6); lbl.setAttribute("text-anchor", txtAnchor); lbl.setAttribute("font-size", "9"); lbl.setAttribute("fill", color);
      lbl.textContent = 'R' + col;
      svg.appendChild(lbl);
    };

    drawProfileBar(1, 24, colors[1]);
    drawProfileBar(2, 34, colors[2]);
    drawProfileBar(3, 44, colors[3]);
    drawProfileBar(4, 54, colors[4]);

    var interpLines = [];
    var totals = chartDataArray.map(function(d) { return d.total; });
    var first = totals[0], last = totals[totals.length - 1];
    var trend = last - first;

    var vectorText = S.ess_vector_neutral;
    if (totals.every(function(v) { return v === 0; })) vectorText = S.ess_vector_neutral;
    else if (totals.every(function(v) { return v <= 0; }) && trend < 0) vectorText = S.ess_vector_sensitization;
    else if (totals.every(function(v) { return v < 0; })) vectorText = S.ess_vector_stable;
    else if (totals.every(function(v) { return v > 0; })) vectorText = S.ess_vector_orientation;
    else if (first < 0 && last >= 0 && trend > 0) vectorText = S.ess_vector_habituation;
    else if (first >= 0 && last < 0 && trend < 0) vectorText = S.ess_vector_increasing;
    else vectorText = S.ess_vector_mixed;

    interpLines.push('<b>' + S.ess_vector_label + ':</b> ' + vectorText);

    var dominantSpot = null; var minAvg = -1.0;
    for(var c=1; c<=4; c++) {
      if(counts[c] > 0 && spotAverages[c] <= minAvg) { minAvg = spotAverages[c]; dominantSpot = c; }
    }

    if (dominantSpot) {
      interpLines.push('<b>' + S.ess_dominant_label + ':</b> ' + S.ess_dominant_focus + ' <b>R' + dominantSpot + '</b> (' + S.ess_dominant_avg + ' ' + minAvg.toFixed(1) + ')');
    } else {
      interpLines.push('<b>' + S.ess_dominant_label + ':</b> ' + S.ess_dominant_none);
    }

    if (highArtifacts) {
      interpLines.push('<span style="color:#ff0000;"><svg class="ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg> <b>' + S.ess_artifacts_critical + ':</b> ' + Math.round(testArtPercent*100) + '% ' + S.ess_artifacts_lost_no + '</span>');
    } else if (hasAnyNO) {
      interpLines.push('<span style="color:#ff0000;"><svg class="ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg> <b>' + S.ess_artifacts_critical + ':</b> ' + S.ess_artifacts_spot_no + '</span>');
    } else if (chartDataArray.some(function(d) { return d.hasArtifact; })) {
      interpLines.push('<span style="color:#ff0000;"><svg class="ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg> <b>' + S.ess_artifacts_present_label + ':</b> ' + S.ess_artifacts_present_desc + '</span>');
    }

    textDiv.innerHTML = "<ul>" + interpLines.map(function(line) { return '<li>' + line + '</li>'; }).join('') + "</ul>";
  };

  var calcPneumoESS = function(vRaw, nRaw, vN, nN) {
    var vA = isArt(vRaw);
    var nA = isArt(nRaw);
    if (vA && nA) return { val: 0, fullArt: true, partialArt: false, conflict: false };
    if (vA) return { val: nN, fullArt: false, partialArt: true, conflict: false };
    if (nA) return { val: vN, fullArt: false, partialArt: true, conflict: false };
    if (vN === 0 && nN === 0) return { val: 0, fullArt: false, partialArt: false, conflict: false };
    if (vN === nN) return { val: vN, fullArt: false, partialArt: false, conflict: false };
    if (vN === 0) return { val: nN, fullArt: false, partialArt: false, conflict: false };
    if (nN === 0) return { val: vN, fullArt: false, partialArt: false, conflict: false };
    if (vN + nN === 0) return { val: 0, fullArt: false, partialArt: false, conflict: true };
    return { val: 0, fullArt: false, partialArt: false, conflict: false };
  };

  var gtProbs = { 3: 64, 4: 68, 5: 72, 6: 76, 7: 80, 8: 83, 9: 86, 10: 88, 11: 91, 12: 92, 13: 94, 14: 95, 15: 96, 16: 97, 17: 98, 18: 98, 19: 99 };
  var getGrandProbValue = function(val) { var v = Math.abs(val); if (v >= 20) return "Pr > 99%"; if (gtProbs[v]) return "Pr ~ " + gtProbs[v] + "%"; return "p > 0.05"; };

  var getScreeningProbValue = function(val) {
    if (val <= -12) return "Pr > 99%"; if (val === -11) return "Pr ~ 99%"; if (val === -10) return "Pr ~ 98%"; if (val === -9) return "Pr ~ 97%";
    if (val === -8) return "Pr ~ 95%"; if (val === -7) return "Pr ~ 92%"; if (val === -6) return "Pr ~ 89%"; if (val === -5) return "Pr ~ 85%";
    if (val === -4) return "Pr ~ 79%"; if (val === -3) return "Pr ~ 73%";
    return "";
  };

  var senterProbsMap = { '-7': 94.0, '-8': 96.2, '-9': 97.8, '-10': 98.8, '-11': 99.4, '-12': 99.7, '-13': 99.9 };
  var getSenterProbValue = function(val) { var numVal = Number(val); if (numVal <= -14) return "Pr > 99.9%"; if (senterProbsMap[numVal]) return "Pr ~ " + senterProbsMap[numVal].toFixed(1) + "%"; return "p > 0.05"; };

  var getSpotInfo = function(val, testType) {
    if (testType === "screening") {
      if (val <= -3) return { status: "SR", prob: getScreeningProbValue(val), cls: "bg-sr" };
      if (val >= 1) return { status: "NSR", prob: "", cls: "bg-nsr" };
      return { status: "INC", prob: "p > 0.05", cls: "bg-inc" };
    } else {
      if (val <= -7) return { status: "SR", prob: getSenterProbValue(val), cls: "bg-sr" };
      return { status: "-", prob: "", cls: "bg-na" };
    }
  };

  var getGrandProb = function(grandTotal, activeSpotVals, testType, minSpot, hasAnySR) {
    if (activeSpotVals.length === 0) return { status: "N/A", prob: S.ess_no_data_short, cls: "bg-na" };
    if (testType === "screening") {
      if (hasAnySR) return { status: "SR", prob: "Spot Rule (" + S.cit_ri.split(' ')[0] + " SR)", cls: "bg-sr" };
      var allNSR = true;
      for(var i=0; i<activeSpotVals.length; i++) { if(activeSpotVals[i] < 1) allNSR = false; }
      if (allNSR) return { status: "NSR", prob: "All Spots NSR", cls: "bg-nsr" };
      return { status: "INC", prob: "Spot Rule (INC)", cls: "bg-inc" };
    }

    if (minSpot <= -7) return { status: "SR", prob: "Senter (" + getSenterProbValue(minSpot).replace('Pr ~ ', '') + ")", cls: "bg-sr" };
    if (grandTotal <= -3) return { status: "SR", prob: getGrandProbValue(grandTotal), cls: "bg-sr" };
    if (grandTotal >= 3) return { status: "NSR", prob: getGrandProbValue(grandTotal), cls: "bg-nsr" };
    return { status: "INC", prob: S.ess_undefined, cls: "bg-inc" };
  };

  var applyFormat = function(wrapper, formatStr) {
    var ce = wrapper._cachedElements;
    var config = formatConfig[formatStr] || formatConfig[S.ess_format_default];

    if (formatStr === S.ess_format_default) {
        ce.formatSelect.classList.add("format-attention");
    } else {
        ce.formatSelect.classList.remove("format-attention");
    }

    var scrRadio = ce.typeRadios.find(function(r) { return r.value === 'screening'; });
    var diagRadio = ce.typeRadios.find(function(r) { return r.value === 'diagnostic'; });
    var scrLabel = wrapper.querySelector('label[for="' + scrRadio.id + '"]');

    if (config.forceDiag) {
        scrRadio.disabled = true;
        if (scrLabel) scrLabel.style.display = 'none';
        if (scrRadio.checked) diagRadio.checked = true;
    } else {
        scrRadio.disabled = false;
        if (scrLabel) scrLabel.style.display = 'inline-block';
    }

    var chartToggle4 = ce.chartToggles.find(function(t) { return t.getAttribute('data-chart') === '4'; });
    var chartToggle5 = ce.chartToggles.find(function(t) { return t.getAttribute('data-chart') === '5'; });
    var activeCharts = { 1: true, 2: true, 3: true, 4: chartToggle4 ? chartToggle4.checked : true, 5: chartToggle5 ? chartToggle5.checked : true };

    for (var col = 1; col <= 4; col++) {
        var isColDisabled = col > config.cols;
        var colStr = col.toString();

        var th = wrapper.querySelector('.ess-th-question[data-th-col="' + colStr + '"]');
        if (th) isColDisabled ? th.classList.add("col-disabled") : th.classList.remove("col-disabled");

        var colInputs = ce.inputs.filter(function(i) { return i.getAttribute('data-col') === colStr; });
        colInputs.forEach(function(inp) {
            var cNum = inp.getAttribute('data-chart');
            inp.disabled = isColDisabled || !activeCharts[cNum];
            var td = inp.parentElement;
            isColDisabled ? td.classList.add("col-disabled") : td.classList.remove("col-disabled");
            if (isColDisabled) {
                inp.value = "";
                td.classList.remove("bg-local-artifact", "bg-artifact");
            }
        });

        var qInp = ce.questionInputs.find(function(i) { return i.getAttribute('data-q') === ('R' + colStr); });
        if (qInp) {
            qInp.disabled = isColDisabled;
            if (isColDisabled) qInp.value = '';
            qInp.parentElement.style.opacity = isColDisabled ? '0.4' : '1';
        }

        var pneumoSums = ce.pneumoSums.filter(function(s) { return s.getAttribute('data-col') === colStr; });
        pneumoSums.forEach(function(span) {
            var td = span.parentElement;
            isColDisabled ? td.classList.add("col-disabled") : td.classList.remove("col-disabled");
            if (isColDisabled) { span.textContent = ""; td.classList.remove("bg-artifact", "bg-local-artifact"); }
        });

        var subtotalSpans = ce.subtotals.filter(function(s) { return s.getAttribute('data-col') === colStr; });
        subtotalSpans.forEach(function(span) {
            var td = span.parentElement;
            isColDisabled ? td.classList.add("col-disabled") : td.classList.remove("col-disabled");
            if (isColDisabled) span.textContent = "";
        });

        var statusCells = ce.statuses.filter(function(s) { return s.getAttribute('data-col') === colStr; });
        statusCells.forEach(function(td) {
            isColDisabled ? td.classList.add("col-disabled") : td.classList.remove("col-disabled");
            if (isColDisabled) { td.innerHTML = ""; td.className = "status-cell bg-na col-disabled"; }
        });

        var dynToggle = wrapper.querySelector('input[id^="dyn_r' + colStr + '_"]');
        if (dynToggle) {
            var dynLabel = wrapper.querySelector('label[for="' + dynToggle.id + '"]');
            if (isColDisabled) {
                dynToggle.disabled = true; dynToggle.checked = false;
                if (dynLabel) dynLabel.style.opacity = '0.3';
            } else {
                dynToggle.disabled = false;
                if (dynLabel) dynLabel.style.opacity = '1';
            }
        }
    }
  };

  var calculateTest = function(wrapper) {
    var ce = wrapper._cachedElements;
    if (!ce) return;

    var currentFormatStr = ce.formatSelect.value;
    var allowedCols = (formatConfig[currentFormatStr] || formatConfig[S.ess_format_default]).cols;

    var subtotals = { 1: 0, 2: 0, 3: 0, 4: 0 };
    var colHasData = { 1: false, 2: false, 3: false, 4: false };

    var checkedRadio = ce.typeRadios.find(function(r) { return r.checked; });
    var currentTestType = checkedRadio ? checkedRadio.value : "screening";

    if (ce.contamWrapper) ce.contamWrapper.style.display = (currentTestType === "screening") ? "inline-flex" : "none";
    var isContamActive = ce.contamToggle ? ce.contamToggle.checked : true;

    var chartToggle4 = ce.chartToggles.find(function(t) { return t.getAttribute('data-chart') === '4'; });
    var chartToggle5 = ce.chartToggles.find(function(t) { return t.getAttribute('data-chart') === '5'; });
    var activeCharts = { 1: true, 2: true, 3: true, 4: chartToggle4 ? chartToggle4.checked : true, 5: chartToggle5 ? chartToggle5.checked : true };

    var spotWeightTotal = { 1: 0, 2: 0, 3: 0, 4: 0 };
    var spotWeightLost = { 1: 0, 2: 0, 3: 0, 4: 0 };

    for (var ch = 1; ch <= 5; ch++) {
      var cStr = ch.toString();
      var rows = ce.rows.filter(function(r) { return r.getAttribute('data-chart-group') === cStr; });
      var chartInputs = ce.inputs.filter(function(i) { return i.getAttribute('data-chart') === cStr; });
      if (!activeCharts[ch]) {
          rows.forEach(function(r) { r.classList.add("chart-disabled"); });
          chartInputs.forEach(function(i) { if(parseInt(i.getAttribute('data-col')) <= allowedCols) i.setAttribute("disabled", "true"); });
      } else {
          rows.forEach(function(r) { r.classList.remove("chart-disabled"); });
          chartInputs.forEach(function(i) { if(parseInt(i.getAttribute('data-col')) <= allowedCols) i.removeAttribute("disabled"); });
      }
    }

    var usePPGCol = {1:false, 2:false, 3:false, 4:false};
    for (var ccol = 1; ccol <= allowedCols; ccol++) {
      for (var ch2 = 1; ch2 <= 5; ch2++) {
        if (!activeCharts[ch2]) continue;
        var pInput = ce.inputsMap[ch2 + '_' + ccol + '_ppg'];
        if (pInput && !pInput.disabled && pInput.value.trim() !== "" && pInput.value.trim() !== "-") {
          usePPGCol[ccol] = true; break;
        }
      }
    }

    var getValStrict = function(chart, col, row) {
      var input = ce.inputsMap[chart + '_' + col + '_' + row];
      if (!input || input.disabled || parseInt(col) > allowedCols) return { val: 0, art: false, empty: true, raw: "" };
      var val = input.value.trim();
      if (isArt(val)) return { val: 0, art: true, empty: false, raw: val };
      if (val === "" || val === "-") return { val: 0, art: false, empty: true, raw: val };

      var num = parseFloat(val);
      if (isNaN(num)) return { val: 0, art: true, empty: false, raw: val };

      if (row === 'eda' && num !== -2 && num !== 0 && num !== 2) return { val: 0, art: true, empty: false, raw: val };
      if (row !== 'eda' && Math.abs(num) > 1) return { val: 0, art: true, empty: false, raw: val };

      return { val: num, art: false, empty: false, raw: val };
    };

    var dynamicsValues = [];

    for (var c = 1; c <= 5; c++) {
      var currentChartSum = 0;
      var chartHasArt = false;
      var cSpots = {};
      var chartHasData = false;
      var cStr2 = c.toString();

      for (var col = 1; col <= 4; col++) {
        if (col > allowedCols) continue;
        var colStr = col.toString();

        var pvInfo = getValStrict(cStr2, colStr, 'pneumo-v');
        var pnInfo = getValStrict(cStr2, colStr, 'pneumo-n');
        var edaInfo = getValStrict(cStr2, colStr, 'eda');
        var carInfo = getValStrict(cStr2, colStr, 'cardio');
        var ppgInfo = getValStrict(cStr2, colStr, 'ppg');

        var colHasCurrentData = !pvInfo.empty || !pnInfo.empty || !edaInfo.empty || !carInfo.empty || !ppgInfo.empty;

        var pneumo = calcPneumoESS(pvInfo.raw, pnInfo.raw, pvInfo.val, pnInfo.val);

        if (colHasCurrentData) {
            if (pvInfo.empty && pnInfo.empty) { pneumo.fullArt = true; pneumo.val = 0; }
            if (edaInfo.empty) edaInfo.art = true;
            if (carInfo.empty) carInfo.art = true;
            if (usePPGCol[col] && ppgInfo.empty) ppgInfo.art = true;
        }

        var spanPneumo = ce.pneumoSums.find(function(s) { return s.getAttribute('data-chart') === cStr2 && s.getAttribute('data-col') === colStr; });
        if (spanPneumo) {
          spanPneumo.parentElement.className = "calc-cell";
          if (pneumo.fullArt) {
              spanPneumo.textContent = "∅";
              spanPneumo.parentElement.classList.add("bg-artifact");
          } else if (pneumo.partialArt) {
              spanPneumo.innerHTML = pneumo.val + ' <svg class="ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>';
              spanPneumo.parentElement.classList.add("bg-local-artifact");
          } else if (pneumo.conflict) {
              spanPneumo.innerHTML = '0 <span style="color:#d8832b; cursor:help;" title="' + S.ess_conflict_title + '"><svg class="ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg></span>';
          } else {
              spanPneumo.textContent = pneumo.val;
          }
        }

        var setVisualArt = function(rowName, isArtif) {
            var inp = ce.inputsMap[cStr2 + '_' + colStr + '_' + rowName];
            if (inp) {
                if (isArtif) inp.parentElement.classList.add("bg-local-artifact");
                else inp.parentElement.classList.remove("bg-local-artifact");
            }
        };

        setVisualArt('pneumo-v', pvInfo.art || (colHasCurrentData && pvInfo.empty && pnInfo.empty));
        setVisualArt('pneumo-n', pnInfo.art || (colHasCurrentData && pvInfo.empty && pnInfo.empty));
        setVisualArt('eda', edaInfo.art);
        setVisualArt('cardio', carInfo.art);
        setVisualArt('ppg', ppgInfo.art);

        if (activeCharts[c] && colHasCurrentData) {
            var expWeight = usePPGCol[col] ? 5 : 4;
            spotWeightTotal[col] += expWeight;

            if (pneumo.fullArt) spotWeightLost[col] += 1;
            if (edaInfo.art) spotWeightLost[col] += 2;
            if (carInfo.art) spotWeightLost[col] += 1;
            if (usePPGCol[col] && ppgInfo.art) spotWeightLost[col] += 1;

            if (pneumo.fullArt || edaInfo.art || carInfo.art || (usePPGCol[col] && ppgInfo.art)) chartHasArt = true;

            colHasData[col] = true;
            chartHasData = true;
        }

        var colSum = pneumo.val + edaInfo.val + carInfo.val + ppgInfo.val;
        if (activeCharts[c]) {
          subtotals[col] += colSum;
          if(colHasCurrentData) cSpots[col] = colSum;
        }
        currentChartSum += colSum;
      }

      var spanChartTotal = ce.chartTotals.find(function(s) { return s.getAttribute('data-chart') === cStr2; });
      if (spanChartTotal) {
        spanChartTotal.textContent = activeCharts[c] ? currentChartSum : "—";
        spanChartTotal.parentElement.style.opacity = activeCharts[c] ? "1" : "0.5";
      }

      if (activeCharts[c] && chartHasData) {
        dynamicsValues.push({ chart: c, total: currentChartSum, hasArtifact: chartHasArt, spots: cSpots });
      }
    }

    wrapper._cachedDynamics = dynamicsValues;

    var testWeightTotal = 0;
    var testWeightLost = 0;
    var spotInfos = {}; var hasAnySR = false; var minSpotVal = Infinity; var activeSpotVals = [];
    var hasAnyNO = false;

    for (var sCol = 1; sCol <= 4; sCol++) {
      if (sCol > allowedCols) continue;
      if (!colHasData[sCol]) { spotInfos[sCol] = { status: "N/A", prob: "-", cls: "bg-na" }; continue; }

      testWeightTotal += spotWeightTotal[sCol];
      testWeightLost += spotWeightLost[sCol];

      var sVal = subtotals[sCol]; activeSpotVals.push(sVal);
      if (sVal < minSpotVal) minSpotVal = sVal;

      var sInfo = getSpotInfo(sVal, currentTestType);
      var spotArtPercent = spotWeightTotal[sCol] > 0 ? spotWeightLost[sCol] / spotWeightTotal[sCol] : 0;

      if (spotArtPercent >= 0.25) {
          sInfo.status = "NO";
          sInfo.prob = S.ess_lost_25;
          sInfo.cls = "bg-no";
          hasAnyNO = true;
      }

      spotInfos[sCol] = sInfo;
      if (sInfo.status === "SR") hasAnySR = true;
    }

    if (currentTestType === "screening" && hasAnySR && isContamActive) {
      for (var cc = 1; cc <= 4; cc++) {
        if (cc > allowedCols) continue;
        if (colHasData[cc] && spotInfos[cc].status === "NSR") spotInfos[cc] = { status: "INC", prob: S.ess_blocked_sr, cls: "bg-inc" };
      }
    }

    var grandTotal = 0;
    for (var gc = 1; gc <= 4; gc++) {
      if (gc > allowedCols) continue;
      var gcStr = gc.toString();
      var spanSub = ce.subtotals.find(function(s) { return s.getAttribute('data-col') === gcStr; });
      if (spanSub) spanSub.textContent = colHasData[gc] ? subtotals[gc] : "-";
      var info = spotInfos[gc];
      var cellStatus = ce.statuses.find(function(s) { return s.getAttribute('data-col') === gcStr; });
      if (cellStatus) {
        cellStatus.className = "status-cell " + info.cls;
        cellStatus.innerHTML = (info.status === "N/A" || info.status === "-") ? '<span style="color:#888;">' + info.status + '</span>' : '<span class="status-badge">' + info.status + '</span><span class="prob-text">' + info.prob + '</span>';
      }
      if (colHasData[gc]) grandTotal += subtotals[gc];
    }

    if (ce.grandTotal) ce.grandTotal.textContent = activeSpotVals.length > 0 ? grandTotal : (allowedCols > 0 ? "0" : "—");

    var grandInfo = getGrandProb(grandTotal, activeSpotVals, currentTestType, minSpotVal, hasAnySR);

    if (currentTestType === "screening" && !hasAnySR) {
        if (hasAnyNO && grandInfo.status !== "NO") {
             grandInfo.status = "NO";
             grandInfo.prob = "Spot Rule (NO)";
             grandInfo.cls = "bg-no";
        }
    }

    var testArtPercent = testWeightTotal > 0 ? testWeightLost / testWeightTotal : 0;
    var highArtifacts = testArtPercent >= 0.25;

    if (highArtifacts && allowedCols > 0) {
        grandInfo.status = "NO";
        grandInfo.prob = S.ess_lost_25_test;
        grandInfo.cls = "bg-no";
    } else if (hasAnyNO) {
        if (grandInfo.status === "SR") {
            grandInfo.prob += ' (' + S.ess_no_present_suffix + ')';
        } else {
            grandInfo.status = "NO";
            grandInfo.prob = S.ess_blocked_no;
            grandInfo.cls = "bg-no";
        }
    }

    if (allowedCols === 0) {
        grandInfo = { status: "N/A", prob: S.ess_select_format, cls: "bg-na" };
    }

    if (ce.grandStatus) {
      ce.grandStatus.className = "status-cell " + grandInfo.cls;
      ce.grandStatus.innerHTML = (grandInfo.status === "N/A" || grandInfo.status === "-") ? '<span style="color:#888;">' + grandInfo.prob + '</span>' : '<span class="status-badge" style="font-size:14px;">' + grandInfo.status + '</span><span class="prob-text" style="font-size:10px;">' + grandInfo.prob + '</span>';
    }

    if (ce.scaleLabels) {
      if (currentTestType === "diagnostic") ce.scaleLabels.innerHTML = '<span style="color: #ff0000;">◀ ' + S.ess_scale_sr_diag + '</span><span style="color: #fbc02d;">INC</span><span style="color: #2e7d32;">' + S.ess_scale_nsr_diag + ' ▶</span>';
      else ce.scaleLabels.innerHTML = '<span style="color: #ff0000;">◀ ' + S.ess_scale_sr_screen + '</span><span style="color: #fbc02d;">INC</span><span style="color: #2e7d32;">' + S.ess_scale_nsr_screen + ' ▶</span>';
    }
    if (ce.scaleMarker) {
      var minVal = -12, maxVal = 12;
      var clamped = Math.max(minVal, Math.min(maxVal, grandTotal));
      var percentage = ((clamped - minVal) / (maxVal - minVal)) * 100;
      ce.scaleMarker.style.left = activeSpotVals.length > 0 ? percentage + "%" : "50%";
    }

    updateDynamicsChart(wrapper, dynamicsValues, ce, highArtifacts, testArtPercent, hasAnyNO);
  };

  var createTestTable = function(savedData) {
    if(!savedData) savedData = null;
    var uid = Math.random().toString(36).substr(2, 9);
    var wrapper = document.createElement("div"); wrapper.className = "ess-test-wrapper";

    var rows = [{ id: 'pneumo-v', label: S.ess_row_pneumo_v }, { id: 'pneumo-n', label: S.ess_row_pneumo_n }, { id: 'eda', label: S.ess_row_eda }, { id: 'cardio', label: S.ess_row_cardio }, { id: 'ppg', label: S.ess_row_ppg }];
    var titleVal = (savedData && savedData.title !== undefined) ? escapeHtml(savedData.title) : "";
    var typeVal = (savedData && savedData.type !== undefined) ? escapeHtml(savedData.type) : "screening";

    var formatVal = (savedData && savedData.format !== undefined) ? escapeHtml(savedData.format) : S.ess_format_default;
    if (!formatConfig[formatVal]) formatVal = S.ess_format_default;

    var savedQuestions = (savedData && savedData.questions) ? savedData.questions : {};
    var formatOptions = TEST_FORMATS.map(function(f) { return '<option value="' + escapeHtml(f) + '" ' + (f === formatVal ? 'selected' : '') + '>' + escapeHtml(f) + '</option>'; }).join('');

    var ds = (savedData && savedData.dynState) ? savedData.dynState : { tot: true, r1: false, r2: false, r3: false, r4: false };

    var tableHtml = '<div class="ess-test-top-bar">' +
        '<div class="ess-top-bar-left">' +
          '<select class="ess-format-select" title="' + S.ess_format_title + '">' + formatOptions + '</select>' +
          '<div class="ess-type-toggle toggle-type">' +
            '<input type="radio" id="scr_' + uid + '" name="tt_' + uid + '" value="screening" ' + (typeVal === 'screening' ? 'checked' : '') + ' />' +
            '<label for="scr_' + uid + '">' + S.type_screening + '</label>' +
            '<input type="radio" id="diag_' + uid + '" name="tt_' + uid + '" value="diagnostic" ' + (typeVal === 'diagnostic' ? 'checked' : '') + ' />' +
            '<label for="diag_' + uid + '">' + S.type_diag + '</label>' +
          '</div>' +
          '<button class="ess-btn ess-questions-btn" title="' + S.btn_questions_title + '">' + S.btn_questions + '</button>' +
          '<button class="ess-btn ess-clear-btn" title="' + S.ess_clear_table_title + '">' + S.btn_clear_data + '</button>' +
        '</div>' +
        '<button class="ess-delete-btn" title="' + S.ess_delete_test_title + '">×</button>' +
      '</div>' +
      '<div class="ess-test-title-area">' +
        '<span class="ess-test-num-label">' + S.test_num + 'X:</span>' +
        '<input type="text" placeholder="' + S.ess_test_title_placeholder + '" value="' + titleVal + '" />' +
      '</div>' +
      '<div class="ess-table-responsive">' +
      '<table class="ess-table">' +
        '<thead>' +
          '<tr>' +
            '<th scope="col" style="width: 14%;">ESS</th>' +
            '<th scope="col" colspan="2" style="width: 19%;" class="ess-th-question" data-th-col="1" title="' + escapeHtml(savedQuestions.R1 || '') + '">R1 (R4)</th>' +
            '<th scope="col" colspan="2" style="width: 19%;" class="ess-th-question" data-th-col="2" title="' + escapeHtml(savedQuestions.R2 || '') + '">R2 (R5)</th>' +
            '<th scope="col" colspan="2" style="width: 19%;" class="ess-th-question" data-th-col="3" title="' + escapeHtml(savedQuestions.R3 || '') + '">R3 (R7)</th>' +
            '<th scope="col" colspan="2" style="width: 19%;" class="ess-th-question" data-th-col="4" title="' + escapeHtml(savedQuestions.R4 || '') + '">R4 (R8)</th>' +
            '<th scope="col" style="width: 10%;">' + S.ess_th_scores + '</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>';

    for (var c = 1; c <= 5; c++) {
      var isChecked = (savedData && savedData.chartToggles && savedData.chartToggles[c] !== undefined) ? (savedData.chartToggles[c] ? "checked" : "") : "checked";
      var headerText = (c === 4 || c === 5) ? '<label class="chart-toggle-label"><input type="checkbox" class="chart-toggle" data-chart="' + c + '" ' + isChecked + '> Chart #' + c + '</label>' : 'Chart #' + c;
      tableHtml += '<tr data-chart-group="' + c + '"><td colspan="10" class="chart-header">' + headerText + '</td></tr>';

      for (var r = 0; r < rows.length; r++) {
        tableHtml += '<tr data-chart-group="' + c + '"><th scope="row" class="row-label">' + rows[r].label + '</th>';
        for (var col = 1; col <= 4; col++) {
          var cellVal = (savedData && savedData.values && savedData.values[c + '_' + col + '_' + rows[r].id] !== undefined) ? escapeHtml(savedData.values[c + '_' + col + '_' + rows[r].id]) : "";
          var isEda = rows[r].id === 'eda';
          var titleText = isEda ? S.ess_eda_hint : S.ess_std_hint;
          var inputHtml = '<input type="text" class="score-input" data-chart="' + c + '" data-col="' + col + '" data-row="' + rows[r].id + '" value="' + cellVal + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" title="' + titleText + '">';

          if (rows[r].id === 'pneumo-v') {
            tableHtml += '<td>' + inputHtml + '</td><td rowspan="2" class="calc-cell"><span data-calc="pneumo-sum" data-chart="' + c + '" data-col="' + col + '">0</span></td>';
          } else if (rows[r].id === 'pneumo-n') {
            tableHtml += '<td>' + inputHtml + '</td>';
          } else if (rows[r].id === 'eda') {
            tableHtml += '<td colspan="2">' + inputHtml + '</td>';
          } else {
            tableHtml += '<td colspan="2">' + inputHtml + '</td>';
          }
        }
        if (r === 0) tableHtml += '<td rowspan="5" class="chart-total-cell"><span data-calc="chart-total" data-chart="' + c + '">0</span></td>';
        tableHtml += '</tr>';
      }
    }

    tableHtml += '<tr><td rowspan="2" class="total-label">' + S.ess_subtotals_label + '<br>' +
          '<label class="contam-toggle-wrapper" style="display: ' + (typeVal === 'screening' ? 'inline-flex' : 'none') + '; align-items:center; justify-content:flex-end; gap:2px; font-size:9px; margin-top:4px; cursor:pointer; color:#666;">' +
            '<input type="checkbox" class="contam-toggle" checked style="margin:0; width:10px; height:10px; cursor:pointer;"> <svg class="ic-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg> ' + S.ess_contam_label +
          '</label></td>';
    for (var tc = 1; tc <= 4; tc++) tableHtml += '<td colspan="2" class="status-cell bg-na" data-calc-cell="status" data-col="' + tc + '">-</td>';
    tableHtml += '<td rowspan="2" class="calc-cell" style="background:rgba(0,0,0,0.03); color:#666;">' + S.ess_chart_sum_label + '</td></tr><tr>';
    for (var sc = 1; sc <= 4; sc++) tableHtml += '<td colspan="2" class="calc-cell"><span data-calc="subtotal" data-col="' + sc + '">-</span></td>';
    tableHtml += '</tr><tr><td class="total-label">' + S.ess_grand_total_label + '</td>' +
        '<td colspan="6" class="calc-cell" style="font-size: 15px; color: #3a7cfd;"><span data-calc="grand-total">0</span></td>' +
        '<td colspan="3" class="status-cell bg-na" data-calc-cell="grand-status">' + S.ess_no_data_short + '</td></tr></tbody></table></div>' +
    '<div class="ess-scale-container"><div class="ess-scale-title">' + S.ess_scale_title + '</div><div class="ess-scale-track"><div class="ess-scale-marker">▼</div></div><div class="ess-scale-labels"></div></div>' +
    '<div class="ess-dynamics-container"><div class="ess-dynamics-header"><div class="ess-dynamics-title">' + S.ess_dynamics_title + '</div>' +
        '<div class="dyn-mode-toggle">' +
          '<input type="checkbox" id="dyn_tot_' + uid + '" value="tot" ' + (ds.tot ? 'checked' : '') + '><label for="dyn_tot_' + uid + '">Σ ' + S.ess_dyn_total + '</label>' +
          '<input type="checkbox" id="dyn_r1_' + uid + '" value="r1" ' + (ds.r1 ? 'checked' : '') + '><label for="dyn_r1_' + uid + '">R1</label>' +
          '<input type="checkbox" id="dyn_r2_' + uid + '" value="r2" ' + (ds.r2 ? 'checked' : '') + '><label for="dyn_r2_' + uid + '">R2</label>' +
          '<input type="checkbox" id="dyn_r3_' + uid + '" value="r3" ' + (ds.r3 ? 'checked' : '') + '><label for="dyn_r3_' + uid + '">R3</label>' +
          '<input type="checkbox" id="dyn_r4_' + uid + '" value="r4" ' + (ds.r4 ? 'checked' : '') + '><label for="dyn_r4_' + uid + '">R4</label>' +
        '</div></div><div class="ess-dynamics-chart"><svg class="ess-dynamics-svg" width="100%" height="100%"></svg></div><div class="ess-dynamics-text"></div></div>' +
    '<div class="ess-modal-overlay"><div class="ess-modal"><div class="ess-modal-header"><h3>' + S.ess_questions_modal_title + 'X</h3><button class="ess-modal-close">&times;</button></div>' +
        '<div class="ess-modal-body">' +
          '<label>R1 (R4): <input type="text" class="ess-question-input" data-q="R1" value="' + escapeHtml(savedQuestions.R1 || '') + '" autocomplete="off"></label>' +
          '<label>R2 (R5): <input type="text" class="ess-question-input" data-q="R2" value="' + escapeHtml(savedQuestions.R2 || '') + '" autocomplete="off"></label>' +
          '<label>R3 (R7): <input type="text" class="ess-question-input" data-q="R3" value="' + escapeHtml(savedQuestions.R3 || '') + '" autocomplete="off"></label>' +
          '<label>R4 (R8): <input type="text" class="ess-question-input" data-q="R4" value="' + escapeHtml(savedQuestions.R4 || '') + '" autocomplete="off"></label>' +
        '</div><div class="ess-modal-footer"><button class="ess-btn ess-modal-save">' + S.modal_save + '</button><button class="ess-btn ess-modal-cancel">' + S.modal_cancel + '</button></div></div></div>';

    wrapper.innerHTML = tableHtml;

    var inputsArray = Array.from(wrapper.querySelectorAll("input.score-input"));
    var inputsMap = {};
    inputsArray.forEach(function(i) { inputsMap[i.getAttribute('data-chart') + '_' + i.getAttribute('data-col') + '_' + i.getAttribute('data-row')] = i; });

    var modalOverlay = wrapper.querySelector(".ess-modal-overlay");
    wrapper.querySelector(".ess-questions-btn").addEventListener('click', function() { modalOverlay.classList.add("active"); });
    var closeModal = function() { modalOverlay.classList.remove("active"); };
    wrapper.querySelector(".ess-modal-close").addEventListener('click', closeModal);
    wrapper.querySelector(".ess-modal-cancel").addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', function(e) { if (e.target === modalOverlay) closeModal(); });

    wrapper.querySelector(".ess-modal-save").addEventListener('click', function() {
      wrapper.querySelectorAll(".ess-question-input").forEach(function(inp) {
        var qKey = inp.getAttribute('data-q');
        var th = wrapper.querySelector('.ess-th-question[data-th-col="' + qKey.replace('R','') + '"]');
        if (th) th.title = escapeHtml(inp.value ? qKey + ": " + inp.value : '');
      });
      closeModal(); triggerUnsaved();
    });

    wrapper._cachedElements = {
      titleInput: wrapper.querySelector(".ess-test-title-area input[type='text']"),
      formatSelect: wrapper.querySelector(".ess-format-select"),
      typeRadios: Array.from(wrapper.querySelectorAll(".toggle-type input[type='radio']")),
      chartToggles: Array.from(wrapper.querySelectorAll(".chart-toggle")),
      dynToggles: Array.from(wrapper.querySelectorAll(".dyn-mode-toggle input[type='checkbox']")),
      inputs: inputsArray,
      inputsMap: inputsMap,
      questionInputs: Array.from(wrapper.querySelectorAll(".ess-question-input")),
      pneumoSums: Array.from(wrapper.querySelectorAll('[data-calc="pneumo-sum"]')),
      chartTotals: Array.from(wrapper.querySelectorAll('[data-calc="chart-total"]')),
      subtotals: Array.from(wrapper.querySelectorAll('[data-calc="subtotal"]')),
      statuses: Array.from(wrapper.querySelectorAll('[data-calc-cell="status"]')),
      grandTotal: wrapper.querySelector('[data-calc="grand-total"]'),
      grandStatus: wrapper.querySelector('[data-calc-cell="grand-status"]'),
      scaleLabels: wrapper.querySelector(".ess-scale-labels"),
      scaleMarker: wrapper.querySelector(".ess-scale-marker"),
      contamToggle: wrapper.querySelector(".contam-toggle"),
      contamWrapper: wrapper.querySelector(".contam-toggle-wrapper"),
      rows: Array.from(wrapper.querySelectorAll("tr[data-chart-group]")),
      dynamicsSvg: wrapper.querySelector(".ess-dynamics-svg"),
      dynamicsText: wrapper.querySelector(".ess-dynamics-text")
    };

    wrapper._cachedElements.formatSelect.setAttribute('data-prev-val', formatVal);
    applyFormat(wrapper, formatVal);

    var calcTimeout;
    var debouncedCalc = function() { clearTimeout(calcTimeout); calcTimeout = setTimeout(function() { calculateTest(wrapper); triggerUnsaved(); }, 50); };

    wrapper._cachedElements.formatSelect.addEventListener('change', function(e) {
        var newFormat = e.target.value;
        var prevFormat = e.target.getAttribute('data-prev-val') || S.ess_format_default;
        var newConfig = formatConfig[newFormat] || formatConfig[S.ess_format_default];
        var prevConfig = formatConfig[prevFormat] || formatConfig[S.ess_format_default];

        if (newConfig.cols < prevConfig.cols) {
            var hasData = false;
            for (var dc = newConfig.cols + 1; dc <= prevConfig.cols; dc++) {
                for (var cc = 1; cc <= 5; cc++) {
                    ['pneumo-v', 'pneumo-n', 'eda', 'cardio', 'ppg'].forEach(function(r) {
                        var inp = wrapper._cachedElements.inputsMap[cc + '_' + dc + '_' + r];
                        if (inp && inp.value.trim() !== '') hasData = true;
                    });
                }
                if (hasData) break;
            }
            if (hasData) {
                alert(S.ess_alert_narrow_format + ' R' + (newConfig.cols + 1) + '.');
                e.target.value = prevFormat;
                return;
            }
        }

        if (prevConfig.forceDiag && !newConfig.forceDiag) {
            var scrRadio = wrapper._cachedElements.typeRadios.find(function(r) { return r.value === 'screening'; });
            if (scrRadio) scrRadio.checked = true;
        }

        e.target.setAttribute('data-prev-val', newFormat);
        applyFormat(wrapper, newFormat);
        debouncedCalc();
        triggerUnsaved();
    });

    wrapper.querySelectorAll('.chart-toggle').forEach(function(el) { el.addEventListener('change', debouncedCalc); });
    wrapper.querySelectorAll('.dyn-mode-toggle input').forEach(function(el) { el.addEventListener('change', debouncedCalc); });
    if(wrapper.querySelector(".contam-toggle")) wrapper.querySelector(".contam-toggle").addEventListener("change", debouncedCalc);
    if(wrapper.querySelector(".ess-test-title-area input[type='text']")) wrapper.querySelector(".ess-test-title-area input[type='text']").addEventListener('input', triggerUnsaved);
    wrapper.querySelectorAll(".toggle-type input[type='radio']").forEach(function(el) { el.addEventListener('change', debouncedCalc); });

    wrapper.querySelector(".ess-delete-btn").addEventListener("click", function() {
      if (confirm(S.ess_confirm_del_test)) {
        wrapper.remove();
        updateTestNumbers();
        triggerUnsaved();
      }
    });

    wrapper.querySelector(".ess-clear-btn").addEventListener("click", function() {
      if (confirm(S.ess_confirm_clear_table)) {
        wrapper._cachedElements.inputs.forEach(function(i) { if (!i.disabled) i.value = ""; });
        debouncedCalc();
      }
    });

    wrapper.addEventListener('input', function(e) {
      if (e.target.tagName === 'INPUT' && e.target.classList.contains('score-input')) {
        var el = e.target;
        var val = el.value.trim().toLowerCase();

        if (val.startsWith('+')) {
            val = val.slice(1);
            el.value = val;
        }

        if (val === 'a' || val === 'а' || val === 'f' || val === 'ф') {
            el.value = 'А';
        } else if (val === '00') {
            el.value = '∅';
        } else if (val !== '∅' && val !== 'а' && val !== 'a' && val !== 'А') {
            if (val !== "" && val !== "-") {
              var num = Number(val);
              if (isNaN(num)) {
                el.value = "";
              } else {
                if (el.getAttribute('data-row') === 'eda' && num !== -2 && num !== 0 && num !== 2) el.value = "";
                else if (el.getAttribute('data-row') !== 'eda' && Math.abs(num) > 1) el.value = "";
                else el.value = val;
              }
            } else {
                el.value = val;
            }
        }
        debouncedCalc();
      }
    });

    wrapper.addEventListener('keydown', function(e) {
      if (e.target.tagName === 'INPUT' && e.target.classList.contains('score-input')) {
        if (e.key === '-' || e.key === 'Subtract' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
          e.preventDefault(); e.target.value = (e.target.getAttribute('data-row') === 'eda') ? "-2" : "-1"; debouncedCalc();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          var activeInputs = wrapper._cachedElements.inputs.filter(function(i) { return !i.disabled; });
          var nextInput = activeInputs.slice(activeInputs.indexOf(e.target) + 1).find(function(i) { return i.getAttribute('data-col') === e.target.getAttribute('data-col'); });
          if (nextInput) { nextInput.focus(); nextInput.select(); }
        }
      }
    });

    testsContainer.appendChild(wrapper);
    updateTestNumbers();
    calculateTest(wrapper);
  };

  return {
    init: function() {
      appRoot = document.getElementById("app");
      container = document.createElement("div");
      container.className = "ess-module-container";

      testsContainer = document.createElement("div");
      addBtnBottom = document.createElement("button");
      addBtnBottom.className = "ess-add-btn";
      addBtnBottom.textContent = S.ess_add;
      addBtnBottom.addEventListener("click", function() { createTestTable(); triggerUnsaved(); });

      container.appendChild(testsContainer);
      container.appendChild(addBtnBottom);
      appRoot.appendChild(container);
    },

    collectState: function() {
      var tests = Array.from(testsContainer.querySelectorAll(".ess-test-wrapper")).map(function(wrapper) {
        var ce = wrapper._cachedElements;
        var titleInput = ce ? ce.titleInput : wrapper.querySelector(".ess-test-title-area input[type='text']");
        var checkedRadio = ce ? ce.typeRadios.find(function(r) { return r.checked; }) : wrapper.querySelector(".toggle-type input[type='radio']:checked");
        var formatSelect = ce ? ce.formatSelect : wrapper.querySelector(".ess-format-select");

        var elTot = wrapper.querySelector('input[id^="dyn_tot_"]');
        var elR1 = wrapper.querySelector('input[id^="dyn_r1_"]');
        var elR2 = wrapper.querySelector('input[id^="dyn_r2_"]');
        var elR3 = wrapper.querySelector('input[id^="dyn_r3_"]');
        var elR4 = wrapper.querySelector('input[id^="dyn_r4_"]');

        var dynState = {
          tot: elTot ? elTot.checked : true,
          r1: elR1 ? elR1.checked : false,
          r2: elR2 ? elR2.checked : false,
          r3: elR3 ? elR3.checked : false,
          r4: elR4 ? elR4.checked : false
        };

        var inputs = ce ? ce.inputs : Array.from(wrapper.querySelectorAll("input.score-input"));
        var qInputs = ce ? ce.questionInputs : Array.from(wrapper.querySelectorAll(".ess-question-input"));

        var values = {};
        inputs.forEach(function(inp) { values[inp.getAttribute('data-chart') + '_' + inp.getAttribute('data-col') + '_' + inp.getAttribute('data-row')] = inp.value; });
        var questions = {};
        qInputs.forEach(function(inp) { questions[inp.getAttribute('data-q')] = inp.value; });

        var chartToggle4 = ce ? ce.chartToggles.find(function(t) { return t.getAttribute('data-chart') === '4'; }) : wrapper.querySelector(".chart-toggle[data-chart='4']");
        var chartToggle5 = ce ? ce.chartToggles.find(function(t) { return t.getAttribute('data-chart') === '5'; }) : wrapper.querySelector(".chart-toggle[data-chart='5']");

        return {
          title: titleInput ? titleInput.value : "",
          format: formatSelect ? formatSelect.value : S.ess_format_default,
          questions: questions,
          type: checkedRadio ? checkedRadio.value : "screening",
          dynState: dynState,
          chartToggles: {
            4: chartToggle4 ? chartToggle4.checked : true,
            5: chartToggle5 ? chartToggle5.checked : true
          },
          values: values
        };
      });
      return tests;
    },

    restoreState: function(testsData) {
      testsContainer.innerHTML = "";
      if (Array.isArray(testsData) && testsData.length > 0) {
          testsData.forEach(function(d) { createTestTable(d); });
      } else {
          createTestTable(null);
      }
    },

    clearAll: function() {
      testsContainer.innerHTML = "";
      createTestTable(null);
    },

    getMarkdown: function() {
      var testWrappers = testsContainer.querySelectorAll('.ess-test-wrapper');
      if(testWrappers.length === 0) return "";

      var md = "";
      testWrappers.forEach(function(wrapper, index) {
          var ce = wrapper._cachedElements;
          if(!ce) return;

          var title = ce.titleInput.value || (S.md_test_fallback + (index + 1));
          var format = ce.formatSelect.value;
          var checkedRadio = ce.typeRadios.find(function(r) { return r.checked; });
          var type = (checkedRadio && checkedRadio.value === 'screening') ? S.type_screening : S.type_diag;
          var isScreening = (checkedRadio && checkedRadio.value === 'screening');
          var allowedCols = (formatConfig[format] && formatConfig[format].cols) ? formatConfig[format].cols : 0;

          md += '### ' + S.test_num + (index + 1) + ': ' + title + '\n';
          md += '**' + S.md_format + ':** ' + format + ' | **' + S.md_type + ':** ' + type + '\n\n';

          if(allowedCols === 0) {
              md += '*' + S.md_no_format + '*\n\n---\n\n';
              return;
          }

          var activeCharts = [];
          for(var c=1; c<=5; c++) {
              var toggle = ce.chartToggles.find(function(t) { return t.getAttribute('data-chart') == c; });
              if(!toggle || toggle.checked) activeCharts.push(c);
          }

          md += '**' + S.md_score_matrix + ':**\n\n';
          var th = '| ' + padR(S.md_question_col, 8) + ' |';
          var sep = '| :------- |';
          activeCharts.forEach(function(c) {
              th += ' ' + padR('C' + c, 4) + ' |';
              sep += ' :---: |';
          });
          th += ' ' + padR('Subtotal', 8) + ' | ' + padR(S.md_status_col, 25) + ' |\n';
          sep += ' :---: | :--- |\n';
          md += th + sep;

          var dynVals = wrapper._cachedDynamics || [];
          var getSpotSum = function(c, col) {
              var chartData = dynVals.find(function(d) { return d.chart == c; });
              if(chartData && chartData.spots[col] !== undefined) return chartData.spots[col];
              return "-";
          };

          for(var col = 1; col <= allowedCols; col++) {
              var rowStr = '| **' + padR('R' + col, 6) + '** |';
              activeCharts.forEach(function(c) {
                  rowStr += ' ' + padR(getSpotSum(c, col), 4) + ' |';
              });
              var subSpan = ce.subtotals.find(function(s) { return s.getAttribute('data-col') == col; });
              var subVal = subSpan ? subSpan.textContent : "-";
              rowStr += ' **' + padR(subVal, 6) + '** |';

              var statusCell = ce.statuses.find(function(s) { return s.getAttribute('data-col') == col; });
              var statusText = "-";
              if(statusCell) {
                  var badge = statusCell.querySelector('.status-badge');
                  if(badge) statusText = badge.textContent;
              }
              rowStr += ' ' + padR(colorizeStatus(statusText), 25) + ' |\n';
              md += rowStr;
          }

          var gTotal = ce.grandTotal ? ce.grandTotal.textContent : "0";
          var gRow = '| **' + padR('G. Total', 6) + '** |';
          activeCharts.forEach(function() { gRow += ' ' + padR('', 4) + ' |'; });
          gRow += ' **' + padR(gTotal, 6) + '** | ' + padR('', 25) + ' |\n';
          md += gRow;

          md += '\n**' + S.md_qc_analysis + ':**\n';
          var listItems = ce.dynamicsText.querySelectorAll('li');
          listItems.forEach(function(li) {
              var htmlContent = li.innerHTML;
              htmlContent = htmlContent.replace(/<b>/g, '**').replace(/<\/b>/g, '**');
              htmlContent = htmlContent.replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '');
              md += '- ' + htmlContent.trim() + '\n';
          });

          md += '\n**' + S.md_conclusion_test + ' (' + S.test_num + (index + 1) + '):**\n';

          if (isScreening) {
              md += S.md_screening_intro + '\n\n';
              md += '**' + S.md_results_by_q + ':**\n';
              for(var cCol = 1; cCol <= allowedCols; cCol++) {
                  var qInput = ce.questionInputs.find(function(i) { return i.getAttribute('data-q') === ('R' + cCol); });
                  var qText = qInput ? qInput.value.trim() : '';
                  var dispText = qText ? qText : ('R' + cCol);

                  var stCell = ce.statuses.find(function(s) { return s.getAttribute('data-col') == cCol; });
                  var stBadge = ""; var pText = "";
                  if(stCell) {
                      var bNode = stCell.querySelector('.status-badge');
                      var pNode = stCell.querySelector('.prob-text');
                      if(bNode) stBadge = bNode.textContent;
                      if(pNode) pText = pNode.textContent;
                  }
                  if (stBadge && stBadge !== '-' && stBadge !== 'N/A') {
                      md += '- **R' + cCol + '** ("' + dispText + '"): ' + colorizeStatus(stBadge) + ' ' + (pText ? '(' + pText + ')' : '') + '\n';
                  }
              }
              md += '\n**' + S.md_test_summary + ':**\n';
              var gStBadge = ce.grandStatus ? ce.grandStatus.querySelector('.status-badge') : null;
              var gPr = ce.grandStatus ? ce.grandStatus.querySelector('.prob-text') : null;
              if (gStBadge) {
                  md += '> ' + colorizeStatus(gStBadge.textContent) + ' ' + (gPr ? '(' + gPr.textContent + ')' : '') + '\n\n';
              }
          } else {
              md += S.md_diagnostic_intro + '\n\n';
              md += '**' + S.md_topics_checked + ':**\n';
              for(var cCol2 = 1; cCol2 <= allowedCols; cCol2++) {
                  var qInp2 = ce.questionInputs.find(function(i) { return i.getAttribute('data-q') === ('R' + cCol2); });
                  var qTxt2 = qInp2 ? qInp2.value.trim() : '';
                  if (qTxt2) md += '- R' + cCol2 + ': ' + qTxt2 + '\n';
              }
              md += '\n**' + S.md_test_summary + ':**\n';
              var gStB = ce.grandStatus ? ce.grandStatus.querySelector('.status-badge') : null;
              var gP = ce.grandStatus ? ce.grandStatus.querySelector('.prob-text') : null;
              if (gStB) {
                  md += '> ' + colorizeStatus(gStB.textContent) + ' ' + (gP ? '(' + gP.textContent + ')' : '') + '\n\n';
              }
          }
      });
      return md;
    },

    // ── Супервізія ────────────────────────────────────────────
    // Генерує ту саму структуру таблиці (chart-групи, R1(R4)...R4(R8), 5 сенсорів),
    // що й основна ESS-таблиця, але кожна клітинка містить три піделементи:
    // поле супервізора (активне), значення поліграфолога (нередаговане), дельта-мітка.
    // testData — один елемент масиву, який повертає collectState().
    getSupervisionTableHtml: function(testData, svScores) {
      if (!testData) return '';
      svScores = svScores || {};

      var rows = [{ id: 'pneumo-v', label: S.ess_row_pneumo_v }, { id: 'pneumo-n', label: S.ess_row_pneumo_n }, { id: 'eda', label: S.ess_row_eda }, { id: 'cardio', label: S.ess_row_cardio }, { id: 'ppg', label: S.ess_row_ppg }];
      var formatVal = testData.format || S.ess_format_default;
      if (!formatConfig[formatVal]) formatVal = S.ess_format_default;
      var allowedCols = formatConfig[formatVal].cols;
      var chartToggles = testData.chartToggles || { 4: true, 5: true };
      var questions = testData.questions || {};
      var values = testData.values || {};

      function isChartActive(c) {
        if (c === 4) return chartToggles[4] !== false;
        if (c === 5) return chartToggles[5] !== false;
        return true;
      }

      var html = '<div class="sv-table-responsive"><table class="sv-table">' +
        '<thead><tr>' +
          '<th scope="col" class="sv-th-label">' + S.ess_th_channel + '</th>';
      for (var qc = 1; qc <= 4; qc++) {
        var qKey = 'R' + qc;
        var qDisabled = qc > allowedCols ? ' sv-col-disabled' : '';
        html += '<th scope="col" class="sv-th-question' + qDisabled + '" title="' + escapeHtml(questions[qKey] || '') + '">R' + qc + ' (R' + (qc + 3) + ')</th>';
      }
      html += '</tr></thead><tbody>';

      for (var c = 1; c <= 5; c++) {
        if (!isChartActive(c)) continue;
        html += '<tr class="sv-chart-row"><td colspan="5">Chart #' + c + '</td></tr>';
        for (var r = 0; r < rows.length; r++) {
          html += '<tr><th scope="row" class="sv-row-label">' + rows[r].label + '</th>';
          for (var col = 1; col <= 4; col++) {
            if (col > allowedCols) { html += '<td class="sv-col-disabled"></td>'; continue; }
            var valKey = c + '_' + col + '_' + rows[r].id;
            var polyVal = values[valKey];
            var polyDisplay = (polyVal === undefined || polyVal === '') ? '—' : escapeHtml(polyVal);
            var svKey = c + '_' + col + '_' + rows[r].id;
            var svVal = svScores[svKey];
            var svDisplay = (svVal !== undefined) ? escapeHtml(svVal) : '';
            var isEda = rows[r].id === 'eda';
            var titleText = isEda ? S.ess_eda_hint : S.ess_std_hint;

            var deltaHtml = '<span class="sv-delta"></span>';
            if (svVal !== undefined && svVal !== '' && polyVal !== undefined && polyVal !== '') {
              var svNum = (svVal === 'А' || svVal === 'A') ? null : (svVal === '∅' ? 0 : parseFloat(svVal));
              var polyNum = (polyVal === 'А' || polyVal === 'A') ? null : (polyVal === '∅' ? 0 : parseFloat(polyVal));
              if (svNum !== null && polyNum !== null && !isNaN(svNum) && !isNaN(polyNum)) {
                var d = svNum - polyNum;
                var dCls = d === 0 ? 'sv-delta-match' : (Math.abs(d) >= 2 ? 'sv-delta-high' : 'sv-delta-low');
                var dText = d === 0 ? '=' : (d > 0 ? '+' + d : String(d));
                deltaHtml = '<span class="sv-delta ' + dCls + '">' + dText + '</span>';
              } else if (svVal === polyVal) {
                deltaHtml = '<span class="sv-delta sv-delta-match">=</span>';
              } else {
                deltaHtml = '<span class="sv-delta sv-delta-high">≠</span>';
              }
            }

            html += '<td>' +
              '<div class="sv-cell">' +
                '<input type="text" class="sv-score-input" data-key="' + svKey + '" value="' + svDisplay + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" title="' + titleText + '">' +
                '<span class="sv-poly-val">' + polyDisplay + '</span>' +
                deltaHtml +
              '</div>' +
            '</td>';
          }
          html += '</tr>';
        }
      }
      html += '</tbody></table></div>';
      return html;
    }
  };
})();
