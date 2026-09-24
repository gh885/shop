package com.shop.platform.product.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.inventory.api.StockCommand;
import com.shop.platform.inventory.api.StockReadQuery;
import com.shop.platform.inventory.api.StockView;
import com.shop.platform.product.mapper.ParamItem;
import com.shop.platform.product.mapper.Product;
import com.shop.platform.product.mapper.ProductMapper;
import com.shop.platform.product.mapper.Sku;
import com.shop.platform.product.mapper.SkuMapper;
import com.shop.platform.product.model.ProductStatus;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 商品 SPU 生命周期：建草稿 → 编辑基本信息 → 发布（上架 / 入库）→ 下架 / 重上 → 放弃草稿。
 *
 * <p>本类只管状态机与发布门槛。规格与 SKU 对账在 {@link SkuService}，卖家 / 买家侧查询在 {@link ProductQueryService}，
 * 类目参数模板校验在 {@link CategoryAttrService}；状态规则本身在实体 {@link Product}（publishTo / off / relist / ensureAbandonable）。
 *
 * <p>卖家侧方法一律显式收 shopId 形参（controller 经 @CurrentShop 从 X-Shop-Id 注入），不在方法体读 ShopIdHolder ThreadLocal。
 */
@Service
@RequiredArgsConstructor
public class ProductService {

    private final ProductMapper productMapper;
    private final CategoryService categoryService;
    private final SkuMapper skuMapper;
    private final CategoryAttrService categoryAttrService;
    private final SkuService skuService;
    private final StockCommand stockCommand;
    private final StockReadQuery stockReadQuery;

    /** 创建商品草稿：只落基本信息，specs/SKU 由后续接口补充。shopId 由 controller 从店铺上下文（X-Shop-Id）注入 */
    public Product create(CreateProductCommand command) {
        // 1. 挂载闸门：必须是存在、启用、父链完整的叶子类目（CATEGORY_NOT_LEAF / CATEGORY_DISABLED）
        categoryService.requireMountableCategory(command.categoryId());
        // 类目有参数模板时校验 params（required 必填、attrId 归属、值域约束）；无模板维持自由文本
        categoryAttrService.validateParams(command.categoryId(), command.params());
        Product draft = toDraftEntity(command);
        productMapper.insert(draft);
        return draft;
    }

    /**
     * 编辑基本信息（specs/SKU 之外的字段）。任何状态可改：上架后改展示字段/分类是日常运营，改规格走 SkuService.updateSpecs。
     *
     * <p>统一用「实体 + updateById」而非 LambdaUpdateWrapper：detailImages / images / params 是 JSONB 列，
     * wrapper 的 {@code set(列, List)} 不携带 {@code @TableField(typeHandler)}，MP 把 ArrayList 当普通参数传入，
     * PG 无法推断数组类型直接 500（实测报「无法推测实例 java.util.ArrayList 的 SQL 类型」）。
     * 实体方案走实体的 typeHandler，JSONB ↔ List 序列化正确。
     *
     * <p>PATCH 语义（传 null 不写）在字段级保留：只 set 非 null 的字段；subtitle 例外——空串表示清空卖点，
     * 显式写给 null（blankToNull），因为 updateById 默认忽略 null 字段，故 subtitle 单独用 wrapper 子句。
     */
    @Transactional
    public Product updateBasic(UUID shopId, UUID productId, UpdateBasicCommand command) {
        // 1. 校验：商品存在且属于当前店铺
        Product product = productMapper.requireShopOwned(shopId, productId);
        // 1.1 类目变更（结构性操作）：PATCH 下 categoryId=null 表示不改；非 null 且与当前不同时仅草稿允许——
        //     上架/仓库中是经营资产（在售/已填完并关联 SKU 规格快照），换类目会错配规格/重新生产，需先下架再改。
        UUID targetCategory = command.categoryId();
        boolean categoryChanged = targetCategory != null && !targetCategory.equals(product.getCategoryId());
        if (categoryChanged) {
            Validate.isTrue(product.isDraft(), 409, "只有草稿可以修改类目，上架/仓库中商品请先下架");
            // 改挂与创建同一挂载闸门（叶子 + 启用 + 父链完整）
            categoryService.requireMountableCategory(targetCategory);
        }
        // 2. params 模板校验：传了 params 用新值校验，没传（不改）则拿存量对有效类目复检（换类目可能撞上必填模板）
        UUID effectiveCategory = targetCategory != null ? targetCategory : product.getCategoryId();
        categoryAttrService.validateParams(
                effectiveCategory, command.params() != null ? command.params() : product.getParams());

        // 3. 实体局部更新：非 null 字段 set 到已加载的实体（JSONB 走实体 typeHandler）
        boolean nameChanged = command.name() != null && !command.name().equals(product.getName());
        if (categoryChanged) {
            product.setCategoryId(targetCategory);
        }
        if (nameChanged) {
            product.setName(command.name());
        }
        if (command.subtitle() != null) {
            product.setSubtitle(Text.blankToNull(command.subtitle()));
        }
        if (command.detailImages() != null) {
            product.setDetailImages(command.detailImages());
        }
        if (command.mainImage() != null) {
            product.setMainImage(command.mainImage());
        }
        if (command.images() != null) {
            product.setImages(command.images());
        }
        if (command.params() != null) {
            product.setParams(command.params());
        }
        if (command.sevenDayReturn() != null) {
            product.setSevenDayReturn(command.sevenDayReturn());
        }
        // 4. subtitle「清空调」：空串传进来 = 想清空卖点，而 updateById 忽略 null 字段，用 wrapper 子句单独写 null
        if (command.subtitle() != null && Text.blankToNull(command.subtitle()) == null) {
            productMapper.update(
                    null,
                    new LambdaUpdateWrapper<Product>()
                            .eq(Product::getId, productId)
                            .set(Product::getSubtitle, null));
        }
        productMapper.updateById(product);
        // 5. SKU 名是「SPU名+规格值」的快照：SPU 改名后刷一遍存量 SKU 名，
        //    避免购物车/订单/列表里留旧标题。规格值不变则组合不变，name 只是拼串，刷新安全。
        if (nameChanged) {
            skuService.refreshNames(product);
        }
        return product;
    }

