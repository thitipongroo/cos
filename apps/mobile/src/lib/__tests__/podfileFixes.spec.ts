// plugins/withPodfileFixes.js fix (4) — raise every pod's iOS deployment target to the app minimum, so Xcode 27
// (which refuses a target below 15.0) can build pods that still declare 12.4. The plugin re-applies it on every
// `expo prebuild`; ios/Podfile carries the same block today. These keep the two in step.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { raisePodDeploymentTargets } = require('../../../plugins/withPodfileFixes') as {
  raisePodDeploymentTargets: (podfile: string) => string;
};

const PODFILE = readFileSync(join(__dirname, '../../../ios/Podfile'), 'utf8');
const MARKER = '# @cos raise-pod-deployment-targets';

/** ios/Podfile as `expo prebuild` generates it — the committed one with fix (4) taken back out. */
const generated = PODFILE.replace(
  /\n\n {4}# @cos raise-pod-deployment-targets[\s\S]*?\n {4}end\n {2}end/,
  '\n  end',
);

describe('withPodfileFixes — raise pod deployment targets (Xcode 27)', () => {
  it('the committed Podfile carries the block', () => {
    expect(PODFILE).toContain(MARKER);
    expect(PODFILE).toContain('Gem::Version.new(target_ios) < Gem::Version.new(app_min_ios)');
  });

  it('re-applied to a freshly generated Podfile, produces exactly the committed one', () => {
    expect(generated).not.toContain(MARKER);
    expect(raisePodDeploymentTargets(generated)).toBe(PODFILE);
  });

  it('places it inside post_install, after react_native_post_install(...)', () => {
    const out = raisePodDeploymentTargets(generated);
    const post = out.indexOf('react_native_post_install(');
    expect(post).toBeGreaterThan(out.indexOf('post_install do |installer|'));
    expect(out.indexOf(MARKER)).toBeGreaterThan(post);
  });

  it('is idempotent', () => {
    expect(raisePodDeploymentTargets(PODFILE)).toBe(PODFILE);
  });

  it('fails loudly when the template no longer has the anchor', () => {
    expect(() => raisePodDeploymentTargets('platform :ios, "16.4"\n')).toThrow(
      'react_native_post_install(...) not found',
    );
  });
});
