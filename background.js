// ═══════════════════════════════════════════════════════
var WORKER_URL = "https://figmascan-keys.berkaybeskok93.workers.dev";
var AUTH_SECRET = "fgscan-internal-k8x7m2p4";
// ═══════════════════════════════════════════════════════

// Extension yüklendiğinde veya Chrome açıldığında key'leri otomatik çek
chrome.runtime.onInstalled.addListener(function() { fetchKeysFromWorker(); });
chrome.runtime.onStartup.addListener(function() { fetchKeysFromWorker(); });

function fetchKeysFromWorker() {
  fetch(WORKER_URL + "/api/keys", {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + AUTH_SECRET,
      "Content-Type": "application/json"
    }
  })
  .then(function(resp) { return resp.json(); })
  .then(function(data) {
    var toSave = {};
    if (data.figmaToken) toSave.figmaToken = data.figmaToken;
    if (data.geminiKey) toSave.geminiKey = data.geminiKey;
    if (data.geminiModel) toSave.geminiModel = data.geminiModel;
    if (Object.keys(toSave).length > 0) {
      chrome.storage.local.set(toSave, function() {
        console.log("[FigmaScan] Key'ler Worker'dan alındı. Model:", data.geminiModel || "default");
      });
    }
  })
  .catch(function(e) {
    console.log("[FigmaScan] Worker bağlantı hatası:", e.message);
  });
}

// ─── Gemini yanıtından text çıkarma (2.0 Flash + 2.5 Pro uyumlu) ───
function extractGeminiText(data) {
  var text = "";
  try {
    if (!data || !data.candidates || !data.candidates.length) return "";
    var c = data.candidates[0];
    // Gemini 2.5 Pro: finishReason MAX_TOKENS = yanıt kesildi
    if (c.finishReason === "MAX_TOKENS" && (!c.content || !c.content.parts)) {
      console.log("[FigmaScan] Gemini MAX_TOKENS - düşünme token'ları yanıt alanını tüketti");
      return "";
    }
    if (c.content && c.content.parts && Array.isArray(c.content.parts)) {
      c.content.parts.forEach(function(p) {
        // 2.5 Pro "thought" bloklarını atla, sadece gerçek text'i al
        if (p.thought) return;
        if (p.text) text += p.text;
      });
    }
    else if (c.text) { text = c.text; }
    else if (c.output) { text = c.output; }
    else if (typeof c.content === "string") { text = c.content; }
  } catch (e) {
    console.log("[FigmaScan] Gemini parse hatası:", e.message);
  }
  return text;
}

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async function(tab) {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.log("FQA sidePanel open error:", e.message);
  }
});

