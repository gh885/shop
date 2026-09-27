/**
 * Audit 模块 —— 平台治理动作的审计账本：谁、对哪类对象的哪个实例、做了什么、什么时候、说明。
 *
 * <p>schema: audit。一张 append-only 表（audit.audit_records），没有 UPDATE 入口。
 * 写入只经 {@link com.shop.platform.audit.api.RecordAuditCommand}，由各业务模块在自己的动作事务里同步调用
 * （同事务原子：动作回滚则审计行一起回滚）。本模块不认识任何业务对象——行里的 targetId 是不带语义的主键文本，
 * 查询时也不回查各模块表（那会让审计入口欠每个模块一份依赖）。
 *
 * <p>业务事件（infra.observability.BizEvent）回答「系统发生了什么」，可检索但会随日志保留期滚失；
 * 审计账本回答「谁动了什么」，要能按人/对象/时间反查、能导出。两者不是一回事，不合并。
 */
@ApplicationModule(displayName = "Audit")
package com.shop.platform.audit;

import org.springframework.modulith.ApplicationModule;
