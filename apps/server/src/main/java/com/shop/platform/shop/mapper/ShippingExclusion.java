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
 * 不配送地区 —— 与运费无关的那一维：命中即<b>下不了单</b>，不是「运费贵一点」。
 *
 * <p>对齐淘宝「不配送地区」而非「不包邮地区」：前者结算直接拦截，后者可下单但要买家补运费。
 * 想对偏远地区加价，正确做法是加一条指定地区计费规则，不是把它设成不配送 ——
 * 后者会误伤正常客户（卖家侧文档反复强调这一点）。
 *
 * <p>做成独立表而不是 {@code first_fee=0, unsupported=TRUE} 的规则：费用列在那种行里是谎言，
 * 而「送不到」与「送得到但多少钱」本来就是两个判断，分开存放时匹配逻辑也更直白（排除优先于定价）。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@TableName("shop.shipping_exclusions")
public class ShippingExclusion {

    @TableId(type = IdType.INPUT)
    private UUID id;

    /** 所属模板（shop.shipping_templates.id）；随模板重建，无软删 */
    private UUID templateId;

    /** 国标区划码前缀：省 2 位 / 市 4 位 / 区县 6 位 */
    private String regionPrefix;

    @TableField(fill = FieldFill.INSERT)
    private OffsetDateTime createdAt;
}
