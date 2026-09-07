/**
 * @shop/api —— 生成 SDK 的唯一驻所（openapi-ts 输出到 src/sdk/，随 pnpm gen:sdk 重生成）。
 *
 * 本文件是包内唯一的**手写**文件：只做生成物的稳定入口聚合 ——
 *   - `export * from "./sdk"`：全部契约类型 + 各域 Api 调用对象
 *   - `export * from "./sdk/zod.gen"`：契约响应 zod schema（表单推导 / 数据守卫用）
 *   - `export { client }`：传输层单例（@shop/common 的 configureSdkClient 装配用）
 *
 * 除 index.ts 外禁止在包内新增手写文件：手写共享逻辑（金额 / 错误码 / 表单 / auth /
 * 传输装配 / 类目树算法）全部归 @shop/common —— 生成物每 gen 一次就整体覆盖，
 * 手写逻辑混进来会被误伤，且依赖方向必须保持 common → api 单向。
 */
export * from "./sdk"
export * from "./sdk/zod.gen"
export { client } from "./sdk/client.gen"
