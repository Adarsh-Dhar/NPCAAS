import TopNav from '@/components/TopNav'
import HeroSection from '@/components/landing/HeroSection'
import ExplainerGrid from '@/components/landing/ExplainerGrid'

export default function Home() {
  return (
    <main className="bg-black min-h-screen">
      <TopNav />
      <HeroSection />
      <ExplainerGrid />
    </main>
  )
}
