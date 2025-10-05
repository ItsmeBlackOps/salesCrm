import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, BarChart3, Settings, LogOut, ChevronLeft, ChevronRight, LifeBuoy, TrendingUp, FileText, Target, ClipboardList, KeyRound, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import { useIsMobile } from '@/hooks/use-mobile';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useAuth } from '@/hooks/useAuth';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
}

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  href: string;
  componentId: string;
  isCollapsed?: boolean;
  badge?: string;
}


function NavItem({ icon: Icon, label, href, componentId, isCollapsed, badge }: NavItemProps) {
  const { roleAccess } = useRoleAccess();
  const location = useLocation();
  if (componentId && roleAccess[componentId] !== true) return null; 
  const isActive = location.pathname === href || (href === '/' && location.pathname === '/');

  return (
    <NavLink
      to={href}
      end={href === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:bg-accent',
          isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/80 hover:text-sidebar-foreground'
        )
      }
      data-nav-item={href}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      {!isCollapsed && (
        <div className="flex items-center justify-between w-full">
          <span>{label}</span>
          {badge && <Badge variant="secondary" className="ml-auto text-xs">{badge}</Badge>}
        </div>
      )}
    </NavLink>
  );
}

export function Sidebar({ isOpen, toggleSidebar }: SidebarProps) {
  const isMobile = useIsMobile();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const handleLogout = () => {
    logout();
    navigate('/auth/signin');
  };
  const handleToggleCollapse = () => {
    if (!isMobile) {
      setIsCollapsed(!isCollapsed);
    } else {
      toggleSidebar();
    }
  };

  // Scroll to active navigation item
  useEffect(() => {
    if (scrollAreaRef.current) {
      const activeNavItem = scrollAreaRef.current.querySelector(`[data-nav-item="${location.pathname}"]`) as HTMLElement;
      
      if (activeNavItem) {
        // Get the scrollable container
        const scrollContainer = scrollAreaRef.current;
        const containerRect = scrollContainer.getBoundingClientRect();
        const itemRect = activeNavItem.getBoundingClientRect();
        
        // Calculate if the item is visible
        const isItemVisible = (
          itemRect.top >= containerRect.top &&
          itemRect.bottom <= containerRect.bottom
        );
        
        // If not visible, scroll to make it visible
        if (!isItemVisible) {
          const scrollTop = activeNavItem.offsetTop - scrollContainer.clientHeight / 2 + activeNavItem.clientHeight / 2;
          scrollContainer.scrollTo({
            top: Math.max(0, scrollTop),
            behavior: 'smooth'
          });
        }
      }
    }
  }, [location.pathname, isOpen]);

  // Hide completely on mobile when closed
  if (isMobile && !isOpen) {
    return null;
  }

  return (
    <>
      {/* Mobile overlay */}
      {isMobile && isOpen && <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" onClick={toggleSidebar} />}

      <aside
        className={cn(
          'bg-sidebar border-r border-border z-50 transition-all duration-300 ease-in-out flex flex-col',
          isMobile ? (isOpen ? 'fixed inset-y-0 left-0 w-64' : '-translate-x-full') : isCollapsed ? 'w-16' : 'w-64',
          'h-full'
        )}
      >
        {/* Fixed Header */}
        <div className="flex h-16 items-center border-b border-border pl-4 flex-shrink-0">
          <Link to="/" className="flex items-center space-x-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="bg-primary rounded h-8 w-8 flex items-center justify-center text-white font-bold">P</div>
              {!isCollapsed && <span className="font-bold text-lg tracking-tight">salesHub</span>}
            </div>
          </Link>

          <Button variant="ghost" size="icon" onClick={handleToggleCollapse} className="ml-auto -mr-4  rounded-full">
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            <span className="sr-only">{isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
          </Button>
        </div>

        {/* Scrollable Content Area - takes remaining space between header and footer */}
        <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-2 min-h-0">
          <div className="flex flex-col gap-1">
            <nav className="grid gap-1">
              <NavItem componentId="dashboard" icon={LayoutDashboard} label="Dashboard" href="/" isCollapsed={isCollapsed} />
            </nav>

          

            <Separator className="my-4" />

            {/* CRM Section */}
            {!isCollapsed && (
              <div className="px-3 py-2">
                <h4 className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider">CRM</h4>
              </div>
            )}

            <nav className="grid gap-1">
              <NavItem componentId="analytics" icon={BarChart3} label="Analytics" href="/analytics" isCollapsed={isCollapsed} />
              <NavItem componentId="deals" icon={TrendingUp} label="Deals" href="/deals" isCollapsed={isCollapsed} />
              <NavItem componentId="deals" icon={FileText} label="Deal Details" href="/deal-details" isCollapsed={isCollapsed} />
              <NavItem componentId="leads" icon={Target} label="Leads" href="/leads" isCollapsed={isCollapsed} />
              {/* <NavItem componentId="leads" icon={ClipboardList} label="Lead Details" href="/lead-details" isCollapsed={isCollapsed} /> */}
              <NavItem componentId="reports" icon={BarChart3} label="Reports" href="/reports" isCollapsed={isCollapsed} />
              <NavItem componentId="reports" icon={FileText} label="Report Details" href="/report-details" isCollapsed={isCollapsed} />
            </nav>

          </div>
        </div>

        {/* Fixed Footer */}
        <div className="border-t border-border p-2 flex-shrink-0">
          <nav className="grid gap-1">
            <NavItem componentId="roleaccess" icon={KeyRound} label="Role Access" href="/role-access" isCollapsed={isCollapsed} />
            <NavItem componentId="usermanagement" icon={UserCheck} label="User Management" href="/user-management" isCollapsed={isCollapsed} />
            <NavItem componentId="settings" icon={Settings} label="Settings" href="/settings" isCollapsed={isCollapsed} />
            {user?.roleid === 1 && (
              <NavItem componentId="support" icon={LifeBuoy} label="Support" href="/support" isCollapsed={isCollapsed} />
            )}
            <Button
              variant="ghost"
              className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all', 'justify-start text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-accent')}
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5 flex-shrink-0" />
              {!isCollapsed && <span>Logout</span>}
            </Button>
          </nav>
        </div>
      </aside>
    </>
  );
}
