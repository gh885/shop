package com.shop.platform.shop.mapper;

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
 * 计费规则覆盖的区域 —— 国标区划码<b>前缀</b>（省 2 位 / 市 4 位 / 区县 6 位）。
 *
 * <p>用前缀而不是「省市县成员表」：区划码本身就是分层编码，一条「广东省」规则存 {@code 44} 即可命中全省，
 * 不必维护 21 个市；「广东省包邮但深圳不包邮」用 {@code 4403} 比 {@code 44} 更长自然表达出来
 * （最长前缀胜），不需要靠界面阻止重叠。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("shop.shipping_rule_regions")
public class ShippingRuleRegion {

    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 所属规则（shop.shipping_rules.id）；随规则重建，无软删 */
    private UUID ruleId;

    /** 国标区划码前缀：省 2 位 / 市 4 位 / 区县 6 位 */
    private String regionPrefix;

    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
}
