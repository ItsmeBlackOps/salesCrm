/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "./useAuth";

// your canonical component list
const COMPONENTS = [
  { id: 'dashboard', name: 'Dashboard' },
  { id: 'analytics', name: 'Analytics' },
  { id: 'contacts',  name: 'Contacts'  },
  { id: 'deals',     name: 'Deals'     },
  { id: 'leads',     name: 'Leads'     },
  { id: 'reports',   name: 'Reports'   },
  { id: 'reportdetails',   name: 'Report Details'   },
  { id: 'settings',  name: 'Settings'  },
  {id: 'roleaccess', name: "Role Access"},
  { id: 'usermanagement', name: 'User Mgmt' }
];

interface RoleAccessContextType {
  roleAccess: Record<string, boolean>;
  refreshRoleAccess: () => Promise<void>;
}

const RoleAccessContext = createContext<RoleAccessContextType | undefined>(undefined);

export function RoleAccessProvider({ children }: { children: React.ReactNode }) {
  const { fetchWithAuth, user } = useAuth();
  const [roleAccess, setRoleAccess] = useState<Record<string, boolean>>({});
  const API = import.meta.env.VITE_API_BASE_URL;

  const loadAccess = async () => {
    if (!user) {
      // no user = no access
      setRoleAccess(COMPONENTS.reduce((acc, c) => {
        acc[c.id] = false;
        return acc;
      }, {} as Record<string, boolean>));
      return;
    }

    const res = await fetchWithAuth(`${API}/role-access`);
    if (!res.ok) {
      console.error("Failed to fetch role-access", res.status);
      return;
    }
    const data: Record<string, Record<string, boolean>> = await res.json();
    const key = String(user.roleid);

    // Build an explicit map of every component → allowed?
    const access = COMPONENTS.reduce((acc, { id }) => {
      acc[id] = Boolean(data[id]?.[key]);
      return acc;
    }, {} as Record<string, boolean>);

    setRoleAccess(access);
  };

  useEffect(() => {
    loadAccess();
  }, [user]);

  return (
    <RoleAccessContext.Provider value={{ roleAccess, refreshRoleAccess: loadAccess }}>
      {children}
    </RoleAccessContext.Provider>
  );
}

export function useRoleAccess() {
  const ctx = useContext(RoleAccessContext);
  if (!ctx) throw new Error("useRoleAccess must be used within RoleAccessProvider");
  return ctx;
}
