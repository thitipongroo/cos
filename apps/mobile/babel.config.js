// Expo SDK 51 Babel config.
// - babel-preset-expo bundles the expo-router transform (SDK 50+), so no separate plugin is needed.
// - @babel/plugin-proposal-decorators (legacy) is required by WatermelonDB models, which use
//   `@field`/`@text`/`@writer` decorators (see src/db/models/*). Without it the models fail to compile.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['@babel/plugin-proposal-decorators', { version: 'legacy' }]],
  };
};
