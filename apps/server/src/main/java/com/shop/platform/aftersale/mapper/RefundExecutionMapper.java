package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/** 退款执行记录持久化入口；重试时只 insert，不 update。 */
@Mapper
public interface RefundExecutionMapper extends BaseMapper<RefundExecution> {}
