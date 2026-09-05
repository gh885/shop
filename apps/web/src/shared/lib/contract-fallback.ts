import { isContractViolation } from "@shop/api"

/**
 * 门面读路径的契约漂移降级帮手（配合 @shop/api 的 zod 响应校验）：
 * - dev：强抛，尽早暴露契约问题；
 * - 生产：仅当响应 2xx 但不符合契约（isContractViolation）时返回兜底数据，
 *   其余错误（404/403/网络等）语义不被吞，照常抛。
 *
 * 用在 queryOptions.queryFn 上：route loader 的 ensureQueryData 与组件 useQuery
 * 共用同一缓存，包一处即两头生效，loader 无需各自 catch。
 *
 * 边界（刻意不支持，防滥用）：
 * - 写路径/mutation 不要用——契约漂移时兜底或重试没有意义，让错误走用户可见提示；
 * - 内部工作台（seller/admin）不要用——错误直接暴露更符合工具属性；
 * - 兜底值必须是调用方能正确渲染的合法领域形状（如空列表），不要伪造半真数据。
 */
export function withContractFallback<T>(
    queryFn: () => Promise<T>,
    fallback: () => T,
): () => Promise<T> {
    return async () => {
        try {
            return await queryFn()
        } catch (error) {
            if (isContractViolation(error) && import.meta.env.PROD) return fallback()
            throw error
        }
    }
}
