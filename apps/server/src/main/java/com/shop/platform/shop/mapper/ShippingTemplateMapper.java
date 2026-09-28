package com.shop.platform.shop.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ShippingTemplateMapper extends BaseMapper<ShippingTemplate> {

    /** 本店生效模板（软删由 @TableLogic 自动过滤；每店至多一个，唯一索引兜底） */
    default Optional<ShippingTemplate> selectByShop(UUID shopId) {
        return selectList(new LambdaQueryWrapper<ShippingTemplate>().eq(ShippingTemplate::getShopId, shopId)).stream()
                .findFirst();
    }

    /**
     * 包邮三列整份覆写（卖家保存运费模板的唯一写路径）：满件/满额门槛<b>无条件 SET，含 null</b>。
     *
     * <p>不走 {@code updateById}：它跳过 null 字段，于是「整店包邮时抹掉满件/满额门槛」那句承诺落不进库——
     * 卖家取消满件包邮后，旧门槛仍继续替他把运费判成 0（钱的事，不是显示问题）。条件更新自己回填 updated_at。
     */
    default int overwriteFreeShippingRules(
            UUID templateId,
            boolean freeShipping,
            Integer freeOverQuantity,
            Long freeOverAmount,
            String currency,
            OffsetDateTime now) {
        return update(
                null,
                new LambdaUpdateWrapper<ShippingTemplate>()
                        .eq(ShippingTemplate::getId, templateId)
                        .set(ShippingTemplate::getFreeShipping, freeShipping)
                        .set(ShippingTemplate::getFreeOverQuantity, freeOverQuantity)
                        .set(ShippingTemplate::getFreeOverAmount, freeOverAmount)
                        .set(ShippingTemplate::getCurrency, currency)
                        .set(ShippingTemplate::getUpdatedAt, now));
    }
}