    /** 发布：目标态 = 立即上架（PUBLISHED）或放入仓库（WAREHOUSE），由入参 target 决定。
     *  门槛见 {@link #ensurePublishable}（商品有名 + 每个在售 SKU 都已设价，两目标同门槛）；
     *  **立即上架**另须至少一个在售 SKU 有库存——
     *  对齐「架上商品不能全 0」（仓库中不售，允许售罄入库，届时列表「上架」动作会再拦）。 */
    @Transactional
    public Product publish(UUID shopId, UUID productId, ProductStatus target) {
        Product product = productMapper.requireShopOwned(shopId, productId);
        // 1. 发布门槛：标题非空 + 每个在售 SKU 都已设价（与重上同一条，见 ensurePublishable）
        product.applyPriceRange(ensurePublishable(product));
        // 1.5 立即上架另须有货（放入仓库允许售罄入库）
        if (target == ProductStatus.PUBLISHED) {
            ensureOnShelfStock(productId);
        }
        // 2. 守卫 + 置目标态（仅草稿可发布、目标只许上架/仓库的规则在实体内）
        product.publishTo(target);
        // 3. 状态迁移条件更新（乐观锁）：只允许「DRAFT → target」，丢更新/竞态下 affected=0 抛 409，
        //    避免读-改-写的并发覆盖（如两请求同时发布、或发布外被它请求改态）。
        requireTransition(productId, ProductStatus.DRAFT, target, "商品状态已变化，请刷新后重试");
        // 4. 回填的价格区间需落库（DB status 已被 requireTransition 置 target；这里补写 min/max 等）
        productMapper.updateById(product);
        return product;
    }

    /** 下架：仅上架商品可下架。不做物理删除，下架即"删除"语义，可无损恢复 */
    @Transactional
    public Product off(UUID shopId, UUID productId) {
        Product product = productMapper.requireShopOwned(shopId, productId);
        // 守卫 + 置下架（仅上架可下架的规则在实体内），乐观锁条件更新
        product.off();
        requireTransition(productId, ProductStatus.PUBLISHED, ProductStatus.WAREHOUSE, "商品状态已变化，请刷新后重试");
        return product;
    }

    /** 重新上架：仅仓库中商品可上架，复检发布门槛（下架期间 SKU 与标题可能被改）+ 有货（对齐「架上不能全 0」） */
    @Transactional
    public Product on(UUID shopId, UUID productId) {
        Product product = productMapper.requireShopOwned(shopId, productId);
        // 1. 复检发布门槛：下架期间 SKU 可能被改（在售 SKU 口径），标题也可能被编辑清空（PRD-43 全部门槛）
        ensurePublishable(product);
        // 1.5 上架须有货：仓库中的售罄商品需先补货再上架
        ensureOnShelfStock(productId);
        // 2. 守卫 + 置上架（仅下架可重上的规则在实体内），乐观锁条件更新
        product.relist();
        requireTransition(productId, ProductStatus.WAREHOUSE, ProductStatus.PUBLISHED, "商品状态已变化，请刷新后重试");
        return product;
    }

    /** 放弃（删除）草稿：仅草稿可删，同事务清 SKU + 库存行，避免草稿箱堆积废弃草稿。
     *  上架/下架商品是经营资产，不做物理删除（走 off）——此删除入口只服务「不发了，扔掉这个草稿」。 */
    @Transactional
    public void abandon(UUID shopId, UUID productId) {
        // 1. 归属 + 守卫：商品存在且属于当前店铺、仅草稿可放弃（规则在实体内）
        Product product = productMapper.requireShopOwned(shopId, productId);
        product.ensureAbandonable();
        // 2. 同事务清 SKU + 库存主体行（先清库存行再删 SKU）
        List<Sku> skus = skuMapper.selectByProductId(productId);
        for (Sku sku : skus) {
            stockCommand.removeRow(sku.getId());
            skuMapper.deleteById(sku.getId());
        }
        // 3. 删 SPU
        productMapper.deleteById(productId);
    }

