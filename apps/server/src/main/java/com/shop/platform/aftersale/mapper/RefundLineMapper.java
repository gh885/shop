package com.shop.platform.aftersale.mapper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

/**
 * 退款单行持久化入口。
 *
 * <p>未完结闸门（同一订单行至多一张未完结退款单）在 {@code uk_refund_lines_open_item} 上：行插入即占坑，
 * 父单到终态时把行标记为 {@code active = false} 让位。删除重建不用于这里——行是金额与数量的账本，
 * 删掉就没法对账（INV-14/15）。
 */
@Mapper
public interface RefundLineMapper extends BaseMapper<RefundLine> {

    /** 一张退款单的全部行：退款详情、执行时算账与回补都用它 */
    default List<RefundLine> selectByRefundId(UUID refundId) {
        return selectList(new LambdaQueryWrapper<RefundLine>()
                .eq(RefundLine::getRefundId, refundId)
                .orderByAsc(RefundLine::getId));
    }

    /** 一批退款单的行：工作台列表展示金额构成时一次取齐，免 N+1 */
    default List<RefundLine> selectByRefundIds(Collection<UUID> refundIds) {
        if (refundIds.isEmpty()) {
            return List.of();
        }
        return selectList(new LambdaQueryWrapper<RefundLine>().in(RefundLine::getRefundId, refundIds));
    }

    /**
     * 终态放闸：退款单到已退款/已拒绝/已撤销时，它的行让出「同一订单行一张未完结」的名额。
     * 失败单不调用——重试期内仍算未完结。
     */
    @Update("UPDATE aftersale.refund_lines SET active = FALSE WHERE refund_id = #{refundId} AND active")
    int deactivateByRefundId(@Param("refundId") UUID refundId);
}
