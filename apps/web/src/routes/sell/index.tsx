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
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react"

import { Button, buttonVariants } from "@shop/ui-web"

import { useAuthStatus, useLoginDialogOpen } from "../../lib/auth"
import { SELLER_URL } from "../../lib/external"

export const Route = createFileRoute("/sell/")({
    component: SellLanding,
    head: () => ({
        meta: [{ title: "免费开店 - Shop" }],
    }),
})

const EASE = [0.16, 1, 0.3, 1] as const

function SellLanding() {
    return (
        <div>
            <Hero />
            <BusinessModes />
            <Steps />
            <FinalCta />
        </div>
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
            className="bg-brand text-brand-foreground hover:bg-brand-hover active:translate-y-px"
        >
            免费开店
            <ArrowRight className="size-4" />
        </Button>
    )
}

const heroTextVariants: Variants = {
    hidden: { opacity: 0, y: 28 },
    show: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.7, delay: i * 0.12, ease: EASE },
    }),
}

function Hero() {
    const reduce = useReducedMotion()

    return (
        <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pt-20 pb-24 lg:grid-cols-[1.1fr_1fr]">
            <div className="space-y-6">
                {[0, 1, 2].map((i) => (
                    <motion.div
                        key={i}
                        custom={i}
                        variants={heroTextVariants}
                        initial={reduce ? false : "hidden"}
                        animate="show"
                    >
                        {i === 0 ? (
                            <h1 className="text-4xl leading-tight font-bold tracking-tight md:text-5xl">
                                0 元开店，
                                <br />
                                让好生意被更多人看见
                            </h1>
                        ) : i === 1 ? (
                            <p className="max-w-md text-lg text-muted-foreground">
                                免费创建店铺，平台审核通过后即可上架商品，开始经营。
                            </p>
                        ) : (
                            <div className="flex items-center gap-4">
                                <OpenShopCta size="lg" />
                                <a
                                    href="#steps"
                                    className={buttonVariants({ variant: "outline", size: "lg" })}
                                >
                                    了解入驻流程
                                </a>
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <motion.img
                    src="https://picsum.photos/seed/sell-storefront/640/800"
                    alt="街边小店"
                    className="mt-8 aspect-4/5 w-full rounded-2xl object-cover"
                    initial={reduce ? false : { opacity: 0, y: 32 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
                />
                <div className="grid gap-4">
                    <motion.img
                        src="https://picsum.photos/seed/sell-parcels/640/480"
                        alt="打包发货"
                        className="aspect-4/3 w-full rounded-2xl object-cover"
                        initial={reduce ? false : { opacity: 0, y: 32 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
                    />
                    <motion.img
                        src="https://picsum.photos/seed/sell-crafts/640/480"
                        alt="手作商品"
                        className="aspect-4/3 w-full rounded-2xl object-cover"
                        initial={reduce ? false : { opacity: 0, y: 32 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.55, ease: EASE }}
                    />
                </div>
            </div>
        </section>
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
            <motion.div
                className="mx-auto max-w-6xl px-4 py-24"
                initial={reduce ? false : { opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.7, ease: EASE }}
            >
                <h2 className="text-3xl font-bold tracking-tight">
                    多元的经营模式，总有一种适合你
                </h2>

                <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
                    <div
                        role="tablist"
                        aria-label="经营模式"
                        className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1"
                    >
                        {MODES.map((m) => {
                            const Icon = m.icon
                            const selected = m.key === active
                            return (
                                <button
                                    key={m.key}
                                    role="tab"
                                    aria-selected={selected}
                                    onClick={() => setActive(m.key)}
                                    className={`flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors ${
                                        selected
                                            ? "bg-background text-brand shadow-sm"
                                            : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                                    }`}
                                >
                                    <Icon className="size-4" />
                                    {m.label}
                                </button>
                            )
                        })}
                    </div>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={mode.key}
                            role="tabpanel"
                            className="grid grid-cols-1 items-center gap-8 rounded-2xl bg-background p-8 shadow-sm md:grid-cols-2"
                            initial={reduce ? false : { opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={reduce ? undefined : { opacity: 0, y: -8 }}
                            transition={{ duration: 0.35, ease: EASE }}
                        >
                            <div className="space-y-4">
                                <h3 className="text-2xl font-semibold">{mode.title}</h3>
                                <p className="leading-relaxed text-muted-foreground">{mode.body}</p>
                                <OpenShopCta />
                            </div>
                            <img
                                src={mode.img}
                                alt={mode.alt}
                                className="aspect-3/2 w-full rounded-xl object-cover"
                            />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </motion.div>
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
            <motion.h2
                className="text-3xl font-bold tracking-tight"
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.6, ease: EASE }}
            >
                三步开店，流程透明
            </motion.h2>

            <ol className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-6">
                {STEPS.map((step, i) => (
                    <motion.li
                        key={step.title}
                        className="relative border-t-2 border-border pt-6"
                        initial={reduce ? false : { opacity: 0, y: 24 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.4 }}
                        transition={{ duration: 0.6, delay: i * 0.12, ease: EASE }}
                    >
                        <span className="absolute -top-2.25 left-0 size-4 rounded-full border-2 border-brand bg-background" />
                        <span className="text-sm font-medium text-brand">0{i + 1}</span>
                        <h3 className="mt-2 text-xl font-semibold">{step.title}</h3>
                        <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
                        {i === STEPS.length - 1 ? (
                            <CheckCircle2 className="mt-4 size-5 text-success" />
                        ) : null}
                    </motion.li>
                ))}
            </ol>
        </section>
    )
}

function FinalCta() {
    const reduce = useReducedMotion()

    return (
        <section className="bg-brand-subtle">
            <motion.div
                className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-24 text-center"
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.7, ease: EASE }}
            >
                <Store className="size-10 text-brand" />
                <h2 className="text-3xl font-bold tracking-tight text-brand-subtle-foreground">
                    准备好开店了吗？
                </h2>
                <p className="max-w-md text-brand-subtle-foreground/80">
                    免费创建你的第一家店铺，从一件好货开始。
                </p>
                <OpenShopCta size="lg" />
            </motion.div>
        </section>
    )
}
