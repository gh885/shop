package com.shop.platform.cart.mapper;

import com.baomidou.mybatisplus.annotation.FieldStrategy;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.AuditedEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 购物车条目 —— 交易前置暂存区，「这个用户想买几个什么」。
 *
 * <p>刻意瘦：只存归属 + SKU 指针 + 数量/勾选。标题/现价/库存/店铺一律不落库——
 * 购物车展示的是现价（加购到下单之间的比价窗口），读取时跨 schema 按 ID 只读批查拼装；
 * 下单那一刻的快照由 order 模块负责。条目谁也不引用（订单做快照），删除即硬删，无软删列。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("cart.items")
public class CartItem extends AuditedEntity {

    /** 归属买家（account.users.id），跨 schema 裸引用不加 FK */
    private UUID userId;

    /** 加购的卖法（product.skus.id），跨 schema 裸引用不加 FK；同用户同 SKU 唯一（uk_cart_items_user_sku） */
    private UUID skuId;

    /**
     * 数量。上限见 {@link com.shop.platform.common.Quantities#LINE_QUANTITY_MAX}（入口 400 与 DB CHECK 同值），
     * 真实限购（秒杀限件）在 service/order 校验。
     *
     * <p>回写永不带这一列：加购是 {@code upsertMerging} 在行锁下的累加（{@code quantity = LEAST(quantity + n, 上限)}），
     * 改数量走 {@code updateOne} 的条件更新；若还有一条整行回写把打开页面时读到的数量写回，并发加购累上去的那几件
     * 就被静默抹掉（累加列一律 NEVER，{@code SecondWriterColumnGateTest}）。
     */
    @TableField(updateStrategy = FieldStrategy.NEVER)
    private Integer quantity;

    /** 结算勾选位：结算页只提交勾选条目。落库保证跨设备一致 */
    private Boolean selected;
}
