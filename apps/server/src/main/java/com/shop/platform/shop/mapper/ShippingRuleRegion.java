package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.annotation.TableName;
import com.shop.platform.infra.db.BaseEntity;
import java.util.UUID;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.experimental.SuperBuilder;

/**
 * 计费规则覆盖的区域 —— 国标区划码<b>前缀</b>（省 2 位 / 市 4 位 / 区县 6 位）。
 *
 * <p>用前缀而不是「省市县成员表」：区划码本身就是分层编码，一条「广东省」规则存 {@code 44} 即可命中全省，
 * 不必维护 21 个市；「广东省包邮但深圳不包邮」用 {@code 4403} 比 {@code 44} 更长自然表达出来
 * （最长前缀胜），不需要靠界面阻止重叠。
 */
@Data
@SuperBuilder
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
@TableName("shop.shipping_rule_regions")
public class ShippingRuleRegion extends BaseEntity {

    /** 所属规则（shop.shipping_rules.id）；随规则重建，无软删 */
    private UUID ruleId;

    /** 国标区划码前缀：省 2 位 / 市 4 位 / 区县 6 位 */
    private String regionPrefix;
}
