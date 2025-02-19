import { debounce } from './utils';
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

// Add flag to track changes from paste button
let isApplyingSuggestion = false;

// Create SVG element safely
function createSVGElement(pathD) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathD);
  svg.appendChild(path);
  
  return svg;
}

// Create loading element
function createLoadingElement() {
  const div = document.createElement('div');
  div.className = 'loading';
  div.textContent = 'Loading suggestions...';
  return div;
}

// Create error element
function createErrorElement(message) {
  const div = document.createElement('div');
  div.className = 'error';
  div.textContent = message;
  return div;
}

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
  
  // Position the container relative to the target
  positionContainer(target, container);
  
  // Store reference to container on target
  target.suggestionContainer = container;
  
  return container;
}

// Position container relative to target
function positionContainer(target, container) {
  if (!target || !container) return;

  const updatePosition = () => {
    const rect = target.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    container.style.top = `${rect.bottom + scrollY + 5}px`;
    container.style.left = `${rect.left + scrollX}px`;
    container.style.width = `${rect.width}px`;
  };

  // Update position immediately
  updatePosition();

  // Update position on scroll and resize
  window.addEventListener('scroll', updatePosition, true);
  window.addEventListener('resize', updatePosition);
}

// Create suggestion element with paste button
function createSuggestionElement(suggestion, target) {
  const suggestionDiv = document.createElement('div');
  suggestionDiv.className = 'suggestion-item';

  // Create suggestion text element
  const textDiv = document.createElement('div');
  textDiv.className = 'suggestion-text';
  
  // Handle both string and object formats
  if (typeof suggestion === 'string') {
    textDiv.textContent = suggestion;
  } else if (suggestion.improvedText) {
    const improvedTextDiv = document.createElement('div');
    improvedTextDiv.className = 'improved-text';
    improvedTextDiv.textContent = suggestion.improvedText;
    textDiv.appendChild(improvedTextDiv);

    if (suggestion.explanation && suggestion.explanation.length > 0) {
      const explanationList = document.createElement('ul');
      explanationList.className = 'explanation-list';
      suggestion.explanation.forEach(exp => {
        const li = document.createElement('li');
        li.textContent = exp;
        explanationList.appendChild(li);
      });
      textDiv.appendChild(explanationList);
    }
  } else {
    textDiv.textContent = 'Invalid suggestion format';
    return suggestionDiv;
  }
  
  suggestionDiv.appendChild(textDiv);

  // Create paste button
  const pasteButton = document.createElement('button');
  pasteButton.className = 'paste-button';
  pasteButton.setAttribute('title', 'Apply this suggestion');
  
  // Add SVG to paste button
  const svg = createSVGElement("M19 2h-4.18C14.4.84 13.3 0 12 0S9.6.84 9.18 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 20H5V4h2v3h10V4h2v18z");
  pasteButton.appendChild(svg);
  
  // Add click handler for paste button
  pasteButton.addEventListener('click', () => {
    // Set flag before making changes
    isApplyingSuggestion = true;
    
    try {
      // Get the text to apply
      const newText = typeof suggestion === 'string' ? suggestion : suggestion.improvedText;
      
      // Set the text using our helper function
      setElementText(target, newText);
      
      // Update UI state
      if (target.suggestionContainer) {
        updateStateIcon(target.suggestionContainer, 'success', 'Suggestion applied');
      }
      
      // Hide suggestion container after successful paste
      if (target.suggestionContainer) {
        target.suggestionContainer.style.display = 'none';
      }
    } catch (error) {
      console.error('Error applying suggestion:', error);
      if (target.suggestionContainer) {
        updateStateIcon(target.suggestionContainer, 'error', 'Failed to apply suggestion');
      }
    } finally {
      // Reset flag after a short delay
      setTimeout(() => {
        isApplyingSuggestion = false;
    }, 1000);
  });

  suggestionDiv.appendChild(pasteButton);
  return suggestionDiv;
}

// Update character count and indicator state
function updateCharCount(target) {
  if (!target.suggestionContainer) return;

  const charCount = target.suggestionContainer.querySelector('.llm-char-count');
  if (!charCount) return;

  const text = getElementText(target);
  const count = text ? text.length : 0;
  const isReady = count >= 20;
  
  charCount.textContent = `${count}/20 characters`;
  charCount.classList.toggle('ready', isReady);
  charCount.setAttribute('data-tooltip', TOOLTIPS.charCount[isReady ? 'ready' : 'notReady']);

  // Update indicator state based on character count
  if (target.indicator) {
    if (!settings.enabled) {
      updateStateIcon(target.indicator, 'disabled');
    } else if (isApplyingSuggestion) {
      updateStateIcon(target.indicator, 'success');
    } else if (count < 20) {
      updateStateIcon(target.indicator, 'waiting');
    } else {
      updateStateIcon(target.indicator, 'ready');
    }
  }
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
  
  // Position the indicator
  positionIndicator(target, indicator);
  
  // Store reference to indicator on target
  target.indicator = indicator;
  
  return indicator;
}

// Position indicator relative to target
function positionIndicator(target, indicator) {
  if (!target || !indicator) return;

  const updatePosition = () => {
    const rect = target.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    indicator.style.top = `${rect.top + scrollY + 5}px`;
    indicator.style.right = `${document.documentElement.clientWidth - (rect.right + scrollX) + 5}px`;
  };

  // Update position immediately
  updatePosition();

  // Update position on scroll and resize
  window.addEventListener('scroll', updatePosition, true);
  window.addEventListener('resize', updatePosition);
}

// Update suggestion container with results
function updateSuggestionContainer(container, suggestions, target) {
  // Clear previous content
  container.textContent = '';
  
  if (suggestions.length === 0) {
    container.appendChild(createErrorElement('No suggestions available'));
    return;
  }

  suggestions.forEach(suggestion => {
    const suggestionElement = createSuggestionElement(suggestion, target);
    container.appendChild(suggestionElement);
  });
}

// Handle input events
function handleInput(event) {
  const target = event.target;
  
  // Skip if we're currently applying a suggestion
  if (isApplyingSuggestion) return;
  
  // Skip if not a valid input element
  if (!isValidInputElement(target)) return;
  
  // Create container and indicator if they don't exist
  if (!target.suggestionContainer) {
    target.suggestionContainer = createSuggestionContainer(target);
  }
  if (!target.indicator) {
    target.indicator = createTextareaIndicator(target);
  }
  
  // Show container and indicator
  target.suggestionContainer.style.display = 'block';
  target.indicator.style.display = 'block';
  
  // Update character count
  updateCharCount(target);
  
  // Get text content
  const text = getElementText(target);
  
  // Skip if text is too short
  if (!text || text.length < 20) {
    if (target.suggestionContainer) {
      updateStateIcon(target.suggestionContainer, 'waiting', 'Need more text...');
    }
    return;
  }
  
  // Get suggestions
  getSuggestionsDebounced(text, target);
}

// Handle focus events
function handleFocus(event) {
  const target = event.target;
  
  // Check if element is a valid input element
  if (!isValidInputElement(target)) return;
  
  // Create container and indicator if they don't exist
  if (!target.suggestionContainer) {
    target.suggestionContainer = createSuggestionContainer(target);
  }
  if (!target.indicator) {
    target.indicator = createTextareaIndicator(target);
  }
  
  // Show indicator
  target.indicator.style.display = 'block';
  
  // Update character count and check if we should show suggestions
  updateCharCount(target);
  
  // Get text content
  const text = getElementText(target);
  
  // Show container if text is long enough
  if (text && text.length >= 20) {
    target.suggestionContainer.style.display = 'block';
  }
}

// Get suggestions with debounce
const getSuggestionsDebounced = debounce(async function(text, target) {
  try {
    if (target.suggestionContainer) {
      updateStateIcon(target.suggestionContainer, 'loading', 'Getting suggestions...');
    }
    
    const suggestions = await getSuggestions(text);
    
    if (Array.isArray(suggestions)) {
      // Clear previous suggestions
      while (target.suggestionContainer.children.length > 2) { // Keep icon and char count
        target.suggestionContainer.removeChild(target.suggestionContainer.lastChild);
      }
      
      // Add new suggestions
      suggestions.forEach(suggestion => {
        const suggestionElement = createSuggestionElement(suggestion, target);
        target.suggestionContainer.appendChild(suggestionElement);
      });
      
      updateStateIcon(target.suggestionContainer, 'success', 'Suggestions ready');
    } else {
      updateStateIcon(target.suggestionContainer, 'error', suggestions); // Show error message
    }
  } catch (error) {
    console.error('Error getting suggestions:', error);
    if (target.suggestionContainer) {
      updateStateIcon(target.suggestionContainer, 'error', 'Failed to get suggestions');
    }
  }
}, 1000);

// Initialize event listeners
function init() {
  // Remove any existing listeners
  document.removeEventListener('input', handleInput);
  document.removeEventListener('focus', handleFocus, true);
  
  // Add event listeners
  document.addEventListener('input', handleInput);
  document.addEventListener('focus', handleFocus, true);
  
  console.log('Content script initialized: Added input and focus handlers');
}

// Initialize when the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
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
  // Select all potential input elements
  const selector = 'textarea, input[type="text"], [contenteditable="true"], [data-contents="true"] [data-block="true"], .editable[role="textbox"]';
  document.querySelectorAll(selector).forEach(target => {
    if (isValidInputElement(target) && !target.textareaIndicator) {
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
          // Check if the node itself is a valid input element
          if (isValidInputElement(node) && !node.textareaIndicator) {
            node.textareaIndicator = createTextareaIndicator(node);
            updateIndicatorState(node, settings.enabled ? 'success' : 'disabled');
          }
          
          // Check child elements
          const selector = 'textarea, input[type="text"], [contenteditable="true"], [data-contents="true"] [data-block="true"], .editable[role="textbox"]';
          node.querySelectorAll(selector).forEach(target => {
            if (isValidInputElement(target) && !target.textareaIndicator) {
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
  // Initialize all text areas and contenteditable elements
  initializeAllTextAreas();

  // Watch for new elements
  const observer = watchForNewTextAreas();

  // Handle input events for all text input types
  document.addEventListener('input', (event) => {
    try {
      const target = event.target;
      if (isValidInputElement(target)) {
        handleInput({ target });
      }
    } catch (error) {
      console.error('Error in input event handler:', error);
    }
  });

  // Handle focus events for new elements
  document.addEventListener('focus', (event) => {
    const target = event.target;
    if (isValidInputElement(target) && !target.textareaIndicator) {
      handleFocus({ target });
    }
  }, true);

  // Update indicator positions on scroll
  document.addEventListener('scroll', debounce(() => {
    document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]').forEach(target => {
      if (target.textareaIndicator) {
        positionIndicator(target, target.textareaIndicator);
      }
    });
  }, 100), true);

  // Update indicator positions on window resize
  window.addEventListener('resize', debounce(() => {
    document.querySelectorAll('textarea, [contenteditable="true"], input[type="text"]').forEach(target => {
      if (target.textareaIndicator) {
        positionIndicator(target, target.textareaIndicator);
      }
    });
  }, 100));

  console.log('Content script initialized!');
} catch (error) {
  console.error('Error initializing content script:', error);
}

// Helper function to check if an element is a valid input element
function isValidInputElement(element) {
  // Check if element is null or undefined
  if (!element) return false;

  // Check for textarea and text input
  if (element.tagName === 'TEXTAREA' || 
      (element.tagName === 'INPUT' && element.type === 'text')) {
    return true;
  }

  // Check for contenteditable div
  if (element.getAttribute('contenteditable') === 'true' ||
      element.getAttribute('g_editable') === 'true') {
    return true;
  }

  // Check for specific Twitter editor div (Draft.js)
  if (element.getAttribute('data-block') === 'true' && 
      element.closest('[data-contents="true"]')) {
    return true;
  }

  // Check for Gmail composer
  if ((element.classList.contains('editable') && element.getAttribute('role') === 'textbox') ||
      element.classList.contains('Am') && element.classList.contains('Al')) {
    return true;
  }

  // Check for Medium editor
  if (element.getAttribute('data-gramm') === 'false' && 
      element.getAttribute('contenteditable') === 'true') {
    return true;
  }

  // Check for Notion editor
  if (element.classList.contains('notranslate') && 
      element.getAttribute('contenteditable') === 'true') {
    return true;
  }

  // Check for WordPress Gutenberg editor
  if (element.classList.contains('block-editor-rich-text__editable') ||
      element.classList.contains('wp-block-paragraph')) {
    return true;
  }

  // Check for Google Docs
  if (element.classList.contains('kix-lineview') ||
      element.classList.contains('docs-texteventtarget-iframe')) {
    return true;
  }

  // Check for Slack input
  if (element.getAttribute('data-qa') === 'message_input' ||
      element.classList.contains('ql-editor')) {
    return true;
  }

  // Check for Discord input
  if (element.classList.contains('markup-2BOw-j') ||
      element.classList.contains('editor-H2NA06')) {
    return true;
  }

  // Check for LinkedIn post editor
  if (element.classList.contains('editor-content') ||
      element.classList.contains('mentions-texteditor')) {
    return true;
  }

  // Check for Facebook post/comment input
  if (element.getAttribute('role') === 'textbox' &&
      (element.getAttribute('aria-label')?.includes('Write') ||
       element.getAttribute('aria-label')?.includes('Comment'))) {
    return true;
  }

  // Check for Jira/Confluence editor
  if (element.classList.contains('ProseMirror') ||
      element.classList.contains('ak-editor-content-area')) {
    return true;
  }

  // Check for Monaco editor (VS Code web, GitHub web editor)
  if (element.classList.contains('monaco-editor') ||
      element.classList.contains('react-monaco-editor-container')) {
    return true;
  }

  // Check for generic rich text editors
  if (element.classList.contains('ql-editor') || // Quill
      element.classList.contains('tox-edit-area') || // TinyMCE
      element.classList.contains('jodit-wysiwyg') || // Jodit
      element.classList.contains('fr-element') || // Froala
      element.classList.contains('cke_editable') || // CKEditor
      element.classList.contains('trumbowyg-editor')) { // Trumbowyg
    return true;
  }

  // Check for any element with role="textbox"
  if (element.getAttribute('role') === 'textbox') {
    return true;
  }

  return false;
}

// Helper function to get element's text content
function getElementText(element) {
  if (!element) return '';

  try {
    if (element.tagName === 'TEXTAREA' || 
        (element.tagName === 'INPUT' && element.type === 'text')) {
      return element.value;
    } else if (element.getAttribute('contenteditable') === 'true') {
      return element.textContent;
    } else {
      return element.value || element.textContent || element.innerText || '';
    }
  } catch (error) {
    console.error('Error getting element text:', error);
    return '';
  }
}

// Helper function to set element's text content
function setElementText(element, text) {
  if (!element) return;

  try {
    if (element.tagName === 'TEXTAREA' || 
        (element.tagName === 'INPUT' && element.type === 'text')) {
      element.value = text;
    } else if (element.getAttribute('contenteditable') === 'true') {
      element.textContent = text;
    } else {
      // Try multiple approaches to set text
      if ('value' in element) {
        element.value = text;
      } else if ('textContent' in element) {
        element.textContent = text;
      } else {
        element.innerText = text;
      }
    }

    // Trigger multiple events to ensure change is registered
    const events = ['input', 'change', 'keyup'];
    events.forEach(eventType => {
      element.dispatchEvent(new Event(eventType, { bubbles: true }));
    });
  } catch (error) {
    console.error('Error setting element text:', error);
  }
}

// Handle text area input with error handling
const handleInput = debounce(async ({ target }) => {
  // Skip if we're applying a suggestion or if suggestions are disabled
  if (isApplyingSuggestion || !settings.enabled) return;
  
  const text = getElementText(target);
  
  // Check character count
  if (text.length < 20) {
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
    suggestionContainer.textContent = '';
    suggestionContainer.appendChild(createLoadingElement());
    
    // Position container below textarea
    const rect = target.getBoundingClientRect();
    suggestionContainer.style.top = `${rect.bottom + window.scrollY + 5}px`;
    suggestionContainer.style.left = `${rect.left + window.scrollX}px`;
    
    // Get suggestions using the local function
    const suggestions = await getSuggestions(text);

    console.log('suggestions', suggestions);
    
    // Handle string response (usually error message)
    if (typeof suggestions === 'string') {
      updateIndicatorState(target, 'error', suggestions);
      suggestionContainer.textContent = '';
      suggestionContainer.appendChild(createErrorElement(suggestions));
      return;
    }
    
    // Update suggestion container with results
    if (suggestions && suggestions.length > 0) {
      updateIndicatorState(target, 'success', TOOLTIPS.success);
      updateSuggestionContainer(suggestionContainer, suggestions, target);
    } else {
      updateIndicatorState(target, 'error', TOOLTIPS.error.noSuggestions);
      suggestionContainer.textContent = '';
      suggestionContainer.appendChild(createErrorElement('No suggestions available'));
    }
    
  } catch (error) {
    console.error('Error getting suggestions:', error);
    updateIndicatorState(target, 'error', TOOLTIPS.error.general);
    if (target.suggestionContainer) {
      suggestionContainer.textContent = '';
      suggestionContainer.appendChild(createErrorElement('Error getting suggestions'));
    }
  }
}, 1000); 