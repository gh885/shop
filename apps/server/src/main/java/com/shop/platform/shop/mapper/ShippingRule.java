package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.common.Money;
import com.shop.platform.infra.db.AuditedEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 运费计费规则 —— 一档「首件价 + 续件价」。
 *
 * <p>一个模板有一条 {@code isDefault} 的兜底规则（淘宝：默认运费必填）与若干条指定地区规则；
 * 命中哪条由 {@link ShippingRuleRegion} 的区域前缀决定（最长前缀胜）。
 *
 * <p>计价单位是<b>件</b>：列名把单位写进名字（firstQuantity 而非 firstStandard），
 * 将来加按重量时新增 valuation 列与重量列，语义不靠注释维系。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("shop.shipping_rules")
public class ShippingRule extends AuditedEntity {

    /** 所属模板（shop.shipping_templates.id）；随模板更新整批重建，故无软删 */
    private UUID templateId;

    /** 默认规则标记：区域未命中任何指定地区规则时用它；一个模板至多一条（uk_shipping_rules_default） */
    private Boolean isDefault;

    /** 首件标准（件）：件数不超过它只收首费 */
    private Integer firstQuantity;

    /** 首费（分） */
    private Long firstFee;

    /** 续件标准（件）：超出首件的部分每满这么多件，加一个续费 */
    private Integer addQuantity;

    /** 续费（分） */
    private Long addFee;

    /** 本档费用的币种（如 CNY）：随模板一同落，一行的两个金额同币种 */
    private String currency;

    /** 首费为 Money */
    public Money firstFeeAsMoney() {
        return Money.ofFen(firstFee, currency);
    }

    /** 续费为 Money */
    public Money addFeeAsMoney() {
        return Money.ofFen(addFee, currency);
    }

    /**
     * 按件计费：首费 + 超出首件部分的「续费档数 × 续费」。
     *
     * <p>不足一档按一档 —— 与淘宝一致（按重量的「不足续重按续重」是同一规则的另一种单位）；
     * 整除向上取整用整数运算表达，避免浮点。
     */
    public Money feeOf(int totalQuantity) {
        if (totalQuantity <= firstQuantity) {
            return firstFeeAsMoney();
        }
        long tiers = (long) Math.ceil((totalQuantity - firstQuantity) / (double) addQuantity);
        return Money.ofFen(firstFee + tiers * addFee, currency);
    }
}
