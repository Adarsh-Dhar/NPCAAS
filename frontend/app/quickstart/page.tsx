"use client"

import Link from 'next/link'
import { useState } from 'react'
import TopNav from '@/components/TopNav'
import RetroButton from '@/components/ui/RetroButton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const installCommand = `npm install @adarsh23/guildcraft-sdk`

const envBlock = `GUILDCRAFT_API_KEY=gc_live_your_key_here
GUILDCRAFT_API_BASE_URL=http://localhost:3000/api`

const commonJsExample = `const { GuildCraftClient } = require('@adarsh23/guildcraft-sdk')

const client = new GuildCraftClient(
	process.env.GUILDCRAFT_API_KEY,
	process.env.GUILDCRAFT_API_BASE_URL || 'http://localhost:3000/api'
)`

const esmExample = `import { GuildCraftClient } from '@adarsh23/guildcraft-sdk'

const client = new GuildCraftClient(
	process.env.GUILDCRAFT_API_KEY,
	process.env.GUILDCRAFT_API_BASE_URL || 'http://localhost:3000/api'
)`

const gameplayLoopExample = `const characters = await client.getCharacters()
const npc = characters[0]

const reply = await client.chat(
	npc.id,
	'I need industrial solvent for my ship repair.'
)

console.log(reply.response)

if (reply.tradeIntent) {
	const tx = await client.executeTransaction(npc.id, reply.tradeIntent)
	console.log('Execution mode:', tx.mode)
}`

const streamExample = `for await (const event of client.chatStream(
	'char_merchant_bob',
	'What is market sentiment tonight?'
)) {
	if (event.type === 'text_delta') process.stdout.write(event.delta)
	if (event.type === 'done') console.log('\\nAction:', event.final?.action)
}`

const steps = [
	{
		number: '01',
		title: 'Install The SDK',
		description: 'Use the npm package and run on Node.js 18+ so fetch + async streaming work out of the box.',
		borderClass: 'border-blue-500',
		code: installCommand,
	},
	{
		number: '02',
		title: 'Configure Environment',
		description: 'Set your API key and API base URL. Keys should use the gc_live_ prefix.',
		borderClass: 'border-cyan-500',
		code: envBlock,
	},
	{
		number: '03',
		title: 'Initialize Client',
		description: 'Initialize one shared GuildCraftClient instance in your runtime layer.',
		borderClass: 'border-purple-500',
		code: commonJsExample,
	},
]

type CodeSnippetProps = {
	code: string
	className?: string
	codeClassName?: string
	copyLabel?: string
}

function CodeSnippet({
	code,
	className = 'border-2 border-gray-700 bg-slate-950 p-3 overflow-x-auto text-[11px] md:text-xs',
	codeClassName = 'text-blue-200 font-mono whitespace-pre',
	copyLabel = 'COPY',
}: CodeSnippetProps) {
	const [copied, setCopied] = useState(false)

	const copyToClipboard = async () => {
		try {
			if (navigator?.clipboard?.writeText) {
				await navigator.clipboard.writeText(code)
			} else {
				const textArea = document.createElement('textarea')
				textArea.value = code
				textArea.setAttribute('readonly', '')
				textArea.style.position = 'absolute'
				textArea.style.left = '-9999px'
				document.body.appendChild(textArea)
				textArea.select()
				document.execCommand('copy')
				document.body.removeChild(textArea)
			}

			setCopied(true)
			setTimeout(() => setCopied(false), 1400)
		} catch {
			setCopied(false)
		}
	}

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-end">
				<button
					type="button"
					onClick={copyToClipboard}
					className="border-2 border-cyan-400 bg-black px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-cyan-200 hover:bg-cyan-900/30 transition-colors"
				>
					{copied ? 'COPIED' : copyLabel}
				</button>
			</div>
			<pre className={className}>
				<code className={codeClassName}>{code}</code>
			</pre>
		</div>
	)
}

