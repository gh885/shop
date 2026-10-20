# @shop/app-kit

三个 SPA（web / seller / admin）共享的「应用层胶水」。

职责边界（这是它存在的原因）：同时消费 `@shop/common`（契约形状 / 错误语义）与 `@shop/ui-web`（UI）的那部分约定——notify 的错误文案策略、时间展示格式、登录表单交互、图片 URL 拼装策略等——既不属于纯 UI 包，也不属于 `@shop/common`（它不含展示决策），又实在没必要在每个 app 里复制一份。

放进来的标准：被 ≥2 个 app 使用 + 依赖两个底层包 + 不含端级业务规则（端级业务规则仍归各 app；端级**装配参数**的差异由工厂参数吸收）。

## 切片（子路径 exports，没有根 barrel）

| 入口                    | 装什么                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@shop/app-kit/auth`    | LoginForm 与账号侧表单格式规则的 owner（手机号形状/位数、验证码位数、密码下限——邀请成员、注销确认复用同一条规则）                        |
| `@shop/app-kit/forms`   | submitForm / FormActions / ReasonForm / serverFieldErrors（422 落点）/ RegionField / useUnsavedLeaveGuard                                |
| `@shop/app-kit/data`    | createAppQueryClient（QueryClient 默认值唯一构造口）、notify 与 MutationMeta、createMeQuery、QueryBoundary、分页 schema 与 PaginationBar |
| `@shop/app-kit/shell`   | mountSpa、RoutePending / RouteErrorFallback / trackRouteResolved、workbench 侧栏与顶栏（样式另走 `@shop/app-kit/workbench.css`）         |
| `@shop/app-kit/display` | 时间格式化（format / TimeText）、createImgUrl、copyWithNotify                                                                            |
| `@shop/app-kit/i18n`    | provider / useI18n / locale scope / 错误码 catalog（error-keys，判据在「错误码判据」）                                                   |
| `@shop/app-kit/test`    | 组件测试的统一薄包装（renderWithProviders 等，三端 vitest setup 指到这里）                                                               |
