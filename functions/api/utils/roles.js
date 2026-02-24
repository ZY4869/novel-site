// 角色层级：super_admin > admin > demo（editor 是 admin 的旧名，兼容）
export const ROLE_LEVEL = { super_admin: 3, admin: 2, editor: 2, demo: 1 };

export function requireSuperAdmin(auth) {
  return auth.role === 'super_admin';
}

export function requireMinRole(auth, minRole) {
  return (ROLE_LEVEL[auth.role] || 0) >= (ROLE_LEVEL[minRole] || 99);
}

