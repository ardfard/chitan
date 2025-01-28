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
  disabled: `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8 0-1.85.63-3.55 1.69-4.9L16.9 18.31C15.55 19.37 13.85 20 12 20zm6.31-3.1L7.1 5.69C8.45 4.63 10.15 4 12 4c4.42 0 8 3.58 8 8 0 1.85-.63 3.55-1.69 4.9z"/></svg>`,
  waiting: `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42z"/></svg>`
};

// Tooltip messages
const TOOLTIPS = {
  loading: 'Analyzing your text with AI...',
  success: 'Suggestions ready',
  error: 'Error occurred while processing',
  disabled: 'AI Assistant is disabled. Click to enable.',
  waiting: 'Waiting for more text...',
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

    const response = await browser.runtime.sendMessage({
      type: 'requestSuggestions',
      text: text,
      model: settings.model
    });

    if (response.error) {
      throw new Error(response.error);
    }

    return response.suggestions;
  } catch (error) {
    console.error('Error in getSuggestions:', error);
    return error.message || 'Failed to get suggestions';
  }
}

// Create textarea indicator
function createTextareaIndicator(target) {
  const indicator = document.createElement('div');
  indicator.className = 'llm-textarea-indicator';
  indicator.setAttribute('data-tooltip', TOOLTIPS.waiting);
  indicator.innerHTML = ICONS.waiting;
  
  document.body.appendChild(indicator);
  positionIndicator(target, indicator);
  
  // Add click handler to toggle suggestions
  indicator.addEventListener('click', () => {
    settings.enabled = !settings.enabled;
    if (settings.enabled) {
      const state = target.value.length >= 20 ? 'success' : 'waiting';
      updateIndicatorState(target, state);
      if (target.value.length >= 20) {
        handleInput({ target });
      }
    } else {
      updateIndicatorState(target, 'disabled');
      if (target.suggestionContainer) {
        target.suggestionContainer.style.display = 'none';
      }
    }
  });

  // Watch for textarea resizing
  const resizeObserver = new ResizeObserver(() => {
    positionIndicator(target, indicator);
    if (target.suggestionContainer && target.suggestionContainer.style.display !== 'none') {
      const rect = target.getBoundingClientRect();
      target.suggestionContainer.style.top = `${rect.bottom + window.scrollY + 5}px`;
      target.suggestionContainer.style.left = `${rect.left + window.scrollX}px`;
    }
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

// Update indicator state
function updateIndicatorState(target, state, message = '') {
  if (!target.textareaIndicator) return;
  
  const indicator = target.textareaIndicator;
  
  // Remove all state classes
  indicator.classList.remove('loading', 'success', 'error', 'disabled', 'waiting');
  
  // Add new state class and icon
  indicator.classList.add(state);
  indicator.innerHTML = ICONS[state] || '';
  indicator.setAttribute('data-tooltip', message || TOOLTIPS[state]);
  
  // Update position in case textarea size changed
  positionIndicator(target, indicator);
}

// Handle text area input with error handling
const handleInput = debounce(async ({ target }) => {
  if (!settings.enabled) return;
  
  // Check character count
  if (target.value.length < 20) {
    updateIndicatorState(target, 'waiting', TOOLTIPS.charCount.notReady);
    if (target.suggestionContainer) {
      target.suggestionContainer.style.display = 'none';
    }
    return;
  }

  try {
    // Show loading state
    updateIndicatorState(target, 'loading', TOOLTIPS.loading);
    
    // Get or create suggestion container
    let suggestionContainer = target.suggestionContainer;
    if (!suggestionContainer) {
      suggestionContainer = createSuggestionContainer(target);
      target.suggestionContainer = suggestionContainer;
    }
    suggestionContainer.style.display = 'block';
    suggestionContainer.innerHTML = '<div class="loading">Loading suggestions...</div>';
    
    // Position container below textarea
    const rect = target.getBoundingClientRect();
    suggestionContainer.style.top = `${rect.bottom + window.scrollY + 5}px`;
    suggestionContainer.style.left = `${rect.left + window.scrollX}px`;
    
    // Get suggestions using the local function
    const suggestions = await getSuggestions(target.value);
    
    // Handle string response (usually error message)
    if (typeof suggestions === 'string') {
      updateIndicatorState(target, 'error', suggestions);
      suggestionContainer.innerHTML = `<div class="error">${suggestions}</div>`;
      return;
    }
    
    // Update suggestion container with results
    if (suggestions && suggestions.length > 0) {
      updateIndicatorState(target, 'success', TOOLTIPS.success);
      suggestionContainer.innerHTML = suggestions.map(suggestion => 
        `<div class="suggestion">${suggestion}</div>`
      ).join('');
    } else {
      updateIndicatorState(target, 'error', TOOLTIPS.error.noSuggestions);
      suggestionContainer.innerHTML = '<div class="error">No suggestions available</div>';
    }
    
  } catch (error) {
    console.error('Error getting suggestions:', error);
    updateIndicatorState(target, 'error', TOOLTIPS.error.general);
    if (target.suggestionContainer) {
      target.suggestionContainer.innerHTML = '<div class="error">Error getting suggestions</div>';
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