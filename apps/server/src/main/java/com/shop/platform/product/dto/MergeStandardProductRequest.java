package com.shop.platform.product.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * 合并标准品：把 {@code sourceId} 并入 {@code targetId}（管理端纠错用）。
 *
 * <p>只有「并」没有「删」：挂靠关系与历史映射都引用着来源行，物理删会留下悬空引用。
 * 合并后来源行置 MERGED 并指向目标，挂在来源上的商家商品一并改指到目标。
 */
public record MergeStandardProductRequest(
        /** 并入的目标标准品（必须存在且可用） */
        @NotNull UUID targetId) {}
