import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { LoadingOverlay } from '@/components/ui/loading-overlay';

const components = [
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

type Role = { roleid: number; name: string };
type PermissionsMap = Record<string, Record<string, boolean>>;

export default function RoleAccess() {
  const { toast }        = useToast();
  const { fetchWithAuth, user } = useAuth();
  const [roles, setRoles]           = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<PermissionsMap>({});
  const [loading, setLoading]       = useState(true);
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  // Load both roles & current permissions
  useEffect(() => {
    setLoading(true);
    Promise.all([
      // 1) fetch roles (with IDs!)
      fetchWithAuth(`${API_BASE_URL}/roles`)
        .then(res => res.json())
        .then((data: Role[]) => setRoles(data))
        .catch(() => toast({ title: 'Failed to load roles', variant: 'destructive' })),

      // 2) fetch role-component-access
      fetchWithAuth(`${API_BASE_URL}/role-access`)
        .then(res => res.json())
        .then((data: PermissionsMap) => setPermissions(data))
        .catch(() => toast({ title: 'Failed to load permissions', variant: 'destructive' }))
    ])
    .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Toggle a boolean in the map, keyed by componentId + numeric roleid
  const togglePermission = (componentId: string, roleid: number) => {
    setPermissions(prev => {
      const compMap = prev[componentId] ?? {};
      const key = String(roleid);
      return {
        ...prev,
        [componentId]: {
          ...compMap,
          [key]: !compMap[key]
        }
      };
    });
  };

  // POST the updated map back to the server
  const handleSave = async () => {
    const res = await fetchWithAuth(`${API_BASE_URL}/role-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(permissions)
    });
    if (res.ok) {
      toast({ title: 'Permissions updated' });
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: err.message || 'Error updating permissions', variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout>
      <div className="relative min-h-[200px]">
        {loading && <LoadingOverlay />}

        {!loading && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Role Access</h1>
            <Card>
              <CardHeader>
                <CardTitle>Component Access by Role</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Component</TableHead>
                      {roles.map(role => (
                        <TableHead key={role.roleid} className="text-center">
                          {role.name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {components.map(comp => (
                      <TableRow key={comp.id}>
                        <TableCell className="font-medium">{comp.name}</TableCell>
                        {roles.map(role => (
                          <TableCell key={role.roleid} className="text-center">
                            <Checkbox
                              checked={permissions[comp.id]?.[String(role.roleid)] ?? false}
                              onCheckedChange={() => togglePermission(comp.id, role.roleid)}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Button onClick={handleSave}>Save</Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
