# 文档

> **唯一入口。** 后端已清空重建，这里只剩重写蓝图；旧的业务规则、约定、ADR 已随代码一起删除（`main` 分支仍可查）。

| 我要…                                            | 读                                                         |
| ------------------------------------------------ | ---------------------------------------------------------- |
| 知道有哪些模块、怎么分层、依赖往哪走、事件怎么发 | [domain/module-map.md](domain/module-map.md)               |
| 知道业务代码开工前要先打好哪些地基               | [domain/platform-baseline.md](domain/platform-baseline.md) |
| 知道表怎么分、迁移怎么写、DDL 守什么             | [domain/database.md](domain/database.md)                   |
| 知道钱怎么记、分录怎么平、和审计什么关系         | [domain/ledger.md](domain/ledger.md)                       |
| 知道谁能做什么、数据怎么隔离、越权怎么防         | [domain/access-control.md](domain/access-control.md)       |

## 目录分工

- `domain/` —— **模型是什么**：模块边界、分层、事件契约、地基清单、数据库管理、资金账务、权限。

## 维护

新增文档前先问：**能不能并进上面某一份？** 不能的话，在本文加一行入口——不要新建第二个索引。
