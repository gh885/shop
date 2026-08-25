package com.shop.platform.inventory.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/** 库存流水 Mapper：append-only 写入口，跨模块不暴露 */
@Mapper
public interface StockMovementMapper extends BaseMapper<StockMovement> {}
