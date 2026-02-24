import { describe, expect, it } from 'vitest';

import { requireMinRole, requireSuperAdmin } from '../functions/api/utils/roles.js';

describe('functions/api/utils/roles.js', () => {
  it('requireSuperAdmin', () => {
    expect(requireSuperAdmin({ role: 'super_admin' })).toBe(true);
    expect(requireSuperAdmin({ role: 'admin' })).toBe(false);
    expect(requireSuperAdmin({ role: 'demo' })).toBe(false);
  });

  it('requireMinRole', () => {
    expect(requireMinRole({ role: 'super_admin' }, 'admin')).toBe(true);
    expect(requireMinRole({ role: 'admin' }, 'demo')).toBe(true);
    expect(requireMinRole({ role: 'demo' }, 'admin')).toBe(false);
    expect(requireMinRole({ role: 'editor' }, 'admin')).toBe(true);
    expect(requireMinRole({ role: 'unknown' }, 'demo')).toBe(false);
    expect(requireMinRole({ role: 'admin' }, 'unknown')).toBe(false);
  });
});

