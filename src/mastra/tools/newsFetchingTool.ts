import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { IMastraLogger } from "@mastra/core/logger";

// RSS feeds for each news source based on PRD specifications
const NEWS_SOURCES = {
  // Tech/business sources
  techCrunch: "https://techcrunch.com/feed/",
  wired: "https://www.wired.com/feed/",
  // Infrastructure/supply chain sources  
  datacenterKnowledge: "https://www.datacenterknowledge.com/feeds/all",
  theRegister: "https://www.theregister.com/headlines.atom",
  // Note: Some sources may need API access or different methods
  // Bloomberg and WSJ require subscription access - will use free alternatives where possible
};

// Keywords for filtering AI infrastructure and supply chain news
const AI_INFRA_KEYWORDS = [
  // GPU/CPU Keywords
  "NVIDIA", "nvidia", "TSMC", "tsmc", "HBM", "hbm", "DDR", "ddr", "GPU", "gpu", "CPU", "cpu",
  "semiconductor", "chip", "silicon", "memory", "processor",
  
  // Infrastructure Keywords
  "data center", "datacenter", "cloud", "server", "rack", "racks", "cooling", "power",
  "hyperscale", "edge computing", "quantum computing",
  
  // Supply Chain Keywords
  "supply chain", "tariffs", "export control", "fab", "foundry", "manufacturing",
  "Foxconn", "foxconn", "Wistron", "wistron", "Vertiv", "vertiv",
  
  // AI/ML Keywords
  "artificial intelligence", "machine learning", "AI", "ML", "LLM", "large language model",
  "training", "inference", "model", "algorithm",
  
  // Networking Keywords
  "5G", "6G", "network", "ethernet", "bandwidth", "fiber", "connectivity",
  
  // Companies Keywords
  "Microsoft", "Google", "Amazon", "AWS", "Azure", "GCP", "Meta", "OpenAI",
  "Broadcom", "broadcom", "SK hynix", "sk hynix", "Intel", "intel", "AMD", "amd"
];

interface NewsArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  guid?: string;
}

async function parseRSSFeed(url: string, sourceName: string, logger?: IMastraLogger): Promise<NewsArticle[]> {
  try {
    logger?.info(`🔧 [NewsFetching] Fetching RSS feed from ${sourceName}`, { url });
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'AI News Automation Bot/1.0 (Supply Chain News Digest)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      logger?.error(`❌ [NewsFetching] Failed to fetch ${sourceName}`, { 
        status: response.status, 
        statusText: response.statusText 
      });
      return [];
    }

    const xmlText = await response.text();
    
    // Basic XML parsing for RSS feeds
    // In production, you'd want to use a proper XML parser library
    const articles: NewsArticle[] = [];
    
    // Extract items using regex (simple approach) - support both RSS and Atom formats
    const itemMatches = xmlText.match(/<item[^>]*>([\s\S]*?)<\/item>/gi) || [];
    const entryMatches = xmlText.match(/<entry[^>]*>([\s\S]*?)<\/entry>/gi) || [];
    const allMatches = [...itemMatches, ...entryMatches];
    
    logger?.info(`📊 [NewsFetching] Found ${itemMatches.length} RSS items and ${entryMatches.length} Atom entries from ${sourceName}`);
    
    for (const itemMatch of allMatches.slice(0, 10)) { // Limit to 10 articles per source
      const title = extractXmlTag(itemMatch, 'title');
      const link = extractXmlTag(itemMatch, 'link') || extractLinkHref(itemMatch);
      const description = extractXmlTag(itemMatch, 'description') || extractXmlTag(itemMatch, 'summary');
      const pubDate = extractXmlTag(itemMatch, 'pubDate') || extractXmlTag(itemMatch, 'published') || extractXmlTag(itemMatch, 'updated');
      const guid = extractXmlTag(itemMatch, 'guid');
      
      if (title && link) {
        // Filter articles based on AI infrastructure keywords
        const articleText = `${title} ${description}`.toLowerCase();
        const hasRelevantKeyword = AI_INFRA_KEYWORDS.some(keyword => 
          articleText.includes(keyword.toLowerCase())
        );
        
        if (hasRelevantKeyword) {
          articles.push({
            title: cleanText(title),
            link: link.trim(),
            description: cleanText(description || ''),
            pubDate: pubDate || new Date().toISOString(),
            source: sourceName,
            guid: guid || link
          });
        }
      }
    }
    
    logger?.info(`✅ [NewsFetching] Found ${articles.length} relevant articles from ${sourceName}`);
    return articles;
    
  } catch (error) {
    logger?.error(`❌ [NewsFetching] Error parsing RSS feed from ${sourceName}`, { error: String(error) });
    return [];
  }
}

