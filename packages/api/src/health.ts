import { z } from "zod"

export const HealthResponseSchema = z.object({
    status: z.string(),
    checks: z.record(z.string(), z.string()).optional(),
    timestamp: z.string().optional(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export function createHealthApi(api: import("ky").KyInstance) {
    return {
        async check(): Promise<HealthResponse> {
            return HealthResponseSchema.parse(await api.get("actuator/health").json())
        },
    }
}
