-- V12: CMS 模块 — cms schema + 首页内容配置（导航 / 运营位 banner / 推荐条词条）

CREATE SCHEMA IF NOT EXISTS cms;

-- 1) 首页分类导航：一条 = 前端 NavEntry（id/title/icon） + JSONB 子分组 subs（NavGroup[]）。
--    subs 用 JSONB 而非拆表：运营整段重配导航，非逐个改词条；前端契约恰好是 NavGroup[]。
CREATE TABLE IF NOT EXISTS cms.nav_entries (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    nav_key     VARCHAR(32) NOT NULL,          -- 'home'，预留顶部/页脚等多导航位
    title       VARCHAR(64) NOT NULL,          -- '冰洗/空调/电视/厨卫大电'
    icon_key    VARCHAR(32),                   -- 'refrigerator'，前端映射 lucide
    target      VARCHAR(255),                  -- 软关联：类目 id / 搜索词 / URL
    target_type VARCHAR(16),                   -- PRODUCT / CATEGORY / CAMPAIGN / SEARCH / URL
    subs        JSONB NOT NULL DEFAULT '[]',   -- [{name,items[]}]
    sort_order  INT NOT NULL DEFAULT 0,
    status      SMALLINT NOT NULL DEFAULT 1,           -- 1 启用 / 0 停用，不做物理删除
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_entries_nav_key ON cms.nav_entries(nav_key);

-- 2) 运营位 banner（位置 × 内容）：slot 标识运营位，如 home_promo
CREATE TABLE IF NOT EXISTS cms.banners (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    slot        VARCHAR(32) NOT NULL,          -- 'home_promo'，可能后续有 home_sidebar / flash_sale
    title       VARCHAR(64) NOT NULL,
    subtitle    VARCHAR(128),
    image_url   VARCHAR(512) NOT NULL,
    target      VARCHAR(255),
    target_type VARCHAR(16),
    link        VARCHAR(512),                  -- 仅 target_type=URL 用
    sort_order  INT NOT NULL DEFAULT 0,
    status      SMALLINT NOT NULL DEFAULT 1,           -- 1 启用 / 0 停用，不做物理删除
    start_at    TIMESTAMPTZ,                   -- 定时生效：大促 0 点自动上下线
    end_at      TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banners_slot ON cms.banners(slot);

-- 3) 推荐条词条（扁平数组）：首项 is_default=true 是"猜你喜欢"
CREATE TABLE IF NOT EXISTS cms.recommend_tabs (
    id          UUID PRIMARY KEY DEFAULT uuidv7(),
    name        VARCHAR(32) NOT NULL,          -- '猜你喜欢' / '运动户外' / '+更多'
    target      VARCHAR(255),
    target_type VARCHAR(16),
    is_default  BOOLEAN NOT NULL DEFAULT false,
    sort_order  INT NOT NULL DEFAULT 0,
    status      SMALLINT NOT NULL DEFAULT 1,           -- 1 启用 / 0 停用，不做物理删除
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
