package com.shop.platform.inventory.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;

/** 库存主体 Mapper：跨模块不暴露，仅本模块 service/api 包内使用 */
@Mapper
public interface SkuStockMapper extends BaseMapper<SkuStock> {}
