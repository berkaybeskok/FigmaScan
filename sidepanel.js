(function () {
  "use strict";

  // ═══ LOGIN SİSTEMİ ═══
  var LOGIN_DOMAIN = "@kariyer.net";
  var LOGIN_PASSWORD = "Kariyer2026";

  function checkLogin() {
    chrome.storage.local.get("fgsLoggedIn", function (r) {
      if (r.fgsLoggedIn) {
        document.getElementById("loginOverlay").classList.add("hidden");
      } else {
        document.getElementById("loginOverlay").classList.remove("hidden");
      }
    });
  }

  checkLogin();

  document.getElementById("loginBtn").addEventListener("click", function () {
    var email = (document.getElementById("loginEmail").value || "").trim().toLowerCase();
    var pass = document.getElementById("loginPass").value || "";
    var errEl = document.getElementById("loginErr");

    if (!email) { errEl.textContent = "E-posta alanı boş olamaz."; errEl.classList.add("show"); return; }
    if (!email.endsWith(LOGIN_DOMAIN)) { errEl.textContent = "Sadece " + LOGIN_DOMAIN + " uzantılı e-postalar ile giriş yapılabilir."; errEl.classList.add("show"); return; }
    if (pass !== LOGIN_PASSWORD) { errEl.textContent = "Şifre hatalı."; errEl.classList.add("show"); return; }

    errEl.classList.remove("show");
    chrome.storage.local.set({ fgsLoggedIn: email }, function () {
      document.getElementById("loginOverlay").classList.add("hidden");
    });
  });

  // Enter tuşuyla giriş
  document.getElementById("loginPass").addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("loginBtn").click();
  });
  document.getElementById("loginEmail").addEventListener("keydown", function (e) {
    if (e.key === "Enter") document.getElementById("loginPass").focus();
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    chrome.storage.local.remove("fgsLoggedIn", function () {
      document.getElementById("loginOverlay").classList.remove("hidden");
      document.getElementById("loginEmail").value = "";
      document.getElementById("loginPass").value = "";
    });
  });
  // ═══ LOGIN SİSTEMİ SONU ═══

  var _tokState = { figma: false, gemini: false };

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
    var rc = document.getElementById("rc"); if (rc) { rc.style.display = "none"; rc.innerHTML = ""; rc.className = "results-section"; }
    var guide = document.getElementById("guide"); if (guide) guide.style.display = "none";
    allVisRes = []; // görsel sonuçları sıfırla

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
          renderResults(failures);
          toast(failures.length + " tutarsızlık bulundu", failures.length > 0 ? "warning" : "success");
          // ═══ YENİ: Token sonuçları gösterildikten sonra görsel taramayı başlat ═══
          startVisualScan(fk, fR.data);
        });
      });
    });
  }

  var allRes = [];
  function renderResults(failures) {
    allRes = failures;
    var guide = document.getElementById("guide"); if (guide) guide.style.display = "none";
    var c = document.getElementById("rc"); if (!c) return;
    c.style.display = "block";
    c.className = "results-section on";
    var tot = failures.length;
    var h = '<div class="sep"></div>';
    h += '<div class="sr"><span class="sn" style="color:#FF5C7C">' + tot + '</span><div class="si"><p>tutarsızlık bulundu</p></div></div>';
    var cats = { colors: 0, typography: 0, sizing_alignment: 0, padding_spacing: 0, borders_radius: 0, effects_elevation: 0, ux_copy: 0 };
    failures.forEach(function (r) { var fc = getFilterCat(r.category, r.property); if (cats[fc] !== undefined) cats[fc]++; });
    h += '<div class="fb" id="fb"><button class="F on" data-f="all">All (' + tot + ')</button>';
    if (cats.colors > 0) h += '<button class="F" data-f="colors">🎨 Colors (' + cats.colors + ')</button>';
    if (cats.typography > 0) h += '<button class="F" data-f="typography">🔤 Typography (' + cats.typography + ')</button>';
    if (cats.sizing_alignment > 0) h += '<button class="F" data-f="sizing_alignment">📐 Sizing (' + cats.sizing_alignment + ')</button>';
    if (cats.padding_spacing > 0) h += '<button class="F" data-f="padding_spacing">📏 Padding (' + cats.padding_spacing + ')</button>';
    if (cats.borders_radius > 0) h += '<button class="F" data-f="borders_radius">✂️ Borders (' + cats.borders_radius + ')</button>';
    if (cats.ux_copy > 0) h += '<button class="F" data-f="ux_copy">📝 UX Copy (' + cats.ux_copy + ')</button>';
    // ═══ YENİ: Images & Icons filtre butonu (başlangıçta loading) ═══
    h += '<button class="F loading" data-f="visuals" id="btnVisuals">🌄 Images &amp; Icons ⏳</button>';
    h += '</div><div class="rc-list" id="rclist"></div><div class="eb"><button class="bt2" id="csv">📄 CSV İndir</button><button class="bt2" id="sheets">📊 Sheets\'te Aç</button></div>';
    c.innerHTML = h;
    fillCards("all");
    c.querySelectorAll(".F").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.classList.contains("loading")) return;
        c.querySelectorAll(".F").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        fillCards(b.dataset.f);
      });
    });
    var csvBtn = c.querySelector("#csv");
    if (csvBtn) csvBtn.addEventListener("click", function () {
      var csv = "Element,Özellik,Kategori,Figma,Link\n";
      allRes.forEach(function (r) { csv += '"' + esc(r.element) + '","' + esc(r.property) + '","' + esc(getFilterCat(r.category, r.property)) + '","' + esc(r.figmaValue) + '","' + esc(r.htmlValue) + '"\n'; });
      var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "figmascan-" + Date.now() + ".csv"; a.click(); toast("CSV indirildi!", "success");
    });
    var sheetsBtn = c.querySelector("#sheets");
    if (sheetsBtn) sheetsBtn.addEventListener("click", function () {
      var catNames = { colors: "Colors", typography: "Typography", sizing_alignment: "Sizing", padding_spacing: "Padding", borders_radius: "Borders", ux_copy: "UX Copy" };
      var grouped = {};
      allRes.forEach(function (r) {
        var fc = getFilterCat(r.category, r.property);
        if (!grouped[fc]) grouped[fc] = [];
        grouped[fc].push(r);
      });
      var tsv = "";
      var catOrder = ["colors", "typography", "sizing_alignment", "padding_spacing", "borders_radius", "ux_copy"];
      catOrder.forEach(function (cat) {
        if (!grouped[cat] || grouped[cat].length === 0) return;
        tsv += (catNames[cat] || cat).toUpperCase() + "\n";
        tsv += "Element\tÖzellik\tFigma\tLink\n";
        grouped[cat].forEach(function (r) {
          tsv += r.element + "\t" + r.property + "\t" + r.figmaValue + "\t" + r.htmlValue + "\n";
        });
        tsv += "\n";
      });
      navigator.clipboard.writeText(tsv).then(function () {
        window.open("https://docs.google.com/spreadsheets/create", "_blank");
        toast("Tablo kopyalandı — Sheets'e yapıştırın (⌘V / Ctrl+V)", "success");
      }).catch(function () {
        var blob = new Blob(["\uFEFF" + tsv], { type: "text/tab-separated-values;charset=utf-8" });
        var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "figmascan-" + Date.now() + ".tsv"; a.click();
        window.open("https://docs.google.com/spreadsheets/create", "_blank");
        toast("TSV indirildi — Sheets'te File > Import ile açın", "success");
      });
    });
  }

  function fillCards(f) {
    var list = document.getElementById("rclist"); if (!list) return; list.innerHTML = "";
    clearHighlight();
    if (f === "visuals") { fillVisualCards(); return; }
    var d = f === "all" ? allRes : allRes.filter(function (r) { return getFilterCat(r.category, r.property) === f; });
    if (d.length === 0) { list.innerHTML = '<div class="em"><p>Bu kategoride tutarsızlık yok.</p></div>'; return; }
    // Checked olanları sona taşı
    var sorted = d.slice().sort(function (a, b) { return (a._checked ? 1 : 0) - (b._checked ? 1 : 0); });
    sorted.forEach(function (r) {
      var fc = getFilterCat(r.category, r.property), tg = getTagForFilter(fc);
      var card = document.createElement("div"); card.className = "rc-card" + (r._checked ? " checked" : "");
      var fD = esc(r.figmaValue), hD = esc(r.htmlValue);
      if (fc === "colors") { if (r.figmaValue && r.figmaValue.startsWith("#")) fD = '<span class="cw" style="background:' + r.figmaValue + '"></span> ' + fD; if (r.htmlValue && r.htmlValue.startsWith("#")) hD = '<span class="cw" style="background:' + r.htmlValue + '"></span> ' + hD; }
      card.innerHTML = '<label class="card-check"><input type="checkbox"' + (r._checked ? ' checked' : '') + '/> İncelendi</label><div class="rc-el">' + esc(r.element) + '</div><div class="rc-prop"><span class="tg ' + tg[0] + '">' + tg[1] + '</span><span>' + esc(r.property) + '</span></div><div class="rc-vals"><div class="rc-val"><div class="rc-val-label">Figma</div><div class="rc-val-v figma">' + fD + '</div></div><div class="rc-val"><div class="rc-val-label">Link</div><div class="rc-val-v live">' + hD + '</div></div></div>';
      var cb = card.querySelector('input[type="checkbox"]');
      cb.addEventListener("change", function (e) {
        e.stopPropagation();
        r._checked = cb.checked;
        // Aktif filtreyi bul ve listeyi yeniden render et
        var activeF = "all";
        var activeBtn = document.querySelector(".F.on");
        if (activeBtn) activeF = activeBtn.dataset.f;
        fillCards(activeF);
      });
      card.addEventListener("click", function (e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "LABEL") return;
        var wasActive = card.classList.contains("active");
        document.querySelectorAll(".rc-card.active").forEach(function (c) { c.classList.remove("active"); });
        if (wasActive) { clearHighlight(); } else { card.classList.add("active"); if (r.selector) highlightElement(r.selector); }
      });
      list.appendChild(card);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     YENİ BÖLÜM: Görsel Karşılaştırma (Images & Icons)
     Token karşılaştırma sonuçları gösterildikten sonra arka planda çalışır,
     bitince filtre butonunu aktif eder.
     ═══════════════════════════════════════════════════════════════════ */

  var allVisRes = [];

  function extractVisualNodes(data) {
    var list = [];
    function walk(n, skipChildren) {
      if (!n || !n.id || skipChildren) return;
      var isVisual = false, vType = "", captureChildren = true;

      // 1. Herhangi bir node'da IMAGE fill varsa → image
      if (n.fills && n.fills.length) {
        for (var i = 0; i < n.fills.length; i++) {
          if (n.fills[i].type === "IMAGE" && n.fills[i].visible !== false) { isVisual = true; vType = "image"; captureChildren = false; break; }
        }
      }

      // 2. INSTANCE veya COMPONENT → bütün bir visual unit (icon veya image)
      if (!isVisual && (n.type === "INSTANCE" || n.type === "COMPONENT") && n.absoluteBoundingBox) {
        var bb = n.absoluteBoundingBox;
        if (bb.width >= 8 && bb.height >= 8) {
          isVisual = true;
          vType = (bb.width <= 80 && bb.height <= 80) ? "icon" : "image";
          captureChildren = false; // children bu unit'in parçası, ayrı yakalama
        }
      }

      // 3. GROUP içinde vektörler varsa grubu yakala (icon olabilir)
      if (!isVisual && n.type === "GROUP" && n.absoluteBoundingBox) {
        var gb = n.absoluteBoundingBox;
        if (gb.width <= 80 && gb.height <= 80 && gb.width >= 8 && n.children && n.children.length > 0) {
          var hasVector = n.children.some(function(c) { return ["VECTOR","BOOLEAN_OPERATION","LINE","STAR","ELLIPSE"].indexOf(c.type) !== -1; });
          if (hasVector) { isVisual = true; vType = "icon"; captureChildren = false; }
        }
      }

      // Tek başına VECTOR, LINE vs yakalama — bunlar genelde parent'ın parçası

      if (isVisual && n.absoluteBoundingBox) {
        var ab = n.absoluteBoundingBox;
        if (ab.width >= 8 && ab.height >= 8) {
          list.push({ id: n.id, name: n.name || "unnamed", type: n.type, vType: vType, w: Math.round(ab.width), h: Math.round(ab.height) });
        }
      }

      if (captureChildren && n.children) {
        n.children.forEach(function (c) { walk(c, false); });
      }
    }
    if (data.nodes) Object.values(data.nodes).forEach(function (nd) { walk(nd.document, false); });
    else if (data.document) walk(data.document, false);
    // Limit: Figma API çok fazla node'la başa çıkamaz
    return list.slice(0, 40);
  }

  function loadImg(src) {
    return new Promise(function (resolve, reject) {
      if (!src) { reject(new Error("no src")); return; }
      var img = new Image(); img.crossOrigin = "anonymous";
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error("load fail")); };
      img.src = src;
    });
  }

  function cropFromScreenshot(ssUrl, rect, dpr) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var sx = Math.max(0, Math.round(rect.x * dpr)), sy = Math.max(0, Math.round(rect.y * dpr));
        var sw = Math.round(rect.w * dpr), sh = Math.round(rect.h * dpr);
        if (sx + sw > img.width) sw = img.width - sx;
        if (sy + sh > img.height) sh = img.height - sy;
        if (sw <= 0 || sh <= 0) { reject(new Error("bounds")); return; }
        var c = document.createElement("canvas"); c.width = sw; c.height = sh;
        c.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = reject; img.src = ssUrl;
    });
  }

  function pixelCompare(imgA, imgB) {
    var size = 150, rA = imgA.width / imgA.height, w, h;
    if (rA >= 1) { w = size; h = Math.max(1, Math.round(size / rA)); } else { h = size; w = Math.max(1, Math.round(size * rA)); }
    var cA = document.createElement("canvas"); cA.width = w; cA.height = h;
    cA.getContext("2d").drawImage(imgA, 0, 0, w, h);
    var cB = document.createElement("canvas"); cB.width = w; cB.height = h;
    cB.getContext("2d").drawImage(imgB, 0, 0, w, h);
    var dA, dB;
    try { dA = cA.getContext("2d").getImageData(0, 0, w, h).data; } catch (e) { return { similarity: -1, diffUrl: null }; }
    try { dB = cB.getContext("2d").getImageData(0, 0, w, h).data; } catch (e) { return { similarity: -1, diffUrl: null }; }
    var cD = document.createElement("canvas"); cD.width = w; cD.height = h;
    var ctxD = cD.getContext("2d"), dd = ctxD.createImageData(w, h);
    var total = w * h, diffN = 0;
    for (var i = 0; i < dA.length; i += 4) {
      var d = (Math.abs(dA[i] - dB[i]) + Math.abs(dA[i + 1] - dB[i + 1]) + Math.abs(dA[i + 2] - dB[i + 2])) / 3;
      if (d > 30) { diffN++; dd.data[i] = 255; dd.data[i + 1] = 59; dd.data[i + 2] = 92; dd.data[i + 3] = 220; }
      else { dd.data[i] = (dA[i] + dB[i]) >> 1; dd.data[i + 1] = (dA[i + 1] + dB[i + 1]) >> 1; dd.data[i + 2] = (dA[i + 2] + dB[i + 2]) >> 1; dd.data[i + 3] = 80; }
    }
    ctxD.putImageData(dd, 0, 0);
    return { similarity: total > 0 ? Math.round(((total - diffN) / total) * 100) : 0, diffUrl: cD.toDataURL() };
  }

  // Token sonuçları gösterildikten sonra otomatik çağrılır
  function startVisualScan(fk, figmaData) {
    var visNodes = extractVisualNodes(figmaData);
    if (!visNodes.length) { updateVisualButton(0); toast("Figma'da görsel/icon node bulunamadı", "warning"); return; }
    var nodeIds = visNodes.map(function (n) { return n.id; });
    console.log("[FigmaScan Visual] " + visNodes.length + " görsel node bulundu:", visNodes.map(function(n){return n.name}).join(", "));

    sendMsg({ action: "figma-export-images", fileKey: fk, nodeIds: nodeIds }, function (imgR) {
      if (!imgR || imgR.error) { updateVisualButton(0); toast("Figma render hatası: " + (imgR ? imgR.error : "bağlantı yok"), "error"); return; }
      var figmaImages = imgR.images || {};
      var validCount = Object.values(figmaImages).filter(function(u){return !!u;}).length;
      console.log("[FigmaScan Visual] Figma " + validCount + "/" + nodeIds.length + " görsel render etti");
      if (validCount === 0) { updateVisualButton(0); toast("Figma hiçbir görseli render edemedi", "warning"); return; }

      sendMsg({ action: "scan-dom-visuals" }, function (domR) {
        if (!domR || domR.error) { updateVisualButton(0); toast("DOM görsel tarama hatası: " + (domR ? domR.error : ""), "error"); return; }
        var domVisuals = domR.visuals || [];
        if (!domVisuals.length) { updateVisualButton(0); toast("Sayfada görsel element bulunamadı", "warning"); return; }
        var dpr = domR.dpr || 1;
        console.log("[FigmaScan Visual] DOM'da " + domVisuals.length + " görsel element bulundu");

        sendMsg({ action: "capture-tab" }, function (capR) {
          if (!capR || capR.error) { updateVisualButton(0); toast("Screenshot hatası: " + (capR ? capR.error : ""), "error"); return; }

          var fSummary = visNodes.map(function (n, i) { return { idx: i, name: n.name, vType: n.vType, w: n.w, h: n.h }; });
          var dSummary = domVisuals.map(function (d, i) { return { idx: i, type: d.type, name: d.alt || d.name || d.src || "", w: d.rect.w, h: d.rect.h }; });

          sendMsg({ action: "gemini-match-visuals", figmaVisuals: fSummary, domVisuals: dSummary }, function (gR) {
            if (!gR || gR.error) { updateVisualButton(0); toast("Gemini görsel eşleştirme: " + (gR ? gR.error : "hata"), "error"); return; }
            var matches = gR.matches || [];
            console.log("[FigmaScan Visual] Gemini " + matches.length + " eşleşme buldu");
            if (!matches.length) { updateVisualButton(0); toast("Görseller eşleştirilemedi (0 match)", "warning"); return; }

            var results = [], pending = matches.length;
            matches.forEach(function (m) {
              var fNode = visNodes[m.figmaIdx], dNode = domVisuals[m.domIdx];
              if (!fNode || !dNode) { pending--; if (pending === 0) finishVisual(results); return; }
              var figUrl = figmaImages[fNode.id];
              if (!figUrl) { pending--; if (pending === 0) finishVisual(results); return; }

              cropFromScreenshot(capR.screenshot, dNode.rect, dpr).then(function (domUrl) {
                return Promise.all([loadImg(figUrl), loadImg(domUrl)]).then(function (imgs) {
                  var cmp = pixelCompare(imgs[0], imgs[1]);
                  results.push({ name: fNode.name, vType: fNode.vType, figmaUrl: figUrl, domUrl: domUrl, diffUrl: cmp.diffUrl, similarity: cmp.similarity });
                });
              }).catch(function (e) {
                console.log("[FigmaScan Visual] Karşılaştırma hatası:", fNode.name, e.message);
              }).finally(function () { pending--; if (pending === 0) finishVisual(results); });
            });
          });
        });
      });
    });
  }

  function finishVisual(results) {
    allVisRes = results.sort(function (a, b) { return (a.similarity === -1 ? 999 : a.similarity) - (b.similarity === -1 ? 999 : b.similarity); });
    var diffCount = results.filter(function (r) { return r.similarity >= 0 && r.similarity < 97; }).length;
    updateVisualButton(diffCount);
    if (results.length > 0) {
      toast("🌄 " + results.length + " görsel karşılaştırıldı, " + diffCount + " fark bulundu", diffCount > 0 ? "warning" : "success");
    }
  }

  function updateVisualButton(count) {
    var btn = document.getElementById("btnVisuals");
    if (!btn) return;
    btn.classList.remove("loading");
    if (allVisRes.length > 0) {
      btn.innerHTML = "🌄 Images &amp; Icons (" + allVisRes.length + ")";
    } else {
      btn.innerHTML = "🌄 Images &amp; Icons (0)";
    }
  }

  function fillVisualCards() {
    var list = document.getElementById("rclist"); if (!list) return;
    list.innerHTML = "";
    if (allVisRes.length === 0) { list.innerHTML = '<div class="em"><p>Görsel karşılaştırma sonucu yok.</p></div>'; return; }

    var sorted = allVisRes.slice().sort(function (a, b) { return (a._checked ? 1 : 0) - (b._checked ? 1 : 0); });
    sorted.forEach(function (r, idx) {
      var simClass = r.similarity < 0 ? "low" : r.similarity >= 97 ? "high" : r.similarity >= 85 ? "med" : "low";
      var simLabel = r.similarity < 0 ? "?" : "%" + r.similarity;
      var typeLabel = r.vType === "image" ? "🖼 Image" : "🔷 Icon";
      var statusIcon = r.similarity >= 97 ? "✅" : r.similarity >= 85 ? "⚠️" : "❌";

      var card = document.createElement("div"); card.className = "vc-card" + (r._checked ? " checked" : "");
      var h = '<label class="card-check"><input type="checkbox"' + (r._checked ? ' checked' : '') + '/> İncelendi</label>';
      h += '<div class="vc-name">' + statusIcon + " " + esc(r.name) + '</div>';
      h += '<div class="vc-meta">' + typeLabel + ' &nbsp; <span class="vc-sim ' + simClass + '">' + simLabel + ' benzerlik</span></div>';
      h += '<div class="vc-imgs">';
      h += '<div class="vc-img-box"><div class="vc-img-label">Figma</div>' + (r.figmaUrl ? '<img src="' + r.figmaUrl + '"/>' : '') + '</div>';
      h += '<div class="vc-img-box"><div class="vc-img-label">Link</div>' + (r.domUrl ? '<img src="' + r.domUrl + '"/>' : '') + '</div>';
      h += '</div>';
      if (r.diffUrl) {
        var oid = "vo-" + idx;
        h += '<button class="vc-toggle" data-oid="' + oid + '">🔍 Overlay Göster</button>';
        h += '<div class="vc-overlay-wrap" id="' + oid + '"><div class="vc-overlay-box"><div class="vc-img-label">Fark Haritası — kırmızı = farklı piksel</div><img src="' + r.diffUrl + '"/></div></div>';
      }
      card.innerHTML = h;

      var cb = card.querySelector('input[type="checkbox"]');
      cb.addEventListener("change", function (e) {
        e.stopPropagation();
        r._checked = cb.checked;
        fillVisualCards();
      });

      var tog = card.querySelector(".vc-toggle");
      if (tog) tog.addEventListener("click", function () {
        var w = card.querySelector("#" + tog.dataset.oid);
        if (w) { var open = w.classList.toggle("open"); tog.textContent = open ? "🔍 Overlay Gizle" : "🔍 Overlay Göster"; }
      });

      list.appendChild(card);
    });
  }

})();
