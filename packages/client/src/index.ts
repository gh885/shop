/**
 * client —— 契约之上的运行时装配：生成 SDK（@shop/api）的传输层接线（sdk-client：token 注入 /
 * 401 刷新重放 / 错误归一化）与应用无关的登录态套件（auth-kit：内存 token 存储 + 启动静默刷新 +
 * 设备 ID + 登录态订阅）。
 *
 * 为什么单独一包：词表与形状住在 `@shop/common/contract`，那边是**纯常量与纯函数**、被后端四道
 * 跨语言门禁当文件读；这里是**带模块级单例状态的装配**，只有 7 个消费点（三端各一个入口 + app-kit
 * 的 3 个类型位 + 1 个测试 setup）。`ky` 与 `react` 全仓库只有这两个文件用，收在这一包里
 * `@shop/common` 就彻底不碰运行时依赖，依赖方向回到单向：client → common → i18n → monitoring。
 */
export { configureSdkClient } from "./sdk-client"
export type { SdkClientOptions, TokenStore } from "./sdk-client"
export { createAuthKit, createSdkAuthKit } from "./auth-kit"
export type { AuthKit, AuthKitOptions, AuthStatus } from "./auth-kit"
