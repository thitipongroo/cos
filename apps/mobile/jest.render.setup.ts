// Undo the logic project's react-native stub for this project.
//
// src/__mocks__/react-native.ts is a 22-line stub (I18nManager / Platform / AppState) written for
// the logic suites. Jest applies a `__mocks__` file naming a NODE MODULE automatically — no
// jest.mock() call and no moduleNameMapper entry needed — for every such directory under `roots`,
// so this project inherited it and the first component to touch StyleSheet.create got `undefined`.
// A moduleNameMapper entry pointing at the real package does not win against it; only unmocking does.
jest.unmock('react-native');
