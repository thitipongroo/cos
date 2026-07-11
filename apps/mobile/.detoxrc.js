/** @type {Detox.DetoxConfig} */
module.exports = {
  logger: {
    level: process.env['CI'] ? 'debug' : 'info',
  },
  testRunner: {
    args: {
      $0: 'jest',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    'ios.release': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Release-iphonesimulator/COS.app',
      build:
        'xcodebuild -workspace ios/COS.xcworkspace -scheme COS -configuration Release -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.release': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      // assembleAndroidTest emits the instrumentation APK as the debug variant here (the
      // -DtestBuildType=release flag is not honored by this Expo/AGP setup), so point Detox at it
      // explicitly — a debug test-runner APK drives a release app fine.
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build: 'cd android && ./gradlew assembleRelease assembleAndroidTest -DtestBuildType=release',
    },
    'android.debug': {
      // Detox's instrumentation runtime is proguard-stripped from the release APK, so its
      // "ready" WebSocket handshake never completes against android.release. The debug app variant
      // keeps Detox intact — used for the deep-link screen capture (capture-android.spec.ts).
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 17',
      },
    },
    emulator: {
      type: 'android.emulator',
      device: {
        avdName: 'cos_test',
      },
    },
  },
  configurations: {
    'ios.sim.release': {
      device: 'simulator',
      app: 'ios.release',
    },
    'android.emu.release': {
      device: 'emulator',
      app: 'android.release',
    },
    'android.emu.debug': {
      device: 'emulator',
      app: 'android.debug',
    },
  },
};
