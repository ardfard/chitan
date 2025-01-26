// Global error handler
window.addEventListener('error', (event) => {
  console.error('Settings Error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
});

// Global promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection in Settings:', event.reason);
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const apiKeyInputs = document.querySelectorAll('.api-key-input');
    const showHideButtons = document.querySelectorAll('.show-hide-btn');
    const saveButton = document.getElementById('save');

    if (!apiKeyInputs.length || !showHideButtons.length || !saveButton) {
      throw new Error('Failed to initialize UI elements');
    }

    // Load saved API keys
    const { apiKeys } = await browser.storage.local.get('apiKeys').catch(error => {
      throw new Error(`Failed to load API keys: ${error.message}`);
    });

    if (!apiKeys || typeof apiKeys !== 'object') {
      throw new Error('API keys not properly initialized');
    }

    // Apply saved API keys to UI
    try {
      apiKeyInputs.forEach(input => {
        const model = input.dataset.model;
        if (!model) {
          throw new Error('Invalid model data attribute');
        }
        input.value = apiKeys[model] || '';
      });
    } catch (error) {
      throw new Error(`Failed to apply API keys to UI: ${error.message}`);
    }

    // Handle show/hide password buttons
    showHideButtons.forEach(button => {
      button.addEventListener('click', () => {
        try {
          const input = button.previousElementSibling;
          if (!input) {
            throw new Error('Failed to find input element');
          }

          if (input.type === 'password') {
            input.type = 'text';
            button.textContent = 'Hide';
          } else {
            input.type = 'password';
            button.textContent = 'Show';
          }
        } catch (error) {
          console.error('Error toggling password visibility:', error);
          alert('Failed to toggle password visibility');
        }
      });
    });

    // Save API keys
    saveButton.addEventListener('click', async () => {
      try {
        const newApiKeys = {};
        
        // Validate and collect API keys
        for (const input of apiKeyInputs) {
          const model = input.dataset.model;
          if (!model) {
            throw new Error('Invalid model data attribute');
          }
          
          const apiKey = input.value.trim();
          // Basic API key validation
          if (apiKey && !isValidApiKey(apiKey, model)) {
            throw new Error(`Invalid API key format for ${model}`);
          }
          
          newApiKeys[model] = apiKey;
        }

        // Save to storage
        await browser.storage.local.set({ apiKeys: newApiKeys }).catch(error => {
          throw new Error(`Failed to save API keys: ${error.message}`);
        });

        showSuccessMessage(saveButton);
      } catch (error) {
        console.error('Error saving API keys:', error);
        showErrorMessage(saveButton, error.message);
      }
    });

  } catch (error) {
    console.error('Error initializing settings:', error);
    document.body.innerHTML = `
      <div class="error-container">
        <h3>Error Initializing Settings</h3>
        <p>${error.message}</p>
        <button onclick="window.location.reload()">Retry</button>
      </div>
    `;
  }
});

// Helper function to validate API keys
function isValidApiKey(apiKey, model) {
  const patterns = {
    gpt: /^sk-[a-zA-Z0-9]{32,}$/,
    claude: /^[a-zA-Z0-9_-]{40,}$/,
    llama: /^[a-zA-Z0-9_-]{32,}$/,
    deepseek: /^[a-zA-Z0-9_-]{32,}$/
  };

  if (!apiKey) return true; // Empty key is valid (for removal)
  return patterns[model] ? patterns[model].test(apiKey) : true;
}

// Helper function to show success message
function showSuccessMessage(parentElement) {
  const successMessage = document.createElement('div');
  successMessage.className = 'success-message';
  successMessage.textContent = 'API keys saved successfully!';
  parentElement.parentElement.appendChild(successMessage);

  setTimeout(() => successMessage.classList.add('show'), 10);
  setTimeout(() => {
    successMessage.classList.remove('show');
    setTimeout(() => successMessage.remove(), 300);
  }, 3000);
}

// Helper function to show error message
function showErrorMessage(parentElement, message) {
  const errorMessage = document.createElement('div');
  errorMessage.className = 'error-message';
  errorMessage.textContent = `Error: ${message}`;
  parentElement.parentElement.appendChild(errorMessage);

  setTimeout(() => errorMessage.classList.add('show'), 10);
  setTimeout(() => {
    errorMessage.classList.remove('show');
    setTimeout(() => errorMessage.remove(), 300);
  }, 5000);
} 