package com.shop.platform.shop.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.infra.region.RegionRegistry;
import com.shop.platform.shop.dto.MerchantAddressRequest;
import com.shop.platform.shop.mapper.MerchantAddress;
import com.shop.platform.shop.mapper.MerchantAddressMapper;
import com.shop.platform.shop.model.AddressStatus;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 商家地址管理（单表「地址本体 + 默认发货/默认退货」模型，对齐淘宝地址库）。
 *
 * <p>核心约束：
 * <ul>
 *   <li>越店访问一律 404（不泄露他人地址存在性，对齐 seller order 模式）。</li>
 *   <li>每店至多一个默认发货 / 默认退货：设默认前先清同类默认（部分唯一索引兜底并发）。</li>
 *   <li>软删地址：api 快照解析（未删 + ACTIVE）永不命中已删地址。</li>
 *   <li>删除/取消默认地址不静默顶替，允许该店暂时无默认。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MerchantAddressService {

    /** 每店地址条数上限（对齐卖家工作台文案「您最多可添加 200 条地址」；软删不占名额，@TableLogic 自动过滤） */
    private static final int MAX_ADDRESS_PER_SHOP = 200;

    /**
     * 「每店至多一个默认发货 / 默认退货」由部分唯一索引守（写偏斜：两个请求各自清掉旧默认再各置一个新的，行级手段
     * 挡不住）。撞索引折成 409——GlobalExceptionHandler 不映射 DuplicateKeyException，不折就是 500（与买家地址同口径）。
     */
    private static final String DEFAULT_CONFLICT = "默认地址正被另一请求设置，请刷新后重试";

    private final MerchantAddressMapper addressMapper;

    private final RegionRegistry regionRegistry;

    /** 本店地址列表：默认发货/退货置顶，其余按更新时间倒序 */
    public List<MerchantAddress> list(UUID shopId) {
        return addressMapper.selectByShop(shopId);
    }

    /** 本店地址详情：非本店地址一律 404 */
    public MerchantAddress detail(UUID shopId, UUID id) {
        return requireOwnedAddress(shopId, id);
    }

    /** 新增地址：条数超限拒绝；可同时标记默认发货/默认退货（各至多一个） */
    @Transactional
    public MerchantAddress create(UUID shopId, MerchantAddressRequest req) {
        // 1. 条数闸门：超限 400 + code。上限作为 params.limit 出一次（不进 detail 那句话的解析），见
        // AddressService.create 同处注释与 错误码判据 的参数通道；哪些行占名额的口径见 countByShop
        long owned = addressMapper.countByShop(shopId);
        if (owned >= MAX_ADDRESS_PER_SHOP) {
            throw BusinessException.badRequestWithParams(
                    ErrorCodes.MERCHANT_ADDRESS_LIMIT_EXCEEDED,
                    "最多添加 " + MAX_ADDRESS_PER_SHOP + " 条地址",
                    Map.of("limit", MAX_ADDRESS_PER_SHOP));
        }
        // 2. 区划校验 + 默认位让位，再落库
        regionRegistry.requireValidCode(req.regionCode());
        boolean asShipDefault = Boolean.TRUE.equals(req.defaultShip());
        boolean asReturnDefault = Boolean.TRUE.equals(req.defaultReturn());
        if (asShipDefault) {
            addressMapper.clearDefaultShip(shopId);
        }
        if (asReturnDefault) {
            addressMapper.clearDefaultReturn(shopId);
        }
        MerchantAddress address = MerchantAddress.builder()
                .shopId(shopId)
                .contactName(req.contactName())
                .phone(PhoneNumber.of(req.phone()).value())
                .regionCode(req.regionCode())
                .province(req.province())
                .city(req.city())
                .district(req.district())
                .detail(req.detail())
                .postalCode(req.postalCode())
                .companyName(req.companyName())
                .note(req.note())
                .defaultShip(asShipDefault)
                .defaultReturn(asReturnDefault)
                .status(AddressStatus.ACTIVE)
                .build();
        DuplicateKeys.conflictOnDuplicate(() -> addressMapper.insert(address), DEFAULT_CONFLICT);
        log.info(
                "[ADDRESS] 新增商家地址, shopId={}, addressId={}, shipDefault={}, returnDefault={}",
                shopId,
                address.getId(),
                asShipDefault,
                asReturnDefault);
        return address;
    }

    /** 编辑地址：默认发货/退货为 null 时保持原值，为 true 时清同类默认后置 */
    @Transactional
    public MerchantAddress update(UUID shopId, UUID id, MerchantAddressRequest req) {
        regionRegistry.requireValidCode(req.regionCode());
        MerchantAddress address = requireOwnedAddress(shopId, id);
        address.setContactName(req.contactName());
        address.setPhone(PhoneNumber.of(req.phone()).value());
        address.setRegionCode(req.regionCode());
        address.setProvince(req.province());
        address.setCity(req.city());
        address.setDistrict(req.district());
        address.setDetail(req.detail());
        address.setPostalCode(req.postalCode());
        address.setCompanyName(req.companyName());
        address.setNote(req.note());
        // 默认标记走条件更新（标记列标了 NEVER，下一句的整行回写写不进它们）：置真前先清同类默认，撞索引折 409
        applyDefaultFlag(shopId, address, req.defaultShip(), true);
        applyDefaultFlag(shopId, address, req.defaultReturn(), false);
        if (req.defaultShip() != null || req.defaultReturn() != null) {
            DuplicateKeys.conflictOnDuplicate(
                    () -> addressMapper.setDefaultFlags(
                            shopId, id, req.defaultShip(), req.defaultReturn(), OffsetDateTime.now()),
                    DEFAULT_CONFLICT);
        }
        addressMapper.updateById(address);
        log.info("[ADDRESS] 更新商家地址, shopId={}, addressId={}", shopId, id);
        return address;
    }

    /** 删除地址：软删，api 快照解析永不命中 */
    @Transactional
    public void delete(UUID shopId, UUID id) {
        MerchantAddress address = requireOwnedAddress(shopId, id);
        addressMapper.deleteById(address.getId());
        log.info("[ADDRESS] 删除商家地址(软删), shopId={}, addressId={}", shopId, id);
    }

    /** 设为默认发货地址：清本店其他默认发货后置 */
    @Transactional
    public MerchantAddress setDefaultShip(UUID shopId, UUID id) {
        return setDefault(shopId, id, true);
    }

    /** 设为默认退货地址：清本店其他默认退货后置 */
    @Transactional
    public MerchantAddress setDefaultReturn(UUID shopId, UUID id) {
        return setDefault(shopId, id, false);
    }

    // 内部
    private MerchantAddress setDefault(UUID shopId, UUID id, boolean ship) {
        MerchantAddress address = requireOwnedAddress(shopId, id);
        applyDefaultFlag(shopId, address, true, ship);
        // 标记列只经条件更新落库（标了 NEVER，updateById 写不进），并发置真撞部分唯一索引折 409
        Boolean defaultShip = ship ? Boolean.TRUE : null;
        Boolean defaultReturn = ship ? null : Boolean.TRUE;
        DuplicateKeys.conflictOnDuplicate(
                () -> addressMapper.setDefaultFlags(shopId, id, defaultShip, defaultReturn, OffsetDateTime.now()),
                DEFAULT_CONFLICT);
        log.info("[ADDRESS] 设默认{}地址, shopId={}, addressId={}", ship ? "发货" : "退货", shopId, id);
        return address;
    }

    /** 应用默认标记到内存对象并清同类默认：flag 为 null 保持原值；true 清同类默认后置；false 取消该默认。落库见 setDefaultFlags */
    private void applyDefaultFlag(UUID shopId, MerchantAddress address, Boolean flag, boolean ship) {
        if (flag == null) {
            return;
        }
        if (Boolean.TRUE.equals(flag)) {
            if (ship) {
                addressMapper.clearDefaultShip(shopId);
                address.setDefaultShip(true);
            } else {
                addressMapper.clearDefaultReturn(shopId);
                address.setDefaultReturn(true);
            }
        } else if (ship) {
            address.setDefaultShip(false);
        } else {
            address.setDefaultReturn(false);
        }
    }

    /**
     * 取本店地址：删除是<b>软删</b>（{@code MerchantAddress.deletedAt} 贴 {@code @TableLogic}，查询自动滤掉已删行），
     * 所以这里没有「已删但仍能查到」的中间态可读——行还在库里（面单/售后拿的是当时解析的快照，不受影响），
     * 但对卖家与 api 解析都当它不存在。不存在或不属于当前店铺一律 404，不泄露他人地址存在性。
     */
    private MerchantAddress requireOwnedAddress(UUID shopId, UUID id) {
        return Validate.requireOwned(addressMapper.selectById(id), MerchantAddress::getShopId, shopId, "地址不存在");
    }
}
