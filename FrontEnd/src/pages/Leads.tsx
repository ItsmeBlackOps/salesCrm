import { useEffect, useMemo, useRef, useState } from "react";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import {
  Search,
  Plus,
  Filter,
  Target,
  TrendingUp,
  Users,
  Phone,
  Mail,
  Trash2,
  MoreHorizontal,
  Eye,
  Edit,
  Calendar as CalendarIcon,
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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { differenceInDays, format } from "date-fns";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  buildFollowUpStorageKey,
  normalizeLeadStatuses,
} from "@/constants/leads";

const visaStatusMap: Record<number, string> = {
  1: "H1B",
  2: "F1",
  3: "OPT",
  4: "STEM",
  5: "Green Card",
  6: "USC",
  7: "H4",
  8: "GC-EAD",
};
function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 10);
  let out = "";
  if (p1) out += `(${p1}`;
  if (p1.length === 3) out += ") ";
  if (p2) out += p2;
  if (p2.length === 3 && p3) out += "-";
  if (p3) out += p3;
  return out;
}
const capitalizeWords = (value?: string) => {
  if (!value) return "";
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

interface Lead {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  phone?: string;
  company: string;
  source?: string;
  status: string;
  assignedto?: string;
  createdat?: Date;
  updatedat?: Date;
  createdby?: number;
  visastatusid?: number;
  checklist?: ChecklistItem[];
  legalnamessn?: string;
  last4ssn?: string;
  notes?: string;

   owner?: {
    name?: string;
    userid?: number;
  };
}

type PanelMode = "view" | "edit";
type ChecklistItem = { label: string; checked: boolean };

const ViewField = ({
  label,
  value,
}: {
  label: string;
  value?: React.ReactNode;
}) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="font-medium break-words">{value ?? "-"}</p>
  </div>
);

