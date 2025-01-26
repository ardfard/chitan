// Global error handler for background script
if (typeof window !== 'undefined') {
  window.onerror = function(message, source, lineno, colno, error) {
    console.error('Background Script Error:', {
      message,
      source,
      lineno,
      colno,
      error
    });
  };
}

// Global unhandled rejection handler
if (typeof window !== 'undefined') {
  window.onunhandledrejection = function(event) {
    console.error('Unhandled Promise Rejection in Background Script:', event.reason);
  };
}

// Initialize default settings when the extension is installed
browser.runtime.onInstalled.addListener(async () => {
  try {
    const settings = await browser.storage.local.get({
      model: 'gpt',
      enabled: false,
      suggestions: {
        grammar: true,
        style: true,
        structure: true
      },
      apiKeys: {
        gpt: '',
        claude: '',
        llama: '',
        deepseek: ''
      }
    }).catch(error => {
      throw new Error(`Failed to get initial settings: ${error.message}`);
    });

    await browser.storage.local.set(settings).catch(error => {
      throw new Error(`Failed to save initial settings: ${error.message}`);
    });

    console.log('Extension installed successfully');
  } catch (error) {
    console.error('Error during extension installation:', error);
  }
});

// Handle messages from content script and popup
browser.runtime.onMessage.addListener(async (message, sender) => {
  try {
    if (!message || typeof message !== 'object') {
      throw new Error('Invalid message format');
    }

    if (message.type === 'getSettings') {
      const settings = await browser.storage.local.get().catch(error => {
        throw new Error(`Failed to get settings: ${error.message}`);
      });
      return settings;
    }

    if (message.type === 'getApiKey') {
      if (!message.model || typeof message.model !== 'string') {
        throw new Error('Invalid model specified');
      }

      const { apiKeys } = await browser.storage.local.get('apiKeys').catch(error => {
        throw new Error(`Failed to get API keys: ${error.message}`);
      });

      if (!apiKeys || typeof apiKeys !== 'object') {
        throw new Error('API keys not properly initialized');
      }

      return { apiKey: apiKeys[message.model] || '' };
    }

    if (message.type === 'setApiKey') {
      if (!message.model || typeof message.model !== 'string') {
        throw new Error('Invalid model specified');
      }

      if (typeof message.apiKey !== 'string') {
        throw new Error('Invalid API key format');
      }

      const { apiKeys } = await browser.storage.local.get('apiKeys').catch(error => {
        throw new Error(`Failed to get existing API keys: ${error.message}`);
      });

      if (!apiKeys || typeof apiKeys !== 'object') {
        throw new Error('API keys not properly initialized');
      }

      apiKeys[message.model] = message.apiKey;
      
      await browser.storage.local.set({ apiKeys }).catch(error => {
        throw new Error(`Failed to save API key: ${error.message}`);
      });

      return { success: true };
    }

    throw new Error(`Unknown message type: ${message.type}`);
  } catch (error) {
    console.error('Error handling message:', error);
    return { error: error.message };
  }
}); 