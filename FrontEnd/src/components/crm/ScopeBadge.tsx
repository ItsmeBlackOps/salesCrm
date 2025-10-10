import { Badge } from "@/components/ui/badge";

interface ScopeBadgeProps {
  role: string;
}

export const ScopeBadge = ({ role }: ScopeBadgeProps) => {
  let label = "";
  let color: "default" | "secondary" | "outline" = "default";

  switch (role) {
    case "Agent":
      label = "Scope: You (Own Leads)";
      color = "outline";
      break;
    case "Manager":
      label = "Scope: Team / Region";
      color = "secondary";
      break;
    case "Admin":
    case "SuperAdmin":
      label = "Scope: All Leads";
      color = "default";
      break;
    default:
      label = "Scope: Limited";
      color = "outline";
      break;
  }

  return (
    <Badge variant={color} className="text-xs px-3 py-1">
      {label}
    </Badge>
  );
};
