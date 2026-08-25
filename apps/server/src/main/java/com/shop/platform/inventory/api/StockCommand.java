package com.shop.platform.inventory.api;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.inventory.mapper.SkuStock;
import com.shop.platform.inventory.mapper.SkuStockMapper;
import com.shop.platform.inventory.mapper.StockMovement;
import com.shop.platform.inventory.mapper.StockMovementMapper;
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
 *   <li><b>冻结/扣实/释放/补货</b> —— 存量增减走<b>条件更新</b>（数值原子运算，WHERE 可用量 >= n 影响行数判 0），
 *       失败抛 409 令调用方事务整体回滚。冻结防超卖，扣实防冻结量不足，释放防重复释放。
 *   <li><b>绝对量调整</b>（后台 set 总库存）= 读-改-写，走 {@code @Version} 乐观锁（两并发调整互相覆盖时 one 让位）。
 * </ul>
 * 每笔变更同步写一条<b>流水</b>（同类 append-only 账本），对账可重放。资金/库存两侧原子靠调用方事务。
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class StockCommand {

    private final SkuStockMapper skuStockMapper;

    private final StockMovementMapper movementMapper;

    /**
     * 下单冻结：stock 不变，frozen += n，可用 -= n。任一 SKU 可用量不足（WHERE 影响行数 = 0）抛 409 令整单回滚。
     * 冻结成功即有库存被锁定；未付款超时/取消走 release。
     */
    @Transactional
    public void freeze(UUID orderId, List<StockLine> lines) {
        for (StockLine line : lines) {
            SkuStock before = requireRow(line.skuId());
            // 1. 条件冻结：可用量不足时影响行数为 0，拒绝整笔订单
            int affected = skuStockMapper.update(
                    null,
                    new LambdaUpdateWrapper<SkuStock>()
                            .eq(SkuStock::getSkuId, line.skuId())
                            .apply("stock - frozen_stock >= {0}", line.quantity())
                            .setSql("frozen_stock = frozen_stock + {0}", line.quantity()));
            if (affected == 0) {
                log.warn("[INVENTORY] 冻结失败: 可用库存不足, skuId={}, need={}", line.skuId(), line.quantity());
                throw BusinessException.conflict("INSUFFICIENT_STOCK", "商品库存不足，请调整数量");
            }
            // 2. 记账（总库存不变，冻结 +n，可用 -n）
            recordMovement(before, requireRow(line.skuId()), orderId, StockMovement.TYPE_FREEZE);
        }
    }

    /**
     * 支付成功扣实：货真的没了 —— stock -= n 且 frozen -= n。只在冻结充分时成功；
     * 冻结被释放（超时关单释放后订单本不该支付，markPaid 先拒绝）或数量异常时让位。
     */
    @Transactional
    public void capture(UUID orderId, List<StockLine> lines) {
        for (StockLine line : lines) {
            SkuStock before = requireRow(line.skuId());
            int affected = skuStockMapper.update(
                    null,
                    new LambdaUpdateWrapper<SkuStock>()
                            .eq(SkuStock::getSkuId, line.skuId())
                            .ge(SkuStock::getFrozenStock, line.quantity())
                            .setSql("stock = stock - {0}, frozen_stock = frozen_stock - {0}", line.quantity()));
            // 扣实失败的规范化响应交给调用方（订单已被取消时 markPaid 早已拒绝），此处仍兜底防御
            if (affected == 0) {
                log.warn("[INVENTORY] 扣实失败: 冻结量不足, skuId={}, need={}", line.skuId(), line.quantity());
                throw BusinessException.conflict("STOCK_NOT_FROZEN", "订单库存冻结状态异常，请联系客服");
            }
            // 记账（总库存 -n，冻结 -n，可用不变）
            recordMovement(before, requireRow(line.skuId()), orderId, StockMovement.TYPE_CAPTURE);
        }
    }

    /**
     * 取消/超时关单释放：frozen -= n，stock 不变，可用 += n（货还给可卖池）。
     * 释放后订单不能再支付（markPaid 与状态机早已拒绝），此处仅防御性判 frozen 充分。
     */
    @Transactional
    public void release(UUID orderId, List<StockLine> lines) {
        for (StockLine line : lines) {
            SkuStock before = requireRow(line.skuId());
            int affected = skuStockMapper.update(
                    null,
                    new LambdaUpdateWrapper<SkuStock>()
                            .eq(SkuStock::getSkuId, line.skuId())
                            .ge(SkuStock::getFrozenStock, line.quantity())
                            .setSql("frozen_stock = frozen_stock - {0}", line.quantity()));
            if (affected == 0) {
                log.warn("[INVENTORY] 释放失败: 冻结量不足, skuId={}, need={}", line.skuId(), line.quantity());
                throw BusinessException.conflict("STOCK_NOT_FROZEN", "订单库存冻结状态异常，请联系客服");
            }
            // 记账（总库存不变，冻结 -n，可用 +n——货还给可卖池）
            recordMovement(before, requireRow(line.skuId()), orderId, StockMovement.TYPE_RELEASE);
        }
    }

    /**
     * 已付款订单取消/退款回补总库存：stock += n，可用 += n（货回到可卖池）。
     * 该场景支付时已扣实（stock 减过），取消需把总库存还原。幂等安全，不依赖冻结状态。
     */
    @Transactional
    public void restock(UUID orderId, List<StockLine> lines) {
        for (StockLine line : lines) {
            SkuStock before = requireRow(line.skuId());
            int affected = skuStockMapper.update(
                    null,
                    new LambdaUpdateWrapper<SkuStock>()
                            .eq(SkuStock::getSkuId, line.skuId())
                            .setSql("stock = stock + {0}", line.quantity()));
            if (affected == 0) {
                throw BusinessException.notFound("SKU 不存在或无库存记录");
            }
            // 记账（总库存 +n，可用 +n）
            recordMovement(before, requireRow(line.skuId()), orderId, StockMovement.TYPE_RELEASE);
        }
    }

    /** 后台补货（单 SKU 增量）：stock += n。幂等安全，不依赖冻结状态 */
    @Transactional
    public void restock(UUID skuId, int quantity) {
        ValidatePositive(quantity);
        SkuStock before = requireRow(skuId);
        int affected = skuStockMapper.update(
                null,
                new LambdaUpdateWrapper<SkuStock>()
                        .eq(SkuStock::getSkuId, skuId)
                        .setSql("stock = stock + {0}", quantity));
        if (affected == 0) {
            throw BusinessException.notFound("SKU 不存在或无库存记录");
        }
        recordMovement(before, requireRow(skuId), null, StockMovement.TYPE_RESTOCK);
    }

    /**
     * 确保某 SKU 有库存主体行（不存在则插 stock=0、frozen=0）。
     * 幂等：并发窗口内靠 uk_sku_stock 唯一索引兜底（已存在则让位不覆盖）。
     * product 新建 SKU 时调用——库存行随 SKU 生命周期诞生，无行视作无货。
     */
    @Transactional
    public void ensureRow(UUID skuId) {
        SkuStock existing = findBySkuId(skuId);
        if (existing != null) {
            return;
        }
        try {
            skuStockMapper.insert(
                    SkuStock.builder().skuId(skuId).stock(0).frozenStock(0).build());
        } catch (org.springframework.dao.DuplicateKeyException ignored) {
            // 并发建行：另一方先插成功，让位即可
        }
    }

    /**
     * 后台把总库存 set 成某值（绝对量调整，读-改-写）：走 @Version 乐观锁。
     * 两个并发调整互相覆盖时后者影响行数 = 0，让位重读。调整时冻结量不超新总量，否则非法。
     */
    @Transactional
    public void setTotal(UUID skuId, int totalStock) {
        ValidatePositive(totalStock);
        // 1. 读-改-写：实体带 @Version，updateById 自动比较 + 自增
        SkuStock before = requireRow(skuId);
        before.setStock(totalStock);
        // 2. 乐观锁闸门：并发调整冲突时影响行数 0
        int affected = skuStockMapper.updateById(before);
        if (affected == 0) {
            throw BusinessException.conflict(null, "库存已被其他操作修改，请重试");
        }
        // 3. 记账（总库存 ±adjust，冻结量原样保留，可用随之增减）
        recordMovement(before, requireRow(skuId), null, StockMovement.TYPE_RESTOCK);
    }

    // ========== 内部：流水记账 ==========

    /**
     * 流水统一写入口：以操作前后两帧实体完整记账，字段全部由实体推导：
     * quantity = after.stock - before.stock（总库存增量）；各前后列取实体实际值。
     * 两帧均在事务内读取，同 SKU 行已被本次更新锁住，免重读竞态。
     */
    private void recordMovement(SkuStock before, SkuStock after, UUID orderId, String type) {
        movementMapper.insert(StockMovement.builder()
                .skuId(after.getSkuId())
                .orderId(orderId)
                .type(type)
                .quantity(after.getStock() - before.getStock())
                .beforeStock(before.getStock())
                .afterStock(after.getStock())
                .beforeAvailable(before.availableStock())
                .afterAvailable(after.availableStock())
                .build());
    }

    /** 按 skuId 查库存主体行：无行抛 404（所有增删改都以行存在为前提） */
    private SkuStock requireRow(UUID skuId) {
        SkuStock stock = findBySkuId(skuId);
        if (stock == null) {
            throw BusinessException.notFound("SKU 不存在或无库存记录");
        }
        return stock;
    }

    /** 按 skuId 查库存主体行：无行返回 null */
    private SkuStock findBySkuId(UUID skuId) {
        return skuStockMapper.selectOne(new LambdaQueryWrapper<SkuStock>().eq(SkuStock::getSkuId, skuId));
    }

    private static void ValidatePositive(int value) {
        if (value < 0) {
            throw new IllegalArgumentException("库存数量不能为负数");
        }
    }
}
