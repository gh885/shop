# reference — 外部设计清单收编

这些清单原本游离在仓库外（`D:/Code/docs/`），是实现对照类文档的依据。**收编日期 2026-09-06**，复制自当时的外部版本。

| 文件                                                     | 版本               | 被谁对照                                                                                         |
| -------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| [authentication-details.md](authentication-details.md)   | v1.1（2026-07-26） | `apps/server/docs/auth-implementation.md`                                                        |
| [observability-checklist.md](observability-checklist.md) | v1.0（2026-07-29） | `apps/server/docs/observability-implementation.md`、`docs/conventions/business-event-logging.md` |
| [permission-details.md](permission-details.md)           | v1.0               | `apps/server/docs/permission-implementation.md`                                                  |

注意：这些是快照副本，外部源文件后续修订不会自动同步；以仓库内这份为准修改，或整体替换后更新版本号与本表。

---

另有一份**竞品/平台做法调研**（非外部收编，2026-09 新增）：

| 文件                                                         | 快照日期 | 被谁对照                                             |
| ------------------------------------------------------------ | -------- | ---------------------------------------------------- |
| [coupon-platform-practices.md](coupon-platform-practices.md) | 2026-09  | `docs/decisions/coupon.md`（§16 平台对照与二期候选） |

它记录淘系/京东的券维度、叠加顺序与退回矩阵，来源分了一手（京东官方帮助）/ 二手（淘系服务商与商家后台口径）/ 低置信三档，引用时注意分层。
