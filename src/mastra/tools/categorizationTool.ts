import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { IMastraLogger } from "@mastra/core/logger";

// Category definitions from PRD
export const NEWS_CATEGORIES = {
  CSP_INDUSTRY: "CSP & Industry",
  SI_NETWORKING: "SI/Networking", 
  GPU_CPU_COMMODITIES: "GPU/CPU & Market Commodities",
  STRUCTURAL_COMPONENTS: "Structural Components",
  AI_LEGISLATION: "AI Legislation/Policy",
  STARTUPS_FUNDING: "AI Startups & Funding"
} as const;

// Keywords for each category based on PRD specifications
const CATEGORY_KEYWORDS = {
  [NEWS_CATEGORIES.CSP_INDUSTRY]: [
    "cloud service provider", "CSP", "hyperscale", "data center", "datacenter",
    "Microsoft", "Azure", "Amazon", "AWS", "Google", "GCP", "cloud platform",
    "public cloud", "private cloud", "hybrid cloud", "multi-cloud", "SaaS", "PaaS", "IaaS",
    "enterprise", "digital transformation", "cloud migration", "workload"
  ],
  
  [NEWS_CATEGORIES.SI_NETWORKING]: [
    "system integrator", "SI", "network", "networking", "ethernet", "5G", "6G",
    "connectivity", "bandwidth", "fiber", "optical", "router", "switch",
    "infrastructure", "telecommunications", "telecom", "carrier", "ISP",
    "edge computing", "CDN", "latency", "throughput", "protocol"
  ],
  
  [NEWS_CATEGORIES.GPU_CPU_COMMODITIES]: [
    "GPU", "gpu", "graphics", "NVIDIA", "nvidia", "AMD", "amd", "Intel", "intel",
    "CPU", "cpu", "processor", "chip", "semiconductor", "silicon", "wafer",
    "HBM", "hbm", "DDR", "ddr", "memory", "DRAM", "SRAM", "storage",
    "TSMC", "tsmc", "foundry", "fab", "manufacturing", "yield", "node",
    "commodity", "pricing", "market", "supply", "demand", "shortage"
  ],
  
  [NEWS_CATEGORIES.STRUCTURAL_COMPONENTS]: [
    "rack", "racks", "server", "cooling", "HVAC", "power", "UPS", "PSU",
    "cabinet", "enclosure", "blade", "chassis", "motherboard", "PCB",
    "connector", "cable", "thermal", "airflow", "liquid cooling",
    "Vertiv", "vertiv", "mechanical", "electrical", "structural",
    "facility", "building", "construction", "installation"
  ],
  
  [NEWS_CATEGORIES.AI_LEGISLATION]: [
    "regulation", "policy", "legislation", "law", "legal", "compliance",
    "government", "federal", "state", "EU", "European Union", "Congress",
    "Senate", "House", "bill", "act", "rule", "ruling", "court",
    "privacy", "GDPR", "data protection", "export control", "tariff",
    "trade war", "sanctions", "antitrust", "monopoly", "ethics",
    "AI safety", "responsible AI", "governance", "oversight"
  ],
  
  [NEWS_CATEGORIES.STARTUPS_FUNDING]: [
    "startup", "funding", "investment", "venture capital", "VC", "Series A",
    "Series B", "Series C", "seed", "angel", "IPO", "acquisition", "merger",
    "valuation", "raise", "round", "investor", "equity", "private equity",
    "AI startup", "machine learning", "artificial intelligence", "LLM",
    "large language model", "generative AI", "ChatGPT", "OpenAI",
    "unicorn", "billion", "million", "exit", "bootstrap"
  ]
};

interface CategorizedNews {
  category: string;
  articles: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    source: string;
    guid?: string;
  }>;
}

