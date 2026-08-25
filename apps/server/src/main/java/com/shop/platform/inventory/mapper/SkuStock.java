package com.shop.platform.inventory.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 库存主体 —— 一个 SKU 一行，管"这一卖法有多少货、被冻结多少"。
 *
 * <p>半充血（见 AGENTS.md）：不变式与派生归实体，并发闸门与持久化归 service。
 * 派生视图只有 {@link #availableStock()}（stock - frozen_stock，只读不落库）；
 * 真正的原子扣减/冻结/扣实/释放一律条件更新（WHERE 可用量 >= n + 影响行数判 0），
 * 不因实体有状态方法而改读-改-写。
 *
 * <p>{@code @Version} 乐观锁只服务于「绝对量调整」这条读-改-写路径（后台把总库存 set 成某值，
 * 两个并发调整会互相覆盖）——updateById 时 MP 自动带 version 比较 + version+1，冲突则影响行数为 0。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("inventory.sku_stock")
public class SkuStock {

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 归属 SKU ID，product.skus.id，裸引用不加 FK；一卖法一份货，uk 保证唯一 */
    private UUID skuId;

    /** 总库存（物理货量），只靠补货增加，人工盘点/绝对调整走 @Version 乐观锁 */
    private Integer stock;

    /** 冻结量：已下单未扣实。支付成功 → 扣实（frozen 减），取消/关单 → 释放（frozen 减 + stock 不变），非法状态防超卖靠校验 */
    private Integer frozenStock;

    /** 乐观锁版本：绝对量调整（读-改-写）的并发闸门，MP 更新时自动注入 */
    @Version
    private Integer version;

    /** 创建时间 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;

    // ---- 派生视图：只读转换不落库（非表字段） ----

    /** 可用量 = 总库存 - 冻结量。下单/冻结只能动可用量，扣实/释放动的是冻结量 */
    public int availableStock() {
        return stock - frozenStock;
    }

    /** 是否缺货（可用量为 0）：列表/详情前端标缺货用 */
    public boolean isSoldOut() {
        return availableStock() <= 0;
    }
}
