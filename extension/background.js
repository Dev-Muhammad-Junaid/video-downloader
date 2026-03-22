async function sendToSnapDown(videoUrl) {
  const { snapdownServerUrl = 'http://localhost:3000' } = await chrome.storage.local.get('snapdownServerUrl');
  
  // Format the endpoint URL
  const endpoint = new URL('/api/download/queue', snapdownServerUrl).href;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls: [videoUrl] })
    });

    if (response.ok) {
      chrome.action.setBadgeText({ text: '✓' });
      chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });

      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'SnapDown',
        message: 'Successfully added to download queue!'
      });
    } else {
      chrome.action.setBadgeText({ text: '!' });
      chrome.action.setBadgeBackgroundColor({ color: '#F44336' });

      const err = await response.json();
      throw new Error(err.error || 'Failed to add to queue from server.');
    }
  } catch (error) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F44336' });

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'SnapDown Error',
      message: error.message || 'Could not reach your SnapDown server. Is it running?'
    });
  } finally {
    // Clear the badge after 3 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 3000);
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url && !tab.url.startsWith('chrome://')) {
    chrome.action.setBadgeText({ text: '⏳', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#FFA500', tabId: tab.id });
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'SnapDown',
      message: 'Sending to SnapDown...'
    });
    await sendToSnapDown(tab.url);
  } else {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Invalid Page',
      message: 'You cannot download this type of page.'
    });
  }
});
