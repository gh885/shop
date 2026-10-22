package com.shop.platform.catalog.service;

import com.shop.platform.catalog.mapper.ProductStore;
import com.shop.platform.catalog.model.IdentityKind;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * 标准品匹配：把商家 SPU 挂到 {@code spu_type = 'standard'} 的平台上。
 *
 * <p><b>标准品是什么。</b> 一个归并标签，不是商品。它没有 SKU、没有价格、没有库存、不能下单
 * （product-model.md §2.3 不变式 2）。它的唯一作用是让"这是同一个东西"这件事有个落点，
 * 服务同款聚合、评论聚合、比价。
 *
 * <p><b>只做精确匹配，不做模糊。</b> 型号、款号、参数哈希三样都是"全等才算同一个"。
 * 模糊匹配没有置信度可言——{@code iPhone16Pro} 和 {@code iPhone 16 Pro} 是不是同一个，
 * 是业务判断，机器猜错一次就是错配，而错配会让比价全乱（§5 失败模式第一条）。
 * 所以 {@code manual} 这种人工确认的口子留在表里，代码里没有自动路径。
 *
 * <p><b>类目下架了还挂不挂？</b> 挂。标准品是平台主数据，它的生命周期和"现在能不能卖"无关——
 * 一个已下市的 iPhone 14 仍然是标准品，买家还要能看它的评论和比价。真正拦住下单的是
 * {@code offer.status}，不是有没有标准品。这条和 {@code category.status = 'closed'} 的分工：
 * 类目关的是"不能再往这里挂新商品"，标准品关不掉历史归并。
 */
@Component
public class StandardMatcher {

    private final ProductStore products;

    public StandardMatcher(ProductStore products) {
        this.products = Objects.requireNonNull(products, "products");
    }

    /**
     * 找到或建出标准品，并把商家 SPU 挂上去。
     *
     * @param identityKind 用哪种键认出来的。{@link IdentityKind#NONE} 直接跳过
     * @param matchKey 已归一化的识别键
     * @param matchedBy 挂载依据。和 {@code identityKind} 同源——自动挂载没有第二种来源
     * @param title 标准品标题。只有真的建出来时才用上；已存在则以库里那条为准（先来者定名）
     */
    public void match(
            UUID spuId,
            UUID categoryId,
            UUID brandId,
            String modelNo,
            String title,
            IdentityKind identityKind,
            String matchKey) {
        Objects.requireNonNull(identityKind, "identityKind");
        if (!identityKind.isKey() || matchKey == null) {
            return;
        }
        UUID standardSpuId = products.findOrCreateStandard(categoryId, brandId, modelNo, identityKind, matchKey, title);
        products.linkStandard(spuId, standardSpuId, identityKind.dbValue());
    }
}
