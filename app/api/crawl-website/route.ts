import { type NextRequest, NextResponse } from "next/server"
import { ComprehensiveCrawler } from "@/lib/comprehensive-crawler"
import { neon } from "@neondatabase/serverless"
const sql = neon(process.env.DATABASE_URL!)

interface DomainSummary {
  target_domain: string
  link_count: number
  first_seen_at: string
  last_seen_at: string
}

export async function POST(request: NextRequest) {
  try {
    const {
      url,
      depth = 3,
      maxPages = 5000, // Increased default
      concurrency = 5, // New parameter for concurrency
      includeSubdomains = true,
      followSitemaps = true,
      resume = false,
    } = await request.json()

    console.log(`API received request: url=${url}, resume=${resume}`)

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    // Validate URL format
    let targetUrl: URL
    try {
      targetUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 })
    }

    // Only allow HTTP/HTTPS
    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      return NextResponse.json({ error: "Only HTTP and HTTPS URLs are supported" }, { status: 400 })
    }

    const sourceDomain = targetUrl.hostname.toLowerCase()

    console.log(`Starting comprehensive crawl for: ${url}`)
    console.log(
      `Config: maxPages=${maxPages}, depth=${depth}, concurrency=${concurrency}, subdomains=${includeSubdomains}, sitemaps=${followSitemaps}, resume=${resume}`,
    )

    // Initialize comprehensive crawler
    const crawler = new ComprehensiveCrawler({
      maxPages: Math.min(maxPages, 10000), // Cap at 10000 pages for safety
      maxDepth: depth,
      concurrency: concurrency, // Pass concurrency to crawler
      includeSubdomains,
      followSitemaps,
      respectRobots: true,
      crawlDelay: 300, // 300ms between requests
      userAgent: "ComprehensiveCrawler/1.0 (+https://example.com/bot)",
      includeLanguageVariants: true,
      followPagination: true,
    })

    // Perform comprehensive crawl
    const crawlResult = await crawler.crawlWebsite(url, resume)

    if (crawlResult.error) {
      return NextResponse.json({ error: crawlResult.error }, { status: 500 })
    }

    const { links, stats } = crawlResult

    // Group by domain (no limit)
    const domainSummary = groupLinksByDomain(links)

    // 1. Insert/Update domain information
    const domainName = sourceDomain
    let domainId
    const existingDomain = await sql`
      SELECT id FROM domains WHERE domain_name = ${domainName};
    `

    if (existingDomain.length > 0) {
      domainId = existingDomain[0].id
      await sql`
        UPDATE domains
        SET
          status = 'completed',
          total_pages_crawled = ${stats.pagesCrawled},
          total_external_links = ${links.length},
          updated_at = NOW()
        WHERE id = ${domainId};
      `
    } else {
      const newDomain = await sql`
        INSERT INTO domains (domain_name, status, total_pages_crawled, total_external_links, crawl_depth)
        VALUES (${domainName}, 'completed', ${stats.pagesCrawled}, ${links.length}, ${depth})
        RETURNING id;
      `
      domainId = newDomain[0].id
    }

    // 2. Clear previous outgoing links and domains for this crawl (optional, but good for fresh crawls)
    // If you want to append results from resumed crawls, you might adjust this.
    // For now, let's clear to ensure fresh data for a completed crawl.
    await sql`DELETE FROM outgoing_links WHERE domain_id = ${domainId};`
    await sql`DELETE FROM outgoing_domains WHERE domain_id = ${domainId};`

    // 3. Insert all discovered external links
    if (links.length > 0) {
      console.log(`Inserting ${links.length} outgoing links into the database.`)
      for (const link of links) {
        await sql`
          INSERT INTO outgoing_links (domain_id, source_url, target_url, target_domain, anchor_text, rel_type, is_nofollow, created_at)
          VALUES (
            ${domainId},
            ${link.source_url},
            ${link.target_url},
            ${link.target_domain},
            ${link.anchor_text},
            ${link.rel_type},
            ${link.is_nofollow},
            ${link.created_at}
          );
        `
      }
      console.log(`Finished inserting outgoing links.`)
    }

    // 4. Insert/Update domain summaries
    if (domainSummary.length > 0) {
      console.log(`Inserting/Updating ${domainSummary.length} domain summaries.`)
      for (const summary of domainSummary) {
        await sql`
          INSERT INTO outgoing_domains (domain_id, target_domain, link_count, first_seen_at, last_seen_at)
          VALUES (${domainId}, ${summary.target_domain}, ${summary.link_count}, ${summary.first_seen_at}, ${summary.last_seen_at})
          ON CONFLICT (domain_id, target_domain) DO UPDATE SET
            link_count = EXCLUDED.link_count,
            last_seen_at = EXCLUDED.last_seen_at;
        `
      }
      console.log(`Finished inserting/updating domain summaries.`)
    }

    return NextResponse.json({
      success: true,
      domain: {
        domain_name: sourceDomain,
        status: "completed",
        total_external_links: links.length,
        total_pages_crawled: stats.pagesCrawled,
        crawl_date: new Date().toISOString(), // Use current date as crawl completion date
        crawl_depth: depth,
        crawl_config: {
          maxPages,
          includeSubdomains,
          followSitemaps,
          sitemapsFound: stats.sitemapsFound,
        },
      },
      totalLinks: links.length,
      domainSummary: domainSummary, // This is still the in-memory summary for immediate response
      stats: stats,
    })
  } catch (error) {
    console.error("Comprehensive crawl API error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to crawl website",
      },
      { status: 500 },
    )
  }
}

function groupLinksByDomain(links: any[]): DomainSummary[] {
  const domainMap = new Map<string, { count: number; first_seen: Date; last_seen: Date }>()

  links.forEach((link) => {
    const domain = link.target_domain
    const linkDate = new Date(link.created_at)

    if (domainMap.has(domain)) {
      const existing = domainMap.get(domain)!
      existing.count++
      if (linkDate < existing.first_seen) existing.first_seen = linkDate
      if (linkDate > existing.last_seen) existing.last_seen = linkDate
    } else {
      domainMap.set(domain, {
        count: 1,
        first_seen: linkDate,
        last_seen: linkDate,
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
