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

  if (msg.action === "save-token") {
    var o = {}; o[msg.key] = msg.value;
    chrome.storage.local.set(o, function() { sendResponse({ ok: true }); });
    return true;
  }

  if (msg.action === "delete-token") {
    chrome.storage.local.remove(msg.key, function() { sendResponse({ ok: true }); });
    return true;
  }

  if (msg.action === "figma-nodes") {
    chrome.storage.local.get("figmaToken", async function(r) {
      if (!r.figmaToken) { sendResponse({ error: "Figma token yok. Ayarlar sekmesinden ekleyin." }); return; }
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
    chrome.storage.local.get("geminiKey", async function(r) {
      if (!r.geminiKey) { sendResponse({ error: "Gemini key yok. Ayarlar sekmesinden ekleyin." }); return; }
      try {
        var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + r.geminiKey;
        var prompt = 'Sen bir UX/Frontend uzmanısın. Sana iki liste veriyorum:\n\n'
          + '## FIGMA ELEMENTLERI (tasarım dosyasından)\n```json\n' + JSON.stringify(msg.figmaList, null, 2) + '\n```\n\n'
          + '## DOM ELEMENTLERI (canlı web sayfasından)\n```json\n' + JSON.stringify(msg.domList, null, 2) + '\n```\n\n'
          + 'Bu iki listeyi eşleştir. Her Figma elementinin DOM\'daki karşılığını bul.\n'
          + 'Eşleştirme kriterleri: metin içeriği benzerliği, element tipi, hiyerarşideki konum.\n\n'
          + 'SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:\n'
          + '[\n  { "figmaIdx": 0, "domIdx": 2, "confidence": "high" },\n  ...\n]\n\n'
          + 'figmaIdx: Figma listesindeki index. domIdx: DOM listesindeki index. confidence: high/medium/low.\n'
          + 'Eşleşme bulamadıklarını dahil etme. Sadece emin olduklarını yaz.';

        var body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
        };
        var resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!resp.ok) {
          var errText = "";
          try { errText = await resp.text(); } catch(e){}
          sendResponse({ error: "Gemini hatası (" + resp.status + "): " + errText.substring(0, 200) });
          return;
        }
        var data = await resp.json();
        var text = "";
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
          data.candidates[0].content.parts.forEach(function(p) { if (p.text) text += p.text; });
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
          // Try injecting content script first
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
});
