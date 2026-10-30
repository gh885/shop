/**
 * 消费队列 → 校验 → 归一化 → 分组 → 落库 → 更新 issue。
 *
 * <p>为什么不和 relay 合并：relay 是"接收"，这里是"理解"。前者的扩容指标是连接数和带宽，
 * 后者是 CPU 和数据库写。合成一个进程时，一次分组算法变慢会直接反压到公网入口——
 * 那是最典型的"监控把业务打死"。
 *
 * <p>M0 只有 {@code all}/{@code worker} profile 会激活其中的消费者。
 */
@ApplicationModule(allowedDependencies = {"store", "grouping", "issues", "shared"})
package com.shop.telemetry.server.ingest;

import org.springframework.modulith.ApplicationModule;