function categorizeArticle(article: any, logger?: IMastraLogger): string[] {
  const articleText = `${article.title} ${article.description}`.toLowerCase();
  const categories: string[] = [];
  
  // Check each category's keywords
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const matches = keywords.filter(keyword => 
      articleText.includes(keyword.toLowerCase())
    );
    
    if (matches.length > 0) {
      categories.push(category);
      logger?.debug(`📝 [Categorization] Article "${article.title}" matched ${category}`, { 
        matchedKeywords: matches.slice(0, 3) // Log first 3 matches
      });
    }
  }
  
  // If no categories match, try to infer from source-specific patterns
  if (categories.length === 0) {
    // Default fallback based on common AI/tech patterns
    const aiPatterns = ["AI", "artificial intelligence", "machine learning", "neural", "algorithm"];
    const hasAI = aiPatterns.some(pattern => articleText.includes(pattern.toLowerCase()));
    
    if (hasAI) {
      categories.push(NEWS_CATEGORIES.CSP_INDUSTRY); // Default AI articles to CSP & Industry
    }
  }
  
  return categories;
}

export const categorizationTool = createTool({
  id: "categorize-news-articles",
  description: "Categorizes news articles into the 6 specified buckets: CSP & Industry, SI/Networking, GPU/CPU & Commodities, Structural Components, AI Legislation, and Startups/Funding",
  inputSchema: z.object({
    articles: z.array(z.object({
      title: z.string(),
      link: z.string(),
      description: z.string(),
      pubDate: z.string(),
      source: z.string(),
      guid: z.string().optional(),
    })),
    allowMultipleCategories: z.boolean().default(true).describe("Allow articles to appear in multiple categories"),
  }),
  outputSchema: z.object({
    categorizedNews: z.array(z.object({
      category: z.string(),
      articles: z.array(z.object({
        title: z.string(),
        link: z.string(),
        description: z.string(),
        pubDate: z.string(),
        source: z.string(),
        guid: z.string().optional(),
      })),
    })),
    uncategorizedArticles: z.array(z.object({
      title: z.string(),
      link: z.string(),
      description: z.string(),
      pubDate: z.string(),
      source: z.string(),
      guid: z.string().optional(),
    })),
    totalCategorized: z.number(),
    categoryStats: z.record(z.number()),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { articles, allowMultipleCategories } = context;
    
    logger?.info('🔧 [Categorization] Starting article categorization', { 
      totalArticles: articles.length,
      allowMultipleCategories
    });

    const categorizedNews: { [key: string]: any[] } = {};
    const uncategorizedArticles: any[] = [];
    const categoryStats: { [key: string]: number } = {};
    
    // Initialize category buckets
    Object.values(NEWS_CATEGORIES).forEach(category => {
      categorizedNews[category] = [];
      categoryStats[category] = 0;
    });

    // Process each article
    for (const article of articles) {
      const matchedCategories = categorizeArticle(article, logger);
      
      if (matchedCategories.length > 0) {
        if (allowMultipleCategories) {
          // Add to all matched categories
          matchedCategories.forEach(category => {
            categorizedNews[category].push(article);
            categoryStats[category]++;
          });
        } else {
          // Add to first matched category only
          const primaryCategory = matchedCategories[0];
          categorizedNews[primaryCategory].push(article);
          categoryStats[primaryCategory]++;
        }
      } else {
        uncategorizedArticles.push(article);
        logger?.debug(`📝 [Categorization] Article not categorized: "${article.title}"`);
      }
    }

    // Convert to output format
    const result = Object.entries(categorizedNews).map(([category, categoryArticles]) => ({
      category,
      articles: categoryArticles
    }));

    const totalCategorized = Object.values(categoryStats).reduce((sum, count) => sum + count, 0);
    
    logger?.info('✅ [Categorization] Completed article categorization', {
      totalCategorized,
      uncategorized: uncategorizedArticles.length,
      categoryStats
    });

    return {
      categorizedNews: result,
      uncategorizedArticles,
      totalCategorized,
      categoryStats,
    };
  },
});