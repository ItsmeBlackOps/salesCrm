import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useRoleAccess } from "@/hooks/useRoleAccess";

interface Props {
  children: JSX.Element;
  componentId?: string;
}

export default function ProtectedRoute({ children, componentId }: Props) {
  const { user } = useAuth();
  const { roleAccess } = useRoleAccess();
  if (!user) return <Navigate to="/auth/signin" replace />;
  if (componentId && roleAccess[componentId] !== true) {
    return <Navigate to="/" replace />;
  }
  return children;
}
