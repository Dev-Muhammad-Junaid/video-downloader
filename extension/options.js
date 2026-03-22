// Restores the Server URL state using the preferences stored in chrome.storage.
const restoreOptions = () => {
  chrome.storage.local.get(
    { snapdownServerUrl: 'http://localhost:3000' },
    (items) => {
      document.getElementById('serverUrl').value = items.snapdownServerUrl;
    }
  );
};

// Saves options to chrome.storage
const saveOptions = () => {
  const serverUrl = document.getElementById('serverUrl').value;
  
  // Basic validation
  if (!serverUrl.startsWith('http')) {
    const status = document.getElementById('status');
    status.style.color = '#ef4444';
    status.textContent = 'URL must start with http:// or https://';
    setTimeout(() => {
      status.textContent = '';
    }, 3000);
    return;
  }

  chrome.storage.local.set(
    { snapdownServerUrl: serverUrl },
    () => {
      // Update status to let user know options were saved.
      const status = document.getElementById('status');
      status.style.color = '#4ade80';
      status.textContent = 'Configuration saved!';
      setTimeout(() => {
        status.textContent = '';
      }, 3000);
    }
  );
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
