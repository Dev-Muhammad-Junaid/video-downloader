const activeJobsPerURL = new Set();
const activeJobsPerTab = new Map();

function isRootDomain(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return parsed.pathname === '/' && parsed.search === '';
  } catch (e) {
    return true; // if unparsable, block it
  }
}

function updateBadgeCount(tabId, overrideText = null, overrideColor = null) {
    if (overrideText !== null) {
        chrome.action.setBadgeText({ text: overrideText, tabId });
        chrome.action.setBadgeBackgroundColor({ color: overrideColor || '#FFA500', tabId });
        return;
    }

    const count = activeJobsPerTab.get(tabId) || 0;
    if (count > 0) {
        chrome.action.setBadgeText({ text: count.toString(), tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#FFA500', tabId });
    } else {
        chrome.action.setBadgeText({ text: '✓', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
        setTimeout(() => {
            // Verify count is still 0 before clearing
            if ((activeJobsPerTab.get(tabId) || 0) === 0) {
                chrome.action.setBadgeText({ text: '', tabId });
            }
        }, 3000);
    }
}

async function sendToSnapDown(videoUrl, tabId, cloudSync = false) {
  // WID-317: Debounce
  if (activeJobsPerURL.has(videoUrl)) {
      chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Already Queued',
          message: 'This link is already actively being processed by SnapDown!'
      });
      return;
  }
  
  // WID-316: Increment Counter
  activeJobsPerURL.add(videoUrl);
  const currentCount = (activeJobsPerTab.get(tabId) || 0) + 1;
  activeJobsPerTab.set(tabId, currentCount);
  updateBadgeCount(tabId);

  const { snapdownServerUrl = 'http://localhost:3000' } = await chrome.storage.local.get('snapdownServerUrl');
  const endpoint = new URL('/api/download/queue', snapdownServerUrl).href;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [videoUrl], cloudSync })
    });

    if (response.ok) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'SnapDown',
        message: 'Successfully added to download queue!'
      });
    } else {
      updateBadgeCount(tabId, '!', '#F44336');
      const err = await response.json();
      throw new Error(err.error || 'Failed to add to queue from server.');
    }
  } catch (error) {
    updateBadgeCount(tabId, '!', '#F44336');
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'SnapDown Error',
      message: error.message || 'Could not reach your SnapDown server. Is it running?'
    });
    
    // Fallback to clear error badge if count was updated
    setTimeout(() => {
        updateBadgeCount(tabId);
    }, 3000);
  } finally {
    activeJobsPerURL.delete(videoUrl);
    const newCount = Math.max(0, (activeJobsPerTab.get(tabId) || 0) - 1);
    activeJobsPerTab.set(tabId, newCount);
    
    // If it didn't crash hard, update badge normally (will show ✓ if hitting 0)
    updateBadgeCount(tabId);
  }
}

async function handleAction(tab, overrideUrl = null, cloudSync = false) {
    const targetUrl = overrideUrl || tab.url;
    
    if (targetUrl && !targetUrl.startsWith('chrome://')) {
        if (isRootDomain(targetUrl)) {
            updateBadgeCount(tab.id, '!', '#F44336');
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icons/icon128.png',
              title: 'Invalid URL',
              message: 'Cannot download a homepage or root domain.'
            });
            setTimeout(() => updateBadgeCount(tab.id), 3000);
            return;
        }

        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'SnapDown',
          message: 'Sending to SnapDown...'
        });
        await sendToSnapDown(targetUrl, tab.id, cloudSync);
    } else {
        updateBadgeCount(tab.id, '!', '#F44336');
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Invalid Page',
          message: 'You cannot download this type of page.'
        });
        setTimeout(() => updateBadgeCount(tab.id), 3000);
    }
}

// 1. Icon Click (Fallback to current page)
chrome.action.onClicked.addListener((tab) => {
  handleAction(tab);
});

// 2. Context Menus Setups
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "snapdown-send",
    title: "Send to SnapDown",
    contexts: ["page", "link", "video", "audio"]
  });
  chrome.contextMenus.create({
    id: "snapdown-send-cloud",
    title: "Send to SnapDown (Cloud Sync)",
    contexts: ["page", "link", "video", "audio"]
  });
  chrome.contextMenus.create({
    id: "snapdown-dashboard",
    title: "Open SnapDown Dashboard",
    contexts: ["page", "action"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "snapdown-dashboard") {
      const { snapdownServerUrl = 'http://localhost:3000' } = await chrome.storage.local.get('snapdownServerUrl');
      chrome.tabs.create({ url: snapdownServerUrl });
      return;
  }
  
  const targetUrl = info.linkUrl || info.srcUrl || info.pageUrl;
  const cloudSync = info.menuItemId === "snapdown-send-cloud";
  
  handleAction(tab, targetUrl, cloudSync);
});
