package com.shop.platform.inventory.mapper;

import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * 库存自检的读侧。<b>只给 {@code InventoryAuditJob} 用</b>，没有任何写。
 *
 * <p>三条查询对应三条不变式，每一条都应该恒为空。返回空是正常，返回非空说明有人绕过了接口
 * 或者代码写错了——那正是这张表存在的意义。
 */
@Mapper
public interface InventoryAuditMapper {

    /**
     * 守恒式被破坏的行：{@code on_hand <> ATP + reserved + safety}。
     *
     * <p>{@code ck_stock_balance} 本该让这种事不可能发生。所以查出来只意味着一件事：
     * 有人 {@code ALTER TABLE ... DROP CONSTRAINT} 或者用超户直接改了表。
     */
    @Select("SELECT sku_id FROM inventory.stock WHERE on_hand <> available_to_promise + reserved + safety")
    List<UUID> brokenBalance();

    /**
     * 账实漂移：库存行与它最后一条流水对不上。
     *
     * <p>对账口径是「流水只追加，所以最后一条流水的 {@code after_*} 必须等于现在的库存行」。
     * 不等就说明中间有人直接 {@code UPDATE stock} 绕过了接口——那一次变动没有流水，
     * 账实从此永久错位。
     *
     * <p>没有流水的库存行不算漂移：商家首次调整走的是 {@code insert}，
     * 调整本身会写一条 {@code adjust} 流水，所以正常路径下每一行都有流水。
     */
    @Select(
            """
            SELECT s.sku_id
              FROM inventory.stock s
              JOIN LATERAL (
                  SELECT l.after_available_to_promise, l.after_reserved, l.after_safety, l.after_on_hand
                    FROM inventory.stock_ledger l
                   WHERE l.sku_id = s.sku_id AND l.warehouse_id = s.warehouse_id
                   ORDER BY l.created_at DESC, l.id DESC
                   FETCH FIRST 1 ROW ONLY
              ) last ON TRUE
             WHERE last.after_available_to_promise <> s.available_to_promise
                OR last.after_reserved <> s.reserved
                OR last.after_safety <> s.safety
                OR last.after_on_hand <> s.on_hand
            """)
    List<UUID> ledgerDrift();

    /**
     * 可售为负的行。
     *
     * <p>这不是 bug，是一个要被看见的状态：负值意味着账上已经超卖（盘亏、商家漏改）。
     * 即时告警在 {@code InventoryService#adjustAll} 里做——那是唯一能造出负值的入口；
     * 这里只是兜底，万一有人绕过接口。
     */
    @Select("SELECT sku_id FROM inventory.stock WHERE available_to_promise < 0")
    List<UUID> oversold();
}
