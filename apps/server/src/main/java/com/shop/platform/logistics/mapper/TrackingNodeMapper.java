package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface TrackingNodeMapper extends BaseMapper<TrackingNode> {

    /**
     * 落一条轨迹节点，撞 dedupe_key 唯一索引则静默跳过（返回 0 行）。
     *
     * <p>用 {@code ON CONFLICT DO NOTHING} 而非"插入 + 抓 DuplicateKeyException"：PG 事务内唯一冲突会让
     * 整个事务进入 aborted 状态，后续语句一律失败——异常吞不掉，只能不让冲突发生。
     *
     * <p>id 由调用方生成（自定义 @Insert 不经过 MyBatis-Plus 的 MetaObjectHandler 填充）：
     * 若留给 DB 默认值，则无法用实体承载入参。
     */
    @Insert(
            """
            INSERT INTO logistics.tracking_nodes
                (id, shipment_id, node_code, description, location, occurred_at, dedupe_key)
            VALUES (#{id}, #{shipmentId}, #{nodeCode}, #{description}, #{location}, #{occurredAt}, #{dedupeKey})
            ON CONFLICT (dedupe_key) DO NOTHING
            """)
    int insertIgnoreDuplicate(TrackingNode node);

    /** 某包裹最后一条动态的时刻（无动态返回 empty）：异常扫描据此算"多久没动静" */
    default Optional<OffsetDateTime> selectLastOccurredAt(UUID shipmentId) {
        return Optional.ofNullable(selectOne(new LambdaQueryWrapper<TrackingNode>()
                        .eq(TrackingNode::getShipmentId, shipmentId)
                        .orderByDesc(TrackingNode::getOccurredAt)
                        .last("LIMIT 1")))
                .map(TrackingNode::getOccurredAt);
    }

    /** 某包裹的全部轨迹节点：按承运商事件时刻正序，同时刻按 id（uuidv7）稳定排序 */
    default List<TrackingNode> selectByShipment(UUID shipmentId) {
        return selectList(new LambdaQueryWrapper<TrackingNode>()
                .eq(TrackingNode::getShipmentId, shipmentId)
                .orderByAsc(TrackingNode::getOccurredAt)
                .orderByAsc(TrackingNode::getId));
    }
}
