package com.shop.platform.account.mapper;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

/**
 * 买家收货地址的读写。
 *
 * <p>「每人至多一个默认」由部分唯一索引 {@code uk_addresses_default} 兜底并发：这里
 * 「先清后设」两步保证常规路径不撞索引，两个请求同时从无默认状态各置一个新默认的写偏斜
 * 由索引接住、折成 409（见 AddressService）。
 */
@Mapper
public interface AddressMapper {

    /** 点查绑归属：id + buyerId 双条件，别人的地址查出空。不存在「查出来再比对」的窗口。 */
    @Select(
            """
            SELECT id, buyer_id, receiver_name, phone, region_code, province,
                   city, district, detail, label, is_default, created_at, updated_at
              FROM account.addresses
             WHERE id = #{id} AND buyer_id = #{buyerId}
            """)
    Optional<AddressRow> find(@Param("id") UUID id, @Param("buyerId") UUID buyerId);

    /** 默认置顶，其余创建时间倒序——结算页取列表第一条兜底就是「最新可用地址」 */
    @Select(
            """
            SELECT id, buyer_id, receiver_name, phone, region_code, province,
                   city, district, detail, label, is_default, created_at, updated_at
              FROM account.addresses
             WHERE buyer_id = #{buyerId}
             ORDER BY is_default DESC, created_at DESC
            """)
    List<AddressRow> findByBuyer(@Param("buyerId") UUID buyerId);

    @Select("SELECT count(*) FROM account.addresses WHERE buyer_id = #{buyerId}")
    long countByBuyer(@Param("buyerId") UUID buyerId);

    /** 新增整行落库；created_at / updated_at 由列默认 now() 落值，insert 不碰。 */
    @Insert(
            """
            INSERT INTO account.addresses
                (id, buyer_id, receiver_name, phone, region_code, province,
                 city, district, detail, label, is_default)
            VALUES (#{row.id}, #{row.buyerId}, #{row.receiverName}, #{row.phone}, #{row.regionCode}, #{row.province},
                    #{row.city}, #{row.district}, #{row.detail}, #{row.label}, #{row.isDefault})
            """)
    void insert(@Param("row") NewAddress address);

    /** 删除也绑归属：requireOwned 已验过，这里再挡一层「验完到删之间 id 被换」的窗口。 */
    @Delete("DELETE FROM account.addresses WHERE id = #{id} AND buyer_id = #{buyerId}")
    int deleteForBuyer(@Param("id") UUID id, @Param("buyerId") UUID buyerId);

    /**
     * 只改内容字段，is_default 一律走 {@link #clearDefault} + {@link #setDefault}——「先清后设」两步，
     * 第一步先降级旧默认，第二步置真才不会撞 uk_addresses_default 的瞬时窗口
     */
    @Update(
            """
            UPDATE account.addresses
               SET receiver_name = #{receiverName}, phone = #{phone},
                   region_code = #{regionCode}, province = #{province}, city = #{city},
                   district = #{district}, detail = #{detail}, label = #{label},
                   updated_at = now()
             WHERE id = #{id} AND buyer_id = #{buyerId}
            """)
    int updateContent(
            @Param("id") UUID id,
            @Param("buyerId") UUID buyerId,
            @Param("receiverName") String receiverName,
            @Param("phone") String phone,
            @Param("regionCode") String regionCode,
            @Param("province") String province,
            @Param("city") String city,
            @Param("district") String district,
            @Param("detail") String detail,
            @Param("label") String label);

    /** 第一步：把本人现有默认全部降级。目标行本身是默认也会先被降级，随后的置真就不会撞瞬时唯一窗口 */
    @Update(
            """
            UPDATE account.addresses
               SET is_default = false, updated_at = now()
             WHERE buyer_id = #{buyerId} AND is_default = true
            """)
    int clearDefault(@Param("buyerId") UUID buyerId);

    /** 第二步：置/取消目标行的默认位。带 buyer 条件是纵深防御——调用方已校验过归属 */
    @Update(
            """
            UPDATE account.addresses
               SET is_default = #{isDefault}, updated_at = now()
             WHERE id = #{id} AND buyer_id = #{buyerId}
            """)
    int setDefault(@Param("id") UUID id, @Param("buyerId") UUID buyerId, @Param("isDefault") boolean isDefault);

    /** 注销时的整簿清理：订单只持有快照，没有任何行引用地址簿，留着只会白养数据。 */
    @Delete("DELETE FROM account.addresses WHERE buyer_id = #{buyerId}")
    int deleteByBuyer(@Param("buyerId") UUID buyerId);

    /** 新增地址的一行。时间列不进 insert（列默认 now()）。 */
    record NewAddress(
            UUID id,
            UUID buyerId,
            String receiverName,
            String phone,
            String regionCode,
            String province,
            String city,
            String district,
            String detail,
            String label,
            Boolean isDefault) {}
}
