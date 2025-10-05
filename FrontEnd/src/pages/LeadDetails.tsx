import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Calendar as CalendarIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import {
  buildFollowUpStorageKey,
  normalizeLeadStatuses,
} from "@/constants/leads";

const companies = [
  { prefix: "VIZ", name: "Vizva Inc." },
  { prefix: "SIL", name: "Silverspace Inc." },
  { prefix: "FL", name: "FlawLess" },
];

const visaStatuses = [
  { visaStatusId: 1, name: "H1B" },
  { visaStatusId: 2, name: "F1" },
  { visaStatusId: 3, name: "OPT" },
  { visaStatusId: 4, name: "STEM" },
  { visaStatusId: 5, name: "Green Card" },
  { visaStatusId: 6, name: "USC" },
  { visaStatusId: 7, name: "H4" },
];

function capitalize(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

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

interface ChecklistItem {
  label: string;
  checked: boolean;
}

interface LeadForm {
  firstname: string;
  lastname: string;
  email: string;
  phone?: string;
  company: string;
  status: string;
  source?: string;
  otherSource?: string;
  notes?: string;
  assignedto?: string;
  createdat?: string;
  updatedat?: string;
  lastcontactedat?: null;
  expectedrevenue?: null;
  createdby?: number;
  visastatusid?: number;
  checklist: ChecklistItem[];
  legalnamessn?: string;
  last4ssn?: string;
}

function extractLeadId(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;

  const directId = (payload as { id?: unknown }).id;
  if (typeof directId === "number") return directId;

  const nestedLead = (payload as { lead?: unknown }).lead;
  if (nestedLead && typeof nestedLead === "object") {
    const nestedId = (nestedLead as { id?: unknown }).id;
    if (typeof nestedId === "number") return nestedId;
  }

  const nestedData = (payload as { data?: unknown }).data;
  if (nestedData && typeof nestedData === "object") {
    const nestedId = (nestedData as { id?: unknown }).id;
    if (typeof nestedId === "number") return nestedId;
  }

  return undefined;
}

export default function LeadDetails() {
  const { id } = useParams<{ id: string }>();
  const { fetchWithAuth, user } = useAuth();
  const { toast } = useToast();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [form, setForm] = useState<LeadForm>({
    firstname: "",
    lastname: "",
    email: "",
    phone: "",
    company: "",
    status: "",
    source: "",
    otherSource: "",
    notes: "",
    assignedto: "",
    checklist: [],
  });
  const [statuses, setStatuses] = useState<string[]>([]);
  const [assignable, setAssignable] = useState<
    { userid: number; name: string }[]
  >([]);
  const [originalForm, setOriginalForm] = useState<LeadForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const editMode = !!id;
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

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const uid = user?.userid ?? "";
        const [columnsData, assignableUsersData] = await Promise.all([
          fetchWithAuth(`${API_BASE_URL}/columns`).then(
            (res) => res.json() as Promise<{ title: string }[]>
          ),
          fetchWithAuth(`${API_BASE_URL}/assignable-users?userId=${uid}`).then(
            (res) => res.json() as Promise<{ userid: number; name: string }[]>
          ),
        ]);

        const normalizedStatuses = normalizeLeadStatuses(
          columnsData.map((c) => c.title)
        );
        setStatuses(normalizedStatuses);

        // Build a unique, ordered list for the Assigned To dropdown
        const seen = new Set<number>();
        const uniq: { userid: number; name: string }[] = [];
        if (user && !seen.has(user.userid)) {
          uniq.push({ userid: user.userid, name: user.name });
          seen.add(user.userid);
        }
        for (const u of assignableUsersData) {
          if (!seen.has(u.userid)) {
            uniq.push({ userid: u.userid, name: u.name });
            seen.add(u.userid);
          }
        }

        if (editMode) {
          const uid = user?.userid ?? "";
          const leadData = await fetchWithAuth(
            `${API_BASE_URL}/crm-leads/${id}?userId=${uid}`
          ).then((res) => res.json());

          if (leadData.assignedto) {
            const aid = Number(leadData.assignedto);
            if (!seen.has(aid)) {
              uniq.push({ userid: aid, name: leadData.assignedtoname || `User ${aid}` });
              seen.add(aid);
            }
          }

          const loaded = {
            firstname: leadData.firstname,
            lastname: leadData.lastname,
            email: leadData.email,
            phone: leadData.phone || "",
            company: leadData.company,
            status: (leadData.status || "").toLowerCase(),
            source: leadData.source || "",
            otherSource: leadData.otherSource || leadData.othersource || "",
            notes: leadData.notes || "",
            assignedto: leadData.assignedto ? String(leadData.assignedto) : "",
            createdat: leadData.createdat,
            updatedat: leadData.updatedat,
            lastcontactedat: leadData.lastcontactedat,
            expectedrevenue: leadData.expectedrevenue,
            createdby: leadData.createdby,
            visastatusid: leadData.visastatusid,
            checklist: leadData.checklist || [],
            legalnamessn: leadData.legalnamessn || leadData.legalNameSsn || "",
            last4ssn: leadData.last4ssn || leadData.last4Ssn || "",
          };
          setForm(loaded);
          setOriginalForm(JSON.parse(JSON.stringify(loaded)));
          if (typeof window !== "undefined") {
            const possibleIdentifiers: Array<string | number> = [];
            if (typeof leadData.id === "number") possibleIdentifiers.push(leadData.id);
            if (id) {
              const numericId = Number(id);
              if (!Number.isNaN(numericId)) possibleIdentifiers.push(numericId);
            }
            if (leadData.email) possibleIdentifiers.push(String(leadData.email).toLowerCase());

            let storedReminder = "";
            for (const identifier of possibleIdentifiers) {
              const value = localStorage.getItem(
                buildFollowUpStorageKey(identifier)
              );
              if (value) {
                storedReminder = value;
                break;
              }
            }
            setFollowUpDate(storedReminder);
          }
          try {
            const ownerId = Number(leadData.createdby);
            const subsSet = new Set<number>();
            if (user?.userid != null) subsSet.add(Number(user.userid));
            assignableUsersData.forEach(u => subsSet.add(Number(u.userid)));
            setCanEdit(subsSet.has(ownerId));
          } catch {
            setCanEdit(false);
          }
        }

        setAssignable(uniq);
      } catch {
        setStatuses(normalizeLeadStatuses());
        toast({ title: "Failed to load lead details", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, user, editMode, fetchWithAuth, API_BASE_URL, toast]);

  const addChecklistItem = () => {
    setForm({
      ...form,
      checklist: [...form.checklist, { label: "", checked: false }],
    });
  };

  const updateChecklistItem = (idx: number, value: string) => {
    const list = [...form.checklist];
    list[idx].label = value;
    setForm({ ...form, checklist: list });
  };

  const toggleChecklistItem = (idx: number) => {
    const list = [...form.checklist];
    list[idx].checked = !list[idx].checked;
    setForm({ ...form, checklist: list });
  };

  const removeChecklistItem = (idx: number) => {
    const list = [...form.checklist];
    list.splice(idx, 1);
    setForm({ ...form, checklist: list });
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name === "firstname" || name === "lastname") {
      setForm({ ...form, [name]: capitalize(value) });
    } else if (name === "email") {
      setForm({ ...form, email: value.toLowerCase() });
    } else if (name === "phone") {
      setForm({ ...form, phone: formatPhone(value) });
    } else if (name === "legalnamessn") {
      setForm({ ...form, legalnamessn: capitalize(value) });
    } else if (name === "last4ssn") {
      const digits = value.replace(/\D/g, "").slice(0, 4);
      setForm({ ...form, last4ssn: digits });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const saveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    if (
      !form.firstname ||
      !form.lastname ||
      !form.email ||
      !form.phone ||
      !form.company
    ) {
      toast({
        title: "Please fill all required fields",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }

    if (!form.visastatusid) {
      toast({ title: "Visa status is required", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    // Skip client-side duplicate scan to avoid large slow fetches.
    // Rely on server constraints; show server error if duplicate.

    if (!form.status) {
      toast({ title: "Please select a status", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    const normalizedStatus = form.status.toLowerCase();
    const requiresFollowUpDate = normalizedStatus === "follow-up";

    if (requiresFollowUpDate && !followUpDate) {
      toast({ title: "Follow-up date is required", variant: "destructive" });
      setSubmitting(false);
      return;
    }

    if (normalizedStatus === "signed" && (!form.legalnamessn || !form.last4ssn)) {
      toast({
        title: "Legal Name SSN and Last4 SSN required for signed status",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }

    // Build body + method based on mode. For edit, send only changed, non-empty fields.
    const method: "POST" | "PATCH" = editMode ? "PATCH" : "POST";
    const url = editMode
      ? `${API_BASE_URL}/crm-leads/${id}`
      : `${API_BASE_URL}/crm-leads`;

    let body: Record<string, unknown>;
    if (editMode) {
      const keysToUpdate: (keyof LeadForm)[] = [
        "firstname",
        "lastname",
        "email",
        "phone",
        "company",
        "status",
        "source",
        "notes",
        "assignedto",
        "visastatusid",
        "checklist",
        "legalnamessn",
        "last4ssn",
        "otherSource",
      ];
      const patch: Record<string, unknown> = {};
      for (const key of keysToUpdate) {
        const nextVal = (form as unknown as Record<string, unknown>)[key];
        if (nextVal === null || nextVal === undefined) continue; // don't send null/undefined
        if (typeof nextVal === "string" && nextVal.trim() === "") continue; // don't blank out
        const prevVal = (originalForm as unknown as Record<string, unknown> | null)?.[key];
        const changed =
          key === "checklist"
            ? JSON.stringify(Array.isArray(nextVal) ? nextVal : []) !==
              JSON.stringify(Array.isArray(prevVal) ? prevVal : [])
            : typeof nextVal === "object"
            ? JSON.stringify(nextVal) !== JSON.stringify(prevVal)
            : nextVal !== prevVal;
        if (changed) {
          // Normalize key naming for server schema
          if (key === "otherSource") {
            patch["othersource"] = nextVal || undefined;
          } else {
            patch[key as string] = nextVal;
          }
        }
      }
      if (Object.keys(patch).length === 0) {
        toast({ title: "No changes to save" });
        return;
      }
      body = patch;
    } else {
      body = {
        ...form,
        company: form.company,
        createdat: form.createdat || new Date().toISOString(),
        updatedat: new Date().toISOString(),
        lastcontactedat: null,
        expectedrevenue: null,
        createdby: form.createdby || user?.userid,
        othersource: form.otherSource || undefined,
      };
    }

    const res = await fetchWithAuth(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    let data: unknown = null;
    if (res.status !== 204) {
      try {
        data = await res.json();
      } catch (err) {
        // ignore JSON parse errors
        void err;
      }
    }
    if (res.ok) {
      let notificationMsg = "";
      if (editMode) {
        const changes: Record<string, { old: unknown; new: unknown }> = {};
        if (originalForm) {
          Object.keys(form).forEach((key) => {
            const k = key as keyof LeadForm;
            if (
              JSON.stringify(form[k]) !==
              JSON.stringify((originalForm as unknown as Record<string, unknown>)[k])
            ) {
              changes[k] = {
                old: (originalForm as unknown as Record<string, unknown>)[k],
                new: form[k],
              };
            }
          });
        }
        if (Object.keys(changes).length) {
          const histPayload = {
            leadId: Number(id),
            state: JSON.stringify(changes),
            changedAt: new Date().toISOString(),
          };
          await fetchWithAuth(`${API_BASE_URL}/crmLeadHistory`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(histPayload),
          });

          if (changes.status) {
            notificationMsg = `${user?.name || "User"} changed status of ${
              form.firstname
            } ${form.lastname} for ${form.company} from ${
              changes.status.old
            } to ${changes.status.new}`;
          } else {
            const fields = Object.keys(changes).join(", ");
            notificationMsg = `${user?.name || "User"} updated ${
              form.firstname
            } ${form.lastname} for ${form.company} (${fields})`;
          }
        }
      } else {
        notificationMsg = `${user?.name || "User"} created lead ${
          form.firstname
        } ${form.lastname} for ${form.company} with status ${form.status}`;
      }

      const msg = editMode ? "Lead updated" : "Lead created";
      toast({ title: msg });
      if (notificationMsg) addNotification(notificationMsg);
      if (typeof window !== "undefined") {
        const targets = new Set<string | number>();
        if (editMode) {
          if (id) {
            const numeric = Number(id);
            if (!Number.isNaN(numeric)) targets.add(numeric);
          }
          const updatedId = extractLeadId(data);
          if (typeof updatedId === "number" && !Number.isNaN(updatedId)) {
            targets.add(updatedId);
          }
        } else {
          const createdId = extractLeadId(data);
          if (typeof createdId === "number" && !Number.isNaN(createdId)) {
            targets.add(createdId);
          }
        }
        if (form.email) {
          targets.add(form.email.toLowerCase());
        }

        targets.forEach((identifier) => {
          const key = buildFollowUpStorageKey(identifier);
          if (requiresFollowUpDate && followUpDate) {
            localStorage.setItem(key, followUpDate);
          } else {
            localStorage.removeItem(key);
          }
        });

        if (!requiresFollowUpDate) {
          setFollowUpDate("");
        }
      }
      navigate("/leads");
    } else {
      type ApiError = { message?: string } | null;
      const message = (data as ApiError)?.message || (res.status === 409 ? "Duplicate lead found" : "Error saving lead");
      toast({ title: message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  const stageFields = true;

  return (
    <DashboardLayout>
      <div className="relative min-h-[200px]">
        {loading && <LoadingOverlay />}
        {!loading && (
          <div className="space-y-6">
            <div className="flex items-center space-x-4">
              <Button variant="outline" size="icon" asChild>
                <Link to="/leads">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight">
                  {editMode ? "Edit Lead" : "New Lead"}
                </h1>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Lead Information</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={saveLead}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstname">First Name</Label>
                      <Input
                        id="firstname"
                        name="firstname"
                        value={form.firstname}
                        onChange={handleChange}
                        disabled={editMode && !canEdit}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastname">Last Name</Label>
                      <Input
                        id="lastname"
                        name="lastname"
                        value={form.lastname}
                        onChange={handleChange}
                        disabled={editMode && !canEdit}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={handleChange}
                        disabled={editMode && !canEdit}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        disabled={editMode && !canEdit}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Select
                      value={form.company}
                      onValueChange={(v) => setForm({ ...form, company: v })}
                      disabled={editMode && !canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.prefix} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={form.status || ""}
                      onValueChange={(v) => {
                        setForm({ ...form, status: v });
                        if (v !== "follow-up") setFollowUpDate("");
                      }}
                      disabled={editMode && !canEdit}
                    >
                      <SelectTrigger id="status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s} value={s}>
                            {capitalize(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {isFollowUpSelected && (
                    <div className="space-y-2">
                      <Label htmlFor="followup-date">Follow-up Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className={`w-full justify-start text-left font-normal ${
                              followUpDate ? "" : "text-muted-foreground"
                            }`}
                            disabled={editMode && !canEdit}
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
                  <div className="space-y-2">
                    <Label htmlFor="source">Source</Label>
                    <Select
                      value={form.source?.toLowerCase()}
                      onValueChange={(v) => setForm({ ...form, source: v })}
                      disabled={editMode && !canEdit}
                    >
                      <SelectTrigger>
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
                    {form.source === "Other" && (
                      <Input
                        className="mt-2"
                        placeholder="Other source"
                        name="otherSource"
                        value={form.otherSource}
                        onChange={handleChange}
                      />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visastatusid">Visa Status</Label>
                    <Select
                      value={form.visastatusid?.toString() || ""}
                      onValueChange={(v) =>
                        setForm({ ...form, visastatusid: Number(v) })
                      }
                      disabled={editMode && !canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select visa status" />
                      </SelectTrigger>
                      <SelectContent>
                        {visaStatuses.map((vs) => (
                          <SelectItem
                            key={vs.visaStatusId}
                            value={vs.visaStatusId.toString()}
                          >
                            {vs.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="assignedto">Assigned To</Label>
                    <Select
                      value={form.assignedto}
                      onValueChange={(v) => setForm({ ...form, assignedto: v })}
                      disabled={editMode && !canEdit}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select user" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignable.map((u) => (
                          <SelectItem key={u.userid} value={String(u.userid)}>
                            {u.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Checklist</Label>
                    {form.checklist.map((item, idx) => (
                      <div key={idx} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={item.checked}
                          onChange={() => toggleChecklistItem(idx)}
                          disabled={editMode && !canEdit}
                        />
                        <Input
                          value={item.label}
                          onChange={(e) =>
                            updateChecklistItem(idx, e.target.value)
                          }
                          disabled={editMode && !canEdit}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => removeChecklistItem(idx)}
                          disabled={editMode && !canEdit}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addChecklistItem}
                      disabled={editMode && !canEdit}
                    >
                      Add Item
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="legalnamessn">Legal Name SSN</Label>
                      <Input
                        id="legalnamessn"
                        name="legalnamessn"
                        value={form.legalnamessn}
                        onChange={handleChange}
                        disabled={editMode && !canEdit}
                        required={form.status === "signed"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last4ssn">Last 4 SSN</Label>
                      <Input
                        id="last4ssn"
                        name="last4ssn"
                        value={form.last4ssn}
                        onChange={handleChange}
                        maxLength={4}
                        disabled={editMode && !canEdit}
                        required={form.status === "signed"}
                      />
                    </div>
                  </div>
                  {stageFields && (
                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes</Label>
                      <Textarea
                        id="notes"
                        name="notes"
                        value={form.notes}
                        onChange={handleChange}
                        disabled={editMode && !canEdit}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <Button type="submit" disabled={submitting || (editMode && !canEdit)}>
                      {submitting ? "Submitting..." : "Save"}
                    </Button>
                    {editMode && !canEdit && (
                      <span className="text-xs text-muted-foreground">You can only edit your leads or your subordinates' leads.</span>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
