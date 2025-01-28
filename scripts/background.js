// Get API key for a specific model
async function getApiKey(model) {
  try {
    const { apiKeys } = await browser.storage.local.get('apiKeys');
    if (!apiKeys || typeof apiKeys !== 'object') {
      throw new Error('API keys not properly initialized');
    }
    return apiKeys[model] || '';
  } catch (error) {
    console.error('Error getting API key:', error);
    return '';
  }
}

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
      enabled: true,
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

// Unified system prompt for all models
const SYSTEM_PROMPT = `You are an expert writing assistant specializing in improving text quality. Analyze the text for:
1. Grammar, spelling, and punctuation accuracy
2. Clarity and readability of expression
3. Paragraph structure and logical flow
4. Word choice precision and effectiveness
5. Style consistency and tone appropriateness

Provide specific, actionable suggestions as bullet points.
Focus on the most significant improvements that will enhance the text quality.
Be direct but maintain a constructive tone.
Format your response as a list of clear, concise suggestions.`;

const USER_PROMPT = (text) => 
  `Review and suggest improvements for this text: "${text}"
   Provide your suggestions as clear bullet points.
   Focus only on the most important improvements.
   Do not include any explanations or commentary.`;

// Handle messages from content script and popup
browser.runtime.onMessage.addListener(async (message, sender) => {
  try {
    switch (message.type) {
      case 'getApiKey':
        return { apiKey: await getApiKey(message.model) };
      
      case 'requestSuggestions':
        // Get API key for the selected model
        const apiKey = await getApiKey(message.model);
        if (!apiKey) {
          return { error: 'Please set up your API key in the extension settings.' };
        }

        // API endpoints and headers for different models
        const apiConfig = {
          gpt: {
            url: 'https://api.openai.com/v1/chat/completions',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: {
              model: 'gpt-3.5-turbo',
              messages: [{
                role: 'system',
                content: SYSTEM_PROMPT
              }, {
                role: 'user',
                content: USER_PROMPT(message.text)
              }]
            }
          },
          claude: {
            url: 'https://api.anthropic.com/v1/messages',
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            },
            body: {
              model: 'claude-2',
              messages: [{
                role: 'user',
                content: `${SYSTEM_PROMPT}\n\n${USER_PROMPT(message.text)}`
              }]
            }
          },
          deepseek: {
            url: 'https://api.deepseek.com/v1/chat/completions',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: {
              model: 'deepseek-chat',
              response_format: { type: 'json_object' },
              messages: [{
                role: 'system',
                content: SYSTEM_PROMPT
              }, {
                role: 'user',
                content: USER_PROMPT(message.text)
              }]
            }
          }
        };

        const config = apiConfig[message.model];
        if (!config) {
          return { error: 'Selected model is not yet supported.' };
        }

        // Make API request
        const response = await fetch(config.url, {
          method: 'POST',
          headers: config.headers,
          body: JSON.stringify(config.body)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`API error (${response.status}): ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        if (!data) {
          throw new Error('Empty response from API');
        }

        // Parse response based on model
        let suggestions;
        if (message.model === 'gpt') {
          if (!data.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from GPT API');
          }
          suggestions = data.choices[0].message.content.split('\n').filter(s => s.trim());
        } else if (message.model === 'deepseek') {
          if (!data.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from DeepSeek API');
          }
          try {
            const jsonContent = JSON.parse(data.choices[0].message.content);
            suggestions = jsonContent.suggestions || [];
          } catch (error) {
            suggestions = data.choices[0].message.content.split('\n').filter(s => s.trim());
          }
        } else {
          if (!data.content?.[0]?.text) {
            throw new Error('Invalid response format from API');
          }
          suggestions = data.content[0].text.split('\n').filter(s => s.trim());
        }

        return { suggestions };

      case 'settingsUpdated':
        // Broadcast settings update to all tabs
        const tabs = await browser.tabs.query({});
        tabs.forEach(tab => {
          browser.tabs.sendMessage(tab.id, {
            type: 'settingsUpdated',
            settings: message.settings
          }).catch(console.error);
        });
        return;

      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  } catch (error) {
    console.error('Error in message handler:', error);
    return { error: error.message };
  }
}); 