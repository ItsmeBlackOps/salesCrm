import { useMemo } from 'react';

export default function SystemDiagnosticsLink() {
  const flag = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const sp = new URLSearchParams(window.location.search);
    return sp.get('diag') === '1';
  }, []);
  return flag ? <a href="/_diag/db-latency">Diagnostics</a> : null;
}

