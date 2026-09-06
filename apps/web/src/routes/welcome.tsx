import { Link, createFileRoute } from "@tanstack/react-router"
import { Apple, ArrowRight, Baby, Shirt, Smartphone, Sofa, Sparkles, Store } from "lucide-react"
import { motion, useReducedMotion, type Variants } from "motion/react"

import { buttonVariants, Card, CardContent } from "@shop/ui-web"

export const Route = createFileRoute("/welcome")({
    component: Home,
    head: () => ({
        meta: [{ title: "Shop - 多店铺电商平台" }],
    }),
})

const EASE = [0.16, 1, 0.3, 1] as const

const staggerVariants: Variants = {
    hidden: { opacity: 0, y: 24 },
    show: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, delay: i * 0.1, ease: EASE },
    }),
}

function Home() {
    return (
        <div>
            <Hero />
            <Categories />
            <SellerBanner />
        </div>
    )
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
                        variants={staggerVariants}
                        initial={reduce ? false : "hidden"}
                        animate="show"
                    >
                        {i === 0 ? (
                            <h1 className="text-4xl leading-tight font-bold tracking-tight text-balance md:text-5xl">
                                千万小店，
                                <br />
                                各有各的好
                            </h1>
                        ) : i === 1 ? (
                            <p className="max-w-md text-lg text-muted-foreground">
                                从产地直供到手作原创，每家店都有自己的脾气。逛的是店，买的是放心。
                            </p>
                        ) : (
                            <div className="flex items-center gap-4">
                                <a
                                    href="#categories"
                                    className={buttonVariants({ size: "lg" })}
                                >
                                    逛商品分类
                                    <ArrowRight className="size-4" />
                                </a>
                                <Link
                                    to="/sell"
                                    className={buttonVariants({ variant: "outline", size: "lg" })}
                                >
                                    我要开店
                                </Link>
                            </div>
                        )}
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <motion.img
                    src="https://picsum.photos/seed/home-market/640/800"
                    alt="集市上的特色小店"
                    className="mt-8 aspect-4/5 w-full rounded-2xl object-cover"
                    initial={reduce ? false : { opacity: 0, y: 32 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
                />
                <div className="grid gap-4">
                    <motion.img
                        src="https://picsum.photos/seed/home-crafts/640/480"
                        alt="手作商品摊位"
                        className="aspect-4/3 w-full rounded-2xl object-cover"
                        initial={reduce ? false : { opacity: 0, y: 32 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
                    />
                    <motion.img
                        src="https://picsum.photos/seed/home-fresh/640/480"
                        alt="新鲜食材"
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

const CATEGORIES = [
    {
        name: "服饰鞋包",
        icon: Shirt,
        subs: ["女装", "男装", "鞋靴", "箱包"],
    },
    {
        name: "数码家电",
        icon: Smartphone,
        subs: ["手机", "电脑办公", "家用电器"],
    },
    {
        name: "美妆个护",
        icon: Sparkles,
        subs: ["护肤", "彩妆", "个人护理"],
    },
    {
        name: "家居家装",
        icon: Sofa,
        subs: ["家具", "家纺", "厨具"],
    },
    {
        name: "食品生鲜",
        icon: Apple,
        subs: ["休闲零食", "生鲜果蔬", "酒水饮料"],
    },
    {
        name: "母婴玩具",
        icon: Baby,
        subs: ["奶粉辅食", "纸尿裤", "玩具"],
    },
] as const

function Categories() {
    const reduce = useReducedMotion()

    return (
        <section
            id="categories"
            className="scroll-mt-20 bg-sunken"
        >
            <div className="mx-auto max-w-6xl px-4 py-24">
                <motion.h2
                    className="text-3xl font-bold tracking-tight"
                    initial={reduce ? false : { opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.6, ease: EASE }}
                >
                    按分类逛逛
                </motion.h2>
                <p className="mt-2 text-muted-foreground">分类浏览即将上线，先看看都有什么。</p>

                <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
                    {CATEGORIES.map((cat, i) => (
                        <motion.div
                            key={cat.name}
                            className="group"
                            custom={i}
                            variants={staggerVariants}
                            initial={reduce ? false : "hidden"}
                            whileInView="show"
                            viewport={{ once: true, amount: 0.2 }}
                        >
                            <Card className="transition-transform duration-300 hover:-translate-y-1">
                                <CardContent>
                                    <cat.icon className="size-6 text-muted-foreground transition-transform duration-300 group-hover:scale-110" />
                                    <h3 className="mt-4 font-semibold">{cat.name}</h3>
                                    <p className="mt-1 text-muted-foreground">
                                        {cat.subs.join(" / ")}
                                    </p>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}

function SellerBanner() {
    const reduce = useReducedMotion()

    return (
        <section className="mx-auto max-w-6xl px-4 py-24">
            <motion.div
                className="flex flex-col items-start gap-4 rounded-2xl bg-primary-subtle p-8 md:flex-row md:items-center md:justify-between"
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.7, ease: EASE }}
            >
                <div className="flex items-start gap-4">
                    <Store className="mt-1 size-8 shrink-0 text-primary" />
                    <div className="space-y-1">
                        <h2 className="text-2xl font-bold tracking-tight text-primary-subtle-foreground">
                            0 元开店，让好生意被更多人看见
                        </h2>
                        <p className="text-primary-subtle-foreground/80">
                            免费创建店铺，审核通过即可上架商品，开始经营。
                        </p>
                    </div>
                </div>
                <Link
                    to="/sell"
                    className={buttonVariants({ size: "lg" })}
                >
                    免费开店
                    <ArrowRight className="size-4" />
                </Link>
            </motion.div>
        </section>
    )
}
