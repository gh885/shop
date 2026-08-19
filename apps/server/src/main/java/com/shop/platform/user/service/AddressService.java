package com.shop.platform.user.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import com.shop.platform.user.dto.AddressRequest;
import com.shop.platform.user.mapper.Address;
import com.shop.platform.user.mapper.AddressMapper;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class AddressService {

    private final AddressMapper addressMapper;

    /** 我的地址列表：默认地址置顶，其余按创建时间倒序 */
    public List<Address> list(UUID userId) {
        return addressMapper.selectList(new LambdaQueryWrapper<Address>()
                .eq(Address::getUserId, userId)
                .orderByDesc(Address::getIsDefault)
                .orderByDesc(Address::getCreatedAt));
    }

    /** 地址详情：仅本人可见，否则 404 */
    public Address detail(UUID userId, UUID id) {
        return own(userId, id);
    }

    /** 新增地址；标记默认时先清掉其他默认，保证每用户至多一个默认 */
    @Transactional
    public Address create(UUID userId, AddressRequest req) {
        boolean asDefault = Boolean.TRUE.equals(req.isDefault());
        if (asDefault) {
            clearDefaults(userId);
        }
        Address address = Address.builder()
                .userId(userId)
                .receiverName(req.receiverName())
                .phone(req.phone())
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
        return address;
    }

    /** 修改地址：仅本人地址；isDefault 为 null 时保持原值 */
    @Transactional
    public Address update(UUID userId, UUID id, AddressRequest req) {
        Address address = own(userId, id);
        address.setReceiverName(req.receiverName());
        address.setPhone(req.phone());
        address.setRegionCode(req.regionCode());
        address.setProvince(req.province());
        address.setCity(req.city());
        address.setDistrict(req.district());
        address.setDetail(req.detail());
        address.setLabel(normalizeLabel(req.label()));
        if (req.isDefault() != null) {
            address.setIsDefault(req.isDefault());
            if (Boolean.TRUE.equals(address.getIsDefault())) {
                clearDefaults(userId);
            }
        }
        addressMapper.updateById(address);
        return address;
    }

    /** 删除地址：软删（MyBatis-Plus 逻辑删除），仅本人地址；被删的默认地址不自动顶替 */
    @Transactional
    public void delete(UUID userId, UUID id) {
        Address address = own(userId, id);
        addressMapper.deleteById(address.getId());
        log.info("[USER] 删除收货地址, userId={}, addrId={}", userId, id);
    }

    /** 设为默认：清掉本人其他默认后置目标为默认，靠部分唯一索引兜底并发 */
    @Transactional
    public Address setDefault(UUID userId, UUID id) {
        Address address = own(userId, id);
        clearDefaults(userId);
        address.setIsDefault(true);
        addressMapper.updateById(address);
        log.info("[USER] 设置默认收货地址, userId={}, addrId={}", userId, id);
        return address;
    }

    // ========== 内部 ==========

    /** 业务层归一化标签：内置枚举 code 原样保留，空白当默认；其余按自定义文案入库 */
    private String normalizeLabel(String label) {
        if (label == null || label.isBlank()) {
            return Address.LABEL_DEFAULT;
        }
        return label;
    }

    /** 把当前用户所有地址的默认标记清零（创建/更新/设默认前调用） */
    private void clearDefaults(UUID userId) {
        addressMapper.update(
                null,
                new LambdaUpdateWrapper<Address>()
                        .eq(Address::getUserId, userId)
                        .set(Address::getIsDefault, false));
    }

    /** 取本人地址：不存在或不属于当前用户一律 404，不泄露他人数据存在性 */
    private Address own(UUID userId, UUID id) {
        Address address = Validate.notNull(addressMapper.selectById(id), "地址不存在");
        if (!address.getUserId().equals(userId)) {
            throw BusinessException.notFound("地址不存在");
        }
        return address;
    }
}
