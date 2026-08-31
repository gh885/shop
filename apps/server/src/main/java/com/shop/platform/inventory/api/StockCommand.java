package com.shop.platform.inventory.api;

import com.shop.platform.common.BusinessException;
import com.shop.platform.inventory.mapper.SkuStock;
import com.shop.platform.inventory.mapper.SkuStockMapper;
import com.shop.platform.inventory.mapper.StockFrames;
import com.shop.platform.inventory.mapper.StockMovement;
import com.shop.platform.inventory.mapper.StockMovementMapper;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 库存命令（跨模块消费）：下单冻结、支付成功扣实、取消/关单释放、后台补货/绝对量调整。
 *
 * <p>都在调用方事务内同步同事务执行（order 下单、payment 支付回调）：
 * <ul>
 *   <li><b>冻结/扣实/释放/补货</b> —— 存量增减走<b>条件更新单语句</b>（WHERE 闸门在行锁下原子求值，
 *       RETURNING OLD/NEW 直接带回前后两帧，见 SkuStockMapper）。无行返回即闸门未过，
 *       抛 409 令调用方事务整体回滚：冻结防超卖，扣实防冻结量不足，释放防重复释放。
 *   <li><b>绝对量调整</b>（后台 set 总库存）= 读-改-写，走 {@code @Version} 乐观锁（两并发调整互相覆盖时 one 让位）。
 * </ul>
 * 每笔变更同步写一条<b>流水</b>（append-only 账本），前后帧来自更新语句本身，严格连续可重放。
 * 资金/库存两侧原子靠调用方事务。
 *
 * <p><b>批量操作一律按 skuId 升序上锁</b>（{@link #ordered}）：每条更新语句在事务内持有该行的行锁直到提交，
 * 若按调用方给的顺序（= 用户勾选购物车的顺序）逐行锁，两笔含相同 SKU 集合但顺序相反的并发订单就会
 * 循环等待，被 PG 死锁检测器杀掉一笔。固定全局顺序后循环不可能成环，退化为正常排队。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class StockCommand {

    private final SkuStockMapper skuStockMapper;

    private final StockMovementMapper movementMapper;

    /** 批量存量操作的统一上锁顺序：按 skuId 升序，见类注释 */
    private static List<StockLine> ordered(List<StockLine> lines) {
        return lines.stream().sorted(Comparator.comparing(StockLine::skuId)).toList();
    }

    /**
     * 下单冻结：stock 不变，frozen += n，可用 -= n。任一 SKU 可用量不足（无行返回）抛 409 令整单回滚。
     * 冻结成功即有库存被锁定；未付款超时/取消走 release。
     */
    @Transactional
    public void freeze(UUID orderId, List<StockLine> lines) {
        for (StockLine line : ordered(lines)) {
            // 1. 条件冻结：可用量不足时闸门不过（无行返回），拒绝整笔订单
            StockFrames frames = skuStockMapper.freezeOne(line.skuId(), line.quantity());
            if (frames == null) {
                log.warn("[INVENTORY] 冻结失败: 可用库存不足, skuId={}, need={}", line.skuId(), line.quantity());
                throw BusinessException.conflict("INSUFFICIENT_STOCK", "商品库存不足，请调整数量");
            }
            // 2. 记账（总库存不变，冻结 +n，可用 -n）
            recordMovement(frames, orderId, StockMovement.TYPE_FREEZE);
        }
    }

    /**
     * 支付成功扣实：货真的没了 —— stock -= n 且 frozen -= n。只在冻结充分时成功；
     * 冻结被释放（超时关单释放后订单本不该支付，markPaid 先拒绝）或数量异常时让位。
     */
    @Transactional
    public void capture(UUID orderId, List<StockLine> lines) {
        for (StockLine line : ordered(lines)) {
            StockFrames frames = skuStockMapper.captureOne(line.skuId(), line.quantity());
            // 扣实失败的规范化响应交给调用方（订单已被取消时 markPaid 早已拒绝），此处仍兜底防御
            if (frames == null) {
                log.warn("[INVENTORY] 扣实失败: 冻结量不足, skuId={}, need={}", line.skuId(), line.quantity());
                throw BusinessException.conflict("STOCK_NOT_FROZEN", "订单库存冻结状态异常，请联系客服");
            }
            // 记账（总库存 -n，冻结 -n，可用不变）
            recordMovement(frames, orderId, StockMovement.TYPE_CAPTURE);
        }
    }

    /**
     * 取消/超时关单释放：frozen -= n，stock 不变，可用 += n（货还给可卖池）。
     * 释放后订单不能再支付（markPaid 与状态机早已拒绝），此处仅防御性判 frozen 充分。
     */
    @Transactional
    public void release(UUID orderId, List<StockLine> lines) {
        for (StockLine line : ordered(lines)) {
            StockFrames frames = skuStockMapper.releaseOne(line.skuId(), line.quantity());
            if (frames == null) {
                log.warn("[INVENTORY] 释放失败: 冻结量不足, skuId={}, need={}", line.skuId(), line.quantity());
                throw BusinessException.conflict("STOCK_NOT_FROZEN", "订单库存冻结状态异常，请联系客服");
            }
            // 记账（总库存不变，冻结 -n，可用 +n——货还给可卖池）
            recordMovement(frames, orderId, StockMovement.TYPE_RELEASE);
        }
    }

    /**
     * 已付款订单取消/退款回补总库存：stock += n，可用 += n（货回到可卖池）。
     * 该场景支付时已扣实（stock 减过），取消需把总库存还原。幂等安全，不依赖冻结状态。
     * 流水记 RETURN：RELEASE 口径是 quantity=0 只换冻结归属，本操作动总库存，混用会破坏按 type 对账。
     */
    @Transactional
    public void restock(UUID orderId, List<StockLine> lines) {
        for (StockLine line : ordered(lines)) {
            StockFrames frames = skuStockMapper.restockOne(line.skuId(), line.quantity());
            if (frames == null) {
                throw BusinessException.notFound("SKU 不存在或无库存记录");
            }
            // 记账（总库存 +n，可用 +n；类型 RETURN，见方法注释）
            recordMovement(frames, orderId, StockMovement.TYPE_RETURN);
        }
    }

    /** 后台补货（单 SKU 增量）：stock += n。幂等安全，不依赖冻结状态 */
    @Transactional
    public void restock(UUID skuId, int quantity) {
        validatePositive(quantity);
        StockFrames frames = skuStockMapper.restockOne(skuId, quantity);
        if (frames == null) {
            throw BusinessException.notFound("SKU 不存在或无库存记录");
        }
        recordMovement(frames, null, StockMovement.TYPE_RESTOCK);
    }

    /**
     * 确保某 SKU 有库存主体行（不存在则插 stock=0、frozen=0）。
     * 幂等一条语句：并发窗口内撞 uk_sku_stock 唯一索引由 ON CONFLICT 让位，不覆盖已有行。
     * product 新建 SKU 时调用——库存行随 SKU 生命周期诞生，无行视作无货。
     */
    @Transactional
    public void ensureRow(UUID skuId) {
        skuStockMapper.insertIgnoreConflict(skuId);
    }

    /**
     * 后台把总库存 set 成某值（绝对量调整，读-改-写）：走 @Version 乐观锁。
     * 两个并发调整互相覆盖时后者影响行数 = 0，让位重读。新总量不得低于在冻量
     * （DB CHECK frozen_stock &lt;= stock 兜底，这里提前拦下并给出可理解的 409）。
     */
    @Transactional
    public void setTotal(UUID skuId, int totalStock) {
        validatePositive(totalStock);
        // 1. 读-改-写：实体带 @Version，updateById 自动比较 + 自增
        SkuStock before = requireRow(skuId);
        // 2. 业务闸门：有未完成订单占着冻结量时不许调低于它，否则可用量为负、对账失真
        if (totalStock < before.getFrozenStock()) {
            throw BusinessException.conflict(null, "总库存不能低于当前冻结量 " + before.getFrozenStock() + "，请先等在途订单完成");
        }
        int previousStock = before.getStock();
        before.setStock(totalStock);
        // 3. 乐观锁闸门：并发调整冲突时影响行数 0；成功即无人插足，读到的前帧可信
        if (skuStockMapper.updateById(before) == 0) {
            throw BusinessException.conflict(null, "库存已被其他操作修改，请重试");
        }
        // 4. 记账（总库存 ±adjust，冻结量原样保留，可用随之增减）
        recordMovement(
                StockFrames.builder()
                        .skuId(skuId)
                        .beforeStock(previousStock)
                        .beforeFrozenStock(before.getFrozenStock())
                        .afterStock(totalStock)
                        .afterFrozenStock(before.getFrozenStock())
                        .build(),
                null,
                StockMovement.TYPE_RESTOCK);
    }

    /**
     * 删除 SKU 的库存主体行（product 规格编辑删 SKU 时同事务随行清理）：流水保留——append-only 账本，
     * 引用已删 SKU 属历史事实。有冻结在身拒绝删除：冻结的货还没扣实/释放，行没了之后取消/关单的 release 无处可释放。
     * 行不存在时幂等返回。
     */
    @Transactional
    public void removeRow(UUID skuId) {
        SkuStock row = skuStockMapper.selectBySkuId(skuId);
        if (row == null) {
            return;
        }
        if (row.getFrozenStock() > 0) {
            throw BusinessException.conflict(null, "该规格有未完成订单占用库存，暂不可删除");
        }
        skuStockMapper.deleteBySkuId(skuId);
    }

    // ========== 内部：流水记账 ==========

    /**
     * 流水统一写入口：前后两帧由更新语句 RETURNING OLD/NEW 原子带回（绝对量调整路径由 CAS 成功保证前帧可信），
     * 字段全部由帧推导：quantity = 总库存增量；各前后列取帧实际值。
     */
    private void recordMovement(StockFrames frames, UUID orderId, String type) {
        movementMapper.insert(StockMovement.builder()
                .skuId(frames.getSkuId())
                .orderId(orderId)
                .type(type)
                .quantity(frames.getAfterStock() - frames.getBeforeStock())
                .beforeStock(frames.getBeforeStock())
                .afterStock(frames.getAfterStock())
                .beforeAvailable(frames.getBeforeStock() - frames.getBeforeFrozenStock())
                .afterAvailable(frames.getAfterStock() - frames.getAfterFrozenStock())
                .build());
    }

    /** 按 skuId 查库存主体行：无行抛 404（所有增删改都以行存在为前提） */
    private SkuStock requireRow(UUID skuId) {
        SkuStock stock = skuStockMapper.selectBySkuId(skuId);
        if (stock == null) {
            throw BusinessException.notFound("SKU 不存在或无库存记录");
        }
        return stock;
    }

    private static void validatePositive(int value) {
        if (value < 0) {
            throw new IllegalArgumentException("库存数量不能为负数");
        }
    }
}
