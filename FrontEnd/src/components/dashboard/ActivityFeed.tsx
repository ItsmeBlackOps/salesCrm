import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';


export function ActivityFeed() {
  const { notifications } = useNotifications();

  return (
    <Card className="dashboard-card">
      <CardHeader className="mb-6 p-0">
        <CardTitle className="text-lg font-medium">Activity Feed</CardTitle>
      </CardHeader>
      <CardContent className="overflow-auto max-h-[400px] px-0 pt-4">
        <div className="space-y-5">
          {notifications.length ? (
            notifications.map((n) => (
              <div key={n.id} className="flex gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>NT</AvatarFallback>
                </Avatar>
                <div className="space-y-1 border-b border-border pb-5 w-full">
                  <p className="text-sm">{n.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(n.time), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No recent activity</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
