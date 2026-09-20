package com.shop.platform.product.api;

import com.shop.platform.common.Money;
import com.shop.platform.product.service.CategoryService;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;

/**
 * 种子序召回：按 {@code (md5(id || seed), id)} 的 keyset 游标，翻一页上架商品卡。
 *
 * <p><b>这是 api 包里唯一的「非按 ID 查询」，且只能是它</b>：排序键跑在 {@code product.products} 上，
 * 跨 schema 没有第二个地方能执行它，所以「有序扫描」与「按 ID 点查」并列收进 owning 模块的 api 包
 * （见 apps/server/AGENTS.md 模块边界规范的例外条款）。它与 {@link ProductReadQuery} 分工明确：
 * 那边点查投影、这条扫一页，互不扩建。
 *
 * <p>边界刻意收窄：<b>不认识游标格式</b>（消费方自己编解码，这里只收「上一页最后一条是谁」）、
 * <b>不认识用户</b>（V2 的用户信号由 recommend 转成参数）、不 JOIN（不碰 skus / shop）、不写、
 * 不判末页（上限由消费方按 size + 1 传，多出来那条就是「还有下一页」的证据）。
 */
@Component
@RequiredArgsConstructor
public class ProductRecallQuery {

    private final JdbcTemplate jdbc;

    private final CategoryService categoryService;

    /**
     * 一页商品卡，按种子序。
     *
     * @param seed       排序种子（16 位 hex，由消费方生成）；同种子 = 同顺序
     * @param afterId    上一页最后一条的 id，null = 第一页
     * @param categoryId 召回范围：类目 id（含其启用子树），null = 全站
     * @param limit      取多少条（消费方传 size + 1）
     */
    public List<ProductCardView> recallPage(String seed, UUID afterId, UUID categoryId, int limit) {
        // 1. 类目子树展开归 product：消费方只说「用户点了哪个类目」，不认识「子树」这个概念；
        //    禁用节点整支剪掉，未知/隐藏类目得到一个空集 → 空页（不是 404，见决策：脏 tab 不报错）
        List<UUID> categoryIds = null;
        if (categoryId != null) {
            Set<UUID> subtree = categoryService.descendantIds(categoryId);
            if (subtree.isEmpty()) {
                return List.of();
            }
            categoryIds = List.copyOf(subtree);
        }
        // 2. keyset 一页：排序键是 (id, seed) 的确定函数，所以「比上一页最后一条大」等价于「还没翻到」——
        //    翻页途中商品上下架只影响还没翻到的部分，已翻过的页不会重复也不会漏
        StringBuilder sql = new StringBuilder(
                "SELECT id, shop_id, category_id, name, subtitle, main_image, min_price, max_price, currency, sold_count"
                        + " FROM product.products WHERE status = 'PUBLISHED'");
        List<Object> args = new ArrayList<>();
        if (categoryIds != null) {
            sql.append(" AND category_id IN (")
                    .append(String.join(",", Collections.nCopies(categoryIds.size(), "?")))
                    .append(')');
            args.addAll(categoryIds);
        }
        if (afterId != null) {
            sql.append(" AND (md5(id::text || ?), id) > (md5(?::text || ?), ?::uuid)");
            args.add(seed);
            args.add(afterId.toString());
            args.add(seed);
            args.add(afterId.toString());
        }
        // 种子与 limit 都走绑定参数（不拼串）：排序表达式里放参数是合法的，能参数化就不拼
        sql.append(" ORDER BY md5(id::text || ?), id LIMIT ?");
        args.add(seed);
        args.add(limit);
        return jdbc.query(sql.toString(), CARD_MAPPER, args.toArray());
    }

    /** 一行 → 商品卡投影：只取卡片列，没有 JSONB，也就没有实体映射那一类坑 */
    private static final RowMapper<ProductCardView> CARD_MAPPER = (rs, i) -> new ProductCardView(
            rs.getObject("id", UUID.class),
            rs.getObject("shop_id", UUID.class),
            rs.getObject("category_id", UUID.class),
            rs.getString("name"),
            rs.getString("subtitle"),
            rs.getString("main_image"),
            money(rs, "min_price"),
            money(rs, "max_price"),
            rs.getLong("sold_count"));

    /** 金额列 + 本行 currency 列 → Money；金额列为 NULL（未定价）时给 null 而不是 0 */
    private static Money money(ResultSet rs, String amountColumn) throws SQLException {
        return Money.ofFenOrNull(rs.getObject(amountColumn, Long.class), rs.getString("currency"));
    }
}
