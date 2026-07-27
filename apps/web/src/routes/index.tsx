import { createFileRoute } from '@tanstack/react-router';

interface HealthResponse {
    status: string;
    checks: Record<string, string>;
    timestamp: string;
}

async function getHealth(): Promise<HealthResponse> {
    const res = await fetch('http://localhost:8080/api/health');
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
        <div className="mx-auto max-w-2xl p-8">
            <h1 className="mb-2 text-4xl font-bold">
                Shop
                <span className="ms-3 text-sm font-normal text-gray-500">多店铺电商平台</span>
            </h1>

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
            <span className="w-20 text-gray-600">{label}</span>
            <span className={ok ? 'text-green-700' : 'text-red-700'}>{status}</span>
        </div>
    );
}
