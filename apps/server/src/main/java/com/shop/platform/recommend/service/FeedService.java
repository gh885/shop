package com.shop.platform.recommend.service;

import com.shop.platform.product.api.ProductCardView;
import com.shop.platform.product.api.ProductRecallQuery;
import com.shop.platform.recommend.dto.FeedQuery;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 首页 feed 编排：种子生成、游标编解码、召回参数拼装、末页判定。
 *
 * <p>召回本身在 {@link ProductRecallQuery}（product :: api）：本模块不认识商品表，也不过滤商品，
 * 只把「用户点了哪个 tab、要第几页」翻译成召回参数。V2 的用户信号（收藏 / 购物车 / 订单的类目权重）
 * 加在这一层，product 侧只多收参数——方向不变，边界不动。
 */
@Service
@RequiredArgsConstructor
public class FeedService {

    /** 多取一条的余量：够 size + 1 说明后面还有，用它换掉一次 count 查询 */
    private static final int PROBE = 1;

    private final ProductRecallQuery productRecallQuery;

    /**
     * 取一页 feed。
     *
     * <p>无游标 = 「换一批」：发新种子从第一个开始；带游标 = 续翻同一批，种子与位置都从游标解出，
     * 服务端无会话状态。
     */
    public FeedPage page(FeedQuery query) {
        // 1. 定位：无游标 = 新批次（新种子 + 从头），有游标 = 解出种子与上一页末尾
        FeedCursor cursor = query.cursor() == null ? null : FeedCursor.decode(query.cursor());
        String seed = cursor == null ? FeedCursor.newSeed() : cursor.seed();
        int size = query.size();
        // 2. 召回多取一条：末页（返回条数 <= size）的 nextCursor 是 null，前端据此收口
        List<ProductCardView> rows = productRecallQuery.recallPage(
                seed, cursor == null ? null : cursor.lastId(), query.categoryId(), size + PROBE);
        boolean hasNext = rows.size() > size;
        List<ProductCardView> items = hasNext ? rows.subList(0, size) : rows;
        // 3. 下一页游标：位置 = 本页最后一条的 id；排序键由 id + seed 重算，不用进游标
        String nextCursor = hasNext ? new FeedCursor(seed, items.getLast().id()).encode() : null;
        return new FeedPage(List.copyOf(items), nextCursor);
    }
}
