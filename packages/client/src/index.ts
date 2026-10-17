/** client —— 契约之上的运行时装配：SDK 传输层接线（sdk-client）+ 应用无关登录态套件（auth-kit）。单独一包：这里是带模块级单例状态的装配（ky/react 只这俩文件用），common 保持纯常量与纯函数；依赖单向 client → common → i18n → monitoring（见 docs/architecture.md）。 */
export { configureSdkClient } from "./sdk-client"
export type { SdkClientOptions, TokenStore } from "./sdk-client"
export { createAuthKit, createSdkAuthKit } from "./auth-kit"
export type { AuthKit, AuthKitOptions, AuthStatus } from "./auth-kit"
