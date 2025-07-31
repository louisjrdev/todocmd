#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

console.log('Creating proper icon files...');

// Create a proper 32x32 PNG icon data
const createPngIcon = () => {
  // PNG signature + minimal 32x32 RGBA image
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrSize = Buffer.from([0x00, 0x00, 0x00, 0x0D]);
  const ihdrType = Buffer.from('IHDR');
  const width = Buffer.from([0x00, 0x00, 0x00, 0x20]); // 32px
  const height = Buffer.from([0x00, 0x00, 0x00, 0x20]); // 32px
  const bitDepth = Buffer.from([0x08]); // 8 bits
  const colorType = Buffer.from([0x06]); // RGBA
  const compression = Buffer.from([0x00]);
  const filter = Buffer.from([0x00]);
  const interlace = Buffer.from([0x00]);
  
  // Calculate CRC for IHDR
  const ihdrData = Buffer.concat([ihdrType, width, height, bitDepth, colorType, compression, filter, interlace]);
  const ihdrCrc = Buffer.from([0x5C, 0x72, 0xA8, 0x66]); // Pre-calculated CRC
  
  // Minimal IDAT chunk with compressed data
  const idatSize = Buffer.from([0x00, 0x00, 0x00, 0x18]);
  const idatType = Buffer.from('IDAT');
  const idatData = Buffer.from([0x78, 0xDA, 0xED, 0xC1, 0x01, 0x0D, 0x00, 0x00, 0x00, 0xC2, 0xA0, 0xF7, 0x4F, 0x6D, 0x0E, 0x37, 0xA0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const idatCrc = Buffer.from([0xBE, 0x0D, 0x21, 0x00]);
  
  // IEND chunk
  const iendSize = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  const iendType = Buffer.from('IEND');
  const iendCrc = Buffer.from([0xAE, 0x42, 0x60, 0x82]);
  
  return Buffer.concat([
    pngSignature, ihdrSize, ihdrData, ihdrCrc,
    idatSize, idatType, idatData, idatCrc,
    iendSize, iendType, iendCrc
  ]);
};

// Create a proper ICO file
const createIcoIcon = () => {
  // ICO file header
  const reserved = Buffer.from([0x00, 0x00]); // Reserved
  const type = Buffer.from([0x01, 0x00]); // ICO type
  const count = Buffer.from([0x01, 0x00]); // Number of images
  
  // Image directory entry
  const width = Buffer.from([0x20]); // 32px (0 means 256)
  const height = Buffer.from([0x20]); // 32px (0 means 256)
  const colors = Buffer.from([0x00]); // 0 for true color
  const reserved2 = Buffer.from([0x00]);
  const planes = Buffer.from([0x01, 0x00]); // Color planes
  const bpp = Buffer.from([0x20, 0x00]); // Bits per pixel
  const size = Buffer.from([0x30, 0x04, 0x00, 0x00]); // Image size (1072 bytes)
  const offset = Buffer.from([0x16, 0x00, 0x00, 0x00]); // Offset to image data (22 bytes)
  
  // Bitmap info header
  const biSize = Buffer.from([0x28, 0x00, 0x00, 0x00]); // Header size (40 bytes)
  const biWidth = Buffer.from([0x20, 0x00, 0x00, 0x00]); // Width (32)
  const biHeight = Buffer.from([0x40, 0x00, 0x00, 0x00]); // Height (64 = 32*2 for bitmap)
  const biPlanes = Buffer.from([0x01, 0x00]); // Planes
  const biBitCount = Buffer.from([0x20, 0x00]); // Bits per pixel
  const biCompression = Buffer.from([0x00, 0x00, 0x00, 0x00]); // No compression
  const biSizeImage = Buffer.from([0x00, 0x04, 0x00, 0x00]); // Image size (1024 bytes)
  const biXPelsPerMeter = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  const biYPelsPerMeter = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  const biClrUsed = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  const biClrImportant = Buffer.from([0x00, 0x00, 0x00, 0x00]);
  
  // Create 32x32 BGRA pixel data (all transparent)
  const pixelData = Buffer.alloc(32 * 32 * 4, 0x00);
  
  // AND mask (32x32 bits = 128 bytes, all 0xFF for transparent)
  const andMask = Buffer.alloc(128, 0xFF);
  
  return Buffer.concat([
    reserved, type, count,
    width, height, colors, reserved2, planes, bpp, size, offset,
    biSize, biWidth, biHeight, biPlanes, biBitCount, biCompression,
    biSizeImage, biXPelsPerMeter, biYPelsPerMeter, biClrUsed, biClrImportant,
    pixelData, andMask
  ]);
};

// Create a proper ICNS file (macOS icon)
const createIcnsIcon = () => {
  // ICNS file header
  const signature = Buffer.from('icns'); // File signature
  const fileSize = Buffer.from([0x00, 0x00, 0x00, 0x18]); // File size (24 bytes minimum)
  
  // Icon element (ic04 = 16x16 icon)
  const iconType = Buffer.from('ic04'); // 16x16 icon type
  const iconSize = Buffer.from([0x00, 0x00, 0x00, 0x10]); // Element size (16 bytes)
  const iconData = Buffer.alloc(8, 0x00); // Minimal icon data
  
  return Buffer.concat([signature, fileSize, iconType, iconSize, iconData]);
};

// Write the icon files
fs.writeFileSync(path.join(assetsDir, 'icon.png'), createPngIcon());
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), createIcoIcon());
fs.writeFileSync(path.join(assetsDir, 'icon.icns'), createIcnsIcon());

console.log('✅ Created proper icon files:');
console.log('  - icon.png (32x32 PNG)');
console.log('  - icon.ico (Windows ICO format)');
console.log('  - icon.icns (macOS ICNS format)');
console.log('');
console.log('NOTE: These are minimal placeholder icons. For production,');
console.log('replace with high-quality icons designed for your app.');
