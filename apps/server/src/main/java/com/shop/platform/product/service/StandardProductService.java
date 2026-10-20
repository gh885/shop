package com.shop.platform.product.service;

import com.shop.platform.common.Validate;
import com.shop.platform.product.dto.StandardProductRequest;
import com.shop.platform.product.mapper.Category;
import com.shop.platform.product.mapper.CategoryMapper;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.mapper.StandardProduct;
import com.shop.platform.product.mapper.StandardProductMapper;
import com.shop.platform.product.model.StandardProductStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 平台标准品：跨商家识别「同一个东西」的那一层。
 *
 * <p>它<b>不进在线交易链路</b>——下单、库存、发货只认商家自己的 SPU/SKU。标准品只服务聚合视角
 * （跨店比价、搜索归一、类目运营），所以它的数据质量不完美是可以接受的：匹配错了改映射，
 * 不影响任何一笔成交。这条边界是本模块愿意把匹配做成「卖家自助 + 平台可改」而不是自动任务的全部理由。
 *
 * <p>只有「并」没有「删」：挂靠关系引用着标准品行，物理删除会留下悬空引用。
 */
@Service
@RequiredArgsConstructor
public class StandardProductService {

    /** 卖家挂靠候选的返回上限：挂靠是「从一屏里挑一个」的动作，翻页对它没有意义 */
    private static final int CANDIDATE_LIMIT = 50;

    private final StandardProductMapper standardProductMapper;
    private final CategoryMapper categoryMapper;
    private final ProductMapper productMapper;

    // ===== 平台侧 =====

    /**
     * 平台建标准品。类目必须存在且启用——标准品挂在禁用类目下就永远聚合不到买家可见的页面上，
     * 那是一条建了也没用的数据。层级不要求是叶子：标准品是聚合维，可以挂到二级做「手机」这一档。
     */
    @Transactional
    public StandardProduct create(StandardProductRequest request) {
        requireEnabledCategory(request.categoryId());
        if (request.barcode() != null) {
            Validate.isTrue(!standardProductMapper.barcodeTaken(request.barcode(), null), "该条码已被其它标准品占用");
        }
        StandardProduct standard = StandardProduct.builder()
                .categoryId(request.categoryId())
                .name(request.name())
                .brand(request.brand())
                .barcode(request.barcode())
                .status(StandardProductStatus.ACTIVE)
                .build();
        standardProductMapper.insert(standard);
        return standard;
    }

    /** 改标准品：只改展示字段与类目；状态与合并去向走 {@link #merge}，不混在「改个名字」里 */
    @Transactional
    public StandardProduct update(UUID id, StandardProductRequest request) {
        StandardProduct standard = requireActive(id);
        requireEnabledCategory(request.categoryId());
        if (request.barcode() != null) {
            Validate.isTrue(!standardProductMapper.barcodeTaken(request.barcode(), id), "该条码已被其它标准品占用");
        }
        standard.setCategoryId(request.categoryId());
        standard.setName(request.name());
        standard.setBrand(request.brand());
        standard.setBarcode(request.barcode());
        standardProductMapper.updateById(standard);
        return standard;
    }

    /**
     * 合并：把 source 并入 target（错匹配的收口）。
     *
     * <p>三件事同事务：① 挂靠在 source 上的商家商品全部改指 target；② source 置 MERGED 并记去向；
     * ③ source 的条码释放（否则那条唯一索引会一直占着，target 若同码则合并后两条码撞在一起）。
     *
     * <p>不物理删 source：历史映射与「当时挂的是哪个」都还引用它。
     */
    @Transactional
    public StandardProduct merge(UUID sourceId, UUID targetId) {
        Validate.isTrue(!sourceId.equals(targetId), "不能把标准品并入自己");
        StandardProduct source = requireActive(sourceId);
        StandardProduct target = requireActive(targetId);
        // 1. 来源置 MERGED + 记去向 + 释放条码（释放是因为那条部分唯一索引会一直占着）
        int affected = standardProductMapper.markMerged(sourceId, targetId, OffsetDateTime.now());
        Validate.conflict(affected == 1, "标准品状态已变化，请刷新后重试");
        // 2. 挂靠关系改指：一条 UPDATE 覆盖全部引用行，不逐条读改写
        productMapper.repointStandardProduct(sourceId, targetId, OffsetDateTime.now());
        source.setBarcode(null);
        source.setStatus(StandardProductStatus.MERGED);
        source.setMergedInto(target.getId());
        return target;
    }

    /** 管理端列表：按类目/关键词筛，默认含已合并（运营要能看到「这条被并到哪儿了」） */
    public List<StandardProductView> listForAdmin(UUID categoryId, String keyword) {
        return standardProductMapper.selectCandidates(categoryId, keyword, CANDIDATE_LIMIT).stream()
                .map(StandardProductView::from)
                .toList();
    }

    // ===== 卖家侧 =====

    /**
     * 卖家挂靠候选：只出 ACTIVE，可按类目与关键词（名字/品牌/条码）收窄。
     *
     * <p>不按「这个商品能不能挂」过滤：标准品与商家商品的类目本来就可能不一致（商家挂错类目是常事），
     * 用类目做硬闸会让正确的挂靠也挂不上。类目只作可选的收窄条件，由卖家自己选。
     */
    public List<StandardProductCandidateView> candidates(UUID categoryId, String keyword) {
        return standardProductMapper.selectCandidates(categoryId, keyword, CANDIDATE_LIMIT).stream()
                .map(StandardProductCandidateView::from)
                .toList();
    }

    /**
     * 卖家给自家商品挂靠/取消挂靠标准品（{@code standardProductId} 传 null 即取消）。
     *
     * <p>只校验「这个商品是本店的」与「目标标准品可用」，不校验两者类目是否一致——理由同
     * {@link #candidates}。挂靠是卖家自己的聚合声明，平台可以事后改，不值得在入口处硬拦。
     */
    @Transactional
    public void bind(UUID shopId, UUID productId, UUID standardProductId) {
        // 1. 归属闸门：非本店商品按不存在回答（与其余卖家入口同一口径）
        productMapper.requireShopOwned(shopId, productId);
        // 2. 目标标准品必须可用；取消挂靠不需要校验
        if (standardProductId != null) {
            Validate.notNull(standardProductMapper.selectActiveById(standardProductId), "标准品不存在或已合并");
        }
        // 3. 单列条件更新（shop_id 参与 WHERE 再兜一层越权）
        int affected = productMapper.bindStandardProduct(shopId, productId, standardProductId);
        Validate.isTrue(affected == 1, "商品不存在或不属于当前店铺");
    }

    /** 卖家视角：本店有多少商品挂了这个标准品（挂靠前先看「是不是已经挂过同一批货」） */
    public long countBound(UUID shopId, UUID standardProductId) {
        return productMapper.countByStandardProduct(shopId, standardProductId);
    }

    // ===== 私有 =====

    private StandardProduct requireActive(UUID id) {
        return Validate.notNull(standardProductMapper.selectActiveById(id), "标准品不存在或已合并");
    }

    private void requireEnabledCategory(UUID categoryId) {
        Category category = Validate.notNull(categoryMapper.selectById(categoryId), "类目不存在");
        Validate.isTrue(category.isEnabled(), "类目已禁用，不能挂标准品");
    }
}
