import { createFileRoute } from '@tanstack/react-router';

import { AdminLayout } from '../components/admin-layout';
import { requireAuth } from '../lib/api';

export const Route = createFileRoute('/_app')({
    beforeLoad: requireAuth,
    component: AdminLayout,
});
