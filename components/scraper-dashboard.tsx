"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { PaginatedLinkTable } from "@/components/paginated-link-table"
import { DomainSummary } from "@/components/domain-summary"
import { Loader2, SearchIcon, AlertCircle, CheckCircle, Clock, Settings, Zap } from "lucide-react"

interface CrawlStatus {
  id: number
  domain_name: string
  status: string
  crawl_date: string
  total_pages_crawled: number
  total_external_links: number
  crawl_depth: number
  created_at: string
  updated_at: string
  crawl_config?: any
}

export function ScraperDashboard() {
  const [url, setUrl] = React.useState("https://en.wikipedia.org")
  const [depth, setDepth] = React.useState("3")
  const [maxPages, setMaxPages] = React.useState("5000") // Increased default
  const [concurrency, setConcurrency] = React.useState("5") // New state for concurrency
  const [includeSubdomains, setIncludeSubdomains] = React.useState(true)
  const [followSitemaps, setFollowSitemaps] = React.useState(true)
  const [resumeCrawl, setResumeCrawl] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [crawlStatus, setCrawlStatus] = React.useState<CrawlStatus | null>(null)
  const [results, setResults] = React.useState<any>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setCrawlStatus(null)
    setResults(null)

    try {
      console.log(`Frontend: Sending crawl request for: ${url}, resume: ${resumeCrawl}`)

      const response = await fetch("/api/crawl-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          depth: Number.parseInt(depth),
          maxPages: Number.parseInt(maxPages),
          concurrency: Number.parseInt(concurrency), // Pass concurrency
          includeSubdomains,
          followSitemaps,
          resume: resumeCrawl,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to crawl website")
      }

      console.log("Comprehensive crawl completed:", data)

      // Set results
      setResults(data)
      setCrawlStatus({
        id: 1, // Placeholder ID
        domain_name: data.domain.domain_name,
        status: "completed",
        crawl_date: data.domain.crawl_date,
        total_pages_crawled: data.domain.total_pages_crawled,
        total_external_links: data.domain.total_external_links,
        crawl_depth: data.domain.crawl_depth,
        created_at: data.domain.crawl_date,
        updated_at: data.domain.crawl_date,
        crawl_config: data.domain.crawl_config,
      })
    } catch (err) {
      console.error("Crawl error:", err)
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-600" />
      case "processing":
      case "crawling":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
      case "processing":
      case "crawling":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
      default:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
    }
  }

  // Predefined example URLs for comprehensive crawling
  const exampleUrls = [
    "https://en.wikipedia.org",
    "https://www.bbc.com",
    "https://techcrunch.com",
    "https://www.reuters.com",
    "https://www.theguardian.com",
  ]

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-orange-500" />
            Comprehensive Website Crawler
          </CardTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Discover and crawl ALL pages on a website including sitemaps, subdomains, and language variants to find
            EVERY outgoing domain
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-grow">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <Input
                  type="url"
                  placeholder="e.g., https://en.wikipedia.org"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="pl-10"
                  required
                  disabled={loading}
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Crawling...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Start Comprehensive Crawl
                  </>
                )}
              </Button>
            </div>

            {/* Advanced Configuration */}
            <div className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                <h3 className="font-medium">Crawl Configuration</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="maxPages">Max Pages</Label>
                  <Input
                    id="maxPages"
                    type="number"
                    value={maxPages}
                    onChange={(e) => setMaxPages(e.target.value)}
                    min="1"
                    disabled={loading}
                    placeholder="e.g., 5000"
                  />
                </div>

                <div>
                  <Label htmlFor="concurrency">Concurrency</Label>
                  <Select value={concurrency} onValueChange={setConcurrency} disabled={loading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 (Sequential)</SelectItem>
                      <SelectItem value="5">5 (Balanced)</SelectItem>
                      <SelectItem value="10">10 (Fast)</SelectItem>
                      <SelectItem value="20">20 (Aggressive)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="depth">Crawl Depth</Label>
                  <Select value={depth} onValueChange={setDepth} disabled={loading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">Depth: 2 (Shallow)</SelectItem>
                      <SelectItem value="3">Depth: 3 (Balanced)</SelectItem>
                      <SelectItem value="5">Depth: 5 (Deep)</SelectItem>
                      <SelectItem value="10">Depth: 10 (Maximum)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="subdomains"
                    checked={includeSubdomains}
                    onCheckedChange={setIncludeSubdomains}
                    disabled={loading}
                  />
                  <Label htmlFor="subdomains">Include Subdomains</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="sitemaps"
                    checked={followSitemaps}
                    onCheckedChange={setFollowSitemaps}
                    disabled={loading}
                  />
                  <Label htmlFor="sitemaps">Follow Sitemaps</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch id="resumeCrawl" checked={resumeCrawl} onCheckedChange={setResumeCrawl} disabled={loading} />
                  <Label htmlFor="resumeCrawl">Resume Crawl</Label>
                </div>
              </div>
            </div>
          </form>

          {/* Example URLs */}
          <div className="mt-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Try comprehensive crawling on these sites:</p>
            <div className="flex flex-wrap gap-2">
              {exampleUrls.map((exampleUrl) => (
                <Button
                  key={exampleUrl}
                  variant="outline"
                  size="sm"
                  onClick={() => setUrl(exampleUrl)}
                  disabled={loading}
                  className="text-xs"
                >
                  {new URL(exampleUrl).hostname}
                </Button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="inline h-4 w-4 mr-1" />
                Error: {error}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {crawlStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getStatusIcon(crawlStatus.status)}
              Comprehensive Crawl Results: {crawlStatus.domain_name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
                <Badge className={getStatusColor(crawlStatus.status)}>{crawlStatus.status}</Badge>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Pages Crawled</p>
                <p className="font-semibold text-blue-600">{crawlStatus.total_pages_crawled}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">External Links</p>
                <p className="font-semibold text-green-600">{crawlStatus.total_external_links}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Unique Domains</p>
                <p className="font-semibold text-purple-600">{results?.domainSummary?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Sitemaps Found</p>
                <p className="font-semibold">{crawlStatus.crawl_config?.sitemapsFound || 0}</p>
              </div>
            </div>
            {results?.stats && (
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  🚀 Discovered {results.stats.totalUrls} total URLs • Crawled {results.stats.pagesCrawled} pages •
                  Found {results.totalLinks} external links to {results.stats.domains} unique domains
                  {crawlStatus.crawl_config?.sitemapsFound > 0 &&
                    ` • Processed ${crawlStatus.crawl_config.sitemapsFound} sitemaps`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Complete Website Analysis</CardTitle>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Comprehensive crawl found {results.totalLinks} external links pointing to {results.domainSummary.length}{" "}
              different domains
            </p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="links" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="links">All External Links ({results.totalLinks})</TabsTrigger>
                <TabsTrigger value="domains">Domain Analysis ({results.domainSummary.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="links" className="space-y-4">
                <PaginatedLinkTable domain={results.domain.domain_name} />
              </TabsContent>
              <TabsContent value="domains" className="space-y-4">
                <DomainSummary data={results.domainSummary} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
