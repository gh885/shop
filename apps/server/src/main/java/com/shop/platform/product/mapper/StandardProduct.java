package com.shop.platform.product.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import com.shop.platform.product.model.StandardProductStatus;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 平台标准品 —— 跨商家识别「同一个东西」的那一层。
 *
 * <p>三层模型里的最上层：标准品 → 商家商品（{@link Product}，多对一、可空）→ 商家 SKU（{@link Sku}）。
 * 它没有价格、没有库存、不参与下单与发货判定——那是商家商品与 SKU 的事。标准品的唯一职责是
 * 「让同一个商品在不同商家之间能被认出来是同一个」，供聚合、比价、类目运营使用。
 *
 * <p>错匹配不物理删：置 {@link StandardProductStatus#MERGED} 并指向 {@code mergedInto}，
 * 商家商品上的挂靠关系由平台改指到合并目标。合并只影响映射，不碰任何交易数据。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("product.standard_products")
public class StandardProduct extends AuditedEntity {

    /** 归一后的归属类目（product.categories.id），裸引用 */
    private UUID categoryId;

    /** 标准名（如「iPhone 15 Pro 256G 黑色」），平台维护；不是任何商家商品的标题副本 */
    private String name;

    /** 品牌，可空：长尾白牌没有品牌 */
    private String brand;

    /** 条码（EAN/UPC），可空；有它就是跨店识别最硬的依据（uk_standard_products_barcode） */
    private String barcode;

    /** ACTIVE 可用 / MERGED 已并入 {@link #mergedInto} */
    private StandardProductStatus status;

    /** 合并去向（本表 id），仅 MERGED 时非空——与 status 同空同非空，由 DB CHECK 钉住 */
    private UUID mergedInto;

    public boolean isActive() {
        return status == StandardProductStatus.ACTIVE;
    }
}
