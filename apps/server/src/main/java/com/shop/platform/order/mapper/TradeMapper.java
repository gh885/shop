package com.shop.platform.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/**
 * 主订单持久化入口。
 *
 * <p>本批只落模型；条件转移（支付成功、关单）与幂等回读在批次②随下单/支付链路一起加，
 * 语句集中在本接口，service 不现拼条件（与 {@link OrderMapper} 同一口径）。
 */
@Mapper
public interface TradeMapper extends BaseMapper<Trade> {}
