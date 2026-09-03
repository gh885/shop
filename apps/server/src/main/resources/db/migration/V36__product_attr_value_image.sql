-- V36: Product 模块 — 类目属性「是否可上传取值图」(allow_image) + 规格值图片字段 (category_attr_values.image)

-- 销售属性/参数模板条目：该规格维度是否允许卖家为每个取值上传配图（如颜色色卡）
ALTER TABLE product.category_attrs
    ADD COLUMN IF NOT EXISTS allow_image BOOLEAN NOT NULL DEFAULT false;

-- 规格值（category_attr_values 行）可带一张默认图（如「红色」对应色卡图），URL/对象 key，可空
ALTER TABLE product.category_attr_values
    ADD COLUMN IF NOT EXISTS image VARCHAR(512);
