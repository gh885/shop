package com.shop.platform.product.model;

import java.util.Map;
import java.util.Set;

/**
 * SPU 履约状态机（product 模块状态规则的唯一真相）：草稿 → 上架 ⇄ 下架。
 *
 * <p>DB 存 {@code name()}（varchar），不存 ordinal——改枚举名不影响存量数据，name 本身即语义。
 * 转移合法性（{@link #TRANSITIONS}）收在这里，实体薄委托；跨聚合门槛（SKU 全设价）留 service。
 */
public enum ProductStatus {

    /** 下架（等价"删除"，可无损恢复） */
    OFF,

    /** 上架（买家可见/可购） */
    PUBLISHED,

    /** 草稿（创建后未发布） */
    DRAFT;

    /** 状态图（源态 → 合法目标态）：发布/下架/重上的唯一真相 */
    private static final Map<ProductStatus, Set<ProductStatus>> TRANSITIONS = Map.of(
            DRAFT, Set.of(PUBLISHED),
            OFF, Set.of(PUBLISHED),
            PUBLISHED, Set.of(OFF));

    // ---- 谓词 ----

    public boolean isPublished() {
        return this == PUBLISHED;
    }

    public boolean isOff() {
        return this == OFF;
    }

    public boolean isDraft() {
        return this == DRAFT;
    }

    /** 上架商品规格冻结（价格/库存可改，规格组合不可改），要改规格先下架 */
    public boolean isSpecsEditable() {
        return !isPublished();
    }

    /** 能否转移到目标态；跨聚合门槛不归这里 */
    public boolean canTransitionTo(ProductStatus target) {
        return TRANSITIONS.getOrDefault(this, Set.of()).contains(target);
    }
}
