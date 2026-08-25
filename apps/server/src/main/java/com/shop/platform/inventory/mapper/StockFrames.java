package com.shop.platform.inventory.mapper;

import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 库存变更的前后两帧 —— 条件更新语句经 PG18 RETURNING OLD/NEW 一次性带回的行快照，
 * 是流水记账的直接原料：两帧在同一语句内原子可见，并发他方的变更各自成行，账本严格连续可重放。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class StockFrames {

    /** 归属 SKU ID */
    private UUID skuId;

    /** 操作前总库存 */
    private Integer beforeStock;

    /** 操作前冻结量 */
    private Integer beforeFrozenStock;

    /** 操作后总库存 */
    private Integer afterStock;

    /** 操作后冻结量 */
    private Integer afterFrozenStock;
}
