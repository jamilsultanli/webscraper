import { getDbClient } from "@/lib/db" // Updated import

interface CrawlConfig {
  maxPages: number
  maxDepth: number
  concurrency: number // New: Number of concurrent requests
  includeSubdomains: boolean
  followSitemaps: boolean
  respectRobots: boolean
  crawlDelay: number // Delay between individual requests
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
  allLinks: any[]
  robotsCache: [string, any][]
  sitemapCache: [string, string[]][]
  lastSavedAt: number
}

export class ComprehensiveCrawler {
  private config: CrawlConfig
  private discoveredUrls = new Set<string>()
  private crawledUrls = new Set<string>()
  private urlQueue: DiscoveredUrl[] = []
  private allLinks: any[] = []
  private robotsCache = new Map<string, any>()
  private sitemapCache = new Map<string, string[]>()
  private crawlErrors = 0 // Track errors during concurrent crawl

  constructor(config: Partial<CrawlConfig> = {}) {
    this.config = {
      maxPages: 5000, // Increased default max pages
      maxDepth: 10,
      concurrency: 5, // Default concurrency
      includeSubdomains: true,
      followSitemaps: true,
      respectRobots: true,
      crawlDelay: 300, // 300ms between requests
      userAgent: "ComprehensiveCrawler/1.0 (+https://example.com/bot)",
      includeLanguageVariants: true,
      followPagination: true,
      ...config,
    }
  }

