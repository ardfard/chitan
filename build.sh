#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo "Starting Firefox extension packaging..."

# Check if zip is installed
if ! command -v zip &> /dev/null; then
    echo -e "${RED}Error: zip is not installed. Please install zip first.${NC}"
    exit 1
fi

# Create a temporary directory for building
BUILD_DIR="build"
DIST_DIR="dist"
EXT_NAME="chitan"

# Clean up previous builds
if [ -d "$BUILD_DIR" ]; then
    rm -rf "$BUILD_DIR"
fi
if [ -d "$DIST_DIR" ]; then
    rm -rf "$DIST_DIR"
fi

# Create directories
mkdir -p "$BUILD_DIR"
mkdir -p "$BUILD_DIR/scripts"
mkdir -p "$BUILD_DIR/styles"
mkdir -p "$BUILD_DIR/icons"
mkdir -p "$BUILD_DIR/popup"
mkdir -p "$BUILD_DIR/settings"
mkdir -p "$DIST_DIR"

# Copy necessary files
echo "Copying files..."
# Main files
cp manifest.json "$BUILD_DIR/"

# Scripts
cp scripts/background.js "$BUILD_DIR/scripts/"
cp scripts/content.js "$BUILD_DIR/scripts/"

# Styles
cp styles/content.css "$BUILD_DIR/styles/"

# Icons
cp icons/icon-48.png "$BUILD_DIR/icons/"
cp icons/icon-96.png "$BUILD_DIR/icons/"

# Popup
if [ -d "popup" ]; then
    cp popup/popup.html "$BUILD_DIR/popup/"
    if [ -f "popup/popup.js" ]; then
        cp popup/popup.js "$BUILD_DIR/popup/"
    fi
    if [ -f "popup/popup.css" ]; then
        cp popup/popup.css "$BUILD_DIR/popup/"
    fi
fi

# Settings
if [ -d "settings" ]; then
    cp settings/settings.html "$BUILD_DIR/settings/"
    if [ -f "settings/settings.js" ]; then
        cp settings/settings.js "$BUILD_DIR/settings/"
    fi
    if [ -f "settings/settings.css" ]; then
        cp settings/settings.css "$BUILD_DIR/settings/"
    fi
fi

# Navigate to build directory
cd "$BUILD_DIR" || exit

# List all files being included
echo "Files being packaged:"
find . -type f

# Create the XPI file with specific zip options
echo "Creating XPI package..."
zip -r -9 -X "../$DIST_DIR/$EXT_NAME.xpi" * -x ".*" -x "__MACOSX" -x "*.DS_Store"

# Check if zip was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}Successfully created $EXT_NAME.xpi in the dist directory${NC}"
    # Get the size of the XPI file
    SIZE=$(du -h "../$DIST_DIR/$EXT_NAME.xpi" | cut -f1)
    echo "Package size: $SIZE"
    
    # Verify the zip file
    echo "Verifying XPI package..."
    if unzip -t "../$DIST_DIR/$EXT_NAME.xpi" > /dev/null; then
        echo -e "${GREEN}XPI package verified successfully${NC}"
        # List contents of the XPI
        echo "XPI contents:"
        unzip -l "../$DIST_DIR/$EXT_NAME.xpi"
    else
        echo -e "${RED}XPI package verification failed${NC}"
        exit 1
    fi
else
    echo -e "${RED}Failed to create XPI package${NC}"
    exit 1
fi

# Clean up build directory
cd ..
rm -rf "$BUILD_DIR"

echo -e "${GREEN}Build complete!${NC}" 