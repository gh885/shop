package com.shop.platform.account.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Mapper;

/**
 * 买家收货地址的读写。
 *
 * <p>「每人至多一个默认」由部分唯一索引 {@code uk_addresses_default} 兜底并发：这里
 * 「先清后设」两步保证常规路径不撞索引，两个请求同时从无默认状态各置一个新默认的写偏斜
 * 由索引接住、折成 409（见 AddressService）。
 */
@Mapper
public interface AddressMapper extends BaseMapper<AddressEntity> {

    /** 点查绑归属：id + buyerId 双条件，别人的地址查出空。不存在「查出来再比对」的窗口。 */
    default Optional<AddressEntity> find(UUID id, UUID buyerId) {
        return Optional.ofNullable(selectOne(Wrappers.<AddressEntity>lambdaQuery()
                .eq(AddressEntity::getId, id)
                .eq(AddressEntity::getBuyerId, buyerId)));
    }

    /** 默认置顶，其余创建时间倒序——结算页取列表第一条兜底就是「最新可用地址」 */
    default List<AddressEntity> findByBuyer(UUID buyerId) {
        return selectList(Wrappers.<AddressEntity>lambdaQuery()
                .eq(AddressEntity::getBuyerId, buyerId)
                .orderByDesc(AddressEntity::getIsDefault)
                .orderByDesc(AddressEntity::getCreatedAt));
    }

    default long countByBuyer(UUID buyerId) {
        return selectCount(Wrappers.<AddressEntity>lambdaQuery().eq(AddressEntity::getBuyerId, buyerId));
    }

    // 新增整行落库走 BaseMapper.insert；删除/更新都绑 buyer_id（纵深防御，调用方已校验过归属）

    /** 删除也绑归属：requireOwned 已验过，这里再挡一层「验完到删之间 id 被换」的窗口。 */
    default int deleteForBuyer(UUID id, UUID buyerId) {
        return delete(Wrappers.<AddressEntity>lambdaQuery()
                .eq(AddressEntity::getId, id)
                .eq(AddressEntity::getBuyerId, buyerId));
    }

    /**
     * 只改内容字段，is_default 一律走 {@link #clearDefault} + {@link #setDefault}——「先清后设」两步，
     * 第一步先降级旧默认，第二步置真才不会撞 uk_addresses_default 的瞬时窗口
     */
    default int updateContent(
            UUID id,
            UUID buyerId,
            String receiverName,
            String phone,
            String regionCode,
            String province,
            String city,
            String district,
            String detail,
            String label) {
        return update(
                null,
                Wrappers.<AddressEntity>lambdaUpdate()
                        .eq(AddressEntity::getId, id)
                        .eq(AddressEntity::getBuyerId, buyerId)
                        .set(AddressEntity::getReceiverName, receiverName)
                        .set(AddressEntity::getPhone, phone)
                        .set(AddressEntity::getRegionCode, regionCode)
                        .set(AddressEntity::getProvince, province)
                        .set(AddressEntity::getCity, city)
                        .set(AddressEntity::getDistrict, district)
                        .set(AddressEntity::getDetail, detail)
                        .set(AddressEntity::getLabel, label)
                        .setSql("updated_at = now()"));
    }

    /** 第一步：把本人现有默认全部降级。目标行本身是默认也会先被降级，随后的置真就不会撞瞬时唯一窗口 */
    default int clearDefault(UUID buyerId) {
        return update(
                null,
                Wrappers.<AddressEntity>lambdaUpdate()
                        .eq(AddressEntity::getBuyerId, buyerId)
                        .eq(AddressEntity::getIsDefault, true)
                        .set(AddressEntity::getIsDefault, false)
                        .setSql("updated_at = now()"));
    }

    /** 第二步：置/取消目标行的默认位。带 buyer 条件是纵深防御——调用方已校验过归属 */
    default int setDefault(UUID id, UUID buyerId, boolean isDefault) {
        return update(
                null,
                Wrappers.<AddressEntity>lambdaUpdate()
                        .eq(AddressEntity::getId, id)
                        .eq(AddressEntity::getBuyerId, buyerId)
                        .set(AddressEntity::getIsDefault, isDefault)
                        .setSql("updated_at = now()"));
    }

    /** 注销时的整簿清理：订单只持有快照，没有任何行引用地址簿，留着只会白养数据。 */
    default int deleteByBuyer(UUID buyerId) {
        return delete(Wrappers.<AddressEntity>lambdaQuery().eq(AddressEntity::getBuyerId, buyerId));
    }
}