// Enable side panel to open via action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function(){});

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {

  if (msg.action === "get-tokens") {
    chrome.storage.local.get(["figmaToken", "geminiKey"], function(r) {
      sendResponse({ figmaToken: r.figmaToken || null, geminiKey: r.geminiKey || null });
    });
    return true;
  }

  if (msg.action === "refresh-tokens") {
    fetchKeysFromWorker();
    setTimeout(function() {
      chrome.storage.local.get(["figmaToken", "geminiKey"], function(r) {
        sendResponse({ figmaToken: r.figmaToken || null, geminiKey: r.geminiKey || null });
      });
    }, 2000);
    return true;
  }

  if (msg.action === "figma-nodes") {
    chrome.storage.local.get("figmaToken", async function(r) {
      if (!r.figmaToken) { sendResponse({ error: "Figma token yok. Yöneticinize başvurun." }); return; }
      try {
        var url = "https://api.figma.com/v1/files/" + msg.fileKey + "/nodes?ids=" + encodeURIComponent(msg.nodeId);
        var resp = await fetch(url, { headers: { "X-Figma-Token": r.figmaToken } });
        if (!resp.ok) { sendResponse({ error: "Figma API hatası: " + resp.status }); return; }
        var data = await resp.json();
        sendResponse({ data: data });
      } catch (e) { sendResponse({ error: e.message }); }
    });
    return true;
  }

  if (msg.action === "gemini-match") {
    chrome.storage.local.get(["geminiKey", "geminiModel"], async function(r) {
      if (!r.geminiKey) { sendResponse({ error: "Gemini key yok. Yöneticinize başvurun." }); return; }
      try {
        var model = r.geminiModel || "gemini-2.5-pro";
        var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + r.geminiKey;
        var prompt = 'Match Figma elements to DOM elements by text similarity, element type, and position.\n\n'
          + 'FIGMA:\n' + JSON.stringify(msg.figmaList) + '\n\n'
          + 'DOM:\n' + JSON.stringify(msg.domList) + '\n\n'
          + 'Reply ONLY with JSON array, no other text:\n'
          + '[{"figmaIdx":0,"domIdx":2,"confidence":"high"},...]';

        var body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
        };
        var resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!resp.ok) {
          var errText = "";
          try { errText = await resp.text(); } catch(e){}
          sendResponse({ error: "Gemini hatası (" + resp.status + "): " + errText.substring(0, 200) });
          return;
        }
        var data = await resp.json();
        var text = extractGeminiText(data);
        if (!text) {
          sendResponse({ error: "Gemini boş yanıt döndü", raw: JSON.stringify(data).substring(0, 300) });
          return;
        }
        var m = text.match(/\[[\s\S]*\]/);
        if (m) {
          try { sendResponse({ matches: JSON.parse(m[0]) }); }
          catch (e) { sendResponse({ error: "JSON parse hatası", raw: text }); }
        } else { sendResponse({ error: "Eşleşme bulunamadı", raw: text }); }
      } catch (e) { sendResponse({ error: e.message }); }
    });
    return true;
  }

  // Forward highlight messages from side panel to content script
  if (msg.action === "highlight-element" || msg.action === "clear-highlight") {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, msg).catch(function(){});
      }
    });
    return false;
  }

  // Side panel requests DOM scan from content script
  if (msg.action === "scan-dom") {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0]) { sendResponse({ error: "Aktif sekme bulunamadı" }); return; }
      chrome.tabs.sendMessage(tabs[0].id, { action: "scan-dom" }, function(resp) {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ["content.js"]
          }).then(function() {
            setTimeout(function() {
              chrome.tabs.sendMessage(tabs[0].id, { action: "scan-dom" }, function(resp2) {
                if (chrome.runtime.lastError) { sendResponse({ error: "Sayfa taranamadı" }); return; }
                sendResponse(resp2);
              });
            }, 300);
          }).catch(function(err) {
            sendResponse({ error: "Script inject hatası: " + err.message });
          });
          return;
        }
        sendResponse(resp);
      });
    });
    return true;
  }

  /* ═══════════════════════════════════════════════════════
     Görsel karşılaştırma action'ları
     ═══════════════════════════════════════════════════════ */

  // Figma node'larını PNG olarak export et
  if (msg.action === "figma-export-images") {
    chrome.storage.local.get("figmaToken", async function(r) {
      if (!r.figmaToken) { sendResponse({ error: "Figma token yok." }); return; }
      try {
        var ids = msg.nodeIds.map(function(id) { return encodeURIComponent(id); }).join(",");
        var url = "https://api.figma.com/v1/images/" + msg.fileKey + "?ids=" + ids + "&format=png&scale=2";
        var resp = await fetch(url, { headers: { "X-Figma-Token": r.figmaToken } });
        if (!resp.ok) { sendResponse({ error: "Figma Images API hatası: " + resp.status }); return; }
        var data = await resp.json();
        sendResponse({ images: data.images || {}, err: data.err || null });
      } catch (e) { sendResponse({ error: e.message }); }
    });
    return true;
  }

  // Sayfa screenshot'ı al
  if (msg.action === "capture-tab") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, function(dataUrl) {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ screenshot: dataUrl });
    });
    return true;
  }

  // DOM görsel taramasını content script'e ilet
  if (msg.action === "scan-dom-visuals") {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (!tabs[0]) { sendResponse({ error: "Aktif sekme bulunamadı" }); return; }
      chrome.tabs.sendMessage(tabs[0].id, { action: "scan-dom-visuals" }, function(resp) {
        if (chrome.runtime.lastError) {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ["content.js"]
          }).then(function() {
            setTimeout(function() {
              chrome.tabs.sendMessage(tabs[0].id, { action: "scan-dom-visuals" }, function(resp2) {
                if (chrome.runtime.lastError) { sendResponse({ error: "Görsel tarama yapılamadı" }); return; }
                sendResponse(resp2);
              });
            }, 300);
          }).catch(function(err) { sendResponse({ error: err.message }); });
          return;
        }
        sendResponse(resp);
      });
    });
    return true;
  }

  // Gemini ile görsel eşleştirme
  if (msg.action === "gemini-match-visuals") {
    chrome.storage.local.get(["geminiKey", "geminiModel"], async function(r) {
      if (!r.geminiKey) { sendResponse({ error: "Gemini key yok." }); return; }
      try {
        var model = r.geminiModel || "gemini-2.5-pro";
        var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + r.geminiKey;
        var prompt = 'Match Figma visual elements to DOM visual elements by name, size ratio, type, and position.\n\n'
          + 'FIGMA:\n' + JSON.stringify(msg.figmaVisuals) + '\n\n'
          + 'DOM:\n' + JSON.stringify(msg.domVisuals) + '\n\n'
          + 'Reply ONLY with JSON array, no other text:\n'
          + '[{"figmaIdx":0,"domIdx":2,"confidence":"high"},...]';

        var body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
        };
        var resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!resp.ok) {
          var errText = ""; try { errText = await resp.text(); } catch(e){}
          sendResponse({ error: "Gemini hatası: " + errText.substring(0, 200) });
          return;
        }
        var data = await resp.json();
        var text = extractGeminiText(data);
        if (!text) {
          sendResponse({ error: "Gemini boş yanıt döndü" });
          return;
        }
        var m = text.match(/\[[\s\S]*\]/);
        if (m) {
          try { sendResponse({ matches: JSON.parse(m[0]) }); }
          catch (e) { sendResponse({ error: "JSON parse hatası" }); }
        } else { sendResponse({ error: "Eşleşme bulunamadı" }); }
      } catch (e) { sendResponse({ error: e.message }); }
    });
    return true;
  }

});
