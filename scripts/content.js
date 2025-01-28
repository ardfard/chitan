console.log('Content script starting to load...');

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Content Script Error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
});

// Global promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection in Content Script:', event.reason);
});

let settings = {
  enabled: true,
  model: 'gpt',
  suggestions: {
    grammar: true,
    style: true,
    structure: true
  }
};

// Debounce function to limit API calls
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// SVG Icons for different states
const ICONS = {
  loading: `<svg viewBox="0 0 24 24"><path d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8A8 8 0 0 1 12 20Z" opacity=".5"/><path d="M20 12h2A10 10 0 0 0 12 2V4A8 8 0 0 1 20 12Z"/></svg>`,
  success: `<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>`,
  error: `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  disabled: `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>`
};

// Tooltip messages
const TOOLTIPS = {
  loading: 'Analyzing your text with AI...',
  success: 'Suggestions ready',
  error: 'Error occurred while processing',
  disabled: 'AI Assistant is disabled. Click to enable.',
  charCount: {
    notReady: 'Type at least 20 characters to get suggestions',
    ready: 'Text length is sufficient for analysis'
  }
};

// Create suggestion container
function createSuggestionContainer(target) {
  const container = document.createElement('div');
  container.className = 'llm-suggestion-container';
  container.style.display = 'none';

  // Add state icon
  const stateIcon = document.createElement('div');
  stateIcon.className = 'llm-state-icon';
  container.appendChild(stateIcon);

  // Add character count
  const charCount = document.createElement('div');
  charCount.className = 'llm-char-count';
  container.appendChild(charCount);

  document.body.appendChild(container);
  return container;
}

// Update character count
function updateCharCount(target) {
  if (!target.suggestionContainer) return;

  const charCount = target.suggestionContainer.querySelector('.llm-char-count');
  if (!charCount) return;

  const count = target.value.length;
  const isReady = count >= 20;
  charCount.textContent = `${count}/20 characters`;
  charCount.classList.toggle('ready', isReady);
  charCount.setAttribute('data-tooltip', TOOLTIPS.charCount[isReady ? 'ready' : 'notReady']);
}

// Update state icon
function updateStateIcon(container, state, message = '') {
  const stateIcon = container.querySelector('.llm-state-icon');
  if (!stateIcon) return;

  // Remove all state classes
  stateIcon.classList.remove('loading', 'success', 'error');
  
  // Add new state class and icon
  stateIcon.classList.add(state);
  stateIcon.innerHTML = ICONS[state] || '';
  stateIcon.setAttribute('data-tooltip', TOOLTIPS[state]);

  // Update container text
  const textNode = document.createTextNode(message);
  container.innerHTML = ''; // Clear container
  container.appendChild(stateIcon); // Re-add icon
  container.appendChild(textNode); // Add message
}

// Get suggestions from the selected LLM
async function getSuggestions(text) {
  try {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid input text');
    }

    // Get the API key for the current model
    const response = await browser.runtime.sendMessage({
      type: 'getApiKey',
      model: settings.model
    }).catch(error => {
      throw new Error(`Failed to get API key: ${error.message}`);
    });

    const { apiKey } = response;
    if (!apiKey) {
      return 'Please set up your API key in the extension settings.';
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
            content: 'You are a helpful writing assistant. Provide brief suggestions for improving grammar, style, and structure.'
          }, {
            role: 'user',
            content: `Please suggest improvements for this text: "${text}"`
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
            content: `Please suggest improvements for this text: "${text}"`
          }]
        }
      }
    };

    const config = apiConfig[settings.model];
    if (!config) {
      return 'Selected model is not yet supported.';
    }

    const fetchResponse = await fetch(config.url, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify(config.body)
    }).catch(error => {
      throw new Error(`Network error: ${error.message}`);
    });

    if (!fetchResponse.ok) {
      const errorData = await fetchResponse.json().catch(() => ({}));
      throw new Error(`API error (${fetchResponse.status}): ${errorData.error?.message || fetchResponse.statusText}`);
    }

    const data = await fetchResponse.json().catch(error => {
      throw new Error(`Failed to parse API response: ${error.message}`);
    });

    if (!data) {
      throw new Error('Empty response from API');
    }

    if (settings.model === 'gpt') {
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response format from GPT API');
      }
      return data.choices[0].message.content;
    } else {
      if (!data.content?.[0]?.text) {
        throw new Error('Invalid response format from API');
      }
      return data.content[0].text;
    }
  } catch (error) {
    console.error('Error in getSuggestions:', error);
    return `Error: ${error.message}. Please check the console for details.`;
  }
}

// Create textarea indicator
function createTextareaIndicator(target) {
  const indicator = document.createElement('div');
  indicator.className = 'llm-textarea-indicator';
  indicator.setAttribute('data-tooltip', TOOLTIPS.disabled);
  indicator.innerHTML = ICONS.disabled;
  
  document.body.appendChild(indicator);
  positionIndicator(target, indicator);
  
  // Add click handler to toggle suggestions
  indicator.addEventListener('click', () => {
    settings.enabled = !settings.enabled;
    updateIndicatorState(target, settings.enabled ? 'success' : 'disabled');
    if (settings.enabled && target.value.length >= 20) {
      handleInput({ target });
    }
  });

  // Watch for textarea resizing
  const resizeObserver = new ResizeObserver(() => {
    positionIndicator(target, indicator);
  });
  resizeObserver.observe(target);
  
  // Store the observer reference for cleanup
  target.resizeObserver = resizeObserver;
  
  return indicator;
}

// Position indicator relative to textarea
function positionIndicator(target, indicator) {
  const rect = target.getBoundingClientRect();
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;
  
  indicator.style.position = 'absolute';
  indicator.style.left = `${rect.right + scrollX - 40}px`;
  indicator.style.top = `${rect.bottom + scrollY - 40}px`;
}

// Clean up resources for a target
function cleanupTarget(target) {
  if (target.textareaIndicator) {
    target.textareaIndicator.remove();
    target.textareaIndicator = null;
  }
  if (target.resizeObserver) {
    target.resizeObserver.disconnect();
    target.resizeObserver = null;
  }
}

// Update indicator state
function updateIndicatorState(target, state, message = '') {
  if (!target.textareaIndicator) return;
  
  const indicator = target.textareaIndicator;
  
  // Remove all state classes
  indicator.classList.remove('loading', 'success', 'error', 'disabled');
  
  // Add new state class and icon
  indicator.classList.add(state);
  indicator.innerHTML = ICONS[state] || '';
  indicator.setAttribute('data-tooltip', TOOLTIPS[state]);
  
  // Update position in case textarea size changed
  positionIndicator(target, indicator);
}

// Handle text area input with error handling
const handleInput = debounce(async (event) => {
  try {
    if (!settings.enabled) return;

    const target = event.target;
    if (!target || !target.value) return;

    const text = target.value;
    if (text.length < 20) {
      updateIndicatorState(target, 'disabled', TOOLTIPS.charCount.notReady);
      return;
    }

    // Show loading state
    updateIndicatorState(target, 'loading');

    const suggestions = await getSuggestions(text);
    if (!suggestions) {
      throw new Error('No suggestions received');
    }

    updateIndicatorState(target, 'success');
    target.textareaIndicator.setAttribute('data-tooltip', suggestions);
  } catch (error) {
    console.error('Error in handleInput:', error);
    if (event.target?.textareaIndicator) {
      updateIndicatorState(event.target, 'error');
    }
  }
}, 1000);

// Handle focus events
function handleFocus(event) {
  console.log('handleFocus', event);
  const target = event.target;
  if (!target.textareaIndicator) {
    target.textareaIndicator = createTextareaIndicator(target);
    updateIndicatorState(target, settings.enabled ? 'success' : 'disabled');
  }
}

// Listen for settings updates with error handling
browser.runtime.onMessage.addListener((message) => {
  try {
    if (!message || typeof message !== 'object') {
      throw new Error('Invalid message format');
    }

    if (message.type === 'settingsUpdated') {
      if (!message.settings || typeof message.settings !== 'object') {
        throw new Error('Invalid settings format');
      }
      settings = message.settings;
    }
  } catch (error) {
    console.error('Error handling message:', error);
  }
});

// Initialize indicators for all text areas
function initializeAllTextAreas() {
  document.querySelectorAll('textarea, input[type="text"]').forEach(target => {
    if (!target.textareaIndicator) {
      target.textareaIndicator = createTextareaIndicator(target);
      updateIndicatorState(target, settings.enabled ? 'success' : 'disabled');
    }
  });
}

// Watch for new text areas being added
function watchForNewTextAreas() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if the node itself is a textarea/input
          if ((node.tagName === 'TEXTAREA' || 
              (node.tagName === 'INPUT' && node.type === 'text')) && 
              !node.textareaIndicator) {
            node.textareaIndicator = createTextareaIndicator(node);
            updateIndicatorState(node, settings.enabled ? 'success' : 'disabled');
          }
          
          // Check child elements
          node.querySelectorAll('textarea, input[type="text"]').forEach(target => {
            if (!target.textareaIndicator) {
              target.textareaIndicator = createTextareaIndicator(target);
              updateIndicatorState(target, settings.enabled ? 'success' : 'disabled');
            }
          });
        }
      });
      
      // Handle removed elements
      mutation.removedNodes.forEach((node) => {
        if (node.textareaIndicator) {
          cleanupTarget(node);
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  return observer;
}

// Initialize with error handling
try {


  // Handle input events
  document.addEventListener('input', (event) => {
    try {
      if (event.target.tagName === 'TEXTAREA' || 
          (event.target.tagName === 'INPUT' && event.type === 'text')) {
        handleInput(event);
      }
    } catch (error) {
      console.error('Error in input event handler:', error);
    }
  });

  // Handle focus events (only for newly created text areas that don't have indicators yet)
  document.addEventListener('focus', (event) => {
    if ((event.target.tagName === 'TEXTAREA' || 
        (event.target.tagName === 'INPUT' && event.target.type === 'text')) &&
        !event.target.textareaIndicator) {
      handleFocus(event);
    }
  }, true);

  // Update indicator positions on scroll
  document.addEventListener('scroll', debounce(() => {
    document.querySelectorAll('textarea, input[type="text"]').forEach(target => {
      if (target.textareaIndicator) {
        positionIndicator(target, target.textareaIndicator);
      }
    });
  }, 100), true);

  // Update indicator positions on window resize
  window.addEventListener('resize', debounce(() => {
    document.querySelectorAll('textarea, input[type="text"]').forEach(target => {
      if (target.textareaIndicator) {
        positionIndicator(target, target.textareaIndicator);
      }
    });
  }, 100));

  console.log('Content script initialized!');
} catch (error) {
  console.error('Error initializing content script:', error);
} 