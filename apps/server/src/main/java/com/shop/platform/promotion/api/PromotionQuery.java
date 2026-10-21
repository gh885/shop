package com.shop.platform.promotion.api;

import java.util.List;
import java.util.UUID;

/**
 * 算价取规则的唯一入口。
 *
 * <p>为什么按类目过滤而不是捞全平台：规则表会一直长，捞全平台再在内存里筛，等于把 promotion 的容量
 * 变成 pricing 的延迟。按类目 + 时间过滤，是这两个模块之间唯一必要的查询条件。
 */
public interface PromotionQuery {

    /**
     * 取生效规则，已按 {@code priority} 升序（数值小 = 优先级高）。
     *
     * <p>返回的是值对象，不是实体：pricing 不 import promotion 的 model，也不跨 schema JOIN。
     */
    List<AppliedRule> effectiveRules(List<UUID> categoryIds, UUID merchantId);
}
