#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Core file mappings - source to destination
const coreFileMap = {
  // Core shared constants and utilities
  'core/core.js': [
    'frontend/core/core.js',
    'backend/src/core/core.js'
  ],
  // Environment configuration - shared across frontend and backend
  'core/environments.js': [
    'frontend/core/environments.js',
    'backend/src/core/environments.js'
  ],
  // Text files - universal across all games
  'core/text.js': [
    'frontend/core/text.js',
    'backend/src/core/text.js'
  ],
  // BlackJack game logic - placed directly in game folders
  'core/games/blackjack/blackjackCore.js': [
    'frontend/games/blackjack/blackjackCore.js',
    'backend/src/games/blackjack/blackjackCore.js'
  ]
};

// Ensure directory exists
function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Copy file with content modifications based on target
function copyFile(source, destination) {
  const sourceContent = fs.readFileSync(source, 'utf8');
  let destinationContent = sourceContent;
  
  // Modify exports based on target directory
  if (destination.includes('frontend/')) {
    // For frontend, keep only ES6 exports
    if (sourceContent.includes('// CommonJS export for backend')) {
      destinationContent = sourceContent
        .replace(/\/\/ CommonJS export for backend[\s\S]*?module\.exports = \{ text \};/g, '')
        .trim();
    }
  } else if (destination.includes('backend/')) {
    // For backend, keep only CommonJS exports
    if (sourceContent.includes('// ES6 export for frontend')) {
      destinationContent = sourceContent
        .replace(/\/\/ ES6 export for frontend[\s\S]*?export \{ text \};/g, '')
        .replace(/\/\/ CommonJS export for backend\s*/g, '')
        .trim();
    }
  }
  
  ensureDir(destination);
  fs.writeFileSync(destination, destinationContent);
  console.log(`✓ Copied ${source} → ${destination}`);
}

// Main sync function
function syncCoreFiles() {
  console.log('🔄 Syncing core files...');
  
  Object.entries(coreFileMap).forEach(([source, destinations]) => {
    if (!fs.existsSync(source)) {
      console.warn(`⚠️  Source file not found: ${source}`);
      return;
    }
    
    destinations.forEach(destination => {
      copyFile(source, destination);
    });
  });
  
  console.log('✅ Core files synced successfully!');
}

// Run sync
syncCoreFiles();