package com.shop.platform.shop.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.region.RegionRegistry;
import com.shop.platform.shop.dto.MerchantAddressRequest;
import com.shop.platform.shop.mapper.MerchantAddress;
import com.shop.platform.shop.mapper.MerchantAddressMapper;
import com.shop.platform.shop.model.AddressStatus;
import java.util.List;
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
        // 1. 条数闸门：超限 400 + code（前端 toast 显示 detail）
        long owned = addressMapper.selectCount(
                new LambdaQueryWrapper<MerchantAddress>().eq(MerchantAddress::getShopId, shopId));
        Validate.isTrue(
                owned < MAX_ADDRESS_PER_SHOP,
                "MERCHANT_ADDRESS_LIMIT_EXCEEDED",
                "最多添加 " + MAX_ADDRESS_PER_SHOP + " 条地址");
        // 2. 区划校验 + 默认位让位，再落库
        validateRegion(req.regionCode());
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
        addressMapper.insert(address);
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
        validateRegion(req.regionCode());
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
        applyDefaultFlag(shopId, address, req.defaultShip(), true);
        applyDefaultFlag(shopId, address, req.defaultReturn(), false);
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
        addressMapper.updateById(address);
        log.info("[ADDRESS] 设默认{}地址, shopId={}, addressId={}", ship ? "发货" : "退货", shopId, id);
        return address;
    }

    /** 应用默认标记：flag 为 null 保持原值；true 清同类默认后置；false 取消该默认 */
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

    /** 校验行政区划码为合法国标 6 位码 */
    private void validateRegion(String regionCode) {
        Validate.isTrue(regionRegistry.isValidCode(regionCode), "行政区划代码无效");
    }

    /** 取本店地址（删除是硬删，没有「已删但仍能查到」的中间态）：不存在或不属于当前店铺一律 404，不泄露他人地址存在性 */
    private MerchantAddress requireOwnedAddress(UUID shopId, UUID id) {
        return Validate.requireOwned(addressMapper.selectById(id), MerchantAddress::getShopId, shopId, "地址不存在");
    }
}
