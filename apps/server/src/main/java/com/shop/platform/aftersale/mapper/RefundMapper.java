package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/**
 * 退款单持久化入口。
 *
 * <p>本批只落模型；状态转移、未完结闸门（事务内锁订单行 + 校验插入）与重试追加在批次④加。
 */
@Mapper
public interface RefundMapper extends BaseMapper<Refund> {}
