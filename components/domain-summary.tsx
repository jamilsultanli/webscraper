"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface DomainSummaryData {
  target_domain: string
  link_count: number
  first_seen_at: string
  last_seen_at: string
}

interface DomainSummaryProps {
  data: DomainSummaryData[]
}

export function DomainSummary({ data }: DomainSummaryProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {data.map((domain, index) => (
        <Card key={index}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg truncate" title={domain.target_domain}>
              {domain.target_domain}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Links Found:</span>
                <Badge variant="secondary">{domain.link_count}</Badge>
              </div>
              <div className="text-xs text-gray-500">
                <p>First seen: {new Date(domain.first_seen_at).toLocaleDateString()}</p>
                <p>Last seen: {new Date(domain.last_seen_at).toLocaleDateString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
