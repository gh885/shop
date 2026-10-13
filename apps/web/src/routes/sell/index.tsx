import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { translateWeb } from "#/locales"
import { useT } from "#/locales/use-t"
import type { WebTranslate } from "#/locales/messages.gen"
import {
    ArrowRight,
    CheckCircle2,
    Factory,
    Megaphone,
    Package,
    Sparkles,
    Store,
} from "lucide-react"
// LazyMotion + m：按需加载动画特性（domAnimation 含 variants/whileInView/AnimatePresence），省约 30kb 全量 motion 包
import { AnimatePresence, m, useReducedMotion } from "motion/react"

import { Button, buttonVariants, Card, CardContent, Image, cn } from "@shop/ui-web"

import { useAuthStatus, useLoginDialogOpen } from "../../shared/api/auth"
import { SELLER_URL } from "../../shared/lib/external"
import {
    EASE,
    HeroBody,
    HeroHeadline,
    LandingHero,
    LandingMotion,
    Reveal,
    SectionTitle,
} from "#/shared/ui/landing"

export const Route = createFileRoute("/sell/")({
    component: SellLanding,
    head: ({ match }) => ({
        meta: [{ title: translateWeb("route.title.sell", match.context.locale) }],
    }),
})

function SellLanding() {
    return (
        <LandingMotion>
            <div>
                <Hero />
                <BusinessModes />
                <Steps />
                <FinalCta />
            </div>
        </LandingMotion>
    )
}

/** 开店 CTA：未登录拉起全局登录框，已登录进入卖家中心 */
function OpenShopCta({ size = "default" }: { size?: "default" | "lg" }) {
    const t = useT()
    const status = useAuthStatus()
    const [, setLoginOpen] = useLoginDialogOpen()

    function handleClick() {
        if (status === "authed") {
            // 店铺管理已迁到卖家中心（apps/seller 独立 SPA），跨应用跳转
            window.location.href = SELLER_URL
        } else {
            setLoginOpen(true)
        }
    }

    return (
        <Button
            size={size}
            onClick={handleClick}
        >
            {t("sell.cta.openShop")}
            <ArrowRight />
        </Button>
    )
}

function Hero() {
    const t = useT()
    return (
        <LandingHero
            headline={
                <HeroHeadline>
                    {t("sell.hero.line1")}
                    <br />
                    {t("sell.hero.line2")}
                </HeroHeadline>
            }
            body={<HeroBody>{t("sell.hero.body")}</HeroBody>}
            actions={
                <div className="flex items-center gap-4">
                    <OpenShopCta size="lg" />
                    <a
                        href="#steps"
                        className={buttonVariants({ variant: "outline", size: "lg" })}
                    >
                        {t("sell.cta.learnFlow")}
                    </a>
                </div>
            }
            images={[
                {
                    src: "https://picsum.photos/seed/sell-storefront/640/800",
                    alt: t("sell.hero.imageAlt.storefront"),
                },
                {
                    src: "https://picsum.photos/seed/sell-parcels/640/480",
                    alt: t("sell.hero.imageAlt.parcels"),
                },
                {
                    src: "https://picsum.photos/seed/sell-crafts/640/480",
                    alt: t("sell.hero.imageAlt.crafts"),
                },
            ]}
        />
    )
}

/**
 * 四种经营模式：**表里存 key 字面量而不是句子**。这样新增一种模式忘了配文案时，写错 key 名立刻是编译错误，
 * 而不是运行时悄悄印出 `sell.modes.…`。键类型由下方 `ModeCopy` 收窄。
 */
const MODES = [
    {
        key: "goods",
        icon: Package,
        img: "https://picsum.photos/seed/sell-goods/960/640",
        labelKey: "sell.modes.goods.label",
        titleKey: "sell.modes.goods.title",
        bodyKey: "sell.modes.goods.body",
        altKey: "sell.modes.goods.alt",
    },
    {
        key: "live",
        icon: Megaphone,
        img: "https://picsum.photos/seed/sell-live/960/640",
        labelKey: "sell.modes.live.label",
        titleKey: "sell.modes.live.title",
        bodyKey: "sell.modes.live.body",
        altKey: "sell.modes.live.alt",
    },
    {
        key: "original",
        icon: Sparkles,
        img: "https://picsum.photos/seed/sell-original/960/640",
        labelKey: "sell.modes.original.label",
        titleKey: "sell.modes.original.title",
        bodyKey: "sell.modes.original.body",
        altKey: "sell.modes.original.alt",
    },
    {
        key: "factory",
        icon: Factory,
        img: "https://picsum.photos/seed/sell-factory/960/640",
        labelKey: "sell.modes.factory.label",
        titleKey: "sell.modes.factory.title",
        bodyKey: "sell.modes.factory.body",
        altKey: "sell.modes.factory.alt",
    },
] as const

/**
 * 表项 → 四句话（tab 标签 / 大标题 / 正文 / 图 alt）。
 *
 * **key 写在表里**而不是由 `key` 拼出来：「未使用的 key」门禁扫的是源码里带引号的
 * key 整串，模板拼出来的一条都认不到——那样 catalog 里那几条会逐条报成「没人用」，
 * 而它们明明在用。把 key 摆进表里既过了门禁，也让「这一项配哪四句话」一眼可数。
 *
 * 函数收在一处而不是散在 JSX：`t()` 要 locale，locale 在组件里。
 * 新增一种模式忘了配文案时，`labelKey` 写错是类型错误，不是运行时回落成 key。
 */
