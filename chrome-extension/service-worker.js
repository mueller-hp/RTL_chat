// Toolbar button: toggle RTL mode in the active tab, same as clicking the pill.
// Needs no permissions: tab.id is always available, and the content script on
// claude.ai is the only listener, so other tabs simply have nobody to answer.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'rtl-mod:toggle' });
  } catch {
    // not a claude.ai tab, or a tab opened before the extension was (re)loaded
  }
});
