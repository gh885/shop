package com.shop.platform.audit.service;

import com.shop.platform.audit.mapper.AuditLogStore;
import com.shop.platform.audit.model.AuditEntry;
import java.util.Objects;
import java.util.Set;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/**
 * 写操作审计。清单驱动、同事务、只追加。
 *
 * <p>三条约束不是靠自觉，各有对应的实现：
 *
 * <ul>
 *   <li><b>清单驱动</b>：{@code action} 必须在 {@code audit.audit_action} 里登记过，否则直接抛异常。宁可挡在开发期，
 *       也不让审计口径悄悄漂移——一个拼错的动作名会让统计永久少一类。
 *   <li><b>同事务</b>：这里用调用方的事务，不另起 REQUIRES_NEW。业务回滚，审计也跟着没；业务提交，审计一定在。
 *   <li><b>只追加</b>：表和触发器在迁移里已经拦掉 UPDATE / DELETE，这里只提供 INSERT。
 * </ul>
 *
 * <p>为什么不用 {@code @Audited} 注解切面：切面只知道方法被调用，拿不到字段的前后值，批量改多行时也记不下来。
 * 见 {@code docs/domain/ledger.md} 第 10 节。
 */
@Component
public class AuditRecorder {

    /** Micrometer 把链路 ID 放在 MDC 里；没有链路（定时任务）时为 null。 */
    private static final String TRACE_ID_KEY = "traceId";

    private final AuditLogStore store;

    private final ObjectMapper json;

    private final Set<String> knownActions;

    public AuditRecorder(AuditLogStore store) {
        this.store = Objects.requireNonNull(store, "store");
        this.json = JsonMapper.builder().build();
        this.knownActions = Set.copyOf(store.knownActions());
    }

    public void record(AuditEntry entry) {
        Objects.requireNonNull(entry, "entry");
        if (!knownActions.contains(entry.action())) {
            throw new IllegalArgumentException("未登记的审计动作: " + entry.action() + "。先加一条 audit.audit_action 迁移，再调这里");
        }

        store.append(
                entry.action(),
                entry.objectType(),
                entry.objectId(),
                entry.operatorType(),
                entry.operatorId(),
                entry.merchantId(),
                json.writeValueAsString(entry.changes()),
                entry.result(),
                MDC.get(TRACE_ID_KEY));
    }
}