const Leads = () => {
  const { fetchWithAuth, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { addNotification } = useNotifications();

  const [searchTerm, setSearchTerm] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryQualified, setSummaryQualified] = useState(0);
  const [summaryConverted, setSummaryConverted] = useState(0);
  const [summaryNew, setSummaryNew] = useState(0);
  const summaryScanVersion = useRef(0);

  // Sheet state
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [mode, setMode] = useState<PanelMode>("view");
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<Partial<Lead>>({});
  const [saving, setSaving] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<string>("");
  const today = useMemo(() => {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value;
  }, []);
  const followUpDateObj = useMemo(
    () =>
      followUpDate ? new Date(`${followUpDate}T00:00:00`) : undefined,
    [followUpDate]
  );
  const isFollowUpSelected = (form.status || "").toLowerCase() === "follow-up";
  const statusOptions = useMemo(() => {
    const base = [...statuses];
    const ensure = (value?: string | null) => {
      if (!value) return;
      const normalized = value.toLowerCase();
      if (normalized && !base.includes(normalized)) base.push(normalized);
    };
    ensure(form.status as string | undefined);
    ensure(activeLead?.status);
    return base;
  }, [activeLead?.status, form.status, statuses]);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
  const clientSearchMode =
    (import.meta.env.VITE_LEADS_CLIENT_SEARCH as string) === "true";
  const debouncedSearch = useDebounce(searchTerm, 450);
  const [scanRunning, setScanRunning] = useState(false);
  const scanVersion = useRef(0);

  // Fetch leads + assignable users (paginated). Supports client-side progressive search when enabled.
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [usersRes, leadsRes, colsRes] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/assignable-users`),
          fetchWithAuth(
            `${API_BASE_URL}/crm-leads?take=50${
              clientSearchMode
                ? ""
                : debouncedSearch
                ? `&q=${encodeURIComponent(debouncedSearch)}&owner=${encodeURIComponent(debouncedSearch)}`
                : ""
            }`
          ),
          fetchWithAuth(`${API_BASE_URL}/columns`),
        ]);
        const usersData = await usersRes.json();
        const map: Record<string, string> = {};
        if (user) map[String(user.userid)] = user.name;
        (usersData || []).forEach((u: { userid: number; name: string }) => {
          map[String(u.userid)] = u.name;
        });
        setUserMap(map);

        // statuses from columns (same as LeadDetails)
        try {
          const cols: { title: string }[] = await colsRes.json();
          setStatuses(
            normalizeLeadStatuses((cols || []).map((c) => c.title))
          );
        } catch (e) {
          setStatuses(normalizeLeadStatuses());
        }
        // Treat empty strings, null, undefined as "empty"

        const toDate = (v?: unknown): Date | undefined => {
          if (!v) return undefined;
          if (v instanceof Date) return v;
          const d = new Date(String(v));
          return isNaN(d.getTime()) ? undefined : d;
        };
        const normalizeLead = (raw: any): Lead => ({
          ...raw,
          createdat: toDate(raw.createdat),
          updatedat: toDate(raw.updatedat),
        });

        const leadsData = await leadsRes.json();
        const rawItems: any[] = Array.isArray(leadsData)
          ? leadsData
          : leadsData.items || [];
        const items: Lead[] = rawItems.map(normalizeLead);
        const initialNext: number | null = Array.isArray(leadsData)
          ? null
          : leadsData.nextCursor ?? null;

        if (clientSearchMode && debouncedSearch.trim()) {
          const term = debouncedSearch.toLowerCase().trim();
          const match = (v?: string) => !!v && v.toLowerCase().includes(term);
          const matchList = (arr?: unknown[]) =>
            Array.isArray(arr) && arr.some((it) => String(it).toLowerCase().includes(term));
          const dateMatch = (d?: string | Date) =>
            !!d && (d instanceof Date ? d : new Date(d)).toLocaleDateString().includes(term);
          const matches = (l: Lead) =>
            match(l.firstname) ||
            match(l.lastname) ||
            match(l.email) ||
            match(l.company) ||
            match(l.status) ||
            match(l.source) ||
            match(visaStatusMap[l.visastatusid ?? 0]) ||
            match(map[l.assignedto ?? ""]) ||
            match(l.owner?.name) ||
            dateMatch(l.createdat) ||
            matchList(l.checklist) ||
            match(l.legalnamessn) ||
            match(l.last4ssn) ||
            match(l.notes);

          const first = items.filter(matches);
          setLeads(first);
          setNextCursor(initialNext);

          // Progressive scan across remaining pages
          scanVersion.current += 1;
          const version = scanVersion.current;
          setScanRunning(true);
          const seen = new Set<number>(first.map((i) => i.id));

          const scan = async (
            cursor: number | null,
            pages = 0
          ): Promise<void> => {
            if (version !== scanVersion.current) return; // cancelled
            if (!cursor || pages > 100) {
              setScanRunning(false);
              return;
            }
            const res = await fetchWithAuth(
              `${API_BASE_URL}/crm-leads?take=50&cursor=${cursor}`
            );
            if (!res.ok) {
              setScanRunning(false);
              return;
            }
            const data = await res.json();
            const list: Lead[] = (data.items || []).map(normalizeLead);
            const next: number | null = data.nextCursor ?? null;
            const filtered = list
              .filter(matches)
              .filter((l) => !seen.has(l.id));
            filtered.forEach((l) => seen.add(l.id));
            if (version !== scanVersion.current) return;
            if (filtered.length) setLeads((prev) => [...prev, ...filtered]);
            setNextCursor(next);
            await scan(next, pages + 1);
          };
          void scan(initialNext);
        } else {
          // Server-side search or no term
          setLeads(items);
          setNextCursor(initialNext);
          setScanRunning(false);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, fetchWithAuth, API_BASE_URL, clientSearchMode, debouncedSearch]);

  const loadMore = async () => {
    if (!nextCursor) return;
    const res = await fetchWithAuth(
      `${API_BASE_URL}/crm-leads?take=50&cursor=${nextCursor}${
        clientSearchMode
          ? ""
          : searchTerm
          ? `&q=${encodeURIComponent(searchTerm)}&owner=${encodeURIComponent(searchTerm)}`
          : ""
      }`
    );
    if (!res.ok) return;
    const data = await res.json();
    const toDate = (v?: unknown): Date | undefined => {
      if (!v) return undefined;
      if (v instanceof Date) return v;
      const d = new Date(String(v));
      return isNaN(d.getTime()) ? undefined : d;
    };
    const normalizeLead = (raw: any): Lead => ({
      ...raw,
      createdat: toDate(raw.createdat),
      updatedat: toDate(raw.updatedat),
    });
    const items: Lead[] = (data.items || []).map(normalizeLead);
    if (clientSearchMode && searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const match = (v?: string) => !!v && v.toLowerCase().includes(term);
      const matchList = (arr?: unknown[]) =>
        Array.isArray(arr) && arr.some((it) => String(it).toLowerCase().includes(term));
      const dateMatch = (d?: string | Date) =>
        !!d && (d instanceof Date ? d : new Date(d)).toLocaleDateString().includes(term);
      const filtered = items.filter(
        (l) =>
          match(l.firstname) ||
          match(l.lastname) ||
          match(l.email) ||
          match(l.company) ||
          match(l.status) ||
          match(l.source) ||
          match(visaStatusMap[l.visastatusid ?? 0]) ||
          match(userMap[l.assignedto ?? ""]) ||
          match(l.owner?.name) ||         dateMatch(l.createdat) ||
          matchList(l.checklist) ||
          match(l.legalnamessn) ||
          match(l.last4ssn) ||
          match(l.notes)
      );
      setLeads((prev) => [...prev, ...filtered]);
    } else {
      setLeads((prev) => [...prev, ...items]);
    }
    setNextCursor(data.nextCursor ?? null);
  };

  // Background scanner for summary cards (counts entire dataset, RBAC-scoped)
  useEffect(() => {
    const run = async () => {
      summaryScanVersion.current += 1;
      const v = summaryScanVersion.current;
      let total = 0;
      let qualified = 0;
      let converted = 0;
      let newCnt = 0;
      let cursor: number | null = null;
      const take = 100;
      try {
        let res = await fetchWithAuth(`${API_BASE_URL}/crm-leads?take=${take}`);
        if (!res.ok) throw new Error("failed");
        const data: { items?: any[]; nextCursor?: unknown } | any[] =
          await res.json();
        const toDate = (v?: unknown): Date | undefined => {
          if (!v) return undefined;
          if (v instanceof Date) return v;
          const d = new Date(String(v));
          return isNaN(d.getTime()) ? undefined : d;
        };
        const normalizeLead = (raw: any): Lead => ({
          ...raw,
          createdat: toDate(raw.createdat),
          updatedat: toDate(raw.updatedat),
        });
        const items: Lead[] = (Array.isArray(data) ? data : data.items || []).map(normalizeLead);
        for (const l of items) {
          total += 1;
          if (l.status === "qualified") qualified += 1;
          if (l.status === "converted") converted += 1;
          if (l.createdat && differenceInDays(new Date(), l.createdat) <= 7)
            newCnt += 1;
        }
        if (v === summaryScanVersion.current) {
          setSummaryTotal(total);
          setSummaryQualified(qualified);
          setSummaryConverted(converted);
          setSummaryNew(newCnt);
        }
        cursor = Array.isArray(data)
          ? null
          : typeof data.nextCursor === "number"
          ? data.nextCursor
          : data.nextCursor
          ? Number(String(data.nextCursor))
          : null;
        let pages = 0;
        while (cursor !== null && pages < 200) {
          if (v !== summaryScanVersion.current) return;
          res = await fetchWithAuth(
            `${API_BASE_URL}/crm-leads?take=${take}&cursor=${cursor}`
          );
          if (!res.ok) break;
          const data2 = (await res.json()) as {
            items?: any[];
            nextCursor?: unknown;
          };
          const items2: Lead[] = (data2.items || []).map(normalizeLead);
          for (const l of items2) {
            total += 1;
            if (l.status === "qualified") qualified += 1;
            if (l.status === "converted") converted += 1;
            if (l.createdat && differenceInDays(new Date(), l.createdat) <= 7)
              newCnt += 1;
          }
          cursor =
            typeof data2.nextCursor === "number"
              ? data2.nextCursor
              : data2.nextCursor
              ? Number(String(data2.nextCursor))
              : null;
          pages += 1;
          if (v === summaryScanVersion.current) {
            setSummaryTotal(total);
            setSummaryQualified(qualified);
            setSummaryConverted(converted);
            setSummaryNew(newCnt);
          }
        }
      } catch {
        // keep previous
      }
    };
    run();
  }, [fetchWithAuth, API_BASE_URL, user]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-100 text-blue-800";
      case "contacted":
        return "bg-yellow-100 text-yellow-800";
      case "qualified":
        return "bg-green-100 text-green-800";
      case "not interested":
        return "bg-red-100 text-red-800";
      case "unqualified":
        return "bg-red-100 text-red-800";
      case "converted":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Server-side search/pagination now; render current list

  const totalLeads = leads.length;
  const qualifiedLeads = leads.filter(
    (lead) => lead.status === "qualified"
  ).length;
  const newLeads = leads.filter(
    (l) =>
      l.createdat && differenceInDays(new Date(), l.createdat) <= 7
  ).length;
  const converted = leads.filter((l) => l.status === "converted").length;
  const conversionRate = totalLeads
    ? Math.round((converted / totalLeads) * 100)
    : 0;

  const deleteLead = async (lead: Lead) => {
    if (!confirm("Delete this lead?")) return;
    const res = await fetchWithAuth(`${API_BASE_URL}/crm-leads/${lead.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      toast({ title: "Lead deleted" });
      addNotification(
        `${user?.name || "User"} deleted lead ${lead.firstname} ${
          lead.lastname
        } for ${lead.company}`
      );
    } else {
      const data = await res.json().catch(() => ({}));
      toast({
        title: data.message || "Error deleting lead",
        variant: "destructive",
      });
    }
  };

  // --- Sheet helpers ---
  const getStoredFollowUpDate = (leadId: number): string => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(buildFollowUpStorageKey(leadId)) ?? "";
  };

  const formatFollowUpDisplay = (value: string): string => {
    if (!value) return "";
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  };

  const seedForm = (lead: Lead) => {
    setForm({
      id: lead.id,
      firstname: lead.firstname,
      lastname: lead.lastname,
      email: lead.email,
      phone: lead.phone,
      company: lead.company,
      source: lead.source ? lead.source.toLowerCase() : undefined,
      status: (lead.status || "").toLowerCase(),
      assignedto: lead.assignedto,
      createdby: lead.createdby,
      visastatusid: lead.visastatusid,
      checklist: (lead.checklist as ChecklistItem[]) || [], // 👈 here
      legalnamessn: lead.legalnamessn,
      last4ssn: lead.last4ssn,
      notes: lead.notes,
    });
  };

  const openLead = (lead: Lead, m: PanelMode) => {
    setActiveLead(lead);
    seedForm(lead);
    if (lead.id != null) {
      setFollowUpDate(getStoredFollowUpDate(lead.id));
    } else {
      setFollowUpDate("");
    }
    setMode(m);
    setIsSheetOpen(true);
  };

  const startView = (lead: Lead) => openLead(lead, "view");
  const startEdit = (lead: Lead) => openLead(lead, "edit");
  const isEmpty = (v: unknown) =>
    v === null || v === undefined || (typeof v === "string" && v.trim() === "");

  // If the original (activeLead) had a non-empty value, block clearing it
  const freezeIfPreviouslyFilled = <K extends keyof Lead>(
    key: K,
    next: any
  ) => {
    if (!activeLead) return next;
    const prev = (activeLead as any)[key];
    const wasFilled = !isEmpty(prev);
    const willBeEmpty = isEmpty(next);
    return wasFilled && willBeEmpty ? prev : next;
  };

  const handleChange =
    <K extends keyof Lead>(key: K) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => {
      let value: any = e.target.value;

      if (key === "firstname" || key === "lastname") {
        value = capitalizeWords(value);
      } else if (key === "email") {
        value = value.toLowerCase();
      } else if (key === "phone") {
        value = formatPhone(value);
      } else if (key === "legalnamessn") {
        value = capitalizeWords(value);
      } else if (key === "last4ssn") {
        value = value.replace(/\D/g, "").slice(0, 4);
      } else if (key === "visastatusid") {
        value = value ? Number(value) : undefined;
      }

      // ❄️ Freeze: if previously filled, do not allow clearing to empty
      value = freezeIfPreviouslyFilled(key, value);

      setForm(
        (prev) =>
          ({ ...(prev as Partial<Lead>), [key]: value } as Partial<Lead>)
      );
    };

  const addChecklistItem = () =>
    setForm((prev) => ({
      ...(prev as Partial<Lead>),
      checklist: [
        ...((prev.checklist as ChecklistItem[]) || []),
        { label: "", checked: false },
      ],
    }));

  const updateChecklistItem = (idx: number, label: string) =>
    setForm((prev) => {
      const list = [...((prev.checklist as ChecklistItem[]) || [])];
      if (!list[idx]) list[idx] = { label: "", checked: false };
      list[idx] = { ...list[idx], label };
      return { ...(prev as Partial<Lead>), checklist: list };
    });

  const toggleChecklistItem = (idx: number) =>
    setForm((prev) => {
      const list = [...((prev.checklist as ChecklistItem[]) || [])];
      if (!list[idx]) list[idx] = { label: "", checked: false };
      list[idx] = { ...list[idx], checked: !list[idx].checked };
      return { ...(prev as Partial<Lead>), checklist: list };
    });

  const removeChecklistItem = (idx: number) =>
    setForm((prev) => {
      const list = [...((prev.checklist as ChecklistItem[]) || [])];
      list.splice(idx, 1);
      return { ...(prev as Partial<Lead>), checklist: list };
    });

  const handleSave = async () => {
    if (!activeLead) return;
    setSaving(true);
    try {
      // Preflight duplicates against currently loaded page (fast feedback)
      const changedEmail =
        form.email &&
        form.email.toLowerCase() !== (activeLead.email || "").toLowerCase();
      const changedPhone = form.phone && form.phone !== activeLead.phone;
      const changedName =
        form.firstname &&
        form.lastname &&
        (form.firstname.toLowerCase() !==
          (activeLead.firstname || "").toLowerCase() ||
          form.lastname.toLowerCase() !==
            (activeLead.lastname || "").toLowerCase());
      const changedLegal =
        form.legalnamessn &&
        form.legalnamessn.toLowerCase() !==
          (activeLead.legalnamessn || "").toLowerCase();
      const changedSsn = form.last4ssn && form.last4ssn !== activeLead.last4ssn;
      if (
        changedEmail ||
        changedPhone ||
        changedName ||
        changedLegal ||
        changedSsn
      ) {
        const conflict = leads.some(
          (l) =>
            l.id !== activeLead.id &&
            ((changedEmail &&
              l.email?.toLowerCase() === (form.email || "").toLowerCase()) ||
              (changedPhone && l.phone === form.phone) ||
              (changedName &&
                l.firstname?.toLowerCase() ===
                  (form.firstname || "").toLowerCase() &&
                l.lastname?.toLowerCase() ===
                  (form.lastname || "").toLowerCase()) ||
              (changedLegal &&
                (l as any).legalnamessn?.toLowerCase() ===
                  (form.legalnamessn || "").toLowerCase()) ||
              (changedSsn && (l as any).last4ssn === form.last4ssn))
        );
        if (conflict) {
          toast({
            title: "Duplicate lead found",
            description:
              "Email, phone, full name, legal name or SSN last 4 already exists.",
            variant: "destructive",
          });
          return;
        }
      }
      if (!form.status) {
        toast({
          title: "Please select a status",
          variant: "destructive",
        });
        return;
      }

      const statusVal = form.status.toLowerCase();
      const requiresFollowUpDate = statusVal === "follow-up";
      if (requiresFollowUpDate && !followUpDate) {
        toast({
          title: "Follow-up date is required",
          variant: "destructive",
        });
        return;
      }

      // Enforce: if status is 'signed', require legalnamessn and last4ssn
      if (statusVal === "signed") {
        const legal = (form.legalnamessn || "").trim();
        const ssn = (form.last4ssn || "").trim();
        if (!legal || !ssn || ssn.length < 4) {
          toast({
            title: "Missing required fields",
            description: "Legal Name and SSN (last 4) are required.",
            variant: "destructive",
          });
          return;
        }
      }
      // Build a minimal PATCH payload with only changed, non-empty values
      const keysToUpdate: (keyof Lead)[] = [
        "firstname",
        "lastname",
        "email",
        "phone",
        "company",
        "source",
        "status",
        "createdby",
        "assignedto",
        "visastatusid",
        "checklist",
        "legalnamessn",
        "last4ssn",
        "notes",
      ];

      const patch: Partial<Lead> = {};
      for (const key of keysToUpdate) {
        const nextVal = (form as any)[key];
        if (nextVal === undefined || nextVal === null) continue; // do not send null/undefined
        if (typeof nextVal === "string" && nextVal.trim() === "") continue; // avoid blanking
        const prevVal = (activeLead as any)[key];
        // Treat undefined and [] as equivalent for checklist
        const changed =
          key === "checklist"
            ? JSON.stringify(Array.isArray(nextVal) ? nextVal : []) !==
              JSON.stringify(Array.isArray(prevVal) ? prevVal : [])
            : typeof nextVal === "object"
            ? JSON.stringify(nextVal) !== JSON.stringify(prevVal)
            : nextVal !== prevVal;
        if (changed) (patch as any)[key] = nextVal;
      }

      if (Object.keys(patch).length === 0) {
        toast({ title: "No changes to save" });
        setSaving(false);
        return;
      }

      const res = await fetchWithAuth(
        `${API_BASE_URL}/crm-leads/${activeLead.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );

      let updated: Lead | null = null;
      if (res.status === 204) {
        updated = {
          ...activeLead,
          ...(patch as Lead),
          updatedat: new Date(),
        };
      } else if (res.ok) {
        const raw = await res.json();
        const toDate = (v?: unknown): Date | undefined => {
          if (!v) return undefined;
          if (v instanceof Date) return v;
          const d = new Date(String(v));
          return isNaN(d.getTime()) ? undefined : d;
        };
        updated = {
          ...(raw || {}),
          createdat: toDate(raw?.createdat) ?? activeLead.createdat,
          updatedat: toDate(raw?.updatedat) ?? new Date(),
        } as Lead;
      } else {
        const err = await res.json().catch(() => ({} as { message?: string }));
        throw new Error(err.message || "Failed to update lead");
      }

      if (updated) {
        setLeads((prev) =>
          prev.map((l) => (l.id === updated!.id ? { ...l, ...updated! } : l))
        );
        setActiveLead(updated); // keep viewing the fresh data
        seedForm(updated); // sync form too
      }

      toast({ title: "Lead updated" });
      addNotification(
        `${user?.name || "User"} updated lead ${form.firstname} ${
          form.lastname
        } for ${form.company}`
      );
      if (typeof window !== "undefined" && updated) {
        const key = buildFollowUpStorageKey(updated.id);
        if ((updated.status || "").toLowerCase() === "follow-up" && followUpDate) {
          localStorage.setItem(key, followUpDate);
        } else {
          localStorage.removeItem(key);
          setFollowUpDate("");
        }
      }
      setMode("view"); // return to read-only in the same sheet
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error updating lead";
      toast({ title: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const closeSheet = () => {
    if (saving) return;
    setIsSheetOpen(false);
    setActiveLead(null);
    setMode("view");
    setFollowUpDate("");
  };

  const activeLeadFollowUpDisplay =
    activeLead && typeof window !== "undefined"
      ? formatFollowUpDisplay(getStoredFollowUpDate(activeLead.id))
      : "";

  return (
    <DashboardLayout>
      <div className="relative min-h-[200px]">
        {loading && leads.length === 0 && <LoadingOverlay />}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Leads</h1>
              <p className="text-muted-foreground">
                Manage your potential customers and prospects
              </p>
            </div>
            <Button asChild>
              <Link to="/lead-details">
                <Plus className="mr-2 h-4 w-4" />
                New Lead
              </Link>
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Leads
                </CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summaryTotal}</div>
                <p className="text-xs text-muted-foreground">
                  +{summaryNew} new this week
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Qualified Leads
                </CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summaryQualified}</div>
                <p className="text-xs text-muted-foreground">Qualified leads</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Conversion Rate
                </CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {summaryTotal
                    ? Math.round((summaryConverted / summaryTotal) * 100)
                    : 0}
                  %
                </div>
                <p className="text-xs text-muted-foreground">Conversion rate</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters and Search */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>All Leads</CardTitle>
                  <CardDescription>
                    Track and manage your potential customers
                  </CardDescription>
                </div>
                <div className="flex space-x-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search leads..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-64"
                    />
                  </div>
                  <Button variant="outline">
                    <Filter className="mr-2 h-4 w-4" />
                    Filter
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {(loading || scanRunning) && leads.length > 0 && (
                <div className="px-4 py-2 text-sm text-muted-foreground">
                  {scanRunning ? "Searching more results…" : "Updating…"}
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <div className="font-medium">
                            {lead.firstname} {lead.lastname}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-4">
                            <span>{lead.email}</span>
                            {lead.phone && <span>{lead.phone}</span>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{lead.company}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(lead.status)}>
                          {lead.status.charAt(0).toUpperCase() +
                            lead.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {capitalizeWords(lead.source)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {(lead.createdby && userMap[lead.createdby]) || ""}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {lead.createdat ? lead.createdat.toLocaleDateString() : ""}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                const params = new URLSearchParams({
                                  name: `${lead.firstname} ${lead.lastname}`.trim(),
                                  email: lead.email || "",
                                  phone: lead.phone || "",
                                  company: lead.company || "",
                                });
                                navigate(`/mock-gen?${params.toString()}`);
                              }}
                            >
                              Mock Gen
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => startView(lead)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => startEdit(lead)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => deleteLead(lead)}
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
              {nextCursor && (
                <div className="flex justify-center py-3">
                  <Button variant="outline" onClick={loadMore}>
                    Load more
                  </Button>
                </div>
              )}
              <div className="hidden">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold truncate">
                          {lead.firstname} {lead.lastname}
                        </h3>

                        <Badge variant="secondary" className="ml-auto">
                          {lead.company}
                        </Badge>

                        <div className="flex items-center gap-2">
                          {/* Keep VIEW button exactly as you had it */}
                          <Button
                            variant="ghost"
                            onClick={() => startView(lead)}
                          >
                            View
                          </Button>
                          <Button
                            variant="link"
                            className="p-0 h-auto text-sm"
                            onClick={() => startEdit(lead)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="delete"
                            onClick={() => deleteLead(lead)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {lead.email}
                        </span>
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {lead.phone}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge className={getStatusColor(lead.status)}>
                          {lead.status.charAt(0).toUpperCase() +
                            lead.status.slice(1)}
                        </Badge>

                        {lead.visastatusid && (
                          <Badge variant="outline">
                            {visaStatusMap[lead.visastatusid]}
                          </Badge>
                        )}

                        {lead.source && (
                          <span className="text-sm text-muted-foreground">
                            Source: {capitalizeWords(lead.source)}
                          </span>
                        )}

                        {lead.createdby != null && (
                          <span className="text-sm text-muted-foreground">
                            Owner:{" "}
                            {userMap[String(lead.createdby)] ||
                              String(lead.createdby)}
                          </span>
                        )}

                        {lead.createdby && (
                          <span className="text-sm text-muted-foreground">
                            Created By:{" "}
                            {userMap[String(lead.createdby)] || lead.createdby}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-1">
                        {lead.createdat && (
                          <span>
                            Created:{" "}
                            {lead.createdat.toLocaleDateString()}
                          </span>
                        )}
                        {lead.updatedat && (
                          <span>
                            Updated:{" "}
                            {lead.updatedat.toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {nextCursor && (
                  <div className="flex justify-center mt-4">
                    <Button variant="outline" onClick={loadMore}>
                      Load more
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* VIEW / EDIT Sheet */}
      <Sheet
        open={isSheetOpen}
        onOpenChange={(o) => {
          if (saving) return;
          if (!o) closeSheet();
          else setIsSheetOpen(true);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg p-0">
          <div className="flex h-full flex-col">
            <div className="px-6 pt-6">
              <SheetHeader>
                <SheetTitle>
                  {mode === "view" ? "Lead Details" : "Edit Lead"}
                </SheetTitle>
                <SheetDescription>
                  {mode === "view"
                    ? "Review the lead information."
                    : "Update the lead details and save your changes."}
                </SheetDescription>
              </SheetHeader>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-28 pt-4">
              {/* BODY */}
              {mode === "view" && activeLead && (
                <div className="py-4 space-y-6">
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(activeLead.status)}>
                      {activeLead.status.charAt(0).toUpperCase() +
                        activeLead.status.slice(1)}
                    </Badge>
                    {activeLead.visastatusid && (
                      <Badge variant="outline">
                        {visaStatusMap[activeLead.visastatusid]}
                      </Badge>
                    )}
                    <Badge variant="secondary">{activeLead.company}</Badge>
                  </div>

                  {/* Single column, line-by-line fields */}
                  <div className="space-y-4">
                    <ViewField
                      label="First Name"
                      value={activeLead.firstname}
                    />
                    <ViewField label="Last Name" value={activeLead.lastname} />
                    <ViewField label="Email" value={activeLead.email} />
                    <ViewField label="Phone" value={activeLead.phone} />
                    <ViewField
                      label="Source"
                      value={capitalizeWords(activeLead.source)}
                    />
                    <ViewField
                      label="Owner"
                      value={
                        (activeLead.createdby != null &&
                          userMap[String(activeLead.createdby)]) ||
                        String(activeLead.createdby ?? "-")
                      }
                    />
                    <ViewField
                      label="Assigned To"
                      value={
                        (activeLead.assignedto != null &&
                          userMap[String(activeLead.assignedto)]) ||
                        (activeLead.assignedto ?? "Unassigned")
                      }
                    />
                    {activeLead.status?.toLowerCase() === "follow-up" && (
                      <ViewField
                        label="Follow-up Date"
                        value={activeLeadFollowUpDisplay || "-"}
                      />
                    )}
                    <ViewField
                      label="Legal Name"
                      value={activeLead.legalnamessn}
                    />
                    <ViewField
                      label="SSN (last 4)"
                      value={activeLead.last4ssn}
                    />
                    <ViewField
                      label="Created"
                      value={activeLead.createdat?.toLocaleString() ?? "-"}
                    />
                    <ViewField
                      label="Updated"
                      value={activeLead.updatedat?.toLocaleString() ?? "-"}
                    />
                    <div>
                      <p className="text-xs text-muted-foreground">Checklist</p>
                      <div className="mt-2 space-y-1">
                        {(activeLead.checklist as ChecklistItem[] | undefined)
                          ?.length ? (
                          (activeLead.checklist as ChecklistItem[]).map(
                            (it, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-2 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  checked={!!it.checked}
                                  readOnly
                                />
                                <span
                                  className={
                                    it.checked
                                      ? "line-through text-muted-foreground"
                                      : ""
                                  }
                                >
                                  {it.label || "-"}
                                </span>
                              </div>
                            )
                          )
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="font-medium whitespace-pre-wrap">
                        {activeLead.notes || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {mode === "edit" && (
                <div className="py-4 space-y-6">
                  <div className="grid gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="firstname">First Name</Label>
                      <Input
                        id="firstname"
                        value={form.firstname || ""}
                        onChange={handleChange("firstname")}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="lastname">Last Name</Label>
                      <Input
                        id="lastname"
                        value={form.lastname || ""}
                        onChange={handleChange("lastname")}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={form.email || ""}
                        onChange={handleChange("email")}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={form.phone || ""}
                        onChange={handleChange("phone")}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="company">Company</Label>
                      <Input
                        id="company"
                        value={form.company || ""}
                        onChange={handleChange("company")}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="source">Source</Label>
                      <Select
                        value={form.source ?? ""} // stores lowercase value
                        onValueChange={(v) =>
                          setForm((prev) => ({
                            ...(prev as Partial<Lead>),
                            source: v,
                          }))
                        }
                      >
                        <SelectTrigger id="source" className="h-10">
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            "Website",
                            "Referral",
                            "Linkedin",
                            "Cold Call",
                            "Other",
                          ].map((src) => (
                            <SelectItem key={src} value={src.toLowerCase()}>
                              {src}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={form.status ?? ""}
                        onValueChange={(value) => {
                          setForm((prev) => ({
                            ...(prev as Partial<Lead>),
                            status: value,
                          }));
                          if (value !== "follow-up") {
                            setFollowUpDate("");
                          } else if (activeLead) {
                            setFollowUpDate(getStoredFollowUpDate(activeLead.id));
                          }
                        }}
                      >
                        <SelectTrigger id="status" className="h-10">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((s) => (
                            <SelectItem key={s} value={s}>
                              {capitalizeWords(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {isFollowUpSelected && (
                      <div className="grid gap-2">
                        <Label htmlFor="followup-date">Follow-up Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              className={`w-full justify-start text-left font-normal ${
                                followUpDate ? "" : "text-muted-foreground"
                              }`}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {followUpDateObj
                                ? format(followUpDateObj, "PPP")
                                : "Pick a date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              initialFocus
                              mode="single"
                              selected={followUpDateObj}
                              onSelect={(date) => {
                                setFollowUpDate(
                                  date ? format(date, "yyyy-MM-dd") : ""
                                );
                              }}
                              disabled={(date) => {
                                const normalized = new Date(date);
                                normalized.setHours(0, 0, 0, 0);
                                return normalized < today;
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        <p className="text-xs text-muted-foreground">
                          Reminder is stored locally on this device.
                        </p>
                      </div>
                    )}

                    <div className="grid gap-2">
                      <Label htmlFor="createdby">Owner</Label>
                      <Input
                        id="createdby"
                        value={
                          (form.createdby != null &&
                            userMap[String(form.createdby)]) ||
                          (form.createdby != null
                            ? String(form.createdby)
                            : "Unassigned")
                        }
                        readOnly
                        className="h-10"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="assignedto">Assigned To</Label>
                      <Select
                        value={form.assignedto ?? "__unassigned__"}
                        onValueChange={(value) => {
                          setForm((prev) => ({
                            ...(prev as Partial<Lead>),
                            assignedto:
                              value && value !== "__unassigned__"
                                ? value
                                : undefined,
                          }));
                        }}
                      >
                        <SelectTrigger id="assignedto" className="h-10">
                          <SelectValue placeholder="Select assignee" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unassigned__">Unassigned</SelectItem>
                          {Object.entries(userMap).map(([id, name]) => (
                            <SelectItem key={id} value={id}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="visastatusid">Visa Status</Label>
                      <select
                        id="visastatusid"
                        value={form.visastatusid ?? ""}
                        onChange={handleChange("visastatusid")}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                      >
                        <option value="">—</option>
                        {Object.entries(visaStatusMap).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="legalnamessn">Legal Name</Label>
                      <Input
                        id="legalnamessn"
                        value={form.legalnamessn || ""}
                        onChange={handleChange("legalnamessn")}
                        required={
                          (form.status || "").toLowerCase() === "signed"
                        }
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="last4ssn">SSN (last 4)</Label>
                      <Input
                        id="last4ssn"
                        maxLength={4}
                        value={form.last4ssn || ""}
                        onChange={handleChange("last4ssn")}
                        required={
                          (form.status || "").toLowerCase() === "signed"
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Checklist</Label>

                      {(form.checklist as ChecklistItem[] | undefined)?.map(
                        (item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!item?.checked}
                              onChange={() => toggleChecklistItem(idx)}
                            />
                            <Input
                              value={item?.label || ""}
                              placeholder={`Item ${idx + 1}`}
                              onChange={(e) =>
                                updateChecklistItem(idx, e.target.value)
                              }
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => removeChecklistItem(idx)}
                            >
                              Remove
                            </Button>
                          </div>
                        )
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        onClick={addChecklistItem}
                      >
                        Add Item
                      </Button>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        placeholder="Add notes…"
                        className="min-h-[120px]"
                        value={form.notes || ""}
                        onChange={handleChange("notes")}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <div className="px-6 py-3">
                <SheetFooter className="justify-end gap-2">
                  {mode === "view" ? (
                    <>
                      <Button
                        onClick={() => {
                          if (activeLead) {
                            seedForm(activeLead);
                            setMode("edit");
                          }
                        }}
                      >
                        Edit
                      </Button>
                      <SheetClose asChild>
                        <Button variant="outline" onClick={closeSheet}>
                          Close
                        </Button>
                      </SheetClose>
                    </>
                  ) : (
                    <>
                      <Button onClick={handleSave} disabled={saving}>
                        {saving ? "Saving…" : "Save Changes"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={saving}
                        onClick={() => {
                          if (activeLead) seedForm(activeLead);
                          setMode("view");
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </SheetFooter>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
};

export default Leads;
