package com.shop.platform.order.service;

import com.shop.platform.common.Money;
import java.util.UUID;

/**
 * 结算有效行 —— 三道判定（SKU 在售 / SPU 上架 / 库存充足）通过后的行快照，
 * 预览分组与下单落库/冻结同源同形状；价格在入口已定型为 Money。
 */
public record ValidLine(
        UUID skuId,
        UUID productId,
        UUID shopId,
        String name,
        String image,
        Money price,
        Money originalPrice,
        int quantity,
        int stock,
        /** 无理由退货声明快照（取自 SPU 当前值）：与 name/price/image 同一批定格，售后判定只读落库后的快照 */
        boolean sevenDayReturn) {}
