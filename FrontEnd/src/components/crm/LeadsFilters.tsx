import { useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface LeadsFiltersProps {
  statuses: string[];
  userMap: Record<string, string>;
  onApply: (filters: { status?: string; owner?: string }) => void;
}

export const LeadsFilters = ({
  statuses,
  userMap,
  onApply,
}: LeadsFiltersProps) => {
  const [status, setStatus] = useState<string>();
  const [owner, setOwner] = useState<string>();

  const handleApply = () => {
    onApply({ status, owner });
  };

  const handleClear = () => {
    setStatus(undefined);
    setOwner(undefined);
    onApply({});
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" /> Filters
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-4 space-y-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {statuses.length === 0 ? (
                <SelectItem disabled value="no-status">
                  No statuses
                </SelectItem>
              ) : (
                statuses
                  .filter((s) => s && s.trim() !== "")
                  .map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Owner</Label>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger>
              <SelectValue placeholder="All owners" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(userMap).length === 0 ? (
                <SelectItem disabled value="no-owner">
                  No owners
                </SelectItem>
              ) : (
                Object.entries(userMap).map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="outline" onClick={handleClear}>
            Clear
          </Button>
          <Button onClick={handleApply}>Apply</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
