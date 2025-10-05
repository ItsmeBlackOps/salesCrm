import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Users, UserPlus, DollarSign, Ticket, Calendar as CalendarIcon, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { differenceInDays, eachDayOfInterval, format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

const NEW_LEADS_DAYS_WINDOW = 7;

interface StatsCardProps {
  title: string;
  value: number | string;
  change: number;
  changeLabel: string;
  icon: React.ReactNode;
  formatter?: (value: number | string) => string;
}

export function StatsCard({ title, value, change, changeLabel, icon, formatter }: StatsCardProps) {
  const isPositive = change > 0;

  const formattedValue = formatter ? formatter(value) : value;

  return (
    <Card className="dashboard-card">
      <div className="flex justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <h3 className="text-2xl font-bold mt-1">{formattedValue}</h3>
        </div>
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">{icon}</div>
      </div>
      <div className="flex items-center mt-3">
        <div className={cn('flex items-center text-xs font-medium', isPositive ? 'text-crm-success' : 'text-crm-danger')}>
          {isPositive ? <ArrowUp className="h-3 w-3 mr-1" /> : <ArrowDown className="h-3 w-3 mr-1" />}
          {Math.abs(change)}%
        </div>
        <span className="text-xs text-muted-foreground ml-2">{changeLabel}</span>
      </div>
    </Card>
  );
}

export function DashboardStats() {
  const { fetchWithAuth, user } = useAuth();
  const [stats, setStats] = useState({ total: 0, newLeads: 0 });
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [ownerTotals, setOwnerTotals] = useState<Record<string, number>>({});
  const [ownerDailyCounts, setOwnerDailyCounts] = useState<Record<string, Record<string, number>>>({});
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [singleDate, setSingleDate] = useState<Date | undefined>();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const scanVersion = useRef(0);

  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
    setLoadingError(null);
    const loadUsers = async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE_URL}/assignable-users`);
        if (!res.ok) throw new Error('Failed to load users');
        const data = await res.json();
        const map: Record<string, string> = {};
        if (user?.userid && user.name) {
          map[String(user.userid)] = user.name;
        }
        (Array.isArray(data) ? data : []).forEach((u: { userid?: number; name?: string }) => {
          if (u?.userid && u.name) {
            map[String(u.userid)] = u.name;
          }
        });
        setUserMap(map);
      } catch {
        if (user?.userid && user.name) {
          setUserMap({ [String(user.userid)]: user.name });
        }
      }
    };
    void loadUsers();
  }, [fetchWithAuth, user]);

  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
    // Frontend background scanner across all pages; no backend changes required
    const run = async () => {
      scanVersion.current += 1;
      const v = scanVersion.current;
      let total = 0;
      let newLeads = 0;
      let cursor: number | null = null;
      const take = 100; // server allows up to 100
      const ownerTotalsMap = new Map<string, number>();
      const ownerPerDayMap = new Map<string, Map<string, number>>();

      const snapshotOwnerTotals = () => Object.fromEntries(ownerTotalsMap);
      const snapshotOwnerDailyCounts = () => {
        const obj: Record<string, Record<string, number>> = {};
        ownerPerDayMap.forEach((ownerMap, dateKey) => {
          obj[dateKey] = Object.fromEntries(ownerMap);
        });
        return obj;
      };

      const registerLead = (lead: { createdby?: number | string | null; createdat?: string | Date | null }) => {
        const ownerId = lead.createdby === null || lead.createdby === undefined || lead.createdby === ''
          ? 'unassigned'
          : String(lead.createdby);
        ownerTotalsMap.set(ownerId, (ownerTotalsMap.get(ownerId) ?? 0) + 1);

        if (lead.createdat) {
          const createdAt = lead.createdat instanceof Date ? lead.createdat : new Date(lead.createdat);
          if (!isNaN(createdAt.getTime())) {
            const dateKey = format(createdAt, 'yyyy-MM-dd');
            const ownerMap = ownerPerDayMap.get(dateKey) ?? new Map<string, number>();
            ownerMap.set(ownerId, (ownerMap.get(ownerId) ?? 0) + 1);
            ownerPerDayMap.set(dateKey, ownerMap);
          }
        }
      };

      const publish = () => {
        if (v !== scanVersion.current) return;
        setOwnerTotals(snapshotOwnerTotals());
        setOwnerDailyCounts(snapshotOwnerDailyCounts());
      };

      try {
        // First page
        let res = await fetchWithAuth(`${API_BASE_URL}/crm-leads?take=${take}`);
        if (!res.ok) throw new Error('Failed to load leads');
        const data: { items?: { createdat?: string; createdby?: number | string | null }[]; nextCursor?: unknown } | { createdat?: string; createdby?: number | string | null }[] = await res.json();
        const items: { createdat?: string; createdby?: number | string | null }[] = Array.isArray(data) ? data : (data.items || []);
        total += items.length;
        newLeads += items.filter(l => l.createdat && differenceInDays(new Date(), new Date(l.createdat)) <= NEW_LEADS_DAYS_WINDOW).length;
        items.forEach(registerLead);
        if (v === scanVersion.current) setStats({ total, newLeads });
        publish();
        cursor = Array.isArray(data)
          ? null
          : (typeof data.nextCursor === 'number'
              ? data.nextCursor
              : (data.nextCursor ? Number(String(data.nextCursor)) : null));

        // Subsequent pages
        let pages = 0;
        while (cursor !== null && pages < 200) {
          if (v !== scanVersion.current) return; // cancelled by new run
          res = await fetchWithAuth(`${API_BASE_URL}/crm-leads?take=${take}&cursor=${cursor}`);
          if (!res.ok) {
            setLoadingError('Some data could not be loaded. Showing partial results.');
            break;
          }
          const data2 = await res.json() as { items?: { createdat?: string; createdby?: number | string | null }[]; nextCursor?: unknown };
          const items2 = data2.items || [];
          total += items2.length;
          newLeads += items2.filter(l => l.createdat && differenceInDays(new Date(), new Date(l.createdat)) <= NEW_LEADS_DAYS_WINDOW).length;
          items2.forEach(registerLead);
          cursor = typeof data2.nextCursor === 'number'
            ? data2.nextCursor
            : (data2.nextCursor ? Number(String(data2.nextCursor)) : null);
          pages += 1;
          if (v === scanVersion.current) setStats({ total, newLeads });
          publish();
        }
      } catch {
        // keep whatever we had
      }
    };
    run();
  }, [fetchWithAuth, user]);

  const formatCurrency = (value: number | string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(Number(value));
  };

  const hasActiveSingle = dateMode === 'single' && !!singleDate;
  const hasActiveRange = dateMode === 'range' && !!dateRange?.from && !!dateRange?.to;

  const activeTotals = useMemo(() => {
    if (dateMode === 'single' && singleDate) {
      const key = format(singleDate, 'yyyy-MM-dd');
      return ownerDailyCounts[key] ?? {};
    }
    if (dateMode === 'range' && dateRange?.from && dateRange?.to) {
      const rangeTotals: Record<string, number> = {};
      const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
      for (const day of days) {
        const key = format(day, 'yyyy-MM-dd');
        const countsForDay = ownerDailyCounts[key];
        if (!countsForDay) continue;
        Object.entries(countsForDay).forEach(([ownerId, count]) => {
          rangeTotals[ownerId] = (rangeTotals[ownerId] ?? 0) + count;
        });
      }
      return rangeTotals;
    }
    return ownerTotals;
  }, [dateMode, dateRange, ownerDailyCounts, ownerTotals, singleDate]);

  const ownerOptions = useMemo(() => {
    return Object.entries(userMap)
      .map(([ownerId, ownerName]) => ({ ownerId, ownerName }))
      .sort((a, b) => a.ownerName.localeCompare(b.ownerName));
  }, [userMap]);

  const ownerCounts = useMemo(() => {
    return Object.entries(activeTotals)
      .filter(([ownerId]) =>
        selectedOwners.length ? selectedOwners.includes(ownerId) : true
      )
      .map(([ownerId, count]) => ({
        ownerId,
        ownerName:
          ownerId === 'unassigned'
            ? 'Unassigned'
            : userMap[ownerId] || `User ${ownerId}`,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [activeTotals, selectedOwners, userMap]);

  const ownerFilterLabel = useMemo(() => {
    if (!selectedOwners.length) return 'All owners';
    if (selectedOwners.length === 1) {
      const ownerId = selectedOwners[0];
      const name = ownerId === 'unassigned'
        ? 'Unassigned'
        : userMap[ownerId] || `User ${ownerId}`;
      return `Owner: ${name}`;
    }
    return `${selectedOwners.length} owners selected`;
  }, [selectedOwners, userMap]);

  const selectedFilterLabel = useMemo(() => {
    let dateLabel: string;
    if (dateMode === 'single' && singleDate) {
      dateLabel = `Leads created on ${format(singleDate, 'PPP')}`;
    } else if (dateMode === 'range' && dateRange?.from && dateRange?.to) {
      dateLabel = `Leads created between ${format(dateRange.from, 'PPP')} and ${format(dateRange.to, 'PPP')}`;
    } else {
      dateLabel = 'All dates';
    }
    return `${dateLabel} • ${ownerFilterLabel}`;
  }, [dateMode, dateRange, ownerFilterLabel, singleDate]);

  const hasActiveFilter = hasActiveSingle || hasActiveRange || selectedOwners.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard title="Total Leads" value={stats.total} change={0} changeLabel="" icon={<Users className="h-5 w-5" />} />
        <StatsCard title="New Leads" value={stats.newLeads} change={0} changeLabel="" icon={<UserPlus className="h-5 w-5" />} />
        <StatsCard title="Revenue" value={54200} change={8} changeLabel="since last month" icon={<DollarSign className="h-5 w-5" />} formatter={formatCurrency} />
        <StatsCard title="Open Tickets" value={32} change={-15} changeLabel="since last week" icon={<Ticket className="h-5 w-5" />} />
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="text-xl">Count of Leads</CardTitle>
            <CardDescription>{selectedFilterLabel}</CardDescription>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
            <ToggleGroup
              type="single"
              value={dateMode}
              onValueChange={value => value && setDateMode(value as 'single' | 'range')}
              className="justify-start"
            >
              <ToggleGroupItem value="single">Single Day</ToggleGroupItem>
              <ToggleGroupItem value="range">Range</ToggleGroupItem>
            </ToggleGroup>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-[220px] justify-start">
                  {selectedOwners.length
                    ? `${selectedOwners.length} owner${selectedOwners.length > 1 ? 's' : ''}`
                    : 'All owners'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Select owners</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ownerOptions.map(({ ownerId, ownerName }) => (
                  <DropdownMenuCheckboxItem
                    key={ownerId}
                    checked={selectedOwners.includes(ownerId)}
                    onCheckedChange={checked => {
                      const isChecked = checked === true;
                      setSelectedOwners(prev => {
                        if (isChecked) {
                          return prev.includes(ownerId) ? prev : [...prev, ownerId];
                        }
                        return prev.filter(id => id !== ownerId);
                      });
                    }}
                  >
                    {ownerName}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuCheckboxItem
                  checked={selectedOwners.includes('unassigned')}
                  onCheckedChange={checked => {
                    const isChecked = checked === true;
                    setSelectedOwners(prev => {
                      if (isChecked) {
                        return prev.includes('unassigned') ? prev : [...prev, 'unassigned'];
                      }
                      return prev.filter(id => id !== 'unassigned');
                    });
                  }}
                >
                  Unassigned
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={event => {
                    event.preventDefault();
                    setSelectedOwners([]);
                  }}
                >
                  Clear selection
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="min-w-[280px] justify-start whitespace-normal text-left font-normal leading-tight"
                  title={
                    dateMode === 'single'
                      ? singleDate
                        ? format(singleDate, 'PPP')
                        : 'Pick a date'
                      : dateRange?.from && dateRange.to
                        ? `${format(dateRange.from, 'PPP')} - ${format(dateRange.to, 'PPP')}`
                        : 'Pick a date range'
                  }
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateMode === 'single'
                    ? singleDate
                      ? format(singleDate, 'PPP')
                      : 'Pick a date'
                    : dateRange?.from && dateRange.to
                      ? `${format(dateRange.from, 'PPP')} - ${format(dateRange.to, 'PPP')}`
                      : 'Pick a date range'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode={dateMode === 'single' ? 'single' : 'range'}
                  selected={dateMode === 'single' ? singleDate : dateRange}
                  onSelect={value => {
                    if (dateMode === 'single') {
                      setSingleDate(value as Date | undefined);
                    } else {
                      setDateRange(value as DateRange | undefined);
                    }
                  }}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>
            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSingleDate(undefined);
                  setDateRange(undefined);
                  setSelectedOwners([]);
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingError && (
            <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span>{loadingError}</span>
            </div>
          )}
          {ownerCounts.length ? (
            <div className="divide-y">
              {ownerCounts.map(({ ownerId, ownerName, count }) => (
                <div key={ownerId} className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium">{ownerName}</span>
                  <span className="text-sm text-muted-foreground">{count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {hasActiveFilter ? 'No leads found for the selected filter.' : 'No leads found yet.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
