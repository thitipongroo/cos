// Expo config plugin — makes the two required Podfile edits DURABLE (re-applied on every
// `expo prebuild`, which regenerates ios/Podfile from scratch). Registered in app.json `plugins`.
//
// 1. Remove `:privacy_file_aggregation_enabled` — this use_react_native! option only exists in
//    react-native >= 0.74.3, but this app pins 0.74.0, so CocoaPods errors "unknown keyword". (Drop
//    this fix once react-native is bumped to >= 0.74.3 / 0.74.5.)
// 2. Add `pod 'React-jsinspector', :modular_headers => true` — ExpoModulesCore (Swift, static lib)
//    imports React-jsinspector, which ships no module map by default; without this, pod install fails
//    "does not define modules". The :path matches the autolinked source to avoid a duplicate-source error.
// 3. Force EXPO_USE_PRECOMPILED_MODULES=false in Podfile.properties.json — prebuild regenerates that
//    file with the default "true", which ships React core as a Release-compiled prebuilt xcframework
//    (React-Core-prebuilt/React.xcframework). New-arch third-party libs (react-native-svg,
//    react-native-gesture-handler, react-native-reanimated) build from source and, in a Debug build,
//    reference React-Fabric debug symbols (ShadowNode::getDebugName/getDebugValue/getDebugChildren,
//    Sealable) that the Release prebuilt omits → "Undefined symbols … linker command failed". Building
//    React from source keeps the debug flags consistent so Debug links. (Release already links either way.)
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withDangerousMod } = require('@expo/config-plugins');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

module.exports = function withPodfileFixes(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      // (1) strip the RN-0.74.3+ option unsupported by RN 0.74.0
      contents = contents.replace(
        /\n\s*:privacy_file_aggregation_enabled => podfile_properties\['apple\.privacyManifestAggregationEnabled'\] != 'false',/,
        '',
      );

      // (2) generate a module map for React-jsinspector (idempotent)
      if (!contents.includes("pod 'React-jsinspector'")) {
        contents = contents.replace(
          /(\n  config = use_native_modules!\n)/,
          `$1\n  pod 'React-jsinspector', :path => "#{config[:reactNativePath]}/ReactCommon/jsinspector-modern", :modular_headers => true\n`,
        );
      }

      fs.writeFileSync(podfilePath, contents);

      // (3) build React Native from source (not the Release prebuilt) so Debug links — see header.
      const propsPath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile.properties.json');
      // Read first and handle ENOENT, rather than existsSync-then-read: between those two calls the
      // file can disappear, and the read then throws from inside a config plugin, where a missing
      // file surfaces as what looks like an Expo bug. CodeQL js/file-system-race.
      let raw = null;
      try {
        raw = fs.readFileSync(propsPath, 'utf8');
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      if (raw !== null) {
        const props = JSON.parse(raw);
        props['EXPO_USE_PRECOMPILED_MODULES'] = 'false';
        fs.writeFileSync(propsPath, `${JSON.stringify(props, null, 2)}\n`);
      }

      return cfg;
    },
  ]);
};
