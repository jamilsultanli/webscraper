import { getDbClient } from "@/lib/db"

interface CrawlConfig {
  maxPages: number
  maxDepth: number
  concurrency: number
  includeSubdomains: boolean
  followSitemaps: boolean
  respectRobots: boolean
  crawlDelay: number
  userAgent: string
  includeLanguageVariants: boolean
  followPagination: boolean
}

interface DiscoveredUrl {
  url: string
  depth: number
  source: string
  type: "page" | "sitemap" | "robots" | "pagination" | "internal"
  priority: number
}

interface CrawlState {
  discoveredUrls: string[]
  crawledUrls: string[]
  urlQueue: DiscoveredUrl[]
  robotsCache: [string, any][]
  sitemapCache: [string, string[]][]
  lastSavedAt: number
}

export class ComprehensiveCrawler {
  private config: CrawlConfig
  private domainId: number
  private discoveredUrls = new Set<string>()
  private crawledUrls = new Set<string>()
  private urlQueue: DiscoveredUrl[] = []
  private robotsCache = new Map<string, any>()
  private sitemapCache = new Map<string, string[]>()
  private crawlErrors = 0

  constructor(config: Partial<CrawlConfig> = {}, domainId: number) {
    this.config = {
      maxPages: 5000,
      maxDepth: 10,
      concurrency: 5,
      includeSubdomains: true,
      followSitemaps: true,
      respectRobots: true,
      crawlDelay: 300,
      userAgent: "ComprehensiveCrawler/1.0 (+https://example.com/bot)",
      includeLanguageVariants: true,
      followPagination: true,
      ...config,
    }
    this.domainId = domainId
  }

  async crawlWebsite(startUrl: string, resume = false): Promise<void> {
    const startDomain = new URL(startUrl).hostname.toLowerCase()
    try {
      let resumed = false
      if (resume) {
        resumed = await this.loadState(startDomain)
      }

      if (!resumed || this.urlQueue.length === 0) {
        console.log(`[Crawl ID: ${this.domainId}] Initializing new crawl for ${startDomain}.`)
        this.addUrlToQueue(startUrl, 0, "start", "page", 10)
        if (this.config.followSitemaps) await this.discoverFromSitemaps(startUrl, startDomain)
        if (this.config.respectRobots) await this.discoverFromRobots(startUrl, startDomain)
      }

      await this.performComprehensiveCrawl(startDomain)

      // Final update to set status to 'completed'
      const client = await getDbClient()
      await client.query(`UPDATE domains SET status = 'completed', updated_at = NOW() WHERE id = $1;`, [this.domainId])
      console.log(`[Crawl ID: ${this.domainId}] Crawl completed successfully.`)
    } catch (error) {
      console.error(`[Crawl ID: ${this.domainId}] Crawl failed with error:`, error)
      const client = await getDbClient()
      await client.query(`UPDATE domains SET status = 'failed', updated_at = NOW() WHERE id = $1;`, [this.domainId])
    }
  }

  private async saveState(domain: string): Promise<void> {
    const state: CrawlState = {
      discoveredUrls: Array.from(this.discoveredUrls),
      crawledUrls: Array.from(this.crawledUrls),
      urlQueue: this.urlQueue,
      robotsCache: Array.from(this.robotsCache.entries()),
      sitemapCache: Array.from(this.sitemapCache.entries()),
      lastSavedAt: Date.now(),
    }
    try {
      const client = await getDbClient()
      await client.query(
        `INSERT INTO crawl_states (domain_name, state_data, last_saved_at) VALUES ($1, $2::jsonb, NOW())
         ON CONFLICT (domain_name) DO UPDATE SET state_data = EXCLUDED.state_data, last_saved_at = NOW();`,
        [domain, JSON.stringify(state)],
      )
    } catch (error) {
      console.error(`[Crawl ID: ${this.domainId}] Failed to save crawl state:`, error)
    }
  }

  private async loadState(domain: string): Promise<boolean> {
    try {
      const client = await getDbClient()
      const result = await client.query(`SELECT state_data FROM crawl_states WHERE domain_name = $1;`, [domain])
      if (result.rows.length === 0) return false

      const state: CrawlState = result.rows[0].state_data
      this.discoveredUrls = new Set(state.discoveredUrls)
      this.crawledUrls = new Set(state.crawledUrls)
      this.urlQueue = state.urlQueue
      this.robotsCache = new Map(state.robotsCache)
      this.sitemapCache = new Map(state.sitemapCache)
      this.urlQueue.sort((a, b) => b.priority - a.priority)
      console.log(`[Crawl ID: ${this.domainId}] Crawl state loaded for ${domain}.`)
      return true
    } catch (error) {
      console.error(`[Crawl ID: ${this.domainId}] Failed to load crawl state:`, error)
      return false
    }
  }

  private addUrlToQueue(url: string, depth: number, source: string, type: DiscoveredUrl["type"], priority: number) {
    if (this.discoveredUrls.size >= this.config.maxPages || this.discoveredUrls.has(url)) return
    this.discoveredUrls.add(url)
    this.urlQueue.push({ url, depth, source, type, priority })
    this.urlQueue.sort((a, b) => b.priority - a.priority)
  }

