const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
  const sizes = [48, 96];
  const svgBuffer = fs.readFileSync(path.join(__dirname, 'icon.svg'));

  for (const size of sizes) {
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(path.join(__dirname, `icon-${size}.png`));
    
    console.log(`Generated ${size}x${size} icon`);
  }
}

generateIcons().catch(console.error); 