  async crawlWebsite(
    startUrl: string,
    resume = false,
  ): Promise<{
    links: any[]
    stats: {
      pagesCrawled: number
      totalUrls: number
      errors: number
      domains: number
      sitemapsFound: number
    }
    error?: string
  }> {
    try {
      const startDomain = new URL(startUrl).hostname.toLowerCase()
      let resumed = false

      if (resume) {
        console.log(`Attempting to resume crawl for ${startDomain} from database...`)
        resumed = await this.loadState(startDomain)
        if (resumed) {
          console.log(`Successfully resumed crawl for ${startDomain} from database.`)
        } else {
          console.log(`No saved state found for ${startDomain} in database. Starting new crawl.`)
        }
      }

      if (!resumed || this.urlQueue.length === 0) {
        // If not resuming or no URLs in queue after loading, initialize with start URL
        console.log(`Initializing new crawl for ${startDomain}.`)
        this.addUrlToQueue(startUrl, 0, "start", "page", 10)

        // Step 1: Discover URLs from sitemaps
        if (this.config.followSitemaps) {
          await this.discoverFromSitemaps(startUrl, startDomain)
        }

        // Step 2: Discover URLs from robots.txt
        if (this.config.respectRobots) {
          await this.discoverFromRobots(startUrl, startDomain)
        }
      } else {
        console.log(`Continuing crawl for ${startDomain} with ${this.urlQueue.length} URLs in queue.`)
      }

      // Step 3: Comprehensive crawling with concurrency
      const { pagesCrawled, errors } = await this.performComprehensiveCrawl(startDomain)

      // Save state one last time after crawl completes
      await this.saveState(startDomain)

      const uniqueDomains = new Set(this.allLinks.map((link) => link.target_domain)).size

      return {
        links: this.allLinks,
        stats: {
          pagesCrawled: pagesCrawled,
          totalUrls: this.discoveredUrls.size,
          errors: errors,
          domains: uniqueDomains,
          sitemapsFound: this.sitemapCache.size,
        },
      }
    } catch (error) {
      console.error(`CrawlWebsite top-level error for ${startUrl}:`, error)
      return {
        links: [],
        stats: { pagesCrawled: 0, totalUrls: 0, errors: 1, domains: 0, sitemapsFound: 0 },
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  private async saveState(domain: string): Promise<void> {
    const state: CrawlState = {
      discoveredUrls: Array.from(this.discoveredUrls),
      crawledUrls: Array.from(this.crawledUrls),
      urlQueue: this.urlQueue,
      allLinks: this.allLinks,
      robotsCache: Array.from(this.robotsCache.entries()),
      sitemapCache: Array.from(this.sitemapCache.entries()),
      lastSavedAt: Date.now(),
    }

    try {
      const client = await getDbClient()
      await client.query(
        `
        INSERT INTO crawl_states (domain_name, state_data, last_saved_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (domain_name) DO UPDATE SET
          state_data = EXCLUDED.state_data,
          last_saved_at = NOW();
      `,
        [domain, JSON.stringify(state)],
      )
      console.log(`Crawl state saved successfully for ${domain} to database.`)
    } catch (error) {
      console.error(`Failed to save crawl state for ${domain} to database:`, error)
    }
  }

  private async loadState(domain: string): Promise<boolean> {
    try {
      const client = await getDbClient()
      const result = await client.query(
        `
        SELECT state_data FROM crawl_states WHERE domain_name = $1;
      `,
        [domain],
      )
      if (result.rows.length === 0) {
        console.log(`No crawl state found for ${domain} in database.`)
        return false
      }

      const state: CrawlState = result.rows[0].state_data

      this.discoveredUrls = new Set(state.discoveredUrls)
      this.crawledUrls = new Set(state.crawledUrls)
      this.urlQueue = state.urlQueue
      this.allLinks = state.allLinks
      this.robotsCache = new Map(state.robotsCache)
      this.sitemapCache = new Map(state.sitemapCache)

      // Re-sort the queue after loading, as it might have been modified externally
      this.urlQueue.sort((a, b) => b.priority - a.priority)

      console.log(`Crawl state loaded for ${domain}. Last saved: ${new Date(state.lastSavedAt).toLocaleString()}`)
      return true
    } catch (error) {
      console.error(`Failed to load crawl state for ${domain} from database:`, error)
      return false
    }
  }

  private addUrlToQueue(url: string, depth: number, source: string, type: DiscoveredUrl["type"], priority: number) {
    // Only add if we haven't reached the maxPages limit for discovered URLs
    if (this.discoveredUrls.size >= this.config.maxPages) {
      // console.log(`Skipping adding URL ${url} as maxPages (${this.config.maxPages}) limit reached for discovered URLs.`)
      return
    }

    if (this.discoveredUrls.has(url)) return

    this.discoveredUrls.add(url)
    this.urlQueue.push({ url, depth, source, type, priority })

    // Sort queue by priority (higher priority first)
    this.urlQueue.sort((a, b) => b.priority - a.priority)
    console.log(`Added to queue: ${url} (Queue size: ${this.urlQueue.length}, Discovered: ${this.discoveredUrls.size})`) // Added log
  }

  // New helper for retrying fetch requests
  private async retryFetch(
    url: string,
    options: RequestInit,
    retries = 3,
    initialDelay = 500, // Start with 500ms delay
  ): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options)
        if (response.ok) {
          return response
        } else {
          console.warn(
            `[RetryFetch] Attempt ${i + 1}/${retries} failed for ${url}. Status: ${response.status} ${response.statusText}`,
          )
          if (i < retries - 1) {
            await new Promise((resolve) => setTimeout(resolve, initialDelay * Math.pow(2, i))) // Exponential backoff
          } else {
            throw new Error(
              `[RetryFetch] Failed to fetch ${url} after ${retries} attempts: HTTP ${response.status} ${response.statusText}`,
            )
          }
        }
      } catch (error) {
        console.warn(
          `[RetryFetch] Attempt ${i + 1}/${retries} failed for ${url} with error: ${error instanceof Error ? error.message : error}`,
        )
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, initialDelay * Math.pow(2, i))) // Exponential backoff
        } else {
          throw error // Re-throw the last error if all retries fail
        }
      }
    }
    throw new Error("[RetryFetch] Unexpected state: Should have returned or thrown.")
  }

  private async discoverFromSitemaps(startUrl: string, domain: string) {
    const sitemapUrls = [
      `${new URL(startUrl).origin}/sitemap.xml`,
      `${new URL(startUrl).origin}/sitemap_index.xml`,
      `${new URL(startUrl).origin}/sitemaps.xml`,
      `${new URL(startUrl).origin}/sitemap/sitemap.xml`,
    ]

    for (const sitemapUrl of sitemapUrls) {
      try {
        const urls = await this.parseSitemap(sitemapUrl)
        urls.forEach((url) => {
          if (this.shouldCrawlUrl(url, domain)) {
            this.addUrlToQueue(url, 1, "sitemap", "sitemap", 8)
          }
        })
        console.log(`Found ${urls.length} URLs in sitemap: ${sitemapUrl}`)
      } catch (error) {
        console.log(`Failed to discover from sitemap ${sitemapUrl}: ${error instanceof Error ? error.message : error}`) // Enhanced log
      }
    }
  }

  private async parseSitemap(sitemapUrl: string): Promise<string[]> {
    if (this.sitemapCache.has(sitemapUrl)) {
      return this.sitemapCache.get(sitemapUrl)!
    }

    try {
      // Use retryFetch for sitemap fetching
      const response = await this.retryFetch(sitemapUrl, {
        headers: { "User-Agent": this.config.userAgent },
      })

      const xml = await response.text()
      const urls: string[] = []

      // Parse sitemap XML
      const urlMatches = xml.match(/<loc>(.*?)<\/loc>/g) || []
      for (const match of urlMatches) {
        const url = match.replace(/<\/?loc>/g, "").trim()

        if (url.endsWith(".xml")) {
          // Nested sitemap - recursively parse
          try {
            const nestedUrls = await this.parseSitemap(url)
            urls.push(...nestedUrls)
          } catch (error) {
            console.log(`Failed to parse nested sitemap: ${url} - ${error instanceof Error ? error.message : error}`) // Enhanced log
          }
        }
        // Only add if we haven't reached the maxPages limit for discovered URLs
        else if (this.discoveredUrls.size < this.config.maxPages) {
          urls.push(url)
        }
      }

      this.sitemapCache.set(sitemapUrl, urls)
      return urls
    } catch (error) {
      console.error(`Failed to fetch or parse sitemap ${sitemapUrl}: ${error instanceof Error ? error.message : error}`)
      throw error // Re-throw to indicate a critical failure for this sitemap branch
    }
  }

  private async discoverFromRobots(startUrl: string, domain: string) {
    try {
      const robotsUrl = `${new URL(startUrl).origin}/robots.txt`
      // Use retryFetch for robots.txt fetching
      const response = await this.retryFetch(robotsUrl, {
        headers: { "User-Agent": this.config.userAgent },
      })

      if (!response.ok) return // If retryFetch throws, this won't be reached. If it returns non-ok, we still return.

      const robotsText = await response.text()

      // Extract sitemap URLs from robots.txt
      const sitemapMatches = robotsText.match(/Sitemap:\s*(.*)/gi) || []
      for (const match of sitemapMatches) {
        const sitemapUrl = match.replace(/Sitemap:\s*/i, "").trim()
        try {
          const urls = await this.parseSitemap(sitemapUrl)
          urls.forEach((url) => {
            if (this.shouldCrawlUrl(url, domain)) {
              this.addUrlToQueue(url, 1, "robots", "sitemap", 8)
            }
          })
        } catch (error) {
          console.log(
            `Failed to parse sitemap from robots.txt: ${sitemapUrl} - ${error instanceof Error ? error.message : error}`,
          ) // Enhanced log
        }
      }

      this.robotsCache.set(domain, robotsText)
    } catch (error) {
      console.log(`No robots.txt found for: ${domain} - ${error instanceof Error ? error.message : error}`) // Enhanced log
    }
  }

  private shouldCrawlUrl(url: string, baseDomain: string): boolean {
    try {
      const urlObj = new URL(url)
      const urlDomain = urlObj.hostname.toLowerCase()

      // Check if it's the same domain or subdomain
      if (this.config.includeSubdomains) {
        return urlDomain === baseDomain || urlDomain.endsWith(`.${baseDomain}`)
      } else {
        return urlDomain === baseDomain
      }
    } catch {
      return false
    }
  }

  private async performComprehensiveCrawl(baseDomain: string): Promise<{ pagesCrawled: number; errors: number }> {
    let pagesCrawled = 0
    this.crawlErrors = 0 // Reset errors for this crawl session
    const saveInterval = 50 // Save state every 50 pages

    console.log(
      `Starting comprehensive crawl with ${this.config.concurrency} workers. Initial queue size: ${this.urlQueue.length}`,
    ) // Added log

    const worker = async (workerId: number) => {
      console.log(`Worker ${workerId} started.`) // Added log
      while (pagesCrawled < this.config.maxPages) {
        const nextUrlData = this.urlQueue.shift() // Get the highest priority URL

        if (!nextUrlData) {
          console.log(`Worker ${workerId}: Queue is empty. Waiting for new URLs or finishing.`) // Added log
          // If queue is empty, wait a bit to see if other workers add new URLs
          await new Promise((resolve) => setTimeout(resolve, this.config.crawlDelay * 5)) // Wait longer
          if (this.urlQueue.length === 0) {
            // Still empty after waiting
            console.log(`Worker ${workerId}: Queue still empty. Exiting.`) // Added log
            break // Exit worker loop
          } else {
            console.log(`Worker ${workerId}: New URLs found after waiting. Continuing.`) // Added log
            continue // Try again
          }
        }

        const { url, depth } = nextUrlData

        if (this.crawledUrls.has(url)) {
          console.log(`Worker ${workerId}: Skipping already crawled URL: ${url}`) // Added log
          continue
        }
        if (depth > this.config.maxDepth) {
          console.log(
            `Worker ${workerId}: Skipping URL due to max depth: ${url} (depth ${depth} > max ${this.config.maxDepth})`,
          ) // Added log
          continue
        }

        try {
          console.log(`Worker ${workerId}: Crawling [${pagesCrawled + 1}/${this.config.maxPages}]: ${url}`) // Added log

          const pageData = await this.crawlPage(url, baseDomain)
          this.allLinks.push(...pageData.links)
          this.crawledUrls.add(pageData.finalUrl) // Use the final URL after redirects
          pagesCrawled++ // This is a shared counter, potential race condition if not careful, but for simple increment it's usually fine.

          await this.discoverUrlsFromPage(pageData.finalUrl, pageData.html, baseDomain, depth)

          if (pagesCrawled % saveInterval === 0) {
            console.log(`Worker ${workerId}: Saving state after ${pagesCrawled} pages.`) // Added log
            await this.saveState(baseDomain)
          }

          // Rate limiting per request
          await new Promise((resolve) => setTimeout(resolve, this.config.crawlDelay))
        } catch (error) {
          console.error(`Worker ${workerId}: Error crawling ${url}: ${error instanceof Error ? error.message : error}`) // Enhanced log
          this.crawlErrors++
          // Continue to next URL even on error
        }
      }
      console.log(`Worker ${workerId} finished.`) // Added log
    }

    // Create a pool of workers
    const workers: Promise<void>[] = []
    for (let i = 0; i < this.config.concurrency; i++) {
      workers.push(worker(i))
    }

    // Wait for all workers to complete
    await Promise.all(workers)

    console.log(
      `Crawling completed: ${pagesCrawled} pages, ${this.crawlErrors} errors, ${this.allLinks.length} external links`,
    )
    return { pagesCrawled, errors: this.crawlErrors }
  }

  private async crawlPage(url: string, baseDomain: string): Promise<{ links: any[]; html: string; finalUrl: string }> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const response = await fetch(url, {
      headers: {
        "User-Agent": this.config.userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        DNT: "1",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: controller.signal,
      redirect: "follow", // Ensure fetch follows redirects
    })

    clearTimeout(timeoutId)

    // Explicitly handle redirect status codes (3xx)
    if (response.status >= 300 && response.status < 400) {
      console.log(`Redirect detected for ${url} to ${response.url} (Status: ${response.status}). Following...`)
      // The fetch API automatically follows redirects when redirect: 'follow',
      // so response.url already contains the final URL.
      // We don't need to throw an error here, just proceed with the final URL.
    } else if (!response.ok) {
      // If it's not a redirect and not OK, then it's a true error (4xx, 5xx)
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("text/html")) {
      console.log(`Skipping non-HTML content: ${contentType} at ${response.url}`)
      return { links: [], html: "", finalUrl: response.url }
    }

    const html = await response.text()
    const finalUrl = response.url // This is the URL after all redirects

    const links = this.extractExternalLinks(html, finalUrl, baseDomain)

    return { links, html, finalUrl }
  }

  private async discoverUrlsFromPage(currentUrl: string, html: string, baseDomain: string, currentDepth: number) {
    // Extract all internal links
    const linkRegex = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi
    let match

    const discoveredInThisPage = new Set<string>()

    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const href = match[1]

        // Skip non-HTTP links
        if (
          !href ||
          href.trim() === "" ||
          href.startsWith("#") ||
          href.startsWith("javascript:") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:")
        ) {
          continue
        }

        const absoluteUrl = new URL(href, currentUrl).toString()
        const urlObj = new URL(absoluteUrl)

        if (this.shouldCrawlUrl(absoluteUrl, baseDomain) && !discoveredInThisPage.has(absoluteUrl)) {
          discoveredInThisPage.add(absoluteUrl)

          // Determine URL type and priority
          let type: DiscoveredUrl["type"] = "internal"
          let priority = 5

          // Higher priority for certain URL patterns
          if (this.isHighValueUrl(absoluteUrl)) {
            priority = 7
          }

          // Language variants
          if (this.config.includeLanguageVariants && this.isLanguageVariant(absoluteUrl)) {
            priority = 6
          }

          // Pagination
          if (this.config.followPagination && this.isPaginationUrl(absoluteUrl)) {
            priority = 6
            type = "pagination"
          }

          this.addUrlToQueue(absoluteUrl, currentDepth + 1, currentUrl, type, priority)
        }
      } catch (error) {
        continue // Skip invalid URLs
      }
    }

    // Also look for special discovery patterns
    await this.discoverSpecialPatterns(html, currentUrl, baseDomain, currentDepth)
  }

  private isHighValueUrl(url: string): boolean {
    const highValuePatterns = [
      "/blog/",
      "/article/",
      "/post/",
      "/news/",
      "/wiki/",
      "/page/",
      "/category/",
      "/tag/",
      "/archive/",
      "/search/",
      "/index",
      "/sitemap",
      "/directory/",
      "/list/",
      "/browse/",
    ]

    return highValuePatterns.some((pattern) => url.toLowerCase().includes(pattern))
  }

  private isLanguageVariant(url: string): boolean {
    const langPatterns = [
      /\/[a-z]{2}\//,
      /\/[a-z]{2}-[a-z]{2}\//i, // /en/, /en-us/
      /\.[a-z]{2}\./, // .en., .fr.
      /lang=/,
      /language=/,
      /locale=/,
    ]

    return langPatterns.some((pattern) => pattern.test(url))
  }

  private isPaginationUrl(url: string): boolean {
    const paginationPatterns = [
      /page=\d+/,
      /p=\d+/,
      /offset=\d+/,
      /start=\d+/,
      /\/page\/\d+/,
      /\/p\d+/,
      /\/\d+\/$/,
      /next/,
      /more/,
      /continue/,
    ]

    return paginationPatterns.some((pattern) => pattern.test(url.toLowerCase()))
  }

  private async discoverSpecialPatterns(html: string, currentUrl: string, baseDomain: string, currentDepth: number) {
    // Look for JSON-LD structured data with URLs
    const jsonLdMatches =
      html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis) || []

    for (const match of jsonLdMatches) {
      try {
        const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, "")
        const data = JSON.parse(jsonContent)
        this.extractUrlsFromJsonLd(data, currentUrl, baseDomain, currentDepth)
      } catch (error) {
        continue
      }
    }

    // Look for RSS/Atom feeds
    const feedMatches = html.match(/href\s*=\s*["']([^"']*(?:rss|atom|feed)[^"']*)["']/gi) || []
    for (const match of feedMatches) {
      const feedUrl = match.match(/href\s*=\s*["']([^"']+)["']/)?.[1]
      if (feedUrl) {
        try {
          const absoluteFeedUrl = new URL(feedUrl, currentUrl).toString()
          if (this.shouldCrawlUrl(absoluteFeedUrl, baseDomain)) {
            this.addUrlToQueue(absoluteFeedUrl, currentDepth + 1, currentUrl, "page", 6)
          }
        } catch (error) {
          continue
        }
      }
    }
  }

  private extractUrlsFromJsonLd(data: any, currentUrl: string, baseDomain: string, currentDepth: number) {
    if (typeof data !== "object" || !data) return

    // Recursively search for URL properties
    const searchForUrls = (obj: any) => {
      if (typeof obj === "string" && (obj.startsWith("http://") || obj.startsWith("https://"))) {
        try {
          if (this.shouldCrawlUrl(obj, baseDomain)) {
            this.addUrlToQueue(obj, currentDepth + 1, currentUrl, "page", 5)
          }
        } catch (error) {
          // Skip invalid URLs
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(searchForUrls)
      } else if (typeof obj === "object" && obj !== null) {
        Object.values(obj).forEach(searchForUrls)
      }
    }

    searchForUrls(data)
  }

  private extractExternalLinks(html: string, baseUrl: string, sourceDomain: string) {
    const links: any[] = []
    const seenUrls = new Set<string>()
    const now = new Date().toISOString()

    const anchorRegex = /<a\s+([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*?)>(.*?)<\/a>/gis
    let match

    while ((match = anchorRegex.exec(html)) !== null) {
      try {
        const beforeHref = match[1] || ""
        const href = match[2]
        const afterHref = match[3] || ""
        const anchorContent = match[4] || ""

        if (
          !href ||
          href.trim() === "" ||
          href.startsWith("#") ||
          href.startsWith("javascript:") ||
          href.startsWith("mailto:") ||
          href.startsWith("tel:")
        ) {
          continue
        }

        const absoluteUrl = new URL(href, baseUrl).toString()
        const targetDomain = new URL(absoluteUrl).hostname.toLowerCase()

        // Only external links
        if (targetDomain !== sourceDomain && !targetDomain.endsWith(`.${sourceDomain}`) && !seenUrls.has(absoluteUrl)) {
          const anchorText = anchorContent
            .replace(/<[^>]*>/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 500)

          const fullAttributes = beforeHref + " " + afterHref
          const relMatch = fullAttributes.match(/rel\s*=\s*["']([^"']+)["']/i)
          const relType = relMatch ? relMatch[1] : ""
          const isNofollow = relType.toLowerCase().includes("nofollow")

          links.push({
            source_url: baseUrl,
            target_url: absoluteUrl,
            target_domain: targetDomain,
            anchor_text: anchorText,
            rel_type: relType,
            is_nofollow: isNofollow,
            created_at: now,
          })
          seenUrls.add(absoluteUrl)
        }
      } catch (error) {
        continue
      }
    }

    return links
  }
}
