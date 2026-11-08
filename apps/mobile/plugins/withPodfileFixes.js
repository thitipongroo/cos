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
//    NOTE (2026-11-02): fixes 1–3 were written for react-native 0.74. On 0.85 the React core prebuilt is
//    chosen by RCT_USE_PREBUILT_RNCORE (Podfile, from `ios.buildReactNativeFromSource`), not by this
//    property, so (3) alone no longer prevents that link error. The fix on 0.85 is app.json
//    `expo-build-properties` → `ios.buildReactNativeFromSource: true`, which prebuild writes into
//    Podfile.properties.json; (3) stays because it still governs Expo's own precompiled modules.
// 4. Raise every pod's iOS deployment target to the app's own minimum (2026-11-02). Xcode 27 refuses a
//    target below 15.0 and some pods still declare one (RNSVG-RNSVGFilters: 12.4), which fails the whole
//    build. The app cannot run on an older iOS anyway, so raising them loses nothing.
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withDangerousMod } = require('@expo/config-plugins');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

/** Marker for fix (4) — also the comment line in ios/Podfile, so a re-run never inserts the block twice. */
const RAISE_TARGETS_MARKER = '# @cos raise-pod-deployment-targets';

const RAISE_TARGETS_BLOCK = `
    ${RAISE_TARGETS_MARKER} (plugins/withPodfileFixes.js — keep the two in step)
    # Xcode 27 refuses an iOS deployment target below 15.0, and some pods still declare an older one
    # (RNSVG-RNSVGFilters: 12.4), which fails the whole build. Raise every pod below the app's own minimum
    # to that minimum: the app cannot run on an older iOS anyway, so nothing is lost.
    app_min_ios = podfile_properties['ios.deploymentTarget'] || '16.4'
    installer.pods_project.targets.each do |pod_target|
      pod_target.build_configurations.each do |build_config|
        target_ios = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if target_ios && Gem::Version.new(target_ios) < Gem::Version.new(app_min_ios)
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = app_min_ios
        end
      end
    end`;

/**
 * Fix (4): append the deployment-target raise to the generated post_install, right after
 * `react_native_post_install(...)`. Idempotent. Throws when the anchor is missing, so a template change
 * fails prebuild loudly instead of producing a Podfile that silently lacks the fix.
 */
function raisePodDeploymentTargets(contents) {
  if (contents.includes(RAISE_TARGETS_MARKER)) return contents;
  const anchor = /(\n    react_native_post_install\([\s\S]*?\n    \)\n)/;
  if (!anchor.test(contents)) {
    throw new Error('withPodfileFixes: react_native_post_install(...) not found in ios/Podfile');
  }
  return contents.replace(anchor, `$1${RAISE_TARGETS_BLOCK}\n`);
}

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

      // (4) raise pods' iOS deployment targets to the app minimum (Xcode 27)
      contents = raisePodDeploymentTargets(contents);

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

module.exports.raisePodDeploymentTargets = raisePodDeploymentTargets;
