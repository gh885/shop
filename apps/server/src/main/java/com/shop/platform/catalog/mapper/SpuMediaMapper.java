package com.shop.platform.catalog.mapper;

import com.shop.platform.common.id.Ids;
import java.util.List;
import java.util.UUID;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 商品图的写入。
 *
 * <p>通用图（{@code attribute_id IS NULL}）与规格图是同一张表。
 *
 * <p>为什么不在 spu 上留一个 jsonb 数组：一张连衣裙 8 色 × 5 码 = 40 个 SKU，但图只有 8 套。
 * 图必须能挂到规格值上（选"红"就换图），而 jsonb 数组表达不了这件事——它只能挂 SPU 级通用图。
 * 两处都能存图，就一定会出现"通用图对了、规格图空着"或"两边对不上"。
 */
@Mapper
public interface SpuMediaMapper {

    /** 通用图（不挂规格值，attribute_id/spec_value 留 NULL）；media_type 由列默认 'image' 落值。 */
    @Insert(
            """
            INSERT INTO catalog.spu_media (id, spu_id, url, sort)
            VALUES (#{id}, #{spuId}, #{url}, #{sort})
            """)
    void insertGenericImage(
            @Param("id") UUID id, @Param("spuId") UUID spuId, @Param("url") String url, @Param("sort") int sort);

    /** 商家发品时给的那批图都是通用图。 */
    default void insertGenericImages(UUID spuId, List<String> images) {
        if (images == null || images.isEmpty()) {
            return;
        }
        int sort = 0;
        for (String url : images) {
            if (url == null || url.isBlank()) {
                continue;
            }
            insertGenericImage(Ids.newId(), spuId, url, sort++);
        }
    }

    /**
     * 清掉一个 SPU 的通用图。
     *
     * <p><b>只删 {@code attribute_id IS NULL} 的那些。</b> 规格图（选“红”就换图）挂在规格值上，
     * 是 SKU 维度的事实；“改基本信息”不该把它们也清掉——那会让商家改个标题就丢掉全部规格图。
     */
    @Delete("DELETE FROM catalog.spu_media WHERE spu_id = #{spuId} AND attribute_id IS NULL")
    int deleteGenericOfSpu(@Param("spuId") UUID spuId);

    /** 删一个 SPU 的全部图（含规格图）。只给草稿删除用。 */
    @Delete("DELETE FROM catalog.spu_media WHERE spu_id = #{spuId}")
    int deleteAllOfSpu(@Param("spuId") UUID spuId);
}
