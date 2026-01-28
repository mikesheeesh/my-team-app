// metro.config.js
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Αυτό χρειάζεται για να μην κρασάρει το Firebase στο Web
config.resolver.sourceExts.push("cjs");

module.exports = config;
