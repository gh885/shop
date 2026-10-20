package com.shop.platform.common.event;

import java.util.UUID;

/**
 * 领域事件的最小契约：必须自带一个生产端生成的 ID。
 *
 * <p>ID 为什么必须由生产端给：消费端每收到一次都拿同一个 ID 去重。让消费端自己造 ID，重投就变成了新事件，
 * 幂等直接失效。
 *
 * <p>事件命名与字段约定见 {@code docs/domain/module-map.md} 第 7 节。
 */
public interface DomainEvent {

    UUID eventId();
}
