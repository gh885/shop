# @shop/common

契约之上、UI 之下的共享逻辑层。

放进来的标准：被 ≥2 个 app 使用 + **不依赖任何 UI 包（ui-web / app-kit）** + 不含端级业务规则。例外是「口径类」逻辑（脱敏形状 `mask.ts`、大数折位 `count.ts`）：它们即使暂时只有一个 app 在调也该进来——收口本身就是理由，「一个概念只许有一个出口」由 `src/shared-vocabulary.test.ts` 钉住，第二个调用点出现时不需要重新决定住哪。

依赖方向：`domain` / `contract` → `@shop/api`（生成 SDK）与 `@shop/i18n` / `@shop/monitoring`，不得反向——那两个包是从这里拆出去的切片，它们不认得这里，所以 workspace 依赖图是纯 DAG（`pnpm -r typecheck` 不吃 cycle）。sdk-client 的上报接线测试（`api-events.test.ts`）因此住在 contract，只从 `@shop/monitoring` 拿 `Transport` 当注入桩。

## 切片（子路径 exports，没有根 barrel）

| 入口                    | 装什么                                                                                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@shop/common/domain`   | 业务字段口径：money / address / regions / coupon / mask / count / status-options / tracking / product-fields / note-fields / scroll / length-rules |
| `@shop/common/contract` | 契约接线层：ApiError 形状、服务端与客户端码表、422 规则词表、权限点、sdk-client 传输装配、auth-kit 登录态套件                                      |

另两个切片已升为独立包：locale 判定与消息格式化在 `@shop/i18n`，前端监控单一出口在 `@shop/monitoring`。

`src/` 根下剩的两个文件是扫全仓的门禁测试（`shared-vocabulary.test.ts`、`page-shell-width.test.ts`），不属于任何切片。

与相邻包的分工：`@shop/api` 是生成 SDK（包内除聚合入口外全是生成物，禁止新增手写文件）；`@shop/ui-web` 是纯 UI 组件，不知道契约；`@shop/app-kit` 是同时消费这两者的展示胶水；`@shop/i18n` 与 `@shop/monitoring` 是不认得契约也不认得 UI 的横切单一出口。约定条文在 `docs/conventions/frontend.md`，错误码规则在 `docs/error-codes.md`。
