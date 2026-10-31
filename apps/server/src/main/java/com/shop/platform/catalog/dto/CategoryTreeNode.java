package com.shop.platform.catalog.dto;

import java.util.List;
import java.util.UUID;

/**
 * 类目树节点。给管理端画树、给卖家发品选类目。
 *
 * @param leaf 能不能挂商品。只有叶子类目能挂——非叶子类目的属性模板有歧义，识别键定不下来
 * @param mountable 能不能挂商品（叶子 + active）。两个字段分开：{@code leaf} 是树结构事实，
 *     {@code mountable} 是业务判断，前端拿后者禁用选项
 */
public record CategoryTreeNode(
        UUID id,
        // 根类目的父为 null；不标 nullable 的话前端契约校验会在第一棵树上就挂
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) UUID parentId,
        String code,
        String name,
        int level,
        int sort,
        String status,
        boolean leaf,
        boolean mountable,
        List<CategoryTreeNode> children) {}
