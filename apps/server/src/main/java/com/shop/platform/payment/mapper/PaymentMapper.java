package com.shop.platform.payment.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface PaymentMapper extends BaseMapper<Payment> {

    /** 订单的成功支付流水：幂等短路与写入冲突回退共用（uk_payments_order_success 保证至多一条） */
    default Payment selectSuccessByOrder(UUID orderId) {
        return selectOne(new LambdaQueryWrapper<Payment>()
                .eq(Payment::getOrderId, orderId)
                .eq(Payment::getStatus, Payment.STATUS_SUCCESS));
    }
}
