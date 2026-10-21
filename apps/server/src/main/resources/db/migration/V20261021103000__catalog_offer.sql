SET lock_timeout = '3s';
SET statement_timeout = '60s';

CREATE TABLE catalog.offer
(
    id            uuid PRIMARY KEY DEFAULT uuidv7(),
    spu_id        uuid        NOT NULL,
    merchant_id   uuid        NOT NULL,
    shop_id       uuid        NOT NULL,
    status        text        NOT NULL DEFAULT 'draft',
    reject_reason text,
    submitted_at  timestamptz,
    approved_at   timestamptz,
    approved_by   uuid,

    CONSTRAINT uq_offer_spu_shop UNIQUE (spu_id, shop_id),
    CONSTRAINT ck_offer_status CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'online', 'offline'))
);

CREATE INDEX idx_offer_shop_status ON catalog.offer (shop_id, status);

CREATE TABLE catalog.offer_review
(
    id         uuid PRIMARY KEY DEFAULT uuidv7(),
    offer_id   uuid        NOT NULL,
    round      integer     NOT NULL,
    decision   text        NOT NULL,
    reason     text,
    reviewer   uuid,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_offer_review_round UNIQUE (offer_id, round),
    CONSTRAINT ck_offer_review_decision CHECK (decision IN ('approved', 'rejected'))
);
