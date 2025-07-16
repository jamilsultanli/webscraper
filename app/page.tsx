import { ScraperDashboard } from "@/components/scraper-dashboard"

export default function Home() {
  return (
    <main className="bg-gray-50 dark:bg-gray-900 min-h-screen w-full">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <header className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
            Custom Web Scraper Platform
          </h1>
          <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">
            Extract and analyze outgoing external links from any website with our custom scraping engine.
          </p>
        </header>
        <ScraperDashboard />
      </div>
    </main>
  )
}
