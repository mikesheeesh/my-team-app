const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Αυτό αναγκάζει το Expo να χρησιμοποιεί τα σωστά αρχεία συστήματος για το Firebase
config.resolver.sourceExts.push('cjs');

module.exports = config;