// Global error handler
window.addEventListener('error', (event) => {
  console.error('Popup Error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
});

// Global promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection in Popup:', event.reason);
});

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded');
  try {
    const modelSelect = document.getElementById('model');
    const saveButton = document.getElementById('save');
    const enableButton = document.getElementById('enable');
    const settingsButton = document.getElementById('settings');
    const grammarCheckbox = document.getElementById('grammar');
    const styleCheckbox = document.getElementById('style');
    const structureCheckbox = document.getElementById('structure');

    if (!modelSelect || !saveButton || !enableButton || !settingsButton || 
        !grammarCheckbox || !styleCheckbox || !structureCheckbox) {
      throw new Error('Failed to initialize UI elements');
    }

    // Load saved settings
    const settings = await browser.storage.local.get({
      model: 'gpt',
      enabled: false,
      suggestions: {
        grammar: true,
        style: true,
        structure: true
      }
    }).catch(error => {
      throw new Error(`Failed to load settings: ${error.message}`);
    });

    // Apply saved settings to UI
    try {
      modelSelect.value = settings.model;
      enableButton.classList.toggle('active', settings.enabled);
      enableButton.textContent = settings.enabled ? 'Disable Assistant' : 'Enable Assistant';
      grammarCheckbox.checked = settings.suggestions.grammar;
      styleCheckbox.checked = settings.suggestions.style;
      structureCheckbox.checked = settings.suggestions.structure;
    } catch (error) {
      throw new Error(`Failed to apply settings to UI: ${error.message}`);
    }

    // Open settings page
    settingsButton.addEventListener('click', () => {
      try {
        browser.runtime.openOptionsPage().catch(error => {
          throw new Error(`Failed to open settings page: ${error.message}`);
        });
      } catch (error) {
        console.error('Error opening settings:', error);
        alert('Failed to open settings page. Please try again.');
      }
    });

    // Save settings
    saveButton.addEventListener('click', async () => {
      try {
        const newSettings = {
          model: modelSelect.value,
          enabled: enableButton.classList.contains('active'),
          suggestions: {
            grammar: grammarCheckbox.checked,
            style: styleCheckbox.checked,
            structure: structureCheckbox.checked
          }
        };

        await browser.storage.local.set(newSettings).catch(error => {
          throw new Error(`Failed to save settings: ${error.message}`);
        });
        
        // Notify the content script about the changes
        const tabs = await browser.tabs.query({ active: true, currentWindow: true })
          .catch(error => {
            throw new Error(`Failed to query tabs: ${error.message}`);
          });

        if (tabs[0]) {
          await browser.tabs.sendMessage(tabs[0].id, {
            type: 'settingsUpdated',
            settings: newSettings
          }).catch(error => {
            throw new Error(`Failed to notify content script: ${error.message}`);
          });
        }

        // Show success message
        const successMessage = document.createElement('div');
        successMessage.className = 'success-message';
        successMessage.textContent = 'Settings saved successfully!';
        saveButton.parentElement.appendChild(successMessage);
        setTimeout(() => successMessage.remove(), 2000);

      } catch (error) {
        console.error('Error saving settings:', error);
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = `Error: ${error.message}`;
        saveButton.parentElement.appendChild(errorMessage);
        setTimeout(() => errorMessage.remove(), 3000);
      }
    });

    // Toggle enable/disable
    enableButton.addEventListener('click', () => {
      try {
        const isEnabled = enableButton.classList.toggle('active');
        enableButton.textContent = isEnabled ? 'Disable Assistant' : 'Enable Assistant';
      } catch (error) {
        console.error('Error toggling enable state:', error);
        enableButton.classList.remove('active');
        enableButton.textContent = 'Enable Assistant';
      }
    });

  } catch (error) {
    console.error('Error initializing popup:', error);
    document.body.innerHTML = `
      <div class="error-container">
        <h3>Error Initializing Extension</h3>
        <p>${error.message}</p>
        <button onclick="window.location.reload()">Retry</button>
      </div>
    `;
  }
}); 