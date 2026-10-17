package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

/**
 * 发货单行持久化入口。
 *
 * <p>行只在录单时写入、之后不可改：改数量等于换一批货，应当取消旧单重录。
 * 交寄时按它把件数累加进订单行账本，取消时按同一批行回退。
 */
@Mapper
public interface ShipmentLineMapper extends BaseMapper<ShipmentLine> {

    /** 一张包裹里的全部行：交寄入账、取消回退、详情展示共用 */
    default List<ShipmentLine> selectByShipmentId(UUID shipmentId) {
        return selectList(new LambdaQueryWrapper<ShipmentLine>()
                .eq(ShipmentLine::getShipmentId, shipmentId)
                .orderByAsc(ShipmentLine::getCreatedAt)
                .orderByAsc(ShipmentLine::getId));
    }
}
