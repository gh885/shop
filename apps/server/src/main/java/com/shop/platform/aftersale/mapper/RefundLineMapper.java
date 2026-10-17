package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/** 退款单行持久化入口；行金额与数量按 INV-14 / INV-15 聚合的查询在批次④加。 */
@Mapper
public interface RefundLineMapper extends BaseMapper<RefundLine> {}
