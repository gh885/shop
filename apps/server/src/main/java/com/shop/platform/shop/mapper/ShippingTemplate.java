package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.infra.db.AuditedEntity;
import java.time.OffsetDateTime;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 运费模板 —— 一个店铺一份计费合同：按收货地区与件数收多少运费，或者干脆包邮。
 *
 * <p>金额列按「分 + 币种」两列存（与 order 的金额列同口径），读出来在本实体一处收成 Money：
 * 模板是店铺对外的报价合同，它自己的币种才是报价的币种，不该借订单的。
 *
 * <p>归属店铺（shop.shops.id），跨 schema 裸引用不加 FK。order 结算经 shop :: api 的
 * {@code ShippingFeeReadQuery} 取报价，不直接读本表；模板怎么算只有本模块说得出口。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("shop.shipping_templates")
public class ShippingTemplate extends AuditedEntity {

    /** 归属店铺（shop.shops.id），每店至多一个生效模板（uk_shipping_templates_shop） */
    private UUID shopId;

    /** 卖家承担运费：不看地区与件数，整店包邮（对齐淘宝 assumer=1） */
    private Boolean freeShipping;

    /** 满件包邮门槛（件）；null = 不设此条件 */
    private Integer freeOverQuantity;

    /** 满额包邮门槛（分）；null = 不设此条件。判定基数是同店商品总额，不含运费本身 */
    private Long freeOverAmount;

    /** 本模板费用的币种（如 CNY）：模板自带币种，报价时不必借订单的（DB 侧 CHECK 只认平台定价币种） */
    private String currency;

    /** 软删除标记：NULL=生效，非 NULL=已删。MyBatis-Plus 逻辑删除，查询自动过滤 */
    @TableLogic(value = "null", delval = "NOW()")
    private OffsetDateTime deletedAt;

    /** 满额包邮门槛为 Money；未设此条件时为 null */
    public Money freeOverAmountAsMoney() {
        return Money.ofFenOrNull(freeOverAmount, currency);
    }

    /**
     * 本模板是否免运费 —— 模板级包邮条件判定（同店订单合计口径）。
     *
     * <p>满额基数是<b>商品总额</b>而非应付额：运费是待求的结果，拿结果判条件会绕成死循环。
     * 将来接优惠券时，这里的基数要跟「优惠后金额」对齐。
     */
    public boolean freeAt(int totalQuantity, Money itemAmount) {
        if (Boolean.TRUE.equals(freeShipping)) {
            return true;
        }
        if (freeOverQuantity != null && totalQuantity >= freeOverQuantity) {
            return true;
        }
        return freeOverAmount != null && itemAmount.atLeast(freeOverAmountAsMoney());
    }
}
