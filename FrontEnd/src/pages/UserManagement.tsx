import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, MoreHorizontal, Trash2 } from 'lucide-react';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Link } from 'react-router-dom';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface User {
  userid: number;
  name: string;
  email: string;
  roleid: number;
  managerid?: number | null;
  departmentid?: number | null;
  status?: string;
  lastlogin?: string;
}

interface Role {
  roleid: number;
  name: string;
  parentroleid: number | null;
}

// Roles are fetched from the API; we avoid hardcoding role maps here

export default function UserManagement() {
  const { user, fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const [users, setUsers] = useState<User[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [q, setQ] = useState<string>("");
  const [rolesById, setRolesById] = useState<Record<number, string>>({});
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ name?: string; email?: string; roleid?: number | null; managerid?: number | null; departmentid?: number | null; status?: string; password?: string }>({});
  const [managers, setManagers] = useState<{ userid: number; name: string }[]>([]);
  const [managersLoading, setManagersLoading] = useState(false);

  const currentRoleId = user?.roleid ?? 0;
  const canCreateUser = roles.some(r => r.roleid > currentRoleId);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [usersRes, rolesRes] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/users?take=50${q ? `&q=${encodeURIComponent(q)}` : ''}`),
          fetchWithAuth(`${API_BASE_URL}/roles`),
        ]);

        if (usersRes.ok) {
          const data = await usersRes.json();
          const items = Array.isArray(data) ? data : (data.items || []);
          const filtered = items.filter((u: User) => u.userid !== (user?.userid ?? -1));
          setUsers(filtered);
          setNextCursor(data.nextCursor ?? null);
        } else {
          const data = await usersRes.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to load users');
        }

        if (rolesRes.ok) {
          const data = (await rolesRes.json()) as Role[];
          setRoles(data);
          const map = Object.fromEntries(data.map(r => [r.roleid, r.name]));
          setRolesById(map);
        } else {
          const data = await rolesRes.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to load roles');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error loading data';
        toast({ title: 'Load failed', description: msg, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fetchWithAuth, API_BASE_URL, toast, q]);

  const loadMore = async () => {
    if (!nextCursor) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/users?take=50&cursor=${nextCursor}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      if (!res.ok) throw new Error('Failed to load more users');
      const data = await res.json();
      const items: User[] = data.items || [];
      const filtered = items.filter((u) => u.userid !== (user?.userid ?? -1));
      setUsers(prev => [...prev, ...filtered]);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      toast({ title: 'Load more failed', variant: 'destructive' });
    }
  };

  // Delete a user (same UX as Leads delete)
  const deleteUser = async (u: User) => {
    if (!confirm('Delete this user?')) return;
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/users/${u.userid}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error deleting user');
      }
      setUsers(prev => prev.filter(x => x.userid !== u.userid));
      toast({ title: 'User deleted' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error deleting user';
      toast({ title: msg, variant: 'destructive' });
    }
  };

  // open edit sheet
  const startEdit = async (u: User) => {
    setEditUser(u);
    setForm({
      name: u.name,
      email: u.email,
      roleid: u.roleid,
      managerid: u.managerid ?? null,
      departmentid: u.departmentid ?? null,
      status: u.status ?? ''
    });
    // load assignable managers
    try {
      setManagersLoading(true);
      const res = await fetchWithAuth(`${API_BASE_URL}/assignable-users`);
      if (res.ok) {
        const data = await res.json();
        setManagers(data || []);
      }
    } finally {
      setManagersLoading(false);
    }
    setIsSheetOpen(true);
  };

  const saveUser = async () => {
    if (!editUser) return;
    // client-side guard: cannot assign equal/higher role than current user
    if (form.roleid != null && form.roleid <= currentRoleId) {
      toast({ title: 'Not allowed', description: 'You can only assign roles below your own.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload: { name?: string; email?: string; roleid?: number | null; managerid?: number | null; departmentid?: number | null; status?: string; password?: string } = { name: form.name, email: form.email, roleid: form.roleid, managerid: form.managerid, departmentid: form.departmentid, status: form.status };
      if (form.password && form.password.trim()) payload.password = form.password.trim();
      const res = await fetchWithAuth(`${API_BASE_URL}/users/${editUser.userid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Error updating user');
      }
      const updated = await res.json();
      toast({ title: 'User updated' });
      // update local list
      setUsers(prev => prev.map(u => u.userid === editUser.userid ? { ...u, ...updated } : u));
      setIsSheetOpen(false);
      setEditUser(null);
      setForm({});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error updating user';
      toast({ title: 'Failed', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <DashboardLayout>
      <div className="relative min-h-[200px]">
        {loading && <LoadingOverlay />}
        {!loading && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Search users"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="w-64 sm:w-80"
                />
                <Button variant="outline" onClick={() => { /* debounced auto-search */ }}>
                  Search
                </Button>
              </div>
              {canCreateUser && (
                <Button asChild className="shrink-0">
                  <Link to="/create-user">
                    <Plus className="mr-2 h-4 w-4" />
                    New User
                  </Link>
                </Button>
              )}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Users</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(u => (
                      <TableRow key={u.userid}>
                        <TableCell>{u.name}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{rolesById[u.roleid] ?? `Role ${u.roleid}`}</TableCell>
                        <TableCell className="capitalize">{u.status ?? ''}</TableCell>
                        <TableCell>{u.lastlogin ? new Date(u.lastlogin).toLocaleString() : ''}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => startEdit(u)}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => deleteUser(u)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            {nextCursor && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={loadMore}>Load more</Button>
              </div>
            )}

            <Sheet
              open={isSheetOpen}
              onOpenChange={(o) => {
                if (saving) return;
                setIsSheetOpen(o);
                if (!o) { setEditUser(null); setForm({}); }
              }}
            >
              <SheetContent side="right" className="w-full sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>{editUser ? `Edit ${editUser.name}` : 'Edit User'}</SheetTitle>
                  <SheetDescription>Update user details. Role and manager changes are subject to your access.</SheetDescription>
                </SheetHeader>

                {editUser && (
                  <div className="py-4 space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="um-name">Name</Label>
                      <Input id="um-name" value={form.name || ''} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="um-email">Email</Label>
                      <Input id="um-email" type="email" value={form.email || ''} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="um-role">Role</Label>
                      <Select value={form.roleid != null ? String(form.roleid) : ''} onValueChange={(v) => setForm(prev => ({ ...prev, roleid: v ? Number(v) : null }))}>
                        <SelectTrigger id="um-role">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {roles
                            .filter(r => r.roleid > currentRoleId)
                            .map(r => (
                              <SelectItem key={r.roleid} value={String(r.roleid)}>{r.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="um-manager">Manager</Label>
                      <Select value={form.managerid != null ? String(form.managerid) : ''} onValueChange={(v) => setForm(prev => ({ ...prev, managerid: v === 'none' ? null : Number(v) }))}>
                        <SelectTrigger id="um-manager" disabled={managersLoading}>
                          <SelectValue placeholder="Select manager" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">-</SelectItem>
                          {managers.map(m => (
                            <SelectItem key={m.userid} value={String(m.userid)}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="um-dept">Department ID</Label>
                      <Input id="um-dept" inputMode="numeric" pattern="[0-9]*" value={form.departmentid != null ? String(form.departmentid) : ''} onChange={(e) => setForm(prev => ({ ...prev, departmentid: e.target.value ? Number(e.target.value) : null }))} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="um-status">Status</Label>
                      <Select value={form.status || ''} onValueChange={(v) => setForm(prev => ({ ...prev, status: v }))}>
                        <SelectTrigger id="um-status">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="um-pass">New Password (optional)</Label>
                      <Input id="um-pass" type="password" value={form.password || ''} onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))} />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => { if (!saving) { setIsSheetOpen(false); setEditUser(null); setForm({}); } }}>Cancel</Button>
                      <Button onClick={saveUser} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
                    </div>
                  </div>
                )}
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
