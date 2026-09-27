/**
 * Audit 模块对外命名接口（跨模块同步调用）。
 *
 * <p>只有一条命令：{@link com.shop.platform.audit.api.RecordAuditCommand}，供各业务模块在自己动作的
 * 事务里写下审计行；另有动作词表 {@link com.shop.platform.audit.api.AuditAction} 与
 * {@link com.shop.platform.audit.api.AuditTargetType}，让「动作名 ↔ 目标类型」在消费方也只有一份写法。
 *
 * <p>为什么是同步命令而不是事件：审计语义是「动作确实发生了」，异步投递两头都可能偏
 * （动作回滚了账本有行 / 动作成功了监听没跑账本没行）。宁可让写审计失败把动作一起回滚。
 */
@org.springframework.modulith.NamedInterface("api")
package com.shop.platform.audit.api;
