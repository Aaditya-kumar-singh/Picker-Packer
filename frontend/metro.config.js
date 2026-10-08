const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add WASM support for expo-sqlite on web
config.resolver.sourceExts.push('wasm');
config.resolver.assetExts.push('wasm');

module.exports = config;
