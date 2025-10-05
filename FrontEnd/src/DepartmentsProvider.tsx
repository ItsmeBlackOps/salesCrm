import { createContext, useContext, useState } from 'react';

type Dept = { id: number; name: string };
type Ctx = { departments: Dept[]; loading: boolean };

const C = createContext<Ctx | null>(null);

export function DepartmentsProvider({ children }: { children: React.ReactNode }) {
  const [state] = useState<Ctx>({ departments: [], loading: true });
  return <C.Provider value={state}>{children}</C.Provider>;
}

export function useDepartmentsContext() {
  const ctx = useContext(C);
  if (!ctx) throw new Error('useDepartmentsContext must be used within DepartmentsProvider');
  return ctx;
}

