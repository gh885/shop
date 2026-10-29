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

    /** 商家发品时给的那批图都是通用图。 */
    default void insertGenericImages(UUID spuId, List<String> images) {
        insertImages(spuId, images, "image");
    }

    /** 详情图是另一条流：详情页正文里的长图，不参与卡片主图/规格图。 */
    default void insertDetailImages(UUID spuId, List<String> images) {
        insertImages(spuId, images, "detail");
    }

    private void insertImages(UUID spuId, List<String> images, String mediaType) {
        if (images == null || images.isEmpty()) {
            return;
        }
        int sort = 0;
        for (String url : images) {
            if (url == null || url.isBlank()) {
                continue;
            }
            insertTypedImage(Ids.newId(), spuId, url, mediaType, sort++);
        }
    }

    @Insert(
            """
            INSERT INTO catalog.spu_media (id, spu_id, url, media_type, sort)
            VALUES (#{id}, #{spuId}, #{url}, #{mediaType}, #{sort})
            """)
    void insertTypedImage(
            @Param("id") UUID id,
            @Param("spuId") UUID spuId,
            @Param("url") String url,
            @Param("mediaType") String mediaType,
            @Param("sort") int sort);

    /**
     * 规格图：选「红」就换这张。写 {@code attribute_id + spec_value}，不挂 SKU——
     * 8 色 × 5 码只有 8 套图。
     */
    @Insert(
            """
            INSERT INTO catalog.spu_media (id, spu_id, attribute_id, spec_value, url, sort)
            VALUES (#{id}, #{spuId}, #{attributeId}, #{specValue}, #{url}, #{sort})
            """)
    void insertSpecImage(
            @Param("id") UUID id,
            @Param("spuId") UUID spuId,
            @Param("attributeId") UUID attributeId,
            @Param("specValue") String specValue,
            @Param("url") String url,
            @Param("sort") int sort);

    default void replaceSpecImages(UUID spuId, List<SpecImage> images) {
        deleteSpecOfSpu(spuId);
        if (images == null || images.isEmpty()) {
            return;
        }
        int sort = 0;
        for (SpecImage image : images) {
            insertSpecImage(Ids.newId(), spuId, image.attributeId(), image.specValue(), image.url(), sort++);
        }
    }

    /**
     * 清掉一个 SPU 的通用图。
     *
     * <p><b>只删 {@code media_type='image'} 的那些。</b> 详情图、规格图各有各的入口；
     * 改基本信息不该顺手把它们清掉。
     */
    @Delete("DELETE FROM catalog.spu_media WHERE spu_id = #{spuId} AND attribute_id IS NULL AND media_type = 'image'")
    int deleteGenericOfSpu(@Param("spuId") UUID spuId);

    @Delete("DELETE FROM catalog.spu_media WHERE spu_id = #{spuId} AND attribute_id IS NULL AND media_type = 'detail'")
    int deleteDetailOfSpu(@Param("spuId") UUID spuId);

    @Delete("DELETE FROM catalog.spu_media WHERE spu_id = #{spuId} AND attribute_id IS NOT NULL")
    int deleteSpecOfSpu(@Param("spuId") UUID spuId);

    /** 删一个 SPU 的全部图（含规格图）。只给草稿删除用。 */
    @Delete("DELETE FROM catalog.spu_media WHERE spu_id = #{spuId}")
    int deleteAllOfSpu(@Param("spuId") UUID spuId);

    record SpecImage(UUID attributeId, String specValue, String url) {}
}
