package com.shop.platform.product.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * SPU 履约状态机（product 模块状态规则的唯一真相）：草稿 → 上架 ⇄ 仓库中，草稿 → 仓库中。
 *
 * <p>仓库中（{@link #WAREHOUSE}）是「不在售但填完了」的汇聚态，容纳两类商品：
 * ① 填完但主动选择放入仓库（草稿 → 仓库中）；
 * ② 上架后又下架（上架 → 仓库中）。
 * 从仓库中随时可重新上架。
 *
 * <p>DB 存 {@code name()}（varchar），不存 ordinal——改枚举名不影响存量数据，name 本身即语义。
 * 状态迁移由 service 的条件更新逐条写死（{@code requireTransition(from, to)}），这里只放谓词。
 */
@Schema(enumAsRef = true)
public enum ProductStatus {

    /** 仓库中（等价旧「下架/删除」，可无损恢复；也收填完未发布的商品） */
    WAREHOUSE,

    /** 上架（买家可见/可购） */
    PUBLISHED,

    /** 草稿（创建后未发布，仍在编辑） */
    DRAFT;

    // 谓词
    public boolean isPublished() {
        return this == PUBLISHED;
    }

    public boolean isWarehouse() {
        return this == WAREHOUSE;
    }

    public boolean isDraft() {
        return this == DRAFT;
    }

    /** 上架商品规格冻结（价格/库存可改，规格组合不可改），要改规格先下架 */
    public boolean isSpecsEditable() {
        return !isPublished();
    }
}
