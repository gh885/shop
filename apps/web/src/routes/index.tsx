import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

import { buttonVariants, cn } from '@shop/ui-web';

interface HealthResponse {
    status: string;
    checks: Record<string, string>;
    timestamp: string;
}

async function getHealth(): Promise<HealthResponse> {
    // SSR 期 fetch 在服务端执行，相对 URL 不可用，需要绝对地址
    const url = import.meta.env.SSR ? 'http://localhost:8080/api/health' : '/api/health';
    const res = await fetch(url);
    return res.json();
}

export const Route = createFileRoute('/')({
    component: Home,
    loader: async () => {
        try {
            return await getHealth();
        } catch {
            return null;
        }
    },
});

function Home() {
    const health = Route.useLoaderData();

    return (
        <div className="mx-auto max-w-6xl p-8">
            <div className="flex flex-col items-start gap-4 rounded-2xl bg-brand-subtle p-8">
                <h2 className="text-2xl font-bold tracking-tight text-brand-subtle-foreground">
                    0 元开店，让好生意被更多人看见
                </h2>
                <p className="text-brand-subtle-foreground/80">
                    免费创建店铺，审核通过即可上架商品，开始经营。
                </p>
                <Link
                    to="/sell"
                    className={cn(
                        buttonVariants(),
                        'bg-brand text-brand-foreground hover:bg-brand-hover active:translate-y-px',
                    )}
                >
                    免费开店
                    <ArrowRight className="size-4" />
                </Link>
            </div>

            <div className="mt-8 space-y-4">
                <h2 className="text-lg font-semibold">系统状态</h2>
                {health ? (
                    <div className="space-y-2">
                        <StatusItem
                            label="服务端"
                            status={health.status}
                        />
                        <StatusItem
                            label="数据库"
                            status={health.checks.database}
                        />
                        <StatusItem
                            label="Redis"
                            status={health.checks.redis}
                        />
                    </div>
                ) : (
                    <p className="text-yellow-600">服务端未连接，请启动后端服务</p>
                )}
            </div>
        </div>
    );
}

function StatusItem({ label, status }: { label: string; status: string }) {
    const ok = status === 'UP';
    return (
        <div className="flex items-center gap-3">
            <span className={`size-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="w-20 text-muted-foreground">{label}</span>
            <span className={ok ? 'text-green-700' : 'text-red-700'}>{status}</span>
        </div>
    );
}
