package com.shop.platform.logistics.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
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

    /**
     * 删一批包裹的轨迹节点（回寄改单作废旧包裹时连带清掉，节点挂在 shipment_id 上不先删会留孤儿）。
     *
     * <p>空集合在语句内短路：MyBatis-Plus 会把空 {@code in} 拼成 {@code IN ()}，那是 PG 的语法错误而不是
     * 「没东西可删」，而调用方本来就常在零行的场景下走到这里。
     *
     * @return 删掉的行数（没传包裹时为 0，不是一条也没删成的错误信号）
     */
    default int deleteByShipmentIds(Collection<UUID> shipmentIds) {
        if (shipmentIds.isEmpty()) {
            return 0;
        }
        return delete(new LambdaQueryWrapper<TrackingNode>().in(TrackingNode::getShipmentId, shipmentIds));
    }

    /**
     * 一批包裹的轨迹节点，按 shipmentId 分组：轨迹页一单多包裹，逐包裹点查就是 N+1。
     *
     * <p>组内顺序与单包裹版一致——全局按 (occurred_at, id) 升序取出后 groupingBy，
     * 同一组的遭遇顺序即时间序，不再二次排。无节点的包裹不出现在 Map 里，调用方自己兜空。
     */
    default Map<UUID, List<TrackingNode>> groupedByShipments(Collection<UUID> shipmentIds) {
        if (shipmentIds.isEmpty()) {
            return Map.of();
        }
        return selectList(new LambdaQueryWrapper<TrackingNode>()
                        .in(TrackingNode::getShipmentId, shipmentIds)
                        .orderByAsc(TrackingNode::getOccurredAt)
                        .orderByAsc(TrackingNode::getId))
                .stream()
                .collect(Collectors.groupingBy(TrackingNode::getShipmentId));
    }
}
