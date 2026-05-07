(function() {
"use strict";
console.log("[FQA] content.js loaded");

// Highlight overlay style
var hlStyle = document.createElement("style");
hlStyle.textContent = ".fqa-highlight{outline:3px solid #FF3B5C !important;outline-offset:2px;box-shadow:0 0 0 6px rgba(255,59,92,.25) !important;transition:outline .2s,box-shadow .2s;position:relative;z-index:2147483640;}";
document.head.appendChild(hlStyle);

var currentHighlight = null;

function scanDOM() {
  var list = [], seen = new Set();
  document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,a,button,span,label,input,textarea,img,nav,header,footer,section,article,main,div,li,ul,ol,td,th").forEach(function(el) {
    if (seen.has(el)) return;
    var r = el.getBoundingClientRect();
    if (r.width < 5 || r.height < 5) return;
    if (r.top > window.innerHeight * 2) return;
    var cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return;
    var text = ""; el.childNodes.forEach(function(n) { if (n.nodeType === 3) text += n.textContent.trim(); }); text = text.substring(0, 80);
    function h(rgb) { if (!rgb) return null; var m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); if (!m) return null; return "#" + ((1 << 24) + (+m[1] << 16) + (+m[2] << 8) + (+m[3])).toString(16).slice(1).toUpperCase(); }
    var item = {
      tag: el.tagName.toLowerCase(),
      textContent: text,
      selector: bSel(el),
      styles: {
        color: h(cs.color),
        backgroundColor: h(cs.backgroundColor),
        fontFamily: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(),
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing,
        textAlign: cs.textAlign,
        paddingTop: cs.paddingTop,
        paddingRight: cs.paddingRight,
        paddingBottom: cs.paddingBottom,
        paddingLeft: cs.paddingLeft,
        borderRadius: cs.borderRadius,
        width: Math.round(r.width) + "px",
        height: Math.round(r.height) + "px",
        gap: cs.gap || "0px"
      }
    };
    if (text || el.tagName.match(/^(H[1-6]|P|A|BUTTON|SPAN|LABEL|INPUT|IMG|NAV|HEADER)$/i)) { list.push(item); seen.add(el); }
  });
  return list;
}

function bSel(el) {
  if (el.id) return "#" + el.id;
  var p = [];
  while (el && el !== document.body && p.length < 3) {
    var t = el.tagName.toLowerCase();
    if (el.className && typeof el.className === "string") {
      var c = el.className.trim().split(/\s+/).filter(function(x) { return x.length < 30 && x !== "fqa-highlight"; }).slice(0, 2).join(".");
      if (c) t += "." + c;
    }
    p.unshift(t);
    el = el.parentElement;
  }
  return p.join(" > ");
}

function doHighlight(selector) {
  clearHL();
  if (!selector) return;
  try {
    var el = document.querySelector(selector);
    if (el) {
      el.classList.add("fqa-highlight");
      currentHighlight = el;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } catch(e) {
    console.log("[FQA] highlight error:", e.message);
  }
}

function clearHL() {
  if (currentHighlight) {
    currentHighlight.classList.remove("fqa-highlight");
    currentHighlight = null;
  }
  // Also clear any stale ones
  document.querySelectorAll(".fqa-highlight").forEach(function(el) {
    el.classList.remove("fqa-highlight");
  });
}

/* ═══ YENİ: Görsel element tarayıcı ═══ */
function scanDOMVisuals() {
  var visuals = [];
  var seen = new Set();

  // 1. <img> elementleri
  document.querySelectorAll("img").forEach(function(el) {
    if (seen.has(el)) return;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    var cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return;
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    if (r.right < 0 || r.left > window.innerWidth) return;
    visuals.push({
      type: "img",
      src: el.currentSrc || el.src || "",
      alt: el.alt || "",
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      nw: el.naturalWidth || 0,
      nh: el.naturalHeight || 0,
      selector: bSel(el)
    });
    seen.add(el);
  });

  // 2. <svg> elementleri (icon boyutundakiler)
  document.querySelectorAll("svg").forEach(function(el) {
    if (seen.has(el)) return;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    if (r.width > 400 || r.height > 400) return;
    var cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    if (r.right < 0 || r.left > window.innerWidth) return;
    var svgName = el.getAttribute("aria-label") || el.getAttribute("data-icon") || el.getAttribute("data-testid") || "";
    if (!svgName && el.classList.length) svgName = el.classList[0];
    if (!svgName && el.parentElement) {
      var pc = el.parentElement.className;
      if (typeof pc === "string" && pc.length < 40) svgName = pc.split(" ")[0];
    }
    try {
      var ser = new XMLSerializer();
      var svgStr = ser.serializeToString(el);
      var b64 = btoa(unescape(encodeURIComponent(svgStr)));
      visuals.push({
        type: "svg",
        dataUrl: "data:image/svg+xml;base64," + b64,
        name: svgName || "svg-icon",
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
        selector: bSel(el)
      });
    } catch(e) { /* skip unserializable SVGs */ }
    seen.add(el);
  });

  // 3. background-image olan elementler
  document.querySelectorAll("div,section,header,a,span,figure").forEach(function(el) {
    if (seen.has(el)) return;
    var cs = window.getComputedStyle(el);
    var bg = cs.backgroundImage;
    if (!bg || bg === "none") return;
    var m = bg.match(/url\(["']?([^"')]+)["']?\)/);
    if (!m) return;
    if (m[1].indexOf("data:image/svg") !== -1 && m[1].length < 200) return;
    var r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    visuals.push({
      type: "bg",
      src: m[1],
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      selector: bSel(el)
    });
    seen.add(el);
  });

  return visuals;
}

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.action === "scan-dom") {
    var domList = scanDOM();
    sendResponse({ domList: domList });
  }
  if (msg.action === "highlight-element") {
    doHighlight(msg.selector);
  }
  if (msg.action === "clear-highlight") {
    clearHL();
  }
  /* ═══ YENİ: Görsel tarama action'ı ═══ */
  if (msg.action === "scan-dom-visuals") {
    var vis = scanDOMVisuals();
    sendResponse({
      visuals: vis,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      dpr: window.devicePixelRatio || 1
    });
  }
  return true;
});

})();
