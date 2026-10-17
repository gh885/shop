# 文档

> **唯一入口。** 按「你要做什么」找，不要按目录找。
> AI 的入口是根 [AGENTS.md](../AGENTS.md)（铁律 + 去哪做）；这里是人的入口。
>
> 一条事实只有一个家：命令清单在 [scripts/README.md](../scripts/README.md)，门禁清单在
> [conventions/tooling.md](conventions/tooling.md)，业务规则在 [business-rules/](business-rules/)。
> 其他地方提到它们只写「这一步做什么」，不复述。

## 我要做什么

| 我要…                                                      | 读                                                                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 写前端代码（目录 / 状态 / 取数 / 表单 / 测试 / 体积）      | [conventions/frontend.md](conventions/frontend.md)                                                                                  |
| 改取数口径——**改条款前必须先读论证**                       | [conventions/query-convergence.md](conventions/query-convergence.md)                                                                |
| 写后端代码（模块边界 / 分层 / 校验 / 测试 / 缓存）         | [apps/server/AGENTS.md](../apps/server/AGENTS.md) + [conventions/backend-*.md](conventions/)                                        |
| 加 / 改一个契约码（错误码 / 权限码 / locale / 路由 / SDK） | [conventions/contracts.md](conventions/contracts.md)                                                                                |
| 查某条业务规则是什么（带编号，可被代码引用）               | [business-rules/README.md](business-rules/README.md)                                                                                |
| 知道某个技术决定为什么这么定                               | [adr/README.md](adr/README.md)                                                                                                      |
| 跑门禁 / 改工具链 / 数据面 / CI 口径                       | [conventions/tooling.md](conventions/tooling.md)                                                                                    |
| 看监控、告警与性能预算                                     | [conventions/observability.md](conventions/observability.md) · [frontend-monitoring.md](conventions/frontend-monitoring.md)         |
| 部署 / 发布 / 回滚                                         | [release/deploy-runbook.md](release/deploy-runbook.md)                                                                              |
| 上线前自查                                                 | [release/production-readiness.md](release/production-readiness.md)                                                                  |
| 设计 token / 组件 / 视觉                                   | [packages/ui-web/DESIGN.md](../packages/ui-web/DESIGN.md)                                                                           |
| 看系统全景 / 模块图 / ID 与金额策略                        | [architecture.md](architecture.md)                                                                                                  |
| 查错误码判据与错误响应契约                                 | [error-codes.md](error-codes.md)                                                                                                    |
| 查权限码表 / 授权矩阵                                      | [conventions/permission-codes.md](conventions/permission-codes.md) · [authorization-matrix.md](conventions/authorization-matrix.md) |
| 搜索与首页分类（阶段 B/C 提案，未实现）                    | [search-design.md](search-design.md)                                                                                                |

## 目录分工

- `conventions/` —— **怎么做**：工程约定、门禁口径、取数论证。改代码前读。
- `business-rules/` —— **规则是什么**：按领域一文件，每条带编号，由 `BusinessRulesIndexTest` 核条数与引用。
- `adr/` —— **为什么**：并发控制、过期语义、定时投递等决策记录。
- `release/` —— 部署、发布自查、审计与冒烟。
- `reference/` —— 外部资料快照（不入库，见 `.gitignore`）。

## 维护

新增文档前先问：**能不能放进已有的一份？** 不能的话，在本文加一行入口——不要新建第二个索引。
改文档路径后跑 `lychee --offline .` 查链接（含锚点）。代码注释里的 `docs/*.md` 路径不参与自动校验，
改路径时用编辑器全局搜索一遍。