    // 私有：发布门槛与状态迁移
    /**
     * 发布门槛（PRD-42）：标题非空 + 有在售 SKU + 每个在售 SKU 都设了价。publish 与 on 共用这一条（PRD-43 要求
     * 重上复检「全部门槛」，标题也在这道门里——曾经只有 publish 卡标题，于是「下架 → 清空标题 → 重新上架」
     * 能把一张空标题的卡片推上架）。
     * 注：库存 0 是否可上架不在此判断（整链接无货不可上架/需先下架）。
     */
    private List<Sku> ensurePublishable(Product product) {
        // 0. 草稿阶段允许空名，但要出门（上架或入库）就必须有名——买家搜索与展示都靠它
        Validate.isTrue(StringUtils.hasText(product.getName()), "请先填写商品标题再发布");
        List<Sku> skus = skuMapper.selectByProductId(product.getId());
        // 发布/重上门槛只看「在售 SKU」：停用 SKU 不计入（停用 SKU 不该阻塞上架，也不该被索取价格）
        List<Sku> onSale = skus.stream().filter(Sku::isOnSale).toList();
        Validate.isTrue(!onSale.isEmpty(), "请先设置商品规格");
        boolean anyMissingPrice = onSale.stream().anyMatch(s -> s.getPrice() == null);
        Validate.isTrue(!anyMissingPrice, "所有在售 SKU 都需设置价格后才能发布");
        return skus;
    }

    /** 上架有货门槛：至少一个在售 SKU 库存 > 0（对齐「架上商品不能全 0」）。库存行在 inventory 模块，经 StockReadQuery 读 total。 */
    private void ensureOnShelfStock(UUID productId) {
        List<Sku> onSale = skuMapper.selectByProductId(productId).stream()
                .filter(Sku::isOnSale)
                .toList();
        Map<UUID, StockView> stocks =
                stockReadQuery.availableBySkuIds(onSale.stream().map(Sku::getId).toList());
        boolean anyInStock = onSale.stream()
                .anyMatch(s -> stocks.getOrDefault(s.getId(), new StockView(s.getId(), 0, 0, 0))
                                .stock()
                        > 0);
        Validate.isTrue(anyInStock, "商品全部在售 SKU 库存为 0，请补充库存后再上架");
    }

    /**
     * 状态迁移乐观锁：只用条件更新「where status=from → set status=to」，affected=0 说明并发下状态已变
     * （读-判-写之间的竞争窗口被挡），抛 409 让调用方刷新重试；返回的实体字段由调用方另行落库。
     */
    private void requireTransition(UUID productId, ProductStatus from, ProductStatus to, String detail) {
        int affected = productMapper.update(
                null,
                new LambdaUpdateWrapper<Product>()
                        .eq(Product::getId, productId)
                        .eq(Product::getStatus, from)
                        .set(Product::getStatus, to));
        if (affected == 0) {
            throw BusinessException.conflict(null, detail);
        }
    }

    /** 组装草稿实体。草稿没有 SKU，故价格字段留空、specs 为 []；
     *  请求未传的 images/params 归一为 []（对齐 detailImages）：
     *  出参 ProductResponse 契约里它们是 required 非空数组，实体落 null 会让响应契约校验直接挂掉 */
    private Product toDraftEntity(CreateProductCommand command) {
        return Product.builder()
                .shopId(command.shopId())
                .categoryId(command.categoryId())
                .name(command.name())
                .subtitle(Text.blankToNull(command.subtitle()))
                .detailImages(command.detailImages() == null ? List.of() : command.detailImages())
                .mainImage(command.mainImage())
                .images(command.images() == null ? List.of() : command.images())
                .specs(List.of())
                .params(command.params() == null ? List.of() : command.params())
                // 未声明 = 支持（消保法默认支持退货，除外得卖家自己说明），不把 null 落库
                .sevenDayReturn(command.sevenDayReturn() == null || command.sevenDayReturn())
                .status(ProductStatus.DRAFT)
                .build();
    }

    // 入参
    /** 创建商品草稿的业务入参聚合 */
    public record CreateProductCommand(
            UUID shopId,
            UUID categoryId,
            String name,
            String subtitle,
            List<String> detailImages,
            String mainImage,
            List<String> images,
            List<ParamItem> params,
            /** null = 未声明，取法定默认（支持七天无理由退货） */
            Boolean sevenDayReturn) {}

    /** 编辑商品基本信息的业务入参聚合（specs/SKU 之外的字段，与创建同字段去掉 shopId） */
    public record UpdateBasicCommand(
            UUID categoryId,
            String name,
            String subtitle,
            List<String> detailImages,
            String mainImage,
            List<String> images,
            List<ParamItem> params,
            /** null = 不改（PATCH） */
            Boolean sevenDayReturn) {}
}