function extractXmlTag(xml: string, tagName: string): string {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : '';
}

function extractLinkHref(xml: string): string {
  // For Atom feeds, links are often in href attributes: <link rel="alternate" href="..."/>
  const regex = /<link[^>]*href=["']([^"']+)["'][^>]*>/i;
  const match = xml.match(regex);
  return match ? match[1] : '';
}

function cleanText(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

export const newsFetchingTool = createTool({
  id: "fetch-ai-infrastructure-news",
  description: "Fetches the latest AI infrastructure and supply chain news from curated sources, filtered by relevant keywords",
  inputSchema: z.object({
    maxArticlesPerSource: z.number().default(10).describe("Maximum number of articles to fetch per source"),
    hoursBack: z.number().default(24).describe("How many hours back to look for articles"),
  }),
  outputSchema: z.object({
    articles: z.array(z.object({
      title: z.string(),
      link: z.string(),
      description: z.string(),
      pubDate: z.string(),
      source: z.string(),
      guid: z.string().optional(),
    })),
    totalArticles: z.number(),
    sourceCount: z.number(),
    errors: z.array(z.string()).optional(),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    
    // Ensure robust defaults to prevent Invalid Date issues
    const maxArticlesPerSource = Number.isFinite(context?.maxArticlesPerSource) ? context.maxArticlesPerSource : 10;
    const hoursBack = Number.isFinite(context?.hoursBack) ? context.hoursBack : 48;
    
    logger?.info('🔧 [NewsFetching] Starting news aggregation', { 
      maxArticlesPerSource, 
      hoursBack,
      sources: Object.keys(NEWS_SOURCES).length
    });

    const allArticles: NewsArticle[] = [];
    const errors: string[] = [];
    let successfulSources = 0;

    // Fetch from all RSS sources
    for (const [sourceName, rssUrl] of Object.entries(NEWS_SOURCES)) {
      try {
        const articles = await parseRSSFeed(rssUrl, sourceName, logger);
        
        // Filter by time window
        const cutoffDate = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
        logger?.info(`🕒 [NewsFetching] Time filter for ${sourceName}`, { 
          hoursBack, 
          cutoffDate: cutoffDate.toISOString(),
          totalArticles: articles.length 
        });
        
        const recentArticles = articles.filter(article => {
          try {
            const articleDate = new Date(article.pubDate);
            return articleDate >= cutoffDate;
          } catch {
            return true; // Include articles with invalid dates
          }
        });
        
        logger?.info(`📊 [NewsFetching] After time filtering ${sourceName}`, { 
          before: articles.length, 
          after: recentArticles.length 
        });

        allArticles.push(...recentArticles.slice(0, maxArticlesPerSource));
        if (articles.length > 0) {
          successfulSources++;
        }
      } catch (error) {
        const errorMsg = `Failed to fetch from ${sourceName}: ${String(error)}`;
        logger?.error(`❌ [NewsFetching] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    // Sort articles by publication date (newest first)
    allArticles.sort((a, b) => {
      try {
        return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
      } catch {
        return 0;
      }
    });

    logger?.info(`✅ [NewsFetching] Completed news aggregation`, {
      totalArticles: allArticles.length,
      sourceCount: successfulSources,
      errorCount: errors.length
    });

    return {
      articles: allArticles,
      totalArticles: allArticles.length,
      sourceCount: successfulSources,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});