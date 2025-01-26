# LLM Writing Assistant Firefox Extension

A Firefox extension that provides real-time writing suggestions using various Language Models (LLMs) like OpenAI GPT, Anthropic Claude, LLaMA, and DeepSeek.

## Features

- Real-time grammar, style, and structure suggestions
- Support for multiple LLM providers
- Customizable suggestion types
- Works with any text area or text input field
- Privacy-focused (your API key is stored locally)

## Installation

1. Download or clone this repository
2. Open Firefox and go to `about:debugging`
3. Click "This Firefox" in the left sidebar
4. Click "Load Temporary Add-on"
5. Navigate to the extension directory and select the `manifest.json` file

## Configuration

1. Click the extension icon in the toolbar
2. Select your preferred LLM provider
3. Enter your API key for the selected provider
4. Choose which types of suggestions you want to receive
5. Click "Save Settings" and "Enable Assistant"

## Usage

1. Enable the extension by clicking its icon and toggling the "Enable Assistant" button
2. Start typing in any text area or text input field
3. After you stop typing for a moment, suggestions will appear below the text field
4. The suggestions will update as you continue typing

## Supported LLM Providers

- OpenAI GPT (default)
- Anthropic Claude
- LLaMA
- DeepSeek

Note: You need to provide your own API key for the LLM service you want to use.

## Privacy

This extension:
- Stores your API key locally in your browser
- Only sends text to the LLM provider when you're actively typing
- Does not collect or store any of your data
- Does not send data to any third parties other than your chosen LLM provider

## Development

The extension is built using standard web technologies:
- JavaScript
- HTML
- CSS
- Firefox WebExtensions API

To modify the extension:
1. Make your changes to the source code
2. Reload the extension in `about:debugging`
3. Test your changes

## License

MIT License - Feel free to modify and distribute this extension as needed. 