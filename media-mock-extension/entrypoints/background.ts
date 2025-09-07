export default defineBackground(() => {
  console.log('MediaMock background script loaded');

  // Handle messages from popup and inject scripts into active tab
  chrome.runtime.onMessage.addListener(async (message, _sender, sendResponse) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id) {
        throw new Error('No active tab found');
      }

      switch (message.action) {
        case 'START_MOCK':
        case 'STOP_MOCK':
        case 'TEST_CAMERA':
        case 'GET_STATUS':
          // Forward message to content script in the active tab
          const response = await chrome.tabs.sendMessage(tab.id, message);
          sendResponse(response);
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ success: false, error: (error as Error).message });
    }

    return true; // Keep message channel open for async response
  });
});