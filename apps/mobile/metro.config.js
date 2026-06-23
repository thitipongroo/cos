// Metro config — Expo default. Required so Metro resolves the project from this package root
// (and picks up expo-router + the monorepo). Extend here only if custom resolver options are needed.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

module.exports = config;
