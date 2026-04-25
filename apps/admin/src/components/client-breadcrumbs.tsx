'use client';

import { useEffect, useState } from 'react';
import { Breadcrumbs } from './breadcrumbs';

export function ClientBreadcrumbs() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return <Breadcrumbs />;
}
