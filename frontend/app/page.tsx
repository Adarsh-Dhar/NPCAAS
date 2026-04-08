import Navigation from '@/components/layout/Navigation'
import HeroSection from '@/components/landing/HeroSection'
import ExplainerGrid from '@/components/landing/ExplainerGrid'

export default function Home() {
  return (
    <main className="bg-black min-h-screen">
      <Navigation />
      <HeroSection />
      <ExplainerGrid />
    </main>
  )
}
