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
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'SnapDown',
        message: 'Successfully added to download queue!'
      });
    } else {
      const err = await response.json();
      throw new Error(err.error || 'Failed to add to queue from server.');
    }
  } catch (error) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'SnapDown Error',
      message: error.message || 'Could not reach your SnapDown server. Is it running?'
    });
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url && !tab.url.startsWith('chrome://')) {
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
