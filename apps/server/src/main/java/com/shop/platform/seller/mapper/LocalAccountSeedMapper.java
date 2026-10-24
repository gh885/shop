package com.shop.platform.seller.mapper;

import com.shop.platform.common.id.Ids;
import java.util.UUID;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 本地种子账号的写入，只服务 {@link LocalAccountSeed}：三张表各一句。
 *
 * <p>merchant 的 id 由应用侧生成（{@code Ids.newId()}）——建店铺和主账号都要先拿着 merchantId，
 * 而注解 SQL 拿不到 {@code RETURNING} 的返回值。shop / operator 的 id 留给数据库默认。
 */
@Mapper
public interface LocalAccountSeedMapper {

    @Select("SELECT count(*) FROM seller.merchant")
    int countMerchants();

    default UUID insertMerchant(String name) {
        UUID id = Ids.newId();
        insertMerchantRow(id, name);
        return id;
    }

    @Insert("INSERT INTO seller.merchant (id, name) VALUES (#{id}, #{name})")
    void insertMerchantRow(@Param("id") UUID id, @Param("name") String name);

    @Insert("INSERT INTO seller.shop (merchant_id, name) VALUES (#{merchantId}, #{name})")
    void insertShop(@Param("merchantId") UUID merchantId, @Param("name") String name);

    @Insert(
            """
            INSERT INTO seller.operator (merchant_id, login_name, password_hash, display_name, is_primary)
            VALUES (#{merchantId}, #{loginName}, #{passwordHash}, #{displayName}, true)
            """)
    void insertOperator(
            @Param("merchantId") UUID merchantId,
            @Param("loginName") String loginName,
            @Param("passwordHash") String passwordHash,
            @Param("displayName") String displayName);
}
