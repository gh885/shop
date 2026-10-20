# 文档

> **唯一入口。** 后端已清空重建，这里只剩重写蓝图；旧的业务规则、约定、ADR 已随代码一起删除（`main` 分支仍可查）。

| 我要…                                            | 读                                                         |
| ------------------------------------------------ | ---------------------------------------------------------- |
| 知道有哪些模块、怎么分层、依赖往哪走、事件怎么发 | [domain/module-map.md](domain/module-map.md)               |
| 知道业务代码开工前要先打好哪些地基               | [domain/platform-baseline.md](domain/platform-baseline.md) |
| 知道表怎么分、迁移怎么写、DDL 守什么             | [domain/database.md](domain/database.md)                   |
| 知道钱怎么记、分录怎么平、和审计什么关系         | [domain/ledger.md](domain/ledger.md)                       |
| 知道谁能做什么、数据怎么隔离、越权怎么防         | [domain/access-control.md](domain/access-control.md)       |
| 知道出错时返回什么、错误码怎么加                 | [domain/errors.md](domain/errors.md)                       |

## 目录分工

- `domain/` —— **模型是什么**：模块边界、分层、事件契约、地基清单、数据库管理、资金账务、权限、错误。
- **代码旁边的 README** —— `apps/server/README.md` 是后端总览与闭环状态；`src/main/java/com/shop/platform/`
  及其下每个模块目录各有一份，只讲「这里放什么、别放什么、怎么加东西」。

模块图闭不闭合用 `pnpm modules:check` 核：它读 30 个模块 README 里的 yaml 块，检查 schema 唯一、依赖不悬空、
无环、事件双向闭合。现在是**结构闭合、事件有 7 个缺口**。

两层分工：`docs/domain/` 讲**为什么这么设计**，目录 README 讲**这个包里该有什么**。同一个结论不写两遍。

## 维护

新增文档前先问：**能不能并进上面某一份？** 不能的话，在本文加一行入口——不要新建第二个索引。

目录 README 例外：它能就地长出来，但只写本目录的事，不复制 `docs/domain/` 里的论证。
