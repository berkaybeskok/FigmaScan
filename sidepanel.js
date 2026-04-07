(function () {
  "use strict";

  var _tokState = { figma: false, gemini: false };

  function switchTab(key) {
    var map = { a: "pa", r: "pr", s: "ps" };
    document.querySelectorAll(".T").forEach(function (btn) {
      btn.classList.toggle("on", btn.getAttribute("data-tab") === key);
    });
    document.querySelectorAll(".pn").forEach(function (p) { p.classList.remove("on"); });
    var panel = document.getElementById(map[key]);
    if (panel) panel.classList.add("on");
  }

  document.getElementById("tabBar").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-tab]");
    if (btn) switchTab(btn.getAttribute("data-tab"));
  });

  var goSLink = document.getElementById("goS");
  if (goSLink) goSLink.addEventListener("click", function (e) { e.preventDefault(); switchTab("s"); });

  function esc(s) { var d = document.createElement("div"); d.textContent = String(s || ""); return d.innerHTML; }

  function toast(m, t) {
    var o = document.querySelector(".to"); if (o) o.remove();
    var e = document.createElement("div"); e.className = "to"; e.textContent = m;
    e.style.background = t === "success" ? "#2a8a6e" : t === "error" ? "#c43a54" : "#b87a1f";
    document.body.appendChild(e);
    setTimeout(function () { e.style.opacity = "0"; setTimeout(function () { e.remove(); }, 300); }, 4000);
  }

  function sendMsg(msg, cb) {
    try {
      chrome.runtime.sendMessage(msg, function (resp) {
        if (chrome.runtime.lastError) { if (cb) cb(null); return; }
        if (cb) cb(resp);
      });
    } catch (e) { if (cb) cb(null); }
  }

  function ckTok() {
    sendMsg({ action: "get-tokens" }, function (r) {
      if (!r) return;
      var f = !!(r.figmaToken), g = !!(r.geminiKey);
      _tokState.figma = f; _tokState.gemini = g;
      var ok = f && g;
      var tw = document.getElementById("tw"); if (tw) tw.style.display = ok ? "none" : "flex";
      var to = document.getElementById("to");
      if (to) {
        if (ok) {
          to.style.display = "flex";
          setTimeout(function() { to.style.display = "none"; }, 5000);
        } else {
          to.style.display = "none";
        }
      }
      var fst = document.getElementById("fst"); if (fst) { fst.style.display = "flex"; fst.className = f ? "bn bo" : "bn bw"; fst.textContent = f ? "✓ Token bağlı" : "⚠ Token eklenmedi"; }
      var gst = document.getElementById("gst"); if (gst) { gst.style.display = "flex"; gst.className = g ? "bn bo" : "bn bw"; gst.textContent = g ? "✓ Key bağlı" : "⚠ Key eklenmedi"; }
      updBtn();
    });
  }

  function updBtn() {
    var v = (document.getElementById("fl") ? document.getElementById("fl").value : "").trim();
    var go = document.getElementById("go");
    if (go) go.disabled = !(_tokState.figma && _tokState.gemini && v.length > 10);
  }

  ckTok();
  document.getElementById("fl").addEventListener("input", updBtn);

  document.getElementById("fs").addEventListener("click", function () {
    var v = document.getElementById("fi").value.trim();
    if (!v) { toast("Token boş olamaz", "error"); return; }
    sendMsg({ action: "save-token", key: "figmaToken", value: v }, function () { document.getElementById("fi").value = ""; _tokState.figma = true; ckTok(); toast("Figma token kaydedildi!", "success"); });
  });
  document.getElementById("fd").addEventListener("click", function () {
    sendMsg({ action: "delete-token", key: "figmaToken" }, function () { _tokState.figma = false; ckTok(); toast("Figma token silindi", "warning"); });
  });
  document.getElementById("fe").addEventListener("click", function () { var i = document.getElementById("fi"); i.type = i.type === "password" ? "text" : "password"; });

  document.getElementById("gs").addEventListener("click", function () {
    var v = document.getElementById("gi").value.trim();
    if (!v) { toast("Key boş olamaz", "error"); return; }
    sendMsg({ action: "save-token", key: "geminiKey", value: v }, function () { document.getElementById("gi").value = ""; _tokState.gemini = true; ckTok(); toast("Gemini key kaydedildi!", "success"); });
  });
  document.getElementById("gd").addEventListener("click", function () {
    sendMsg({ action: "delete-token", key: "geminiKey" }, function () { _tokState.gemini = false; ckTok(); toast("Gemini key silindi", "warning"); });
  });
  document.getElementById("ge").addEventListener("click", function () { var i = document.getElementById("gi"); i.type = i.type === "password" ? "text" : "password"; });

  function parseFig(s) {
    s = (s || "").trim();
    var m = s.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)(?:\/[^?]*)?(?:\?.*node-id=([^&]+))?/);
    if (m && m[2]) return { fk: m[1], nid: decodeURIComponent(m[2]).replace(/-/g, ":") };
    return null;
  }

  function flattenFigma(data) {
    var list = [];
    function hex(c) { if (!c) return null; var r = Math.round((c.r || 0) * 255), g = Math.round((c.g || 0) * 255), b = Math.round((c.b || 0) * 255); return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase(); }
    function walk(n, d) {
      if (!n || !n.id) return;
      var it = { id: n.id, name: n.name, type: n.type, depth: d, tokens: {} };
      if (n.characters) it.textContent = n.characters;
      if (n.fills && n.fills.length) { for (var i = 0; i < n.fills.length; i++) { var f = n.fills[i]; if (f.type === "SOLID" && f.visible !== false) { it.tokens.fillColor = hex(f.color); break; } } }
      if (n.strokes && n.strokes.length) { for (var i = 0; i < n.strokes.length; i++) { var s = n.strokes[i]; if (s.type === "SOLID" && s.visible !== false) { it.tokens.strokeColor = hex(s.color); break; } } }
      var st = n.style || {};
      if (st.fontFamily) it.tokens.fontFamily = st.fontFamily;
      if (st.fontSize) it.tokens.fontSize = st.fontSize + "px";
      if (st.fontWeight) it.tokens.fontWeight = String(st.fontWeight);
      if (st.lineHeightPx) it.tokens.lineHeight = Math.round(st.lineHeightPx) + "px";
      if (st.letterSpacing) it.tokens.letterSpacing = st.letterSpacing.toFixed(1) + "px";
      if (st.textAlignHorizontal) it.tokens.textAlign = st.textAlignHorizontal.toLowerCase();
      if (n.paddingTop != null) it.tokens.paddingTop = n.paddingTop + "px";
      if (n.paddingRight != null) it.tokens.paddingRight = n.paddingRight + "px";
      if (n.paddingBottom != null) it.tokens.paddingBottom = n.paddingBottom + "px";
      if (n.paddingLeft != null) it.tokens.paddingLeft = n.paddingLeft + "px";
      if (n.itemSpacing != null) it.tokens.gap = n.itemSpacing + "px";
      if (n.absoluteBoundingBox) { it.tokens.width = Math.round(n.absoluteBoundingBox.width) + "px"; it.tokens.height = Math.round(n.absoluteBoundingBox.height) + "px"; }
      if (n.cornerRadius) it.tokens.borderRadius = n.cornerRadius + "px";
      if (Object.keys(it.tokens).length > 0 || it.textContent) list.push(it);
      if (n.children) n.children.forEach(function (c) { walk(c, d + 1); });
    }
    if (data.nodes) Object.values(data.nodes).forEach(function (n) { walk(n.document, 0); });
    else if (data.document) walk(data.document, 0);
    return list;
  }

  function getFilterCat(category, property) {
    if (category === "color") return "colors";
    if (category === "typo") { if (property === "Text Align") return "sizing_alignment"; return "typography"; }
    if (category === "spacing") return "padding_spacing";
    if (category === "layout") { if (property === "Border Radius") return "borders_radius"; return "sizing_alignment"; }
    if (category === "content") return "ux_copy";
    return "colors";
  }

  function getTagForFilter(fc) {
    var map = { colors: ["tc", "Colors"], typography: ["tt", "Typography"], sizing_alignment: ["tsa", "Sizing"], padding_spacing: ["tp", "Padding"], borders_radius: ["tbr", "Borders"], effects_elevation: ["tfx", "Effects"], ux_copy: ["tcn", "UX Copy"] };
    return map[fc] || ["tl", "Other"];
  }

  function diffPair(fi, di) {
    var r = [], t = fi.tokens, d = di.styles, nm = fi.name || fi.textContent || fi.id;
    if (t.fillColor) { if (fi.type === "TEXT") r.push(mk(nm, "Yazı Rengi", "color", t.fillColor, d.color, hxM(t.fillColor, d.color), di.selector)); else r.push(mk(nm, "Arka Plan", "color", t.fillColor, d.backgroundColor, hxM(t.fillColor, d.backgroundColor), di.selector)); }
    if (t.strokeColor) r.push(mk(nm, "Stroke Rengi", "color", t.strokeColor, d.color, hxM(t.strokeColor, d.color), di.selector));
    if (t.fontFamily) r.push(mk(nm, "Font Family", "typo", t.fontFamily, d.fontFamily, fM(t.fontFamily, d.fontFamily), di.selector));
    if (t.fontSize) r.push(mk(nm, "Font Size", "typo", t.fontSize, d.fontSize, pM(t.fontSize, d.fontSize, 1), di.selector));
    if (t.fontWeight) r.push(mk(nm, "Font Weight", "typo", t.fontWeight, d.fontWeight, t.fontWeight === d.fontWeight, di.selector));
    if (t.lineHeight) r.push(mk(nm, "Line Height", "typo", t.lineHeight, d.lineHeight, pM(t.lineHeight, d.lineHeight, 2), di.selector));
    if (t.letterSpacing) r.push(mk(nm, "Letter Spacing", "typo", t.letterSpacing, d.letterSpacing, pM(t.letterSpacing, d.letterSpacing, 0.5), di.selector));
    if (t.textAlign) r.push(mk(nm, "Text Align", "typo", t.textAlign, d.textAlign, t.textAlign === d.textAlign, di.selector));
    ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].forEach(function (p) { if (t[p]) r.push(mk(nm, p.replace("padding", "Padding "), "spacing", t[p], d[p], pM(t[p], d[p], 2), di.selector)); });
    if (t.gap) r.push(mk(nm, "Gap", "spacing", t.gap, d.gap, pM(t.gap, d.gap, 2), di.selector));
    if (t.borderRadius) r.push(mk(nm, "Border Radius", "layout", t.borderRadius, d.borderRadius, pM(t.borderRadius, d.borderRadius, 1), di.selector));
    if (t.width) r.push(mk(nm, "Width", "layout", t.width, d.width, pM(t.width, d.width, 3), di.selector));
    if (t.height) r.push(mk(nm, "Height", "layout", t.height, d.height, pM(t.height, d.height, 3), di.selector));
    if (fi.textContent && di.textContent) { var a = fi.textContent.trim(), b = di.textContent.trim(); if (a !== b) r.push(mk(nm, "Metin İçeriği", "content", a.substring(0, 60), b.substring(0, 60), false, di.selector)); }
    return r;
  }
  function mk(el, pr, ct, fv, hv, ok, sel) { return { element: el, property: pr, category: ct, figmaValue: fv || "—", htmlValue: hv || "—", status: ok ? "pass" : "fail", selector: sel || "" }; }
  function hxM(a, b) { if (!a || !b) return false; return a.toUpperCase().replace("#", "") === b.toUpperCase().replace("#", ""); }
  function fM(a, b) { if (!a || !b) return false; return a.toLowerCase().replace(/\s+/g, "") === b.toLowerCase().replace(/\s+/g, ""); }
  function pM(a, b, t) { var x = parseFloat(a), y = parseFloat(b); if (isNaN(x) || isNaN(y)) return false; return Math.abs(x - y) <= (t || 1); }

  function highlightElement(sel) { sendMsg({ action: "highlight-element", selector: sel }); }
  function clearHighlight() { sendMsg({ action: "clear-highlight" }); }

  function setLd(show, msg, d) {
    var ldEl = document.getElementById("ld"); if (ldEl) ldEl.style.display = show ? "block" : "none";
    if (msg) { var lm = document.getElementById("lm"); if (lm) lm.textContent = msg; }
    if (d) { var ls = document.getElementById("ls"); if (ls) ls.textContent = d; }
    var go = document.getElementById("go"); if (go) go.disabled = show;
  }

  document.getElementById("go").addEventListener("click", function () {
    var p = parseFig(document.getElementById("fl").value);
    if (!p) { toast("URL'de node-id bulunamadı. Frame'i seçip Copy link yapın.", "error"); return; }
    run(p.fk, p.nid);
  });

  function run(fk, nid) {
    setLd(true, "Figma tasarım verileri çekiliyor...", "REST API'den JSON token'lar alınıyor");
    sendMsg({ action: "figma-nodes", fileKey: fk, nodeId: nid }, function (fR) {
      if (!fR) { setLd(false); toast("Bağlantı hatası", "error"); return; }
      if (fR.error) { setLd(false); toast("Figma: " + fR.error, "error"); return; }
      var figList = flattenFigma(fR.data);
      if (!figList.length) { setLd(false); toast("Figma'da token bulunamadı", "error"); return; }
      setLd(true, "Sayfa taranıyor...", figList.length + " Figma token'ı bulundu");
      sendMsg({ action: "scan-dom" }, function (domR) {
        if (!domR) { setLd(false); toast("Sayfa taranamadı", "error"); return; }
        if (domR.error) { setLd(false); toast(domR.error, "error"); return; }
        var domList = domR.domList || [];
        if (!domList.length) { setLd(false); toast("Sayfada element bulunamadı", "error"); return; }
        setLd(true, "Gemini AI eşleştiriyor...", figList.length + " Figma ↔ " + domList.length + " DOM");
        var fSum = figList.map(function (f, i) { return { idx: i, name: f.name, type: f.type, text: (f.textContent || "").substring(0, 50) }; });
        var dSum = domList.map(function (d, i) { return { idx: i, tag: d.tag, text: (d.textContent || "").substring(0, 50), selector: d.selector }; });
        sendMsg({ action: "gemini-match", figmaList: fSum, domList: dSum }, function (gR) {
          if (!gR) { setLd(false); toast("Gemini bağlantı hatası", "error"); return; }
          if (gR.error) { setLd(false); toast("Gemini: " + gR.error, "error"); return; }
          setLd(true, "Karşılaştırılıyor...", "Token değerleri diff ediliyor");
          var matches = gR.matches || [], allR = [];
          matches.forEach(function (m) { if (m.figmaIdx != null && m.domIdx != null && figList[m.figmaIdx] && domList[m.domIdx]) { allR = allR.concat(diffPair(figList[m.figmaIdx], domList[m.domIdx])); } });
          setLd(false);
          var failures = allR.filter(function (r) { return r.status === "fail"; });
          renderResults(failures, allR.length);
          switchTab("r");
          toast(failures.length + " tutarsızlık bulundu (" + allR.length + " kontrol yapıldı)", failures.length > 0 ? "warning" : "success");
        });
      });
    });
  }

  var allRes = [];
  function renderResults(failures, totalChecks) {
    allRes = failures;
    var nrEl = document.getElementById("nr"); if (nrEl) nrEl.style.display = "none";
    var c = document.getElementById("rc"); if (!c) return; c.style.display = "block";
    var tot = failures.length;
    var sc = totalChecks > 0 ? Math.round(((totalChecks - tot) / totalChecks) * 100) : 100;
    var clr = sc >= 90 ? "#3ECFB4" : sc >= 70 ? "#FFB443" : "#FF5C7C";
    var h = '<div class="sr"><span class="sn" style="color:' + clr + '">' + sc + '</span><div class="si"><p><strong style="color:#FF5C7C">' + tot + '</strong> tutarsızlık bulundu<br/><span style="font-size:11px;color:#606078">' + totalChecks + ' kontrol yapıldı</span></p></div></div>';
    var cats = { colors: 0, typography: 0, sizing_alignment: 0, padding_spacing: 0, borders_radius: 0, effects_elevation: 0, ux_copy: 0 };
    failures.forEach(function (r) { var fc = getFilterCat(r.category, r.property); if (cats[fc] !== undefined) cats[fc]++; });
    h += '<div class="fb" id="fb"><button class="F on" data-f="all">All (' + tot + ')</button>';
    if (cats.colors > 0) h += '<button class="F" data-f="colors">🎨 Colors (' + cats.colors + ')</button>';
    if (cats.typography > 0) h += '<button class="F" data-f="typography">🔤 Typography (' + cats.typography + ')</button>';
    if (cats.sizing_alignment > 0) h += '<button class="F" data-f="sizing_alignment">📐 Sizing (' + cats.sizing_alignment + ')</button>';
    if (cats.padding_spacing > 0) h += '<button class="F" data-f="padding_spacing">📏 Padding (' + cats.padding_spacing + ')</button>';
    if (cats.borders_radius > 0) h += '<button class="F" data-f="borders_radius">✂️ Borders (' + cats.borders_radius + ')</button>';
    if (cats.ux_copy > 0) h += '<button class="F" data-f="ux_copy">📝 UX Copy (' + cats.ux_copy + ')</button>';
    h += '</div><div class="rc-list" id="rclist"></div><div class="eb"><button class="bt2" id="csv">📄 CSV İndir</button></div>';
    c.innerHTML = h;
    fillCards("all");
    c.querySelectorAll(".F").forEach(function (b) {
      b.addEventListener("click", function () { c.querySelectorAll(".F").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on"); fillCards(b.dataset.f); });
    });
    var csvBtn = c.querySelector("#csv");
    if (csvBtn) csvBtn.addEventListener("click", function () {
      var csv = "Element,Özellik,Kategori,Figma,CSS\n";
      allRes.forEach(function (r) { csv += '"' + esc(r.element) + '","' + esc(r.property) + '","' + esc(getFilterCat(r.category, r.property)) + '","' + esc(r.figmaValue) + '","' + esc(r.htmlValue) + '"\n'; });
      var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "figmascan-" + Date.now() + ".csv"; a.click(); toast("CSV indirildi!", "success");
    });
  }

  function fillCards(f) {
    var list = document.getElementById("rclist"); if (!list) return; list.innerHTML = "";
    clearHighlight();
    var d = f === "all" ? allRes : allRes.filter(function (r) { return getFilterCat(r.category, r.property) === f; });
    if (d.length === 0) { list.innerHTML = '<div class="em"><p>Bu kategoride tutarsızlık yok.</p></div>'; return; }
    d.forEach(function (r) {
      var fc = getFilterCat(r.category, r.property), tg = getTagForFilter(fc);
      var card = document.createElement("div"); card.className = "rc-card";
      var fD = esc(r.figmaValue), hD = esc(r.htmlValue);
      if (fc === "colors") { if (r.figmaValue && r.figmaValue.startsWith("#")) fD = '<span class="cw" style="background:' + r.figmaValue + '"></span> ' + fD; if (r.htmlValue && r.htmlValue.startsWith("#")) hD = '<span class="cw" style="background:' + r.htmlValue + '"></span> ' + hD; }
      card.innerHTML = '<div class="rc-el">' + esc(r.element) + '</div><div class="rc-prop"><span class="tg ' + tg[0] + '">' + tg[1] + '</span><span>' + esc(r.property) + '</span></div><div class="rc-vals"><div class="rc-val"><div class="rc-val-label">Figma</div><div class="rc-val-v figma">' + fD + '</div></div><div class="rc-val"><div class="rc-val-label">Canlı CSS</div><div class="rc-val-v live">' + hD + '</div></div></div>';
      card.addEventListener("click", function () { var wasActive = card.classList.contains("active"); document.querySelectorAll(".rc-card.active").forEach(function (c) { c.classList.remove("active"); }); if (wasActive) { clearHighlight(); } else { card.classList.add("active"); if (r.selector) highlightElement(r.selector); } });
      list.appendChild(card);
    });
  }

})();
