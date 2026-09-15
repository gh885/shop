import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
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

import { Button, buttonVariants, Card, CardContent } from "@shop/ui-web"

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
    head: () => ({
        meta: [{ title: "免费开店 - Shop" }],
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
            免费开店
            <ArrowRight />
        </Button>
    )
}

function Hero() {
    return (
        <LandingHero
            headline={
                <HeroHeadline>
                    0 元开店，
                    <br />
                    让好生意被更多人看见
                </HeroHeadline>
            }
            body={<HeroBody>免费创建店铺，平台审核通过后即可上架商品，开始经营。</HeroBody>}
            actions={
                <div className="flex items-center gap-4">
                    <OpenShopCta size="lg" />
                    <a
                        href="#steps"
                        className={buttonVariants({ variant: "outline", size: "lg" })}
                    >
                        了解入驻流程
                    </a>
                </div>
            }
            images={[
                { src: "https://picsum.photos/seed/sell-storefront/640/800", alt: "街边小店" },
                { src: "https://picsum.photos/seed/sell-parcels/640/480", alt: "打包发货" },
                { src: "https://picsum.photos/seed/sell-crafts/640/480", alt: "手作商品" },
            ]}
        />
    )
}

const MODES = [
    {
        key: "goods",
        label: "我有好货",
        icon: Package,
        title: "好货不愁卖",
        body: "把货源优势直接变成店铺销量。上架商品、管理库存、跟踪订单，经营所需的基础能力一站配齐。",
        img: "https://picsum.photos/seed/sell-goods/960/640",
        alt: "丰富的货源",
    },
    {
        key: "live",
        label: "我擅长直播",
        icon: Megaphone,
        title: "会表达，就开店",
        body: "擅长镜头前的表达，就让它变成成交。店铺是你内容流量的承接地，粉丝看完就能下单。",
        img: "https://picsum.photos/seed/sell-live/960/640",
        alt: "直播带货",
    },
    {
        key: "original",
        label: "我是原创",
        icon: Sparkles,
        title: "原创值得被认真对待",
        body: "手作、设计、原创内容都有自己的受众。开一家只属于你的店，让同好的人找到你。",
        img: "https://picsum.photos/seed/sell-original/960/640",
        alt: "原创手作",
    },
    {
        key: "factory",
        label: "我有工厂",
        icon: Factory,
        title: "从车间直达买家",
        body: "去掉中间环节，源头好货直面消费者。支持邀请成员共同打理店铺，团队协作更高效。",
        img: "https://picsum.photos/seed/sell-factory/960/640",
        alt: "工厂车间",
    },
] as const

function BusinessModes() {
    const reduce = useReducedMotion()
    const [active, setActive] = useState<(typeof MODES)[number]["key"]>("goods")
    const mode = MODES.find((m) => m.key === active) ?? MODES[0]

    return (
        <section className="bg-sunken">
            <m.div
                className="mx-auto max-w-6xl px-4 py-24"
                initial={reduce ? false : { opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.7, ease: EASE }}
            >
                <h2 className="text-3xl font-bold tracking-tight">
                    多元的经营模式，总有一种适合你
                </h2>

                <div className="mt-10 flex flex-col gap-8 lg:flex-row">
                    <div
                        role="tablist"
                        aria-label="经营模式"
                        className="flex gap-2 overflow-x-auto lg:w-60 lg:shrink-0 lg:flex-col lg:gap-1"
                    >
                        {MODES.map((mode) => {
                            const Icon = mode.icon
                            const selected = mode.key === active
                            return (
                                <button
                                    key={mode.key}
                                    role="tab"
                                    aria-selected={selected}
                                    onClick={() => setActive(mode.key)}
                                    className={`flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${
                                        selected
                                            ? "bg-background text-foreground shadow-sm"
                                            : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                                    }`}
                                >
                                    <Icon className="size-4" />
                                    {mode.label}
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
                                    <img
                                        src={mode.img}
                                        alt={mode.alt}
                                        className="aspect-3/2 w-full rounded-xl object-cover"
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

const STEPS = [
    {
        title: "创建店铺",
        body: "登录后填写店铺信息，一分钟提交入驻申请。",
    },
    {
        title: "平台审核",
        body: "平台对入驻申请进行审核，结果及时可见。",
    },
    {
        title: "开始经营",
        body: "上架商品、邀请成员，店铺正式开张。",
    },
] as const

function Steps() {
    const reduce = useReducedMotion()

    return (
        <section
            id="steps"
            className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24"
        >
            <SectionTitle>三步开店，流程透明</SectionTitle>
            <ol className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
                {STEPS.map((step, i) => (
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
                        <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
                        {i === STEPS.length - 1 ? (
                            <CheckCircle2 className="mt-4 size-5 text-success" />
                        ) : undefined}
                    </m.li>
                ))}
            </ol>
        </section>
    )
}

function FinalCta() {
    return (
        <section className="bg-primary-subtle">
            <Reveal className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center">
                <Store className="size-10 text-primary" />
                <h2 className="text-3xl font-bold tracking-tight text-primary-subtle-foreground">
                    准备好开店了吗？
                </h2>
                <p className="max-w-md text-primary-subtle-foreground/80">
                    免费创建你的第一家店铺，从一件好货开始。
                </p>
                <OpenShopCta size="lg" />
            </Reveal>
        </section>
    )
}
