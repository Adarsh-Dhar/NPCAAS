import Link from 'next/link'
import TopNav from '@/components/TopNav'
import RetroButton from '@/components/ui/RetroButton'

const principles = [
	{
		title: 'LIVE NPC ECONOMIES',
		description:
			'NPCs negotiate, react, and trade in real time so your world feels like a living market, not static dialog trees.',
		borderClass: 'retro-card-cyan',
	},
	{
		title: 'WEB3-NATIVE ACTIONS',
		description:
			'Trade intent can route straight into transaction execution flows with sponsored, fallback, or user-paid paths.',
		borderClass: 'retro-card-blue',
	},
	{
		title: 'GAME-READY INTEGRATION',
		description:
			'Use one SDK to fetch characters, stream chat, execute actions, and wire gameplay loops from prototype to production.',
		borderClass: 'retro-card-purple',
	},
]

const capabilities = [
	'Character + game/project management APIs',
	'Streaming chat events for real-time UX',
	'Trade intent to transaction execution bridge',
	'NPC memory, logs, loop automation, and webhooks',
]

export default function AboutPage() {
	return (
		<div className="min-h-screen bg-black text-white">
			<TopNav />

			<main className="max-w-7xl mx-auto px-6 py-10 md:py-14 space-y-10 md:space-y-14">
				<section className="border-4 border-blue-500 bg-black p-6 md:p-10">
					<p className="text-blue-300 text-xs md:text-sm uppercase tracking-wide font-bold mb-4">
						NEOCITY FILE // DISTRICT 7 // ORIGIN REPORT
					</p>
					<h1 className="gradient-text gradient-neon text-3xl md:text-5xl font-bold leading-tight mb-5">
						ABOUT GUILDCRAFT
					</h1>
					<p className="text-gray-200 text-sm md:text-base leading-relaxed max-w-3xl mb-6">
						In NeoCity, every faction pushes for advantage. GuildCraft brings that same energy into your game through
						autonomous NPCs that talk, reason, and trade with players using programmable Web3 rails.
					</p>
					<p className="text-blue-100 text-sm md:text-base leading-relaxed max-w-3xl">
						The product goal is practical: ship believable agents quickly, keep control over integration details,
						and let your game economy evolve through real interactions instead of scripted menus.
					</p>
				</section>

				<section>
					<div className="mb-5">
						<h2 className="text-xl md:text-2xl font-bold text-blue-200 uppercase">Core Principles</h2>
						<p className="text-gray-400 text-xs md:text-sm mt-2 uppercase">Design language: reactive, composable, game-first</p>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-3 gap-5">
						{principles.map((item) => (
							<article key={item.title} className={`retro-card ${item.borderClass} h-full`}>
								<h3 className="text-sm md:text-base font-bold text-white uppercase mb-3">{item.title}</h3>
								<p className="text-xs md:text-sm text-gray-300 leading-relaxed">{item.description}</p>
							</article>
						))}
					</div>
				</section>

				<section className="grid grid-cols-1 lg:grid-cols-5 gap-5">
					<article className="lg:col-span-3 border-4 border-purple-500 bg-black p-6">
						<h2 className="text-lg md:text-xl font-bold text-purple-200 uppercase mb-4">What You Can Build</h2>
						<ul className="space-y-3 text-sm text-gray-200">
							{capabilities.map((capability) => (
								<li key={capability} className="flex items-start gap-3">
									<span className="text-cyan-300">▣</span>
									<span>{capability}</span>
								</li>
							))}
						</ul>
					</article>

					<article className="lg:col-span-2 border-4 border-blue-500 bg-black p-6">
						<h2 className="text-lg md:text-xl font-bold text-blue-200 uppercase mb-4">Ecosystem Fit</h2>
						<p className="text-sm text-gray-300 leading-relaxed mb-4">
							GuildCraft is designed for teams building interactive worlds, live marketplaces, and persistent social loops.
							Start with a local API base and scale toward production endpoints as your game loop matures.
						</p>
						<p className="text-xs text-blue-200 uppercase font-bold">Node.js 18+ recommended for SDK runtime support.</p>
					</article>
				</section>

				<section className="border-4 border-cyan-500 bg-black p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
					<div>
						<h2 className="text-lg md:text-2xl font-bold text-cyan-200 uppercase mb-2">Ready To Integrate?</h2>
						<p className="text-sm text-gray-300">Jump into the SDK quickstart or start creating live NPC flows now.</p>
					</div>

					<div className="flex flex-col sm:flex-row gap-3">
						<Link href="/quickstart">
							<RetroButton variant="blue" size="md" className="w-full sm:w-auto text-xs">
								OPEN QUICKSTART
							</RetroButton>
						</Link>
						<Link href="/creator">
							<RetroButton variant="magenta" size="md" className="w-full sm:w-auto text-xs">
								LAUNCH CREATOR
							</RetroButton>
						</Link>
					</div>
				</section>
			</main>
		</div>
	)
}
