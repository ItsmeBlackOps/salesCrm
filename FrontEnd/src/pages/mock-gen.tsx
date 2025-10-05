import React from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Copy, Check, X } from "lucide-react";
import { ArrowLeft } from "lucide-react";

type Candidate = {
  name: string;
  phone: string;
  email: string;
  company: string;
  jobTitle: string;
};

const capitalizeWords = (str: string) =>
  str
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");

export default function MockGen() {
  const [searchParams] = useSearchParams();
  const [form, setForm] = React.useState({
    name: "",
    phone: "",
    email: "",
    company: "",
  });
  const [jobTitle, setJobTitle] = React.useState("");
  const [showJobDialog, setShowJobDialog] = React.useState(false);
  const [candidate, setCandidate] = React.useState<Candidate | null>(null);
  const [copyState, setCopyState] = React.useState<"table" | "subject" | null>(
    null
  );
  const [prefilled, setPrefilled] = React.useState(false);

  React.useEffect(() => {
    const n = searchParams.get("name") || "";
    const e = searchParams.get("email") || "";
    const p = searchParams.get("phone") || "";
    const c = searchParams.get("company") || "";
    if (n || e || p || c) {
      setForm({ name: n, email: e, phone: p, company: c });
      setPrefilled(true);
      setShowJobDialog(true); // only ask for Job Title
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getTitle = (c: Candidate) =>
    `Mock Interview - ${capitalizeWords(c.name)} - ${capitalizeWords(
      c.jobTitle
    )} - ${capitalizeWords(c.company)}`;

  const rows = (c: Candidate): { label: string; value: string }[] => [
    { label: "Candidate Name", value: capitalizeWords(c.name) },
    { label: "Job Title", value: capitalizeWords(c.jobTitle) },
    { label: "Company", value: capitalizeWords(c.company) },
    { label: "Email ID", value: c.email },
    { label: "Contact Number", value: c.phone },
  ];

  const onGenerate = () => {
    // basic validation for base fields
    if (!form.name || !form.email || !form.phone || !form.company) {
      alert("Please fill name, email, phone and company");
      return;
    }
    setShowJobDialog(true);
  };

  const confirmJobTitle = () => {
    if (!jobTitle.trim()) return;
    const c: Candidate = { ...form, jobTitle: jobTitle.trim() };
    setCandidate(c);
    setShowJobDialog(false);
  };

  const copySubject = async () => {
    if (!candidate) return;
    await navigator.clipboard.writeText(getTitle(candidate));
    setCopyState("subject");
    setTimeout(() => setCopyState(null), 1500);
  };

  const copyTable = () => {
    if (!candidate) return;
    // Create a temporary DOM to copy exact table styling like the provided format
    const temp = document.createElement("div");
    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "auto";
    table.style.color = "black";
    rows(candidate).forEach(({ label, value }) => {
      const tr = document.createElement("tr");
      const td1 = document.createElement("td");
      const td2 = document.createElement("td");
      [td1, td2].forEach((td) => {
        td.style.border = "1px solid black";
        td.style.padding = "8px";
        td.style.whiteSpace = "nowrap";
        td.style.width = "auto";
      });
      td1.style.fontWeight = "bold";
      td1.textContent = label;
      td2.textContent = value || "-";
      tr.appendChild(td1);
      tr.appendChild(td2);
      table.appendChild(tr);
    });
    temp.appendChild(table);
    document.body.appendChild(temp);
    const range = document.createRange();
    range.selectNode(temp);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("copy");
      sel.removeAllRanges();
    }
    document.body.removeChild(temp);
    setCopyState("table");
    setTimeout(() => setCopyState(null), 1500);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 relative min-h-[200px]">
        <Button variant="outline" size="icon" asChild>
          <Link to="/leads">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">
          Mock Interview Generator
        </h1>

        {!prefilled && (
          <Card>
            <CardHeader>
              <CardTitle>Candidate Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="name">
                    Name
                  </label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="email">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, email: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="phone">
                    Phone
                  </label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, phone: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="company">
                    Company
                  </label>
                  <Input
                    id="company"
                    value={form.company}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, company: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="pt-4 flex gap-2">
                <Button onClick={onGenerate}>Generate</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {candidate && (
          <Card>
            <CardHeader className="flex items-start justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <button
                  onClick={copySubject}
                  className="p-1.5 hover:bg-muted rounded"
                >
                  {copyState === "subject" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <span className="truncate">{getTitle(candidate)}</span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <button
                  onClick={copyTable}
                  className="p-1.5 hover:bg-muted rounded"
                >
                  {copyState === "table" ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="border-collapse border border-black dark:border-white dark:text-white">
                  <tbody>
                    {rows(candidate).map(({ label, value }) => (
                      <tr key={label} className="border-b border-black">
                        <td className="border border-black p-2 font-semibold whitespace-nowrap">
                          {label}
                        </td>
                        <td className="border border-black p-2 whitespace-nowrap">
                          {value || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        <Dialog open={showJobDialog} onOpenChange={setShowJobDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enter Job Title</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                placeholder="e.g. Senior React Developer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowJobDialog(false)}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button onClick={confirmJobTitle}>Confirm</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
