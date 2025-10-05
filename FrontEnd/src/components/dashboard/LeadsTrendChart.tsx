import { useEffect, useMemo, useState } from 'react';
import { format, startOfDay, subDays, parseISO, startOfWeek, subWeeks, startOfMonth, subMonths } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/hooks/useAuth';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useToast } from '@/hooks/use-toast';

const FETCH_PAGE_SIZE = 100;
const DAY_POINTS = 14;
const WEEK_POINTS = 12;
const MONTH_POINTS = 12;
const WEEK_STARTS_ON: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1; // Monday

type Timeframe = 'day' | 'week' | 'month';

type ChartDatum = {
  label: string;
  total: number;
};

export function LeadsTrendChart() {
  const { fetchWithAuth } = useAuth();
  const { toast } = useToast();
  const [timeframe, setTimeframe] = useState<Timeframe>('month');
  const [leadDates, setLeadDates] = useState<Date[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const dates: Date[] = [];
        let cursor: number | null = null;
        let pages = 0;

        const processPage = (items: { createdat?: string | Date | null }[]) => {
          items.forEach(item => {
            if (!item.createdat) return;
            const createdAt = item.createdat instanceof Date ? item.createdat : new Date(item.createdat);
            if (!isNaN(createdAt.getTime())) {
              dates.push(createdAt);
            }
          });
        };

        const firstRes = await fetchWithAuth(`${API_BASE_URL}/crm-leads?take=${FETCH_PAGE_SIZE}`);
        if (!firstRes.ok) throw new Error('Failed to load leads');
        const firstData: { items?: { createdat?: string | Date | null }[]; nextCursor?: unknown } | { createdat?: string | Date | null }[] = await firstRes.json();
        const firstItems = Array.isArray(firstData) ? firstData : firstData.items || [];
        processPage(firstItems);
        cursor = Array.isArray(firstData)
          ? null
          : (typeof firstData.nextCursor === 'number'
              ? firstData.nextCursor
              : (firstData.nextCursor ? Number(String(firstData.nextCursor)) : null));

        while (cursor !== null && pages < 200) {
          const res = await fetchWithAuth(`${API_BASE_URL}/crm-leads?take=${FETCH_PAGE_SIZE}&cursor=${cursor}`);
          if (!res.ok) break;
          const data = await res.json() as { items?: { createdat?: string | Date | null }[]; nextCursor?: unknown };
          const items = data.items || [];
          processPage(items);
          cursor = typeof data.nextCursor === 'number'
            ? data.nextCursor
            : (data.nextCursor ? Number(String(data.nextCursor)) : null);
          pages += 1;
        }

        if (!cancelled) {
          setLeadDates(dates);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unable to load lead trend data';
          setError(message);
          toast({
            variant: 'destructive',
            title: 'Lead trend data failed to load',
            description: message,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [fetchWithAuth, toast]);

  const dayCounts = useMemo(() => {
    const map = new Map<string, number>();
    leadDates.forEach(date => {
      const key = format(date, 'yyyy-MM-dd');
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [leadDates]);

  const weekCounts = useMemo(() => {
    const map = new Map<string, number>();
    dayCounts.forEach((count, key) => {
      const date = parseISO(key);
      const weekKey = format(startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON }), 'yyyy-MM-dd');
      map.set(weekKey, (map.get(weekKey) ?? 0) + count);
    });
    return map;
  }, [dayCounts]);

  const monthCounts = useMemo(() => {
    const map = new Map<string, number>();
    dayCounts.forEach((count, key) => {
      const date = parseISO(key);
      const monthKey = format(startOfMonth(date), 'yyyy-MM');
      map.set(monthKey, (map.get(monthKey) ?? 0) + count);
    });
    return map;
  }, [dayCounts]);

  const chartData = useMemo<{ data: ChartDatum[]; change: number }>(() => {
    const today = startOfDay(new Date());

    if (timeframe === 'day') {
      const series: ChartDatum[] = [];
      for (let i = DAY_POINTS - 1; i >= 0; i -= 1) {
        const day = subDays(today, i);
        const key = format(day, 'yyyy-MM-dd');
        series.push({
          label: format(day, 'MMM d'),
          total: dayCounts.get(key) ?? 0,
        });
      }
      const lastPoint = series[series.length - 1];
      const prevPoint = series[series.length - 2];
      const change = prevPoint?.total
        ? ((lastPoint.total - prevPoint.total) / prevPoint.total) * 100
        : 0;
      return { data: series, change };
    }

    if (timeframe === 'week') {
      const series: ChartDatum[] = [];
      const startWeek = startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON });
      for (let i = WEEK_POINTS - 1; i >= 0; i -= 1) {
        const weekStart = subWeeks(startWeek, i);
        const key = format(weekStart, 'yyyy-MM-dd');
        series.push({
          label: format(weekStart, 'MMM d'),
          total: weekCounts.get(key) ?? 0,
        });
      }
      const lastPoint = series[series.length - 1];
      const prevPoint = series[series.length - 2];
      const change = prevPoint?.total
        ? ((lastPoint.total - prevPoint.total) / prevPoint.total) * 100
        : 0;
      return { data: series, change };
    }

    // month
    const series: ChartDatum[] = [];
    const startMonth = startOfMonth(today);
    for (let i = MONTH_POINTS - 1; i >= 0; i -= 1) {
      const monthStart = subMonths(startMonth, i);
      const key = format(monthStart, 'yyyy-MM');
      series.push({
        label: format(monthStart, 'MMM yyyy'),
        total: monthCounts.get(key) ?? 0,
      });
    }
    const lastPoint = series[series.length - 1];
    const prevPoint = series[series.length - 2];
    const change = prevPoint?.total
      ? ((lastPoint.total - prevPoint.total) / prevPoint.total) * 100
      : 0;
    return { data: series, change };
  }, [dayCounts, monthCounts, timeframe, weekCounts]);

  const isPositive = chartData.change >= 0;
  const changeLabel = `${isPositive ? '+' : ''}${chartData.change.toFixed(1)}% vs previous period`;

  return (
    <Card className="dashboard-card h-full">
      <CardHeader className="flex flex-col gap-4 p-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-lg font-medium">Lead Volume Trend</CardTitle>
          <Badge
            variant="outline"
            className={isPositive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}
          >
            {changeLabel}
          </Badge>
        </div>
        <ToggleGroup type="single" value={timeframe} onValueChange={value => value && setTimeframe(value as Timeframe)}>
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
        </ToggleGroup>
      </CardHeader>
      <CardContent className="px-0 pt-6">
        <div className="h-[300px] w-full">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading lead trend…</div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{error}</div>
          ) : chartData.data.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No lead data available yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData.data}
                margin={{
                  top: 5,
                  right: 8,
                  left: -20,
                  bottom: 5,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                  }}
                  formatter={(value: number) => [value.toLocaleString(), 'Leads']}
                  labelFormatter={(label) => `${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  name="Leads"
                  dot={{
                    r: 4,
                    fill: 'hsl(var(--primary))',
                    stroke: 'hsl(var(--card))',
                    strokeWidth: 2,
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
