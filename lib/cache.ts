import NodeCache from "node-cache"

const cacheTTL = 60 * 60 // 1 hour

export const crawlCache = new NodeCache({ stdTTL: cacheTTL, checkperiod: 120 })
