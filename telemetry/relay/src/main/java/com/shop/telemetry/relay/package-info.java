/**
 * relay：唯一公网入口。
 *
 * <p>职责：DSN 鉴权、envelope 拆分、（M2）脱敏 / 限流 / 采样、入队。到此为止。
 *
 * <p>它**不解析 event 字段、不碰数据库、不做分组、不知道 issue 是什么**。这条界线靠 Maven
 * 依赖方向强制：relay 不依赖 server，所以越界会直接编译失败。
 */
package com.shop.telemetry.relay;
