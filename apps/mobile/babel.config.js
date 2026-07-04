// Expo SDK 56 Babel config.
// babel-preset-expo bundles the expo-router transform (SDK 50+), so no extra plugins are needed.
// History: this file previously forced legacy decorators + loose ([[Set]]) class properties for
// WatermelonDB's model decorators. That loose transform was also what turned React Native's
// Event.js instance-field annotations into `this.NONE = void 0` assignments (facebook/react-native
// #54732 — see patches/react-native@0.85.3.patch). WatermelonDB was replaced by Drizzle/expo-sqlite
// (spec §17.10, 2026-07-04), so the workarounds are gone and defaults apply again.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
