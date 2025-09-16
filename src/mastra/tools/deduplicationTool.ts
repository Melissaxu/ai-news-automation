import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { IMastraLogger } from "@mastra/core/logger";

interface NewsArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  source: string;
  guid?: string;
}

// Source reliability ranking based on PRD preferences
const SOURCE_RELIABILITY_RANK: { [key: string]: number } = {
  // Tier 1: Premium business sources
  "bloomberg": 1,
  "wsj": 2, 
  "wall street journal": 2,
  
  // Tier 2: Major tech outlets
  "techcrunch": 3,
  "wired": 4,
  "cnbc": 5,
  
  // Tier 3: Infrastructure specialists
  "datacenterknowledge": 6,
  "theregister": 7,
  "the register": 7,
  "datacenterdynamics": 8,
  "dcd": 8,
  "digitalinfranetwork": 9,
  
  // Tier 4: Regional/specialized
  "trendforce": 10,
  "taipei times": 11,
  
  // Default for unknown sources
  "unknown": 99
};

function getSourceReliabilityScore(source: string): number {
  const normalizedSource = source.toLowerCase().trim();
  
  // Try exact match first
  if (SOURCE_RELIABILITY_RANK[normalizedSource]) {
    return SOURCE_RELIABILITY_RANK[normalizedSource];
  }
  
  // Try partial matching for common variations
  for (const [key, score] of Object.entries(SOURCE_RELIABILITY_RANK)) {
    if (normalizedSource.includes(key) || key.includes(normalizedSource)) {
      return score;
    }
  }
  
  return SOURCE_RELIABILITY_RANK.unknown;
}

function calculateSimilarity(text1: string, text2: string): number {
  // Simple word-based similarity calculation
  const words1 = text1.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const words2 = text2.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const intersection = words1.filter(word => words2.includes(word));
  const union = new Set([...words1, ...words2]);
  
  return intersection.length / union.size;
}

function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove tracking parameters and normalize
    return urlObj.hostname + urlObj.pathname;
  } catch {
    return url.toLowerCase().trim();
  }
}

function areArticlesSimilar(article1: NewsArticle, article2: NewsArticle): boolean {
  // Check for exact URL match (after normalization)
  if (normalizeUrl(article1.link) === normalizeUrl(article2.link)) {
    return true;
  }
  
  // Check for GUID match
  if (article1.guid && article2.guid && article1.guid === article2.guid) {
    return true;
  }
  
  // Check for title similarity (threshold: 0.7 for high similarity)
  const titleSimilarity = calculateSimilarity(article1.title, article2.title);
  if (titleSimilarity > 0.7) {
    return true;
  }
  
  // Check for high similarity in both title and description
  const descSimilarity = calculateSimilarity(article1.description, article2.description);
  if (titleSimilarity > 0.5 && descSimilarity > 0.5) {
    return true;
  }
  
  return false;
}

function selectBestArticle(duplicates: NewsArticle[], logger?: IMastraLogger): NewsArticle {
  // Sort by source reliability (lower score = more reliable)
  duplicates.sort((a, b) => {
    const scoreA = getSourceReliabilityScore(a.source);
    const scoreB = getSourceReliabilityScore(b.source);
    
    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }
    
    // If same reliability, prefer more detailed description
    return b.description.length - a.description.length;
  });
  
  const selected = duplicates[0];
  logger?.debug(`📝 [Deduplication] Selected article from ${selected.source}`, {
    title: selected.title.substring(0, 60) + "...",
    duplicateCount: duplicates.length,
    sources: duplicates.map(d => d.source)
  });
  
  return selected;
}

export const deduplicationTool = createTool({
  id: "deduplicate-news-articles",
  description: "Identifies and removes duplicate news stories across sources, keeping the most reliable and detailed version",
  inputSchema: z.object({
    articles: z.array(z.object({
      title: z.string(),
      link: z.string(), 
      description: z.string(),
      pubDate: z.string(),
      source: z.string(),
      guid: z.string().optional(),
    })),
    similarityThreshold: z.number().default(0.7).describe("Threshold for considering articles as duplicates (0.0-1.0)"),
  }),
  outputSchema: z.object({
    uniqueArticles: z.array(z.object({
      title: z.string(),
      link: z.string(),
      description: z.string(), 
      pubDate: z.string(),
      source: z.string(),
      guid: z.string().optional(),
    })),
    duplicatesRemoved: z.number(),
    originalCount: z.number(),
    duplicateGroups: z.array(z.object({
      selectedArticle: z.object({
        title: z.string(),
        source: z.string(),
      }),
      duplicateCount: z.number(),
      duplicateSources: z.array(z.string()),
    })),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { articles, similarityThreshold } = context;
    
    logger?.info('🔧 [Deduplication] Starting article deduplication', { 
      totalArticles: articles.length,
      similarityThreshold
    });

    const uniqueArticles: NewsArticle[] = [];
    const duplicateGroups: any[] = [];
    const processed = new Set<number>();

    // Find duplicate groups
    for (let i = 0; i < articles.length; i++) {
      if (processed.has(i)) continue;
      
      const currentArticle = articles[i];
      const duplicates: NewsArticle[] = [currentArticle];
      processed.add(i);
      
      // Find all duplicates of current article
      for (let j = i + 1; j < articles.length; j++) {
        if (processed.has(j)) continue;
        
        const otherArticle = articles[j];
        
        if (areArticlesSimilar(currentArticle, otherArticle)) {
          duplicates.push(otherArticle);
          processed.add(j);
        }
      }
      
      // Select the best article from the duplicate group
      const selectedArticle = selectBestArticle(duplicates, logger);
      uniqueArticles.push(selectedArticle);
      
      // Track duplicate group info
      if (duplicates.length > 1) {
        duplicateGroups.push({
          selectedArticle: {
            title: selectedArticle.title,
            source: selectedArticle.source,
          },
          duplicateCount: duplicates.length,
          duplicateSources: duplicates.map(d => d.source),
        });
      }
    }

    const duplicatesRemoved = articles.length - uniqueArticles.length;
    
    logger?.info('✅ [Deduplication] Completed article deduplication', {
      originalCount: articles.length,
      uniqueCount: uniqueArticles.length,
      duplicatesRemoved,
      duplicateGroups: duplicateGroups.length
    });

    return {
      uniqueArticles,
      duplicatesRemoved,
      originalCount: articles.length,
      duplicateGroups,
    };
  },
});