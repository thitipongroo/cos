// Expo config plugin — makes the WatermelonDB Android JSI registration DURABLE on every
// `expo prebuild` (which regenerates android/app/.../MainApplication.kt from scratch).
//
// The @morrowdigital/watermelondb-expo-plugin injects the legacy
// `getJSIModulePackage(): JSIModulePackage` wiring into MainApplication, but React Native 0.85
// removed `com.facebook.react.bridge.JSIModulePackage` (the old bridge JSI mechanism), so that
// injected code fails to compile ("Unresolved reference 'JSIModulePackage'"). WatermelonDBJSIPackage
// is a plain ReactPackage whose native module installs the JSI bindings, so we register it in the
// React package list instead — the RN-0.85-compatible path (ADR-046).
//
// MUST be listed AFTER '@morrowdigital/watermelondb-expo-plugin' in app.json `plugins` so this mod
// runs after @morrowdigital's MainApplication injection and repairs it.
//
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withMainApplication } = require('@expo/config-plugins');

module.exports = function withWatermelonAndroidJSIFix(config) {
  return withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;

    // (1) Remove the broken JSIModulePackage import (class removed in RN 0.85).
    src = src.replace(
      /^[ \t]*import com\.facebook\.react\.bridge\.JSIModulePackage;?[ \t]*\n/gm,
      '',
    );

    // (2) Normalize / ensure the WatermelonDBJSIPackage import (Kotlin style, no semicolon).
    src = src.replace(
      /import com\.nozbe\.watermelondb\.jsi\.WatermelonDBJSIPackage;/g,
      'import com.nozbe.watermelondb.jsi.WatermelonDBJSIPackage',
    );
    if (!src.includes('import com.nozbe.watermelondb.jsi.WatermelonDBJSIPackage')) {
      src = src.replace(
        /^(package .+\n)/m,
        '$1\nimport com.nozbe.watermelondb.jsi.WatermelonDBJSIPackage\n',
      );
    }

    // (3) Register WatermelonDBJSIPackage() in the RN package list (idempotent).
    if (!src.includes('add(WatermelonDBJSIPackage())')) {
      src = src.replace(
        /(PackageList\(this\)\.packages\.apply\s*\{)/,
        '$1\n          add(WatermelonDBJSIPackage())',
      );
    }

    cfg.modResults.contents = src;
    return cfg;
  });
};
