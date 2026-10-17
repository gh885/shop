package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/**
 * 发货单行持久化入口。
 *
 * <p>本批只落模型；按订单行统计累计发出量、随发货单落行/取消回退的查询在批次③加。
 */
@Mapper
public interface ShipmentLineMapper extends BaseMapper<ShipmentLine> {}
