import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Index from './pages/Index';
import NotFound from './pages/NotFound';
import Messages from './pages/Messages';
import Contactus from './pages/ContactUS';
import Calendar from './pages/Calendar';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import Support from './pages/Support';
import Deals from './pages/Deals';
import DealDetails from './pages/DealDetails';
import Leads from './pages/Leads';
import LeadDetails from './pages/LeadDetails';
import Reports from './pages/Reports';
import ReportDetails from './pages/ReportDetails';
import AddContact from './pages/AddContact';
import Profile from './pages/Profile';
import RoleAccess from './pages/RoleAccess';
import UserManagement from './pages/UserManagement';
import CreateUserCard from './pages/CreateUserCard';
import MockGen from './pages/mock-gen';

// Authentication pages
import SignIn from './pages/auth/SignIn';

import { AuthProvider, useAuth } from './hooks/useAuth';
import { RoleAccessProvider } from './hooks/useRoleAccess';
import { NotificationProvider } from './hooks/useNotifications';
import ProtectedRoute from './components/ProtectedRoute';

// Component pages
import ComponentAccordion from './pages/components/Accordion';
import ComponentAvatar from './pages/components/Avatar';
import ComponentAlerts from './pages/components/Alerts';
import ComponentBadge from './pages/components/Badge';
import ComponentBreadcrumb from './pages/components/Breadcrumb';
import ComponentButtons from './pages/components/Buttons';
import ComponentCalendar from './pages/components/Calendar';
import ComponentCard from './pages/components/Card';
import ComponentCarousel from './pages/components/Carousel';
import ComponentCollapse from './pages/components/Collapse';
import ComponentDropdown from './pages/components/Dropdown';
import ComponentGantt from './pages/components/Gantt';
import ComponentListGroup from './pages/components/ListGroup';
import ComponentModals from './pages/components/Modals';
import ComponentNavsTabs from './pages/components/NavsTabs';
import ComponentOffcanvas from './pages/components/Offcanvas';
import ComponentProgress from './pages/components/Progress';
import ComponentPlaceholder from './pages/components/Placeholder';
import ComponentPagination from './pages/components/Pagination';
import ComponentPopovers from './pages/components/Popovers';
import ComponentScrollspy from './pages/components/Scrollspy';
import ComponentSortable from './pages/components/Sortable';
import ComponentSpinners from './pages/components/Spinners';
import ComponentToast from './pages/components/Toast';
import ComponentTooltips from './pages/components/Tooltips';
import ComponentTypedText from './pages/components/TypedText';
import ComponentChatWidget from './pages/components/ChatWidget';
function SuperAdminOnly({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (user?.roleid !== 1) {
    return <Navigate to="/" replace />;
  }
  return children;
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <RoleAccessProvider>
          <NotificationProvider>
            <BrowserRouter
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
            <Routes>
              <Route path="/auth/signin" element={<SignIn />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute componentId="dashboard">
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contacts"
                element={
                  <ProtectedRoute componentId="contacts">
                    <Contactus />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analytics"
                element={
                  <ProtectedRoute componentId="analytics">
                    <Analytics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/messages"
                element={
                  <ProtectedRoute componentId="messages">
                    <Messages />
                  </ProtectedRoute>
                }
              />
              <Route path="/calendar" element={<ProtectedRoute componentId="calendar"><Calendar /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute componentId="settings"><Settings /></ProtectedRoute>} />
              <Route
                path="/support"
                element={
                  <ProtectedRoute componentId="support">
                    <SuperAdminOnly>
                      <Support />
                    </SuperAdminOnly>
                  </ProtectedRoute>
                }
              />
              <Route path="/deals" element={<ProtectedRoute componentId="deals"><Deals /></ProtectedRoute>} />
              <Route path="/deal-details" element={<ProtectedRoute componentId="deals"><DealDetails /></ProtectedRoute>} />
              <Route path="/leads" element={<ProtectedRoute componentId="leads"><Leads /></ProtectedRoute>} />
              <Route path="/lead-details/:id?" element={<ProtectedRoute componentId="leads"><LeadDetails /></ProtectedRoute>} />
              <Route path="/mock-gen" element={<ProtectedRoute componentId="leads"><MockGen /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute componentId="reports"><Reports /></ProtectedRoute>} />
              <Route path="/report-details" element={<ProtectedRoute componentId="reports"><ReportDetails /></ProtectedRoute>} />
              <Route path="/add-contact" element={<ProtectedRoute componentId="contacts"><AddContact /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/role-access" element={<ProtectedRoute componentId="roleaccess"><RoleAccess /></ProtectedRoute>} />
              <Route path="/user-management" element={<ProtectedRoute componentId="usermanagement"><UserManagement /></ProtectedRoute>} />
              <Route path="/create-user" element={<ProtectedRoute componentId="usermanagement"><CreateUserCard /></ProtectedRoute>} />
              

              {/* Authentication routes */}
              <Route path="/auth/signin" element={<SignIn />} />

              {/* Component routes */}
              <Route path="/components/accordion" element={<ComponentAccordion />} />
              <Route path="/components/avatar" element={<ComponentAvatar />} />
              <Route path="/components/alerts" element={<ComponentAlerts />} />
              <Route path="/components/badge" element={<ComponentBadge />} />
              <Route path="/components/breadcrumb" element={<ComponentBreadcrumb />} />
              <Route path="/components/buttons" element={<ComponentButtons />} />
              <Route path="/components/calendar" element={<ComponentCalendar />} />
              <Route path="/components/card" element={<ComponentCard />} />
              <Route path="/components/carousel" element={<ComponentCarousel />} />
              <Route path="/components/collapse" element={<ComponentCollapse />} />
              <Route path="/components/dropdown" element={<ComponentDropdown />} />
              <Route path="/components/gantt" element={<ComponentGantt />} />
              <Route path="/components/list-group" element={<ComponentListGroup />} />
              <Route path="/components/modals" element={<ComponentModals />} />
              <Route path="/components/navs-tabs" element={<ComponentNavsTabs />} />
              <Route path="/components/offcanvas" element={<ComponentOffcanvas />} />
              <Route path="/components/progress" element={<ComponentProgress />} />
              <Route path="/components/placeholder" element={<ComponentPlaceholder />} />
              <Route path="/components/pagination" element={<ComponentPagination />} />
              <Route path="/components/popovers" element={<ComponentPopovers />} />
              <Route path="/components/scrollspy" element={<ComponentScrollspy />} />
              <Route path="/components/sortable" element={<ComponentSortable />} />
              <Route path="/components/spinners" element={<ComponentSpinners />} />
              <Route path="/components/toast" element={<ComponentToast />} />
              <Route path="/components/tooltips" element={<ComponentTooltips />} />
              <Route path="/components/typed-text" element={<ComponentTypedText />} />
              <Route path="/components/chat-widget" element={<ComponentChatWidget />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          </NotificationProvider>
        </RoleAccessProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
