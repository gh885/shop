package com.shop.platform.coupon.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/**
 * 券核销流水（append-only）：只插不改不删，故除 BaseMapper 的 insert 外无自定义语句。
 *
 * <p>刻意不提供按订单/按券的删除或更新入口——账本一旦可改就不再是账本。
 * 查询需求（对账）目前由 SQL 直接查，有消费点再加读取方法。
 */
@Mapper
public interface CouponUsageMapper extends BaseMapper<CouponUsage> {}
