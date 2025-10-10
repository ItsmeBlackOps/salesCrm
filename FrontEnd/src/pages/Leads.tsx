import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Download,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { useNotifications } from "@/hooks/useNotifications";
import { ROLE_MAP, ROLE_PERMISSIONS } from "@/constants/roles";
import { LeadsFilters } from "@/components/crm/LeadsFilters";
import { ScopeBadge } from "@/components/crm/ScopeBadge";

interface Lead {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  phone?: string;
  company: string;
  source?: string;
  status: string;
  createdby?: number;
  assignedto?: number;
  createdat?: Date;
}

export default function Leads() {
  const { user, fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const { addNotification } = useNotifications();

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState<{ status?: string; owner?: string }>(
    {}
  );
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const role = ROLE_MAP[user?.roleid ?? 0] || "Guest";
  const permissions = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.Agent;
  const debouncedSearch = useDebounce(searchTerm, 400);

  // Fetch data
  useEffect(() => {
    const loadLeads = async () => {
      setLoading(true);
      try {
        const [usersRes, leadsRes] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/assignable-users`),
          fetchWithAuth(
            `${API_BASE_URL}/crm-leads?take=50${
              debouncedSearch ? `&q=${debouncedSearch}` : ""
            }${filters.status ? `&status=${filters.status}` : ""}${
              filters.owner ? `&owner=${filters.owner}` : ""
            }`
          ),
        ]);
        const users = await usersRes.json();
        const map: Record<string, string> = {};
        (users || []).forEach((u: { userid: number; name: string }) => {
          map[String(u.userid)] = u.name;
        });
        setUserMap(map);

        const leadsData = await leadsRes.json();
        let raw = Array.isArray(leadsData) ? leadsData : leadsData.items || [];

        // 🧩 Fallback mock for empty data in safe dev/test environment
        if (import.meta.env.MODE !== "production" && raw.length === 0) {
        raw = [
            {
              id: 1,
              firstname: "Test",
              lastname: "Lead",
              email: "testlead@example.com",
              company: "Example Corp",
              status: "New",
              createdby: user?.userid,
              assignedto: user?.userid,
              createdat: new Date(),
            },
          ];
        }
        const normalized = raw.map((l: any) => ({
          ...l,
          createdat: l.createdat ? new Date(l.createdat) : undefined,
        })) as Lead[];

        let scoped: Lead[] = normalized;
        if (role === "Agent") {
          scoped = normalized.filter((l) => l.createdby === user?.userid);
        } else if (role === "Manager") {
          scoped = normalized.filter(
            (l) =>
              l.createdby === user?.userid || l.assignedto === user?.userid
          );
        }

        setLeads(scoped);
        setNextCursor(
          Array.isArray(leadsData) ? null : leadsData.nextCursor ?? null
        );
      } catch {
        toast({ title: "Error loading leads", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    loadLeads();
  }, [debouncedSearch, filters, API_BASE_URL, user, fetchWithAuth]);

  const loadMore = async () => {
    if (!nextCursor) return;
    const res = await fetchWithAuth(
      `${API_BASE_URL}/crm-leads?take=50&cursor=${nextCursor}`
    );
    if (!res.ok) return;
    const data = await res.json();
    const newItems = (data.items || []).map((l: any) => ({
      ...l,
      createdat: l.createdat ? new Date(l.createdat) : undefined,
    })) as Lead[];
    setLeads((prev) => [...prev, ...newItems]);
    setNextCursor(data.nextCursor ?? null);
  };

  const deleteLead = async (lead: Lead) => {
    if (!permissions.canDelete) return;
    if (!confirm("Delete this lead?")) return;
    const res = await fetchWithAuth(`${API_BASE_URL}/crm-leads/${lead.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      toast({ title: "Lead deleted" });
      addNotification(
        `${user?.name || "User"} deleted lead ${lead.firstname} ${lead.lastname}`
      );
    } else {
      toast({ title: "Failed to delete lead", variant: "destructive" });
    }
  };

  const handleExport = async () => {
    if (!permissions.canExport) return;
    const res = await fetchWithAuth(`${API_BASE_URL}/crm-leads/export`);
    if (!res.ok) {
      toast({ title: "Export failed", variant: "destructive" });
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast({ title: "Export complete" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
            <p className="text-muted-foreground">
              Manage your potential customers
            </p>
          </div>
          {permissions.canExport && (
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
          )}
        </div>

        {/* Filters and Search */}
        <div className="flex justify-between items-center">
          <ScopeBadge role={role} />
          <div className="flex gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            <LeadsFilters
              statuses={statuses}
              userMap={userMap}
              onApply={setFilters}
            />
          </div>
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Leads</CardTitle>
            <CardDescription>Scoped list based on your role</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading leads...</p>
            ) : leads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leads found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="font-medium">
                          {lead.firstname} {lead.lastname}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {lead.email}
                        </p>
                      </TableCell>
                      <TableCell>{lead.company}</TableCell>
                      <TableCell>
                        <Badge>{lead.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {userMap[String(lead.createdby)] || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.createdat?.toLocaleDateString() ?? "-"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Eye className="h-4 w-4 mr-2" /> View
                            </DropdownMenuItem>
                            {(permissions.canAssign ||
                              permissions.canExport) && (
                              <DropdownMenuItem>
                                <Edit className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                            )}
                            {permissions.canDelete && (
                              <DropdownMenuItem
                                onClick={() => deleteLead(lead)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {nextCursor && (
              <div className="flex justify-center py-3">
                <Button variant="outline" onClick={loadMore}>
                  Load more
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
