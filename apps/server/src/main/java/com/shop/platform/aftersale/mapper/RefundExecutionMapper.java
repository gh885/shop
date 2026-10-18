package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

/**
 * 退款执行记录持久化入口：append-only。
 *
 * <p>重试不改变退款单状态，只在这里追加一条；「试过几次」= 记录数，转人工的门槛因此不需要另存计数列
 * （§4.5 / §8）。
 */
@Mapper
public interface RefundExecutionMapper extends BaseMapper<RefundExecution> {

    /** 这张退款单已经向渠道发起过几次调用 */
    default long countByRefundId(UUID refundId) {
        return selectCount(new LambdaQueryWrapper<RefundExecution>().eq(RefundExecution::getRefundId, refundId));
    }
}