function modeCopy(item: (typeof MODES)[number], t: WebTranslate) {
    return {
        label: t(item.labelKey),
        title: t(item.titleKey),
        body: t(item.bodyKey),
        alt: t(item.altKey),
    }
}

function BusinessModes() {
    const t = useT()
    const reduce = useReducedMotion()
    const [active, setActive] = useState<(typeof MODES)[number]["key"]>("goods")
    const current = MODES.find((item) => item.key === active) ?? MODES[0]
    const mode = { ...current, ...modeCopy(current, t) }

    return (
        <section className="bg-background">
            <m.div
                className="mx-auto w-full max-w-6xl px-4 py-24"
                initial={reduce ? false : { opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.7, ease: EASE }}
            >
                <h2 className="text-3xl font-bold">{t("sell.modes.title")}</h2>

                <div className="mt-10 flex flex-col gap-8 lg:flex-row">
                    <div
                        role="tablist"
                        aria-label={t("sell.modes.tablistLabel")}
                        className="flex gap-2 overflow-x-auto lg:w-60 lg:shrink-0 lg:flex-col lg:gap-1"
                    >
                        {MODES.map((item) => {
                            const Icon = item.icon
                            const selected = item.key === active
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={selected}
                                    onClick={() => setActive(item.key)}
                                    className={cn(
                                        "flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors",
                                        // 整页单色后选中的白底不再有灰地面可对比：阴影升到 shadow-float 才读得出「选中」；
                                        // 未选中的 hover 原来是 bg-background/60——白底上那是 60% 白叠白，等于没有，换成 accent
                                        selected
                                            ? "bg-background text-foreground shadow-float"
                                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                >
                                    <Icon className="size-4" />
                                    {modeCopy(item, t).label}
                                </button>
                            )
                        })}
                    </div>

                    <AnimatePresence mode="wait">
                        <m.div
                            key={mode.key}
                            role="tabpanel"
                            className="lg:min-w-0 lg:flex-1"
                            initial={reduce ? false : { opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduce ? undefined : { opacity: 0, y: -8 }}
                            transition={{ duration: 0.35, ease: EASE }}
                        >
                            <Card>
                                <CardContent className="grid grid-cols-1 items-center gap-8 md:grid-cols-2">
                                    <div className="space-y-4">
                                        <h3 className="text-2xl font-semibold">{mode.title}</h3>
                                        <p className="leading-relaxed text-muted-foreground">
                                            {mode.body}
                                        </p>
                                        <OpenShopCta />
                                    </div>
                                    <Image
                                        src={mode.img}
                                        alt={mode.alt}
                                        ratio={3 / 2}
                                        radius="xl"
                                        className="w-full"
                                    />
                                </CardContent>
                            </Card>
                        </m.div>
                    </AnimatePresence>
                </div>
            </m.div>
        </section>
    )
}

/**
 * 三步：表里是 id + 两个 key 字面量（判据同 MODES 表——key 写在表里而不是由 id 拼出来，
 * 「未使用的 key」门禁才看得见它们）。
 */
const STEPS = [
    { titleKey: "sell.steps.create.title", bodyKey: "sell.steps.create.body" },
    { titleKey: "sell.steps.review.title", bodyKey: "sell.steps.review.body" },
    { titleKey: "sell.steps.operate.title", bodyKey: "sell.steps.operate.body" },
] as const

function stepCopy(step: (typeof STEPS)[number], t: WebTranslate) {
    return { title: t(step.titleKey), body: t(step.bodyKey) }
}

function Steps() {
    const t = useT()
    const reduce = useReducedMotion()

    return (
        <section
            id="steps"
            className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-24"
        >
            <SectionTitle>{t("sell.steps.sectionTitle")}</SectionTitle>
            <ol className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
                {STEPS.map((entry, i) => {
                    const step = stepCopy(entry, t)
                    return (
                        <m.li
                            key={step.title}
                            className="relative border-t-2 border-border pt-6"
                            initial={reduce ? false : { opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, amount: 0.4 }}
                            transition={{ duration: 0.6, delay: i * 0.12, ease: EASE }}
                        >
                            <span className="absolute -top-2.25 left-0 size-4 rounded-full border-2 border-foreground bg-background" />
                            <span className="text-sm font-medium text-foreground">0{i + 1}</span>
                            <h3 className="mt-2 text-xl font-semibold">{step.title}</h3>
                            <p className="mt-2 leading-relaxed text-muted-foreground">
                                {step.body}
                            </p>
                            {i === STEPS.length - 1 ? (
                                <CheckCircle2 className="mt-4 size-5 text-success" />
                            ) : undefined}
                        </m.li>
                    )
                })}
            </ol>
        </section>
    )
}

function FinalCta() {
    const t = useT()
    return (
        <section className="bg-primary-subtle">
            <Reveal className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center">
                <Store className="size-10 text-primary" />
                <h2 className="text-3xl font-bold text-primary-subtle-foreground">
                    {t("sell.finalCta.title")}
                </h2>
                <p className="max-w-md text-primary-subtle-foreground/80">
                    {t("sell.finalCta.body")}
                </p>
                <OpenShopCta size="lg" />
            </Reveal>
        </section>
    )
}
