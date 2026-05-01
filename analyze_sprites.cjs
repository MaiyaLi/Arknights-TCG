const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');

async function analyze(file) {
    const img = await loadImage(file);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    
    let minX = img.width, minY = img.height, maxX = 0, maxY = 0;
    
    for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
            const alpha = data[(y * img.width + x) * 4 + 3];
            if (alpha > 10) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    
    console.log(`${file}:`);
    console.log(`  Size: ${img.width}x${img.height}`);
    console.log(`  Content Bounds: X[${minX}...${maxX}], Y[${minY}...${maxY}]`);
    console.log(`  Content Width: ${maxX - minX}, Content Height: ${maxY - minY}`);
    console.log(`  Padding Top: ${minY}, Padding Bottom: ${img.height - maxY}`);
}

async function run() {
    await analyze('Characters/Sprite/Guard/Amiya Guard Front.png');
    await analyze('Characters/Sprite/Guard/Sarkaz Mercenary Front.png');
}

run();
