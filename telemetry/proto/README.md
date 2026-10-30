# proto — 协议真相源

这个目录**没有代码**，只有两样东西：`schema/`（我们认哪些字段）和 `fixtures/`（两端真实长什么样）。

## 为什么真相源是 schema，而不是 DTO

采集端用上游 SDK（`@sentry/react` / `io.sentry:sentry`），所以协议**不是我们发明的**，是 Sentry envelope 规范。我们只在它上面做两件事：

1. **声明子集**：哪些字段我们真的会读、会索引、会展示。
2. **钉住样本**：把两端真实发出的 payload 存下来，SDK 单测、relay 校验、前端渲染三处共用。

Sentry 自己走的是「Rust schema + 各语言手写类型 + 共享夹具」，因为它的 SDK 有 20 多种语言，codegen 的维护成本高于手写。我们只有两种语言、两个消费者，所以 **schema 单源 + 生成**更划算——但**夹具这条要照抄**，它比 codegen 值钱：没有真实样本，校验器永远只是"我以为的样子"。

M0 阶段 DTO 手写（`proto-java`），schema 用来做校验入口；M1 再上 codegen 生成 TS 类型给 `telemetry-web`。

## 强制字段（两端同名同义）

| 字段                     | 落在哪                    | 为什么                                                                                                                |
| ------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `service.name`           | `tags["service.name"]`    | 实体树上的一等公民。OTel 同名，将来映射是一张表                                                                       |
| `service.version`        | `tags["service.version"]` | 与 `release` 同值。`release` 是 Sentry 概念（发版/回归检测），`service.version` 是 OTel 概念，两个都留，由 relay 派生 |
| `deployment.environment` | `environment`             | 环境是查询的第一道过滤，不能只在 tag 里                                                                               |
| `tenant.id`              | `tags["tenant.id"]`       | **写侧强制打标**。将来做成本分摊、物理隔离、按租户删数据，全靠它                                                      |
| `projectId`              | envelope 路径 / `dsn`     | 归属来自 relay 鉴权结果，**不信任 payload 里的同名字段**                                                              |
| `trace_id`               | `contexts.trace.trace_id` | 三个关联键之一；另外两个是 `resource_id` 和「时间 + label 对齐」                                                      |

放在 `tags` 里而不是 `contexts` 里的理由：Sentry 的 tag 会进索引列，是最便宜的**可查询**维度；`contexts` 是给人看的结构，不进索引。

## 两端 fixture 为什么必须各一份

它们结构不同，只测一端会在另一端接进来时炸：

|        | 浏览器（`@sentry/react`）                                        | 后端（`io.sentry:sentry`）                                  |
| ------ | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| 栈     | `stacktrace.frames[]`，`abs_path` 是打包后的 URL，需要 sourcemap | 同结构但带 `module` / `class_name` / `lineno`，**天然可读** |
| 线程   | 无                                                               | `threads.values[]`（`crashed` / `current`）                 |
| 符号化 | Debug ID → sourcemap（M0 必做）                                  | source bundle（M1+，混淆才有必要）                          |
| 额外   | `request.headers`、`breadcrumbs` 密集                            | `debug_meta.images`、`runtime` / `os` / `jvm` 更全          |

推论：**M0 的符号化只需要前端**。Java 栈自带类名和行号，不做任何处理也能读。

## fixtures 怎么用

`fixtures/*.event.json` 存的是 **item payload**，不是完整 envelope。原因是 envelope 的 `length` 是字节数，手算必错；用脚本包：

```bash
node telemetry/scripts/envelope-wrap.mjs telemetry/proto/fixtures/browser-error.event.json
```

输出的就是一个能直接 `curl` 到 relay 的完整 envelope，也是校验器测试的输入。

抓新样本的原则：**从真实请求里存下来，不要手写**。手写的样本只能证明"我们的校验器认识我们自己编的东西"。
