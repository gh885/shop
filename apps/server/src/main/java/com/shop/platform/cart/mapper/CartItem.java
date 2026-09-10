package com.shop.platform.cart.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 购物车条目 —— 交易前置暂存区，「这个用户想买几个什么」。
 *
 * <p>刻意瘦：只存归属 + SKU 指针 + 数量/勾选。标题/现价/库存/店铺一律不落库——
 * 购物车展示的是现价（加购到下单之间的比价窗口），读取时跨 schema 按 ID 只读批查拼装；
 * 下单那一刻的快照由 order 模块负责。条目谁也不引用（订单做快照），删除即硬删，无软删列。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("cart.items")
public class CartItem {

    /** 单行购买数量上限，与 DB CHECK 兜底同值 */
    public static final int MAX_QUANTITY_PER_ITEM = 999;

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 归属买家（account.users.id），跨 schema 裸引用不加 FK */
    private UUID userId;

    /** 加购的卖法（product.skus.id），跨 schema 裸引用不加 FK；同用户同 SKU 唯一（uk_cart_items_user_sku） */
    private UUID skuId;

    /** 数量。DB CHECK 兜底 1~999，真实限购（秒杀限件）在 service/order 校验；同 SKU 再加的累加封顶在 CartItemMapper#upsertMerging */
    private Integer quantity;

    /** 结算勾选位：结算页只提交勾选条目。落库保证跨设备一致 */
    private Boolean selected;

    /** 加购时间，MyBatis-Plus 插入时自动填充。列表按它倒序 = 新加的在前 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;
}