export default function QuickstartPage() {
	return (
		<div className="min-h-screen bg-black text-white">
			<TopNav />

			<main className="max-w-7xl mx-auto px-6 py-10 md:py-14 space-y-10 md:space-y-14">
				<section className="border-4 border-blue-500 bg-black p-6 md:p-10">
					<p className="text-blue-300 text-xs md:text-sm uppercase tracking-wide font-bold mb-4">
						SDK DOCS // QUICKSTART // GAME DEV TRACK
					</p>
					<h1 className="gradient-text gradient-neon text-3xl md:text-5xl font-bold leading-tight mb-4">
						BUILD YOUR FIRST GUILDCRAFT LOOP
					</h1>
					<p className="text-gray-200 text-sm md:text-base leading-relaxed max-w-3xl mb-4">
						This path is optimized for game developers: install the SDK, wire a character interaction, detect trade intent,
						and route transactions without losing momentum in your core gameplay loop.
					</p>
					<p className="text-xs md:text-sm text-cyan-200 uppercase font-bold">
						Runtime requirements: Node.js 18+, valid gc_live_ API key, reachable API base URL.
					</p>
				</section>

				<section>
					<div className="mb-5">
						<h2 className="text-xl md:text-2xl font-bold text-blue-200 uppercase">Fast Setup</h2>
						<p className="text-gray-400 text-xs md:text-sm mt-2 uppercase">Three steps to get signal in your game build</p>
					</div>

					<div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
						{steps.map((step) => (
							<article key={step.number} className={`border-4 ${step.borderClass} bg-black p-5`}>
								<p className="text-2xl font-bold text-cyan-300 mb-3">{step.number}</p>
								<h3 className="text-sm md:text-base font-bold text-white uppercase mb-3">{step.title}</h3>
								<p className="text-xs md:text-sm text-gray-300 leading-relaxed mb-4">{step.description}</p>
								<CodeSnippet code={step.code} />
							</article>
						))}
					</div>
				</section>

				<section className="border-4 border-purple-500 bg-black p-6 md:p-8">
					<h2 className="text-xl md:text-2xl font-bold text-purple-200 uppercase mb-5">Initialization Patterns</h2>
					<Tabs defaultValue="cjs" className="w-full">
						<TabsList className="bg-black border-2 border-purple-400 rounded-none h-auto p-1">
							<TabsTrigger value="cjs" className="rounded-none data-[state=active]:bg-purple-700 data-[state=active]:text-white text-xs uppercase">
								CommonJS
							</TabsTrigger>
							<TabsTrigger value="esm" className="rounded-none data-[state=active]:bg-purple-700 data-[state=active]:text-white text-xs uppercase">
								ESM
							</TabsTrigger>
						</TabsList>
						<TabsContent value="cjs" className="mt-4">
							<CodeSnippet
								code={commonJsExample}
								className="border-2 border-purple-400 bg-slate-950 p-4 overflow-x-auto text-xs"
								codeClassName="text-blue-100 font-mono whitespace-pre"
							/>
						</TabsContent>
						<TabsContent value="esm" className="mt-4">
							<CodeSnippet
								code={esmExample}
								className="border-2 border-purple-400 bg-slate-950 p-4 overflow-x-auto text-xs"
								codeClassName="text-blue-100 font-mono whitespace-pre"
							/>
						</TabsContent>
					</Tabs>
				</section>

				<section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
					<article className="border-4 border-blue-500 bg-black p-6">
						<h2 className="text-lg md:text-xl font-bold text-blue-200 uppercase mb-4">Core Gameplay Loop</h2>
						<p className="text-sm text-gray-300 leading-relaxed mb-4">
							The canonical flow: discover NPCs, send chat, inspect action + trade intent, then execute transaction when intent exists.
						</p>
						<CodeSnippet
							code={gameplayLoopExample}
							className="border-2 border-blue-500 bg-slate-950 p-4 overflow-x-auto text-xs"
							codeClassName="text-cyan-100 font-mono whitespace-pre"
						/>
					</article>

					<article className="border-4 border-cyan-500 bg-black p-6">
						<h2 className="text-lg md:text-xl font-bold text-cyan-200 uppercase mb-4">Streaming Responses</h2>
						<p className="text-sm text-gray-300 leading-relaxed mb-4">
							Use streaming when you want live dialogue rendering, moment-by-moment actions, and faster perceived response time in UI.
						</p>
						<CodeSnippet
							code={streamExample}
							className="border-2 border-cyan-500 bg-slate-950 p-4 overflow-x-auto text-xs"
							codeClassName="text-blue-100 font-mono whitespace-pre"
						/>
					</article>
				</section>

				<section className="border-4 border-blue-500 bg-black p-6 md:p-8">
					<h2 className="text-xl md:text-2xl font-bold text-blue-200 uppercase mb-4">Troubleshooting</h2>
					<Accordion type="single" collapsible className="w-full">
						<AccordionItem value="api-key" className="border-blue-700">
							<AccordionTrigger className="text-sm uppercase">Client Fails On Initialization</AccordionTrigger>
							<AccordionContent className="text-sm text-gray-300 leading-relaxed">
								Confirm your key starts with <span className="text-cyan-300 font-mono">gc_live_</span>. The constructor validates this and rejects invalid formats early.
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="base-url" className="border-blue-700">
							<AccordionTrigger className="text-sm uppercase">No Response From API</AccordionTrigger>
							<AccordionContent className="text-sm text-gray-300 leading-relaxed">
								Verify your <span className="text-cyan-300 font-mono">GUILDCRAFT_API_BASE_URL</span> points to an active endpoint (for local dev, typically <span className="text-cyan-300 font-mono">http://localhost:3000/api</span>).
							</AccordionContent>
						</AccordionItem>
						<AccordionItem value="trade-intent" className="border-blue-700">
							<AccordionTrigger className="text-sm uppercase">No Trade Transaction Triggered</AccordionTrigger>
							<AccordionContent className="text-sm text-gray-300 leading-relaxed">
								Not every chat yields a trade intent. Gate transaction execution behind <span className="text-cyan-300 font-mono">if (reply.tradeIntent)</span> checks and prompt with commerce-related context.
							</AccordionContent>
						</AccordionItem>
					</Accordion>
				</section>

				<section className="border-4 border-cyan-500 bg-black p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
					<div>
						<h2 className="text-lg md:text-2xl font-bold text-cyan-200 uppercase mb-2">Next Steps</h2>
						<p className="text-sm text-gray-300">Continue with character creation, then plug this loop into your live game scene.</p>
					</div>
					<div className="flex flex-col sm:flex-row gap-3">
						<Link href="/creator">
							<RetroButton variant="blue" size="md" className="w-full sm:w-auto text-xs">
								OPEN CREATOR
							</RetroButton>
						</Link>
						<Link href="/about">
							<RetroButton variant="magenta" size="md" className="w-full sm:w-auto text-xs">
								READ ABOUT
							</RetroButton>
						</Link>
					</div>
				</section>
			</main>
		</div>
	)
}
