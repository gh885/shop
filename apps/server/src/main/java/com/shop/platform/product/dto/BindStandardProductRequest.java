package com.shop.platform.product.dto;

import java.util.UUID;

/**
 * 卖家给商品挂靠平台标准品：{@code standardProductId} 传 null = 取消挂靠。
 *
 * <p>用「显式 null」表达取消，而不是另开一个 DELETE 端点：挂靠关系是商品的一个字段，
 * 改字段走同一个 PUT，语义比「删除一个子资源」更贴近它实际是什么。
 */
public record BindStandardProductRequest(
        /** 目标标准品；null = 取消挂靠（不校验存在性） */
        UUID standardProductId) {}
