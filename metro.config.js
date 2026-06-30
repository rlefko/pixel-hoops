// Metro configuration for Pixel Hoops.
// This is the standard Expo default, made explicit so the resolver and
// transformer have a clear place to be customized later.
// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
