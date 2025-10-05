import { useState, useMemo, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ArrowLeft } from "lucide-react";

interface UserOption {
  userid: number;
  name: string;
  email: string;
  role: string; // or roleid if you have it; not required here
}

interface Role {
  roleid: number;
  name: string;
  parentroleid: number | null;
}

interface AssignableUser {
  userid: number;
  name: string;
  managerid: number | null;
}

type CreateUserPayload = {
  name: string;
  email: string;
  password: string;
  roleid: number | null;
  managerid: number | null;
  departmentid: number | null;
  status?: string;
};

interface ApiUser {
  userid: number;
  name: string;
  email: string;
  roleid?: number | null;
  managerid?: number | null;
  departmentid?: number | null;
  status?: string | null;
}

type Props = {
  /** Optional: limit which roles can be assigned (defaults to roles below the current user's role) */
  rolesFromApi?: string[]; // e.g. ["admin","manager","lead","agent"]
  /** Optional: manager dropdown options (defaults to all users returned by GET /users) */
  managerOptions?: UserOption[];
  /** Optional: called with the newly created user object returned by the API */
  onCreated?: (user: ApiUser) => void;
  /** Optional: show/hide Department field (defaults to hidden) */
  enableDepartment?: boolean;
};

export default function CreateUserCard({
  rolesFromApi,
  managerOptions,
  onCreated,
  enableDepartment = false,
}: Props) {
  const { toast } = useToast();
  const { user, fetchWithAuth } = useAuth();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;
  const navigate = useNavigate();

  const currentRoleId = user?.roleid ?? 0;

  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [managers, setManagers] = useState<AssignableUser[]>([]);
  const [managersLoading, setManagersLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    roleId: "" as "" | string,
    managerId: "" as "" | string, // stores userid as string
    // If department field is enabled, default to "1" per requirement
    departmentId: (enableDepartment ? "1" : "") as "" | string,
    password: "",
    showPw: false,
  });

  // Fetch canonical roles
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setRolesLoading(true);
        const res = await fetchWithAuth(`${API_BASE_URL}/roles`);
        if (!res.ok) throw new Error("Failed to load roles");
        const data: Role[] = await res.json();
        if (!cancelled) setRoles(data || []);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load roles";
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API_BASE_URL, fetchWithAuth, toast]);

  // Fetch assignable managers if not provided via props
  useEffect(() => {
    if (managerOptions && managerOptions.length) return; // use provided options
    let cancelled = false;
    (async () => {
      try {
        setManagersLoading(true);
        const res = await fetchWithAuth(`${API_BASE_URL}/assignable-users`);
        if (!res.ok) throw new Error("Failed to load managers");
        const data: AssignableUser[] = await res.json();
        if (!cancelled) setManagers(data || []);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to load managers";
        toast({ title: "Error", description: msg, variant: "destructive" });
      } finally {
        if (!cancelled) setManagersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API_BASE_URL, fetchWithAuth, managerOptions, toast]);

  // Compute allowed roles: strictly lower privilege (higher numeric roleid)
  const allowedRoles = useMemo(() => {
    const me = currentRoleId;
    let base = roles;
    if (rolesFromApi?.length) {
      const allowedNames = new Set(rolesFromApi.map((r) => r.toLowerCase()));
      base = roles.filter((r) => allowedNames.has(r.name.toLowerCase()));
    }
    const filtered = base.filter((r) => r.roleid > me);
    return filtered.sort((a, b) => a.roleid - b.roleid);
  }, [roles, rolesFromApi, currentRoleId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic client-side validation
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      toast({
        title: "Missing fields",
        description: "Name, Email and Password are required.",
        variant: "destructive",
      });
      return;
    }
    if (!form.roleId) {
      toast({ title: "Select a role", variant: "destructive" });
      return;
    }
    const selectedRoleId = Number(form.roleId);
    if (!Number.isFinite(selectedRoleId)) {
      toast({
        title: "Invalid role",
        description: "Please select a valid role.",
        variant: "destructive",
      });
      return;
    }
    // Enforce precedence: can only create lower-privileged roles
    if (selectedRoleId <= currentRoleId) {
      toast({
        title: "Not allowed",
        description: "You can only assign roles below your own.",
        variant: "destructive",
      });
      return;
    }
    // Manager requirement: required for all except super admin (roleid === 1)
    const isSuperAdmin = currentRoleId === 1;
    if (!isSuperAdmin && !form.managerId?.trim()) {
      toast({
        title: "Select a manager",
        description: "Manager is required for your role.",
        variant: "destructive",
      });
      return;
    }

    const roleid = selectedRoleId || null;
    const managerid = form.managerId?.trim() ? Number(form.managerId) : null;
    // Default department is 1 when creating users; if a valid department is provided, use it
    const departmentid = (() => {
      const raw = form.departmentId?.trim();
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) && n > 0 ? n : 1;
    })();

    const payload: CreateUserPayload = {
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      roleid,
      managerid,
      departmentid,
      status: "active",
    };

    try {
      setSubmitting(true);
      const res = await fetchWithAuth(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let message = "Error creating user";
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {
          /* ignore non-JSON response */
        }
        if (res.status === 409) message = "Email already exists";
        if (res.status === 403) message = "Not allowed to create this user";
        if (res.status === 400) message = "Invalid request";
        throw new Error(message);
      }

      const data = await res.json();
      toast({ title: "User created" });
      onCreated?.(data as ApiUser);
      // Navigate to User Management after success
      navigate("/user-management");

      // Reset form
      setForm({
        name: "",
        email: "",
        roleId: "",
        managerId: "",
        departmentId: enableDepartment ? "1" : "",
        password: "",
        showPw: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error creating user";
      toast({ title: "Failed", description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="relative min-h-[200px] space-y-6">
        <Button variant="outline" size="icon" asChild>
          <Link to="/user-management">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Create User</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="cu-name">Name</Label>
                  <Input
                    id="cu-name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                    required
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cu-email">Email</Label>
                  <Input
                    id="cu-email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    required
                    disabled={submitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cu-role">Role</Label>
                  <Select
                    value={form.roleId}
                    onValueChange={(value) =>
                      setForm((f) => ({ ...f, roleId: value }))
                    }
                    disabled={submitting || rolesLoading}
                  >
                    <SelectTrigger id="cu-role">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedRoles.length === 0 && !rolesLoading ? (
                        <SelectItem disabled value="">
                          No assignable roles
                        </SelectItem>
                      ) : (
                        allowedRoles.map((r) => (
                          <SelectItem key={r.roleid} value={String(r.roleid)}>
                            {r.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cu-manager">Manager</Label>
                  <Select
                    value={form.managerId}
                    onValueChange={(value) =>
                      setForm((f) => ({ ...f, managerId: value }))
                    }
                    disabled={submitting || managersLoading}
                  >
                    <SelectTrigger id="cu-manager">
                      <SelectValue placeholder="Select manager (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {(managerOptions && managerOptions.length
                        ? managerOptions
                        : managers
                      ).map((m) => (
                        <SelectItem key={m.userid} value={String(m.userid)}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {enableDepartment && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="cu-dept">Department ID</Label>
                    <Input
                      id="cu-dept"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="e.g. 12"
                      value={form.departmentId}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, departmentId: e.target.value }))
                      }
                      disabled={submitting}
                    />
                  </div>
                )}

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cu-password">Password</Label>
                  <div className="flex gap-2">
                    <Input
                      id="cu-password"
                      type={form.showPw ? "text" : "password"}
                      value={form.password}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, password: e.target.value }))
                      }
                      required
                      disabled={submitting}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={submitting}
                      onClick={() =>
                        setForm((f) => ({ ...f, showPw: !f.showPw }))
                      }
                    >
                      {form.showPw ? "Hide" : "Show"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Creating…" : "Create"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
