import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { requireAuth, ShopReviewStatusSchema } from '../lib/api';

export const Route = createFileRoute('/')({
    beforeLoad: requireAuth,
    validateSearch: z.object({
        status: ShopReviewStatusSchema.optional(),
        page: z.coerce.number().int().min(1).catch(1),
    }),
    component: ReviewRoute,
});

function ReviewRoute() {
    return <div>dd</div>;
}
