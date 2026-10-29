SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 内容合规：违禁词表。匹配口径在 Java（NFKC + trim + lowercase，子串命中），
-- 表里存归一化后的词，唯一键兜住重复。
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE governance.forbidden_word
(
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    word       text        NOT NULL,
    status     text        NOT NULL DEFAULT 'active',
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT ck_forbidden_word_value CHECK (length(btrim(word)) > 0),
    CONSTRAINT ck_forbidden_word_status CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX uq_forbidden_word ON governance.forbidden_word (lower(word));

INSERT INTO audit.audit_action (action, subject, description)
VALUES ('governance.seller.suspended', 'governance', '平台暂停商家经营（级联下架在架商品）'),
       ('governance.seller.resumed', 'governance', '平台恢复商家经营'),
       ('governance.forbidden_word.created', 'governance', '新增违禁词'),
       ('governance.forbidden_word.status_changed', 'governance', '违禁词启用或停用')
ON CONFLICT (action) DO NOTHING;
