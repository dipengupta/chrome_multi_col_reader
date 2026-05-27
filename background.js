chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "toggle-reader" }, (response) => {
    if (chrome.runtime.lastError) {
      // Content script not yet injected — inject it first then toggle
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["content.js"] },
        () => {
          chrome.tabs.sendMessage(tab.id, { action: "toggle-reader" });
        }
      );
    }
  });
});
