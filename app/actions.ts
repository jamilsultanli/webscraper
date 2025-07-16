"use server"

import FirecrawlApp from "@mendable/firecrawl-js"
import * as cheerio from "cheerio"

export interface LinkData {
  sourceUrl: string
  targetUrl: string
  anchorText: string
  isNofollow: boolean
}

export async function crawlWebsite(url: string): Promise<{ data?: LinkData[]; error?: string }> {
  if (!process.env.FIRECRAWL_API_KEY) {
    return {
      error: "Firecrawl API key is not set. Please add it to your environment variables.",
    }
  }

  if (!url) {
    return { error: "URL is required." }
  }

  let sourceDomain: string
  try {
    sourceDomain = new URL(url).hostname
  } catch (e) {
    return { error: "Invalid URL provided." }
  }

  const app = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY })

  try {
    // Using a service like Firecrawl helps manage complexities like user-agents and proxies to avoid bot-blocking [^1][^2].
    const scrapeResult = await app.scrapeUrl(url, {
      pageOptions: {
        includeHtml: true,
      },
    })

    if (!scrapeResult.success || !scrapeResult.data.html) {
      return { error: "Failed to scrape the URL." }
    }

    const html = scrapeResult.data.html
    const $ = cheerio.load(html)
    const links: LinkData[] = []
    const seenUrls = new Set<string>()

    $("a").each((_, element) => {
      const href = $(element).attr("href")
      if (!href) return

      try {
        const absoluteUrl = new URL(href, url).toString()
        const targetDomain = new URL(absoluteUrl).hostname

        // Only include external links and avoid duplicates
        if (targetDomain !== sourceDomain && !seenUrls.has(absoluteUrl)) {
          const anchorText = $(element).text().trim()
          const rel = $(element).attr("rel")
          const isNofollow = rel ? rel.includes("nofollow") : false

          links.push({
            sourceUrl: url,
            targetUrl: absoluteUrl,
            anchorText,
            isNofollow,
          })
          seenUrls.add(absoluteUrl)
        }
      } catch (e) {
        // Ignore invalid URLs
      }
    })

    return { data: links }
  } catch (error) {
    console.error("Crawling failed:", error)
    return { error: "An unexpected error occurred during crawling." }
  }
}