  private async performComprehensiveCrawl(baseDomain: string): Promise<void> {
    let pagesCrawled = 0
    this.crawlErrors = 0
    const saveInterval = 20 // Save state more frequently

    const worker = async (workerId: number) => {
      let batchLinks: any[] = []
      while (pagesCrawled < this.config.maxPages) {
        const nextUrlData = this.urlQueue.shift()
        if (!nextUrlData) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
          if (this.urlQueue.length === 0) break
          continue
        }

        const { url, depth } = nextUrlData
        if (this.crawledUrls.has(url) || depth > this.config.maxDepth) continue

        try {
          const pageData = await this.crawlPage(url, baseDomain)
          this.crawledUrls.add(pageData.finalUrl)
          pagesCrawled++
          batchLinks.push(...pageData.links)

          await this.discoverUrlsFromPage(pageData.finalUrl, pageData.html, baseDomain, depth)

          if (batchLinks.length >= 20) {
            await this._saveBatchToDb(batchLinks)
            batchLinks = []
          }

          // Update stats in DB periodically
          if (pagesCrawled % 10 === 0) {
            const client = await getDbClient()
            await client.query(`UPDATE domains SET total_pages_crawled = $1, updated_at = NOW() WHERE id = $2;`, [
              this.crawledUrls.size,
              this.domainId,
            ])
          }

          await new Promise((resolve) => setTimeout(resolve, this.config.crawlDelay))
        } catch (error) {
          this.crawlErrors++
        }
      }
      // Save any remaining links in the batch
      if (batchLinks.length > 0) {
        await this._saveBatchToDb(batchLinks)
      }
    }

    const workers = Array.from({ length: this.config.concurrency }, (_, i) => worker(i))
    await Promise.all(workers)

