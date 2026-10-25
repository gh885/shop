package com.shop.platform.account.service;

import com.alotuser.address.SmartAgent;
import com.alotuser.address.assets.UserInfo;
import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.mapper.AddressMapper;
import com.shop.platform.account.mapper.AddressRow;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.Text;
import com.shop.platform.common.id.Ids;
import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.infra.region.RegionRegistry;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 收货地址簿。订单只取快照不取引用，这里的增删改不影响任何历史订单。
 *
 * <p>「每人至多一个默认」由部分唯一索引 {@code uk_addresses_default} 兜底并发：服务层
 * 「先清后设」两步保证常规路径不撞索引，两个请求同时从无默认状态各置一个新默认的写偏斜
 * 由索引接住、折成 409。
 */
@Service
public class AddressService {

    private static final int MAX_ADDRESSES = 20;
    private static final String LABEL_DEFAULT = "HOME";
    private static final String DEFAULT_CONFLICT = "默认地址正被另一请求设置，请刷新后重试";

    private final AddressMapper addresses;
    private final RegionRegistry regions;

    public AddressService(AddressMapper addresses, RegionRegistry regions) {
        this.addresses = addresses;
        this.regions = regions;
    }

    /** 我的地址列表：默认置顶，其余创建时间倒序 */
    public List<AddressView> list(UUID buyerId) {
        return addresses.findByBuyer(buyerId).stream().map(AddressView::from).toList();
    }

    /** 地址详情：仅本人可见，否则 404 */
    public AddressView detail(UUID buyerId, UUID id) {
        return AddressView.from(requireOwned(buyerId, id));
    }

    /**
     * 新增地址；条数超限拒绝。
     *
     * <p>首条自动默认：结算页需要一个默认地址兜底，别让第一单卡在选地址上。
     * 显式 {@code isDefault=true} 或是本人第一条地址，都会成为默认。
     */
    @Transactional
    public AddressView create(UUID buyerId, AddressRequest req) {
        long owned = addresses.countByBuyer(buyerId);
        if (owned >= MAX_ADDRESSES) {
            // 上限走 params 通道：后端把 20 改 30 时前端文案零改动
            throw BusinessException.badRequestWithParams(
                    ErrorCodes.ADDRESS_LIMIT_EXCEEDED,
                    "最多保存 " + MAX_ADDRESSES + " 条收货地址",
                    Map.of("limit", MAX_ADDRESSES));
        }
        regions.requireValidCode(req.regionCode());
        boolean asDefault = Boolean.TRUE.equals(req.isDefault()) || owned == 0;
        if (asDefault) {
            addresses.clearDefault(buyerId);
        }
        UUID addressId = Ids.newId();
        var row = new AddressMapper.NewAddress(
                addressId,
                buyerId,
                req.receiverName(),
                PhoneNumber.of(req.phone()).value(),
                req.regionCode(),
                req.province(),
                req.city(),
                req.district(),
                req.detail(),
                normalizeLabel(req.label()),
                asDefault);
        DuplicateKeys.conflictOnDuplicate(() -> addresses.insert(row), DEFAULT_CONFLICT);
        return AddressView.from(addresses.find(addressId, buyerId).orElseThrow());
    }

    /** 修改地址：仅本人地址；isDefault 为 null 时保持原值 */
    @Transactional
    public AddressView update(UUID buyerId, UUID id, AddressRequest req) {
        regions.requireValidCode(req.regionCode());
        requireOwned(buyerId, id);
        addresses.updateContent(
                id,
                buyerId,
                req.receiverName(),
                PhoneNumber.of(req.phone()).value(),
                req.regionCode(),
                req.province(),
                req.city(),
                req.district(),
                req.detail(),
                normalizeLabel(req.label()));
        if (Boolean.TRUE.equals(req.isDefault())) {
            addresses.clearDefault(buyerId);
            DuplicateKeys.conflictOnDuplicate(() -> addresses.setDefault(id, buyerId, true), DEFAULT_CONFLICT);
        } else if (Boolean.FALSE.equals(req.isDefault())) {
            addresses.setDefault(id, buyerId, false);
        }
        return AddressView.from(addresses.find(id, buyerId).orElseThrow());
    }

    /** 删除地址（硬删）：仅本人地址。被删的是默认地址不自动顶替，允许无默认状态 */
    @Transactional
    public void delete(UUID buyerId, UUID id) {
        requireOwned(buyerId, id);
        addresses.deleteForBuyer(id, buyerId);
    }

    /** 设为默认：先清本人其他默认再置真；并发撞索引折成 409 */
    @Transactional
    public AddressView setDefault(UUID buyerId, UUID id) {
        requireOwned(buyerId, id);
        addresses.clearDefault(buyerId);
        DuplicateKeys.conflictOnDuplicate(() -> addresses.setDefault(id, buyerId, true), DEFAULT_CONFLICT);
        return AddressView.from(addresses.find(id, buyerId).orElseThrow());
    }

    /** 取消默认：仅当目标是默认时清掉标记，允许出现「无默认地址」状态 */
    @Transactional
    public AddressView unsetDefault(UUID buyerId, UUID id) {
        AddressRow owned = requireOwned(buyerId, id);
        if (owned.isDefault()) {
            addresses.setDefault(id, buyerId, false);
        }
        return AddressView.from(addresses.find(id, buyerId).orElseThrow());
    }

    /**
     * 智能粘贴：把一段非结构化收货文本解析成结构化字段。
     * 分词/抽取交给第三方库（smart-parse-address），区划名称 → 国标码复用本模块 RegionRegistry。
     * 收件人/手机号可能抽取失败，由前端填充后让用户确认。纯文本处理，不落库。
     */
    public AddressParseResult parse(String text) {
        UserInfo info = SmartAgent.parseUserAddressString(text).getUserInfo();
        String province = Text.trimToNull(info.getProvince());
        String city = Text.trimToNull(info.getCity());
        String district = Text.trimToNull(info.getCounty());
        String regionCode = regions.resolveCode(province, city, district);
        return new AddressParseResult(
                cleanReceiver(info.getName()),
                Text.trimToNull(info.getMobile()),
                regionCode,
                province,
                city,
                district,
                Text.trimToNull(info.getAddress()));
    }

    /** 收件人清洗：去掉尾部逗号/句号/空白等杂讯（如 "淘宝,"） */
    private static String cleanReceiver(String name) {
        String s = Text.trimToNull(name);
        return s == null ? null : s.replaceAll("[\\s,，。;；、]+$", "");
    }

    /** 标签归一化：空白当默认档 HOME，其余按传入文案入库 */
    private static String normalizeLabel(String label) {
        if (label == null || label.isBlank()) {
            return LABEL_DEFAULT;
        }
        return label;
    }

    /** 取本人地址：归属在 SQL 里（id + buyerId 双条件），不存在或不属于当前用户一律 404，不泄露存在性 */
    private AddressRow requireOwned(UUID buyerId, UUID id) {
        return addresses.find(id, buyerId).orElseThrow(() -> BusinessException.notFound("地址不存在"));
    }
}
