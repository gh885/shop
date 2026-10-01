package com.shop.platform.account.service;

import com.alotuser.address.SmartAgent;
import com.alotuser.address.assets.UserInfo;
import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.mapper.Address;
import com.shop.platform.account.mapper.AddressMapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.ErrorCodes;
import com.shop.platform.common.PhoneNumber;
import com.shop.platform.common.Text;
import com.shop.platform.common.Validate;
import com.shop.platform.infra.region.RegionRegistry;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class AddressService {

    /** 每买家收货地址条数上限（ACC-53：只数未删行，计数口径见 {@code AddressMapper.countByUser}） */
    private static final int MAX_ADDRESS_PER_USER = 20;

    private final AddressMapper addressMapper;

    private final RegionRegistry regionRegistry;

    /** 我的地址列表：默认地址置顶，其余按创建时间倒序 */
    public List<AddressView> list(UUID userId) {
        return addressMapper.selectByUser(userId).stream()
                .map(AddressView::from)
                .toList();
    }

    /** 地址详情：仅本人可见，否则 404 */
    public AddressView detail(UUID userId, UUID id) {
        return AddressView.from(requireOwned(userId, id));
    }

    /** 新增地址；条数超限拒绝。标记默认时先清掉其他默认，保证每用户至多一个默认 */
    @Transactional
    public AddressView create(UUID userId, AddressRequest req) {
        // 1. 条数闸门：超限 400 + code。上限作为 params.limit 出一次（不进 detail 那句话的解析），
        // 前端用它填 catalog 句子的 {limit}，后端把 20 改成 30 时前端零改动（docs/error-codes.md 的参数通道）。
        // 这里不用 Validate.isTrue：它没有带 params 的形状，而四参重载会让本行不再被 ErrorCodeVocabularyTest
        // 认成抛码站点（它按 3 参取码位），等于给这处闸门静默地松了门禁。
        long owned = addressMapper.countByUser(userId);
        if (owned >= MAX_ADDRESS_PER_USER) {
            throw BusinessException.badRequestWithParams(
                    ErrorCodes.ADDRESS_LIMIT_EXCEEDED,
                    "最多保存 " + MAX_ADDRESS_PER_USER + " 条收货地址",
                    Map.of("limit", MAX_ADDRESS_PER_USER));
        }
        // 2. 区划校验 + 默认位让位，再落库
        regionRegistry.requireValidCode(req.regionCode());
        boolean asDefault = Boolean.TRUE.equals(req.isDefault());
        if (asDefault) {
            addressMapper.clearDefault(userId);
        }
        Address address = Address.builder()
                .userId(userId)
                .receiverName(req.receiverName())
                .phone(PhoneNumber.of(req.phone()).value())
                .regionCode(req.regionCode())
                .province(req.province())
                .city(req.city())
                .district(req.district())
                .detail(req.detail())
                .label(normalizeLabel(req.label()))
                .isDefault(asDefault)
                .build();
        addressMapper.insert(address);
        log.info("[USER] 新增收货地址, userId={}, addrId={}, isDefault={}", userId, address.getId(), asDefault);
        return AddressView.from(address);
    }

    /** 修改地址：仅本人地址；isDefault 为 null 时保持原值 */
    @Transactional
    public AddressView update(UUID userId, UUID id, AddressRequest req) {
        regionRegistry.requireValidCode(req.regionCode());
        Address address = requireOwned(userId, id);
        address.setReceiverName(req.receiverName());
        address.setPhone(PhoneNumber.of(req.phone()).value());
        address.setRegionCode(req.regionCode());
        address.setProvince(req.province());
        address.setCity(req.city());
        address.setDistrict(req.district());
        address.setDetail(req.detail());
        address.setLabel(normalizeLabel(req.label()));
        if (req.isDefault() != null) {
            address.setIsDefault(req.isDefault());
            if (Boolean.TRUE.equals(address.getIsDefault())) {
                addressMapper.clearDefault(userId);
            }
        }
        addressMapper.updateById(address);
        return AddressView.from(address);
    }

    /** 删除地址：软删（MyBatis-Plus 逻辑删除），仅本人地址；被删的默认地址不自动顶替，允许无默认 */
    @Transactional
    public void delete(UUID userId, UUID id) {
        Address address = requireOwned(userId, id);
        addressMapper.deleteById(address.getId());
        log.info("[USER] 删除收货地址, userId={}, addrId={}", userId, id);
    }

    /** 设为默认：清掉本人其他默认后置目标为默认，靠部分唯一索引兜底并发 */
    @Transactional
    public AddressView setDefault(UUID userId, UUID id) {
        Address address = requireOwned(userId, id);
        addressMapper.clearDefault(userId);
        address.setIsDefault(true);
        addressMapper.updateById(address);
        log.info("[USER] 设置默认收货地址, userId={}, addrId={}", userId, id);
        return AddressView.from(address);
    }

    /** 取消默认：仅当目标是默认时清掉标记，允许出现「无默认地址」状态 */
    @Transactional
    public AddressView unsetDefault(UUID userId, UUID id) {
        Address address = requireOwned(userId, id);
        if (Boolean.TRUE.equals(address.getIsDefault())) {
            address.setIsDefault(false);
            addressMapper.updateById(address);
            log.info("[USER] 取消默认收货地址, userId={}, addrId={}", userId, id);
        }
        return AddressView.from(address);
    }

    /**
     * 智能粘贴：把一段非结构化收货文本解析成结构化字段。
     * 文本分词/抽取交给第三方库（smart-parse-address），
     * 区划名称 → 国标码的映射复用本模块 RegionRegistry（权威数据）。
     * 收件人/手机号可能抽取失败，由前端填充后让用户确认。
     */
    public AddressParseResult parse(String text) {
        UserInfo info = SmartAgent.parseUserAddressString(text).getUserInfo();
        String province = Text.trimToNull(info.getProvince());
        String city = Text.trimToNull(info.getCity());
        String district = Text.trimToNull(info.getCounty());
        String regionCode = regionRegistry.resolveCode(province, city, district);
        log.info("[USER] 智能粘贴解析, 命中区划码={}", regionCode);
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

    // 内部
    /** 业务层归一化标签：内置枚举 code 原样保留，空白当默认；其余按自定义文案入库 */
    private String normalizeLabel(String label) {
        if (label == null || label.isBlank()) {
            return Address.LABEL_DEFAULT;
        }
        return label;
    }

    /** 取本人地址：不存在或不属于当前用户一律 404，不泄露他人数据存在性 */
    private Address requireOwned(UUID userId, UUID id) {
        return Validate.requireOwned(addressMapper.selectById(id), Address::getUserId, userId, "地址不存在");
    }
}