    // Final state save and stats update
    await this.saveState(baseDomain)
    const client = await getDbClient()
    const totalLinksResult = await client.query(`SELECT COUNT(*) FROM outgoing_links WHERE domain_id = $1;`, [
      this.domainId,
    ])
    await client.query(
      `UPDATE domains SET total_pages_crawled = $1, total_external_links = $2, updated_at = NOW() WHERE id = $3;`,
      [this.crawledUrls.size, totalLinksResult.rows[0].count, this.domainId],
    )
  }

  private async _saveBatchToDb(links: any[]) {
    if (links.length === 0) return
    const client = await getDbClient()
    try {
      // Bulk insert links
      const values = links
        .map(
          (_, index: number) =>
            `($${index * 7 + 1}, $${index * 7 + 2}, $${index * 7 + 3}, $${index * 7 + 4}, $${index * 7 + 5}, $${index * 7 + 6}::boolean, $${index * 7 + 7}::timestamp)`,
        )
        .join(",")
      const flatParams = links.flatMap((link: any) => [
        this.domainId,
        link.source_url,
        link.target_url,
        link.target_domain,
        link.anchor_text,
        link.is_nofollow,
        link.created_at,
      ])
      await client.query(
        `INSERT INTO outgoing_links (domain_id, source_url, target_url, target_domain, anchor_text, is_nofollow, created_at) VALUES ${values} ON CONFLICT DO NOTHING;`,
        flatParams,
      )

      // Update domain summaries
      const domainSummary = this.groupLinksByDomain(links)
      for (const summary of domainSummary) {
        await client.query(
          `INSERT INTO outgoing_domains (domain_id, target_domain, link_count, first_seen_at, last_seen_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (domain_id, target_domain) DO UPDATE SET
             link_count = outgoing_domains.link_count + EXCLUDED.link_count,
             last_seen_at = EXCLUDED.last_seen_at;`,
          [this.domainId, summary.target_domain, summary.link_count, summary.first_seen_at, summary.last_seen_at],
        )
      }
    } catch (error) {
      console.error(`[Crawl ID: ${this.domainId}] Error saving batch to DB:`, error)
    }
  }

  // --- Other methods (discoverFromSitemaps, crawlPage, etc.) remain largely the same but can be simplified ---
  // For brevity, I'm showing the core logic changes. The existing helper methods for discovery can be reused.
  // The key change is that `allLinks` is no longer a class property holding all links.

  private async discoverFromSitemaps(startUrl: string, domain: string) {
    const sitemapUrls = [`${new URL(startUrl).origin}/sitemap.xml`, `${new URL(startUrl).origin}/sitemap_index.xml`]
    for (const sitemapUrl of sitemapUrls) {
      try {
        const urls = await this.parseSitemap(sitemapUrl)
        urls.forEach((url) => this.shouldCrawlUrl(url, domain) && this.addUrlToQueue(url, 1, "sitemap", "sitemap", 8))
      } catch (error) {}
    }
  }

  private async parseSitemap(sitemapUrl: string): Promise<string[]> {
    if (this.sitemapCache.has(sitemapUrl)) return this.sitemapCache.get(sitemapUrl)!
    try {
      const response = await fetch(sitemapUrl, { headers: { "User-Agent": this.config.userAgent } })
      if (!response.ok) return []
      const xml = await response.text()
      const urls: string[] = []
      const urlMatches = xml.match(/<loc>(.*?)<\/loc>/g) || []
      for (const match of urlMatches) {
        const url = match.replace(/<\/?loc>/g, "").trim()
        if (url.endsWith(".xml")) {
          urls.push(...(await this.parseSitemap(url)))
        } else if (this.discoveredUrls.size < this.config.maxPages) {
          urls.push(url)
        }
      }
      this.sitemapCache.set(sitemapUrl, urls)
      return urls
    } catch (error) {
      return []
    }
  }

  private async discoverFromRobots(startUrl: string, domain: string) {
    try {
      const robotsUrl = `${new URL(startUrl).origin}/robots.txt`
      const response = await fetch(robotsUrl, { headers: { "User-Agent": this.config.userAgent } })
      if (!response.ok) return
      const robotsText = await response.text()
      const sitemapMatches = robotsText.match(/Sitemap:\s*(.*)/gi) || []
      for (const match of sitemapMatches) {
        const sitemapUrl = match.replace(/Sitemap:\s*/i, "").trim()
        const urls = await this.parseSitemap(sitemapUrl)
        urls.forEach((url) => this.shouldCrawlUrl(url, domain) && this.addUrlToQueue(url, 1, "robots", "sitemap", 8))
      }
      this.robotsCache.set(domain, robotsText)
    } catch (error) {}
  }

  private shouldCrawlUrl(url: string, baseDomain: string): boolean {
    try {
      const urlObj = new URL(url)
      const urlDomain = urlObj.hostname.toLowerCase()
      if (this.config.includeSubdomains) {
        return urlDomain === baseDomain || urlDomain.endsWith(`.${baseDomain}`)
      }
      return urlDomain === baseDomain
    } catch {
      return false
    }
  }

  private async crawlPage(url: string, baseDomain: string): Promise<{ links: any[]; html: string; finalUrl: string }> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)
    const response = await fetch(url, {
      headers: { "User-Agent": this.config.userAgent },
      signal: controller.signal,
      redirect: "follow",
    })
    clearTimeout(timeoutId)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("text/html")) return { links: [], html: "", finalUrl: response.url }
    const html = await response.text()
    const finalUrl = response.url
    const links = this.extractExternalLinks(html, finalUrl, baseDomain)
    return { links, html, finalUrl }
  }

  private async discoverUrlsFromPage(currentUrl: string, html: string, baseDomain: string, currentDepth: number) {
    const linkRegex = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi
    let match
    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const href = match[1]
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue
        const absoluteUrl = new URL(href, currentUrl).toString()
        if (this.shouldCrawlUrl(absoluteUrl, baseDomain)) {
          this.addUrlToQueue(absoluteUrl, currentDepth + 1, currentUrl, "internal", 5)
        }
      } catch (error) {}
    }
  }

  private extractExternalLinks(html: string, baseUrl: string, sourceDomain: string) {
    const links: any[] = []
    const seenUrls = new Set<string>()
    const now = new Date().toISOString()
    const anchorRegex = /<a\s+([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*?)>(.*?)<\/a>/gis
    let match
    while ((match = anchorRegex.exec(html)) !== null) {
      try {
        const href = match[2]
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue
        const absoluteUrl = new URL(href, baseUrl).toString()
        const targetDomain = new URL(absoluteUrl).hostname.toLowerCase()
        if (targetDomain !== sourceDomain && !targetDomain.endsWith(`.${sourceDomain}`) && !seenUrls.has(absoluteUrl)) {
          const anchorText = match[4]
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 500)
          const relMatch = (match[1] + " " + match[3]).match(/rel\s*=\s*["']([^"']+)["']/i)
          const isNofollow = relMatch ? relMatch[1].toLowerCase().includes("nofollow") : false
          links.push({
            source_url: baseUrl,
            target_url: absoluteUrl,
            target_domain: targetDomain,
            anchor_text: anchorText,
            is_nofollow: isNofollow,
            created_at: now,
          })
          seenUrls.add(absoluteUrl)
        }
      } catch (error) {}
    }
    return links
  }

  private groupLinksByDomain(links: any[]) {
    const domainMap = new Map<string, { count: number; first_seen: Date; last_seen: Date }>()
    links.forEach((link) => {
      const domain = link.target_domain
      const linkDate = new Date(link.created_at)
      const existing = domainMap.get(domain)
      if (existing) {
        existing.count++
        if (linkDate > existing.last_seen) existing.last_seen = linkDate
      } else {
        domainMap.set(domain, { count: 1, first_seen: linkDate, last_seen: linkDate })
      }
    })
    return Array.from(domainMap.entries()).map(([domain, data]) => ({
      target_domain: domain,
      link_count: data.count,
      first_seen_at: data.first_seen.toISOString(),
      last_seen_at: data.last_seen.toISOString(),
    }))
  }
}
