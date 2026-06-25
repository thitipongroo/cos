// Expo config plugin — makes the two required Podfile edits DURABLE (re-applied on every
// `expo prebuild`, which regenerates ios/Podfile from scratch). Registered in app.json `plugins`.
//
// 1. Remove `:privacy_file_aggregation_enabled` — this use_react_native! option only exists in
//    react-native >= 0.74.3, but this app pins 0.74.0, so CocoaPods errors "unknown keyword". (Drop
//    this fix once react-native is bumped to >= 0.74.3 / 0.74.5.)
// 2. Add `pod 'React-jsinspector', :modular_headers => true` — ExpoModulesCore (Swift, static lib)
//    imports React-jsinspector, which ships no module map by default; without this, pod install fails
//    "does not define modules". The :path matches the autolinked source to avoid a duplicate-source error.
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
      return cfg;
    },
  ]);
};
