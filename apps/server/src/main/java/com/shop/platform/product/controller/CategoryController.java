package com.shop.platform.product.controller;

import com.shop.platform.product.service.CategoryService;
import com.shop.platform.product.service.CategoryService.CategoryNode;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;

    /** 前台类目树（仅启用节点），数据量小，全量返回由前端缓存 */
    @GetMapping("/tree")
    public List<CategoryNode> tree() {
        return categoryService.publicTree();
    }
}
