import { type NextRequest, NextResponse } from "next/server"

interface LinkData {
  source_url: string
  target_url: string
  target_domain: string
  anchor_text: string
  rel_type: string
  is_nofollow: boolean
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    // Extract domain from URL
    const sourceDomain = new URL(url).hostname

    // Fetch the webpage
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()

    // Parse HTML to extract links
    const links = extractLinksFromHTML(html, url, sourceDomain)

    // Group by domain
    const domainSummary = groupLinksByDomain(links)

    return NextResponse.json({
      success: true,
      domain: {
        domain_name: sourceDomain,
        status: "completed",
        total_external_links: links.length,
        crawl_date: new Date().toISOString(),
      },
      links: links,
      domainSummary: domainSummary,
      pagination: {
        page: 1,
        limit: links.length,
        total: links.length,
        totalPages: 1,
      },
    })
  } catch (error) {
    console.error("Simple crawl error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to crawl website",
      },
      { status: 500 },
    )
  }
}

function extractLinksFromHTML(html: string, baseUrl: string, sourceDomain: string): LinkData[] {
  const links: LinkData[] = []
  const seenUrls = new Set<string>()

  // Simple regex to find anchor tags
  const anchorRegex = /<a[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gi
  let match

  while ((match = anchorRegex.exec(html)) !== null) {
    try {
      const href = match[1]
      const anchorText = match[2].replace(/<[^>]*>/g, "").trim() // Remove HTML tags

      // Get the full anchor tag to extract rel attribute
      const fullTag = match[0]
      const relMatch = fullTag.match(/rel\s*=\s*["']([^"']+)["']/i)
      const relType = relMatch ? relMatch[1] : ""

      // Convert relative URLs to absolute
      const absoluteUrl = new URL(href, baseUrl).toString()
      const targetDomain = new URL(absoluteUrl).hostname

      // Only include external links and avoid duplicates
      if (targetDomain !== sourceDomain && !seenUrls.has(absoluteUrl)) {
        const isNofollow = relType.toLowerCase().includes("nofollow")

        links.push({
          source_url: baseUrl,
          target_url: absoluteUrl,
          target_domain: targetDomain,
          anchor_text: anchorText,
          rel_type: relType,
          is_nofollow: isNofollow,
        })
        seenUrls.add(absoluteUrl)
      }
    } catch (e) {
      // Ignore invalid URLs
      continue
    }
  }

  return links
}

function groupLinksByDomain(links: LinkData[]) {
  const domainMap = new Map<string, { count: number; first_seen: Date; last_seen: Date }>()

  links.forEach((link) => {
    const domain = link.target_domain
    const now = new Date()

    if (domainMap.has(domain)) {
      const existing = domainMap.get(domain)!
      existing.count++
      existing.last_seen = now
    } else {
      domainMap.set(domain, {
        count: 1,
        first_seen: now,
        last_seen: now,
      })
    }
  })

  return Array.from(domainMap.entries())
    .map(([domain, data]) => ({
      target_domain: domain,
      link_count: data.count,
      first_seen_at: data.first_seen.toISOString(),
      last_seen_at: data.last_seen.toISOString(),
    }))
    .sort((a, b) => b.link_count - a.link_count)
}
