package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 运费模板 —— 一个店铺一份计费合同：按收货地区与件数收多少运费，或者干脆包邮。
 *
 * <p>金额列一律「分」（与 order 的金额列同口径），币种由订单的 currency 决定（本平台定价币种为 CNY），
 * 故模板自身不存币种。
 *
 * <p>归属店铺（shop.shops.id），跨 schema 裸引用不加 FK。order 结算经 shop :: api 的
 * {@code ShippingFeeReadQuery} 取报价，不直接读本表；模板怎么算只有本模块说得出口。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("shop.shipping_templates")
public class ShippingTemplate {

    /** 主键。应用层生成 uuidv7（见 infra/MyBatisPlusMetaObjectHandler），一旦创建不可变 */
    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 归属店铺（shop.shops.id），每店至多一个生效模板（uk_shipping_templates_shop） */
    private UUID shopId;

    /** 卖家承担运费：不看地区与件数，整店包邮（对齐淘宝 assumer=1） */
    private Boolean freeShipping;

    /** 满件包邮门槛（件）；null = 不设此条件 */
    private Integer freeOverQuantity;

    /** 满额包邮门槛（分）；null = 不设此条件。判定基数是同店商品总额，不含运费本身 */
    private Long freeOverAmount;

    /** 软删除标记：NULL=生效，非 NULL=已删。MyBatis-Plus 逻辑删除，查询自动过滤 */
    @TableLogic(value = "null", delval = "NOW()")
    private OffsetDateTime deletedAt;

    /** 创建时间，MyBatis-Plus 插入时自动填充 */
    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;

    /** 更新时间，插入/更新时自动填充 */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private OffsetDateTime updatedAt;

    /**
     * 本模板是否免运费 —— 模板级包邮条件判定（同店订单合计口径）。
     *
     * <p>满额基数是<b>商品总额</b>而非应付额：运费是待求的结果，拿结果判条件会绕成死循环。
     * 将来接优惠券时，这里的基数要跟「优惠后金额」对齐（见 order 的金额构成口径）。
     */
    public boolean freeAt(int totalQuantity, long itemAmountFen) {
        if (Boolean.TRUE.equals(freeShipping)) {
            return true;
        }
        if (freeOverQuantity != null && totalQuantity >= freeOverQuantity) {
            return true;
        }
        return freeOverAmount != null && itemAmountFen >= freeOverAmount;
    }
}
