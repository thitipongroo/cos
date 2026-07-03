// Expo SDK 56 Babel config.
// - babel-preset-expo bundles the expo-router transform (SDK 50+), so no separate plugin is needed.
// - @babel/plugin-proposal-decorators (legacy) is required by WatermelonDB models, which use
//   `@field`/`@text`/`@writer` decorators (see src/db/models/*). Without it the models fail to compile.
// - babel-preset-expo 56 defaults class fields to `useDefineForClassFields` ([[Define]] semantics),
//   which overwrites the getter/setter that WatermelonDB's `@field name!: type` legacy decorators
//   install → "Definitely assigned fields cannot be initialized here". Forcing loose ([[Set]]) class
//   properties restores the SDK-51 behavior so the models bundle.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['@babel/plugin-proposal-decorators', { version: 'legacy' }],
      ['@babel/plugin-transform-class-properties', { loose: true }],
      ['@babel/plugin-transform-private-methods', { loose: true }],
      ['@babel/plugin-transform-private-property-in-object', { loose: true }],
    ],
  };
};
