package com.shop.platform.governance.api;

import java.util.List;
import java.util.UUID;

/**
 * 其它模块唯一的售卖资格入口。
 *
 * <p>catalog 发布商品、trade 下单都应该调这里，不许各自拼“商家状态 + 类目授权 + 资质”的条件。
 * 判定只读，不开事务，不产生副作用。
 */
public interface GovernanceQuery {

    /**
     * 这个商家现在能不能在这个类目卖这个品牌。
     *
     * @param qualificationCodes 类目要求的资质代码，来自 {@code category_config.qualification_codes}。
     *     <b>必须由调用方传入</b>——资质要求是 catalog 的配置，governance 不该反向去读它，
     *     否则两个模块成环。空列表表示这个类目不要求资质
     * @return 不允许时带稳定的 reasonCode
     */
    SellDecision canSell(UUID merchantId, UUID categoryId, UUID brandId, List<String> qualificationCodes);
}
