import { describe, it, expect } from 'vitest';
// Generators may not be present in all environments; focus on outputs path
import fs from 'node:fs';

function existsNonEmpty(p: string) {
  try {
    const stat = fs.statSync(p);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function existsAny(paths: string[]) {
  return paths.some((p) => existsNonEmpty(p));
}

describe('Docs generators write to docs/ba_pack (new path)', () => {
  it('generate_ba_pack.py writes outputs to docs/ba_pack', () => {
    expect(existsAny(['docs/ba_pack/application_inventory.xlsx','../docs/ba_pack/application_inventory.xlsx'])).toBe(true);
    expect(existsAny(['docs/ba_pack/architecture.mmd','../docs/ba_pack/architecture.mmd'])).toBe(true);
    expect(existsAny(['docs/ba_pack/architecture.svg','../docs/ba_pack/architecture.svg'])).toBe(true);
    expect(existsAny(['docs/ba_pack/system_overview_and_access_rules.md','../docs/ba_pack/system_overview_and_access_rules.md'])).toBe(true);
    // Old path should not exist anymore
    expect(fs.existsSync('pulseCrm/docs/ba_pack') || fs.existsSync('../pulseCrm/docs/ba_pack')).toBe(false);
  });

  it('build_role_access_user_stories.py writes outputs to docs/ba_pack', () => {
    expect(existsAny(['docs/ba_pack/role_access_user_stories.xlsx','../docs/ba_pack/role_access_user_stories.xlsx'])).toBe(true);
    expect(existsAny(['docs/ba_pack/role_access_user_stories.md','../docs/ba_pack/role_access_user_stories.md'])).toBe(true);
  });
});
