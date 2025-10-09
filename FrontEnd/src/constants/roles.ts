export const ROLE_MAP: Record<number, string> = {
  1: "Agent",
  2: "Manager",
  3: "Admin",
  4: "Super Admin",
};

export const ROLE_PERMISSIONS = {
  Agent: {
    canView: true,
    canAssign: false,
    canExport: false,
    canDelete: false,
    scope: "you",
  },
  Manager: {
    canView: true,
    canAssign: true,
    canExport: false,
    canDelete: false,
    scope: "team",
  },
  Admin: {
    canView: true,
    canAssign: true,
    canExport: true,
    canDelete: true,
    scope: "all",
  },
  "Super Admin": {
    canView: true,
    canAssign: true,
    canExport: true,
    canDelete: true,
    scope: "all",
  },
};
