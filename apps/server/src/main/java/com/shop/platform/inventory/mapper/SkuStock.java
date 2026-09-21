package com.shop.platform.inventory.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.shop.platform.infra.db.AuditedEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 库存主体 —— 一个 SKU 一行，管"这一卖法有多少货、被冻结多少"。
 *
 * <p>半充血（见 AGENTS.md）：不变式与派生归实体，并发闸门与持久化归 service。
 * 真正的原子扣减/冻结/扣实/释放一律条件更新（WHERE 可用量 >= n + 影响行数判 0，
 * 单语句 RETURNING OLD/NEW），不因实体有状态方法而改读-改-写。
 *
 * <p>{@code @Version} 乐观锁只服务于「绝对量调整」这条读-改-写路径（后台把总库存 set 成某值，
 * 两个并发调整会互相覆盖）——updateById 时 MP 自动带 version 比较 + version+1，冲突则影响行数为 0。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("inventory.sku_stock")
public class SkuStock extends AuditedEntity {

    /** 归属 SKU ID，product.skus.id，裸引用不加 FK；一卖法一份货，uk 保证唯一 */
    private UUID skuId;

    /** 总库存（物理货量），只靠补货增加，人工盘点/绝对调整走 @Version 乐观锁 */
    private Integer stock;

    /** 冻结量：已下单未扣实。支付成功 → 扣实（frozen 减），取消/关单 → 释放（frozen 减 + stock 不变），非法状态防超卖靠校验 */
    private Integer frozenStock;

    /** 乐观锁版本：绝对量调整（读-改-写）的并发闸门，MP 更新时自动注入 */
    @Version
    private Integer version;
}
