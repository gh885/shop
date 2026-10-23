package com.shop.platform.audit.api;

/**
 * 审计的唯一写入口。
 *
 * <p>业务模块只认这个接口，不认 {@code AuditRecorder}——实现类住在 {@code service/}，换实现（比如改成异步刷盘）
 * 不该惊动调用方。命名接口是 {@code audit :: api}，见 {@code package-info.java}。
 *
 * <p><b>同事务</b>：调用方的事务就是审计的事务。业务回滚，审计跟着没；业务提交，审计一定在。
 * 所以这里不提供异步版本——异步会把"业务成功了但审计丢了"变成可能。
 *
 * <p>失败会抛异常（{@link IllegalArgumentException}，动作名没在 {@code audit.audit_action} 里登记）：
 * 审计宁可挡住这次写，也不要静默少记一笔。
 */
public interface AuditCommand {

    void record(AuditEntry entry);
}
