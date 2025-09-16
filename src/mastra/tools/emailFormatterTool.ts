import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { IMastraLogger } from "@mastra/core/logger";

interface CategorizedNews {
  category: string;
  articles: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: string;
    source: string;
    summary?: string;
    impact?: string;
    guid?: string;
  }>;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Los_Angeles' // PDT/PST
  });
}

function formatArticleDate(pubDate: string): string {
  try {
    const date = new Date(pubDate);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles'
    });
  } catch {
    return 'Recent';
  }
}

function generateEmailHTML(categorizedNews: CategorizedNews[], stats: any): string {
  const today = formatDate(new Date());
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Infrastructure Daily Brief - ${today}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .container {
            background-color: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            border-bottom: 3px solid #0066cc;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .header h1 {
            color: #0066cc;
            margin: 0 0 10px 0;
            font-size: 28px;
            font-weight: 600;
        }
        .header .date {
            color: #666;
            font-size: 16px;
            margin: 0;
        }
        .stats {
            background-color: #f1f8ff;
            border: 1px solid #d1ecff;
            border-radius: 6px;
            padding: 15px;
            margin-bottom: 30px;
            font-size: 14px;
            color: #0066cc;
        }
        .category {
            margin-bottom: 35px;
        }
        .category-header {
            background-color: #e8f4f8;
            border-left: 4px solid #0066cc;
            padding: 12px 20px;
            margin-bottom: 20px;
            border-radius: 0 6px 6px 0;
        }
        .category-header h2 {
            margin: 0;
            color: #004499;
            font-size: 20px;
            font-weight: 500;
        }
        .article {
            margin-bottom: 25px;
            padding-bottom: 20px;
            border-bottom: 1px solid #eee;
        }
        .article:last-child {
            border-bottom: none;
        }
        .article-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .article-title a {
            color: #0066cc;
            text-decoration: none;
        }
        .article-title a:hover {
            text-decoration: underline;
        }
        .article-meta {
            color: #666;
            font-size: 12px;
            margin-bottom: 10px;
        }
        .summary {
            margin-bottom: 8px;
            font-size: 14px;
            line-height: 1.5;
        }
        .impact {
            background-color: #fff8e1;
            border-left: 3px solid #ffb74d;
            padding: 8px 12px;
            margin-top: 8px;
            font-size: 13px;
            font-style: italic;
            color: #e65100;
        }
        .impact:before {
            content: "💡 Why it matters: ";
            font-weight: 600;
            font-style: normal;
        }
        .no-updates {
            color: #888;
            font-style: italic;
            padding: 15px;
            text-align: center;
            background-color: #f9f9f9;
            border-radius: 6px;
            border: 1px solid #eee;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 12px;
            text-align: center;
        }
        @media only screen and (max-width: 600px) {
            .container {
                padding: 20px;
            }
            .header h1 {
                font-size: 24px;
            }
            .category-header h2 {
                font-size: 18px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>AI Infrastructure Daily Brief</h1>
            <p class="date">${today}</p>
        </div>
        
        <div class="stats">
            📊 <strong>Today's Digest:</strong> ${stats.totalArticles} articles from ${stats.sourceCount} sources | 
            ${stats.duplicatesRemoved} duplicates removed | 
            Coverage across ${stats.categoriesWithContent} categories
        </div>

        ${categorizedNews.map(categoryNews => {
          if (categoryNews.articles.length === 0) {
            return `
            <div class="category">
                <div class="category-header">
                    <h2>${categoryNews.category}</h2>
                </div>
                <div class="no-updates">
                    No material updates today
                </div>
            </div>
            `;
          }
          
          return `
          <div class="category">
              <div class="category-header">
                  <h2>${categoryNews.category}</h2>
              </div>
              ${categoryNews.articles.map(article => `
              <div class="article">
                  <div class="article-title">
                      <a href="${article.link}" target="_blank">${article.title}</a>
                  </div>
                  <div class="article-meta">
                      ${article.source} | ${formatArticleDate(article.pubDate)}
                  </div>
                  ${article.summary ? `<div class="summary">${article.summary}</div>` : ''}
                  ${article.impact ? `<div class="impact">${article.impact}</div>` : ''}
              </div>
              `).join('')}
          </div>
          `;
        }).join('')}

        <div class="footer">
            <p>
                🤖 Generated by AI Infrastructure News Automation<br>
                Curated from: Bloomberg, WSJ, CNBC, TechCrunch, Wired, DatacenterKnowledge, The Register, DCD, and other trusted sources<br>
                <em>Focused on AI infrastructure, cloud supply chain, and strategic technology developments</em>
            </p>
        </div>
    </div>
</body>
</html>
  `.trim();
}

function generatePlainTextEmail(categorizedNews: CategorizedNews[], stats: any): string {
  const today = formatDate(new Date());
  
  let text = `AI Infrastructure Daily Brief - ${today}\n`;
  text += `${'='.repeat(50)}\n\n`;
  
  text += `📊 Today's Digest: ${stats.totalArticles} articles from ${stats.sourceCount} sources | `;
  text += `${stats.duplicatesRemoved} duplicates removed | `;
  text += `Coverage across ${stats.categoriesWithContent} categories\n\n`;

  for (const categoryNews of categorizedNews) {
    text += `${categoryNews.category.toUpperCase()}\n`;
    text += `${'-'.repeat(categoryNews.category.length)}\n`;
    
    if (categoryNews.articles.length === 0) {
      text += `No material updates today\n\n`;
      continue;
    }
    
    for (const article of categoryNews.articles) {
      text += `• ${article.title}\n`;
      text += `  Source: ${article.source} | ${formatArticleDate(article.pubDate)}\n`;
      text += `  Link: ${article.link}\n`;
      
      if (article.summary) {
        text += `  Summary: ${article.summary}\n`;
      }
      
      if (article.impact) {
        text += `  💡 Why it matters: ${article.impact}\n`;
      }
      
      text += `\n`;
    }
    
    text += `\n`;
  }

  text += `🤖 Generated by AI Infrastructure News Automation\n`;
  text += `Curated from trusted sources focusing on AI infrastructure, cloud supply chain, and strategic technology developments`;
  
  return text;
}

export const emailFormatterTool = createTool({
  id: "format-daily-digest-email",
  description: "Formats categorized and summarized news articles into a professional email digest with HTML and plain text versions",
  inputSchema: z.object({
    categorizedNews: z.array(z.object({
      category: z.string(),
      articles: z.array(z.object({
        title: z.string(),
        link: z.string(),
        description: z.string(),
        pubDate: z.string(),
        source: z.string(),
        summary: z.string().optional(),
        impact: z.string().optional(),
        guid: z.string().optional(),
      })),
    })),
    stats: z.object({
      totalArticles: z.number(),
      sourceCount: z.number(),
      duplicatesRemoved: z.number(),
      categoriesWithContent: z.number(),
    }),
    subject: z.string().optional(),
  }),
  outputSchema: z.object({
    htmlContent: z.string(),
    plainTextContent: z.string(),
    subject: z.string(),
    stats: z.object({
      totalCategories: z.number(),
      categoriesWithContent: z.number(),
      totalArticles: z.number(),
      avgArticlesPerCategory: z.number(),
    }),
  }),
  execute: async ({ context, mastra }) => {
    const logger = mastra?.getLogger();
    const { categorizedNews, stats, subject } = context;
    
    logger?.info('🔧 [EmailFormatter] Starting email formatting', {
      categories: categorizedNews.length,
      totalArticles: stats.totalArticles
    });

    // Generate email content
    const htmlContent = generateEmailHTML(categorizedNews, stats);
    const plainTextContent = generatePlainTextEmail(categorizedNews, stats);
    
    // Generate subject line
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles'
    });
    
    const finalSubject = subject || `AI Infrastructure Brief - ${dateStr} (${stats.totalArticles} updates)`;
    
    // Calculate email stats
    const categoriesWithContent = categorizedNews.filter(cat => cat.articles.length > 0).length;
    const avgArticlesPerCategory = categoriesWithContent > 0 
      ? Math.round(stats.totalArticles / categoriesWithContent * 10) / 10 
      : 0;

    logger?.info('✅ [EmailFormatter] Completed email formatting', {
      htmlLength: htmlContent.length,
      textLength: plainTextContent.length,
      subject: finalSubject,
      categoriesWithContent,
      avgArticlesPerCategory
    });

    return {
      htmlContent,
      plainTextContent,
      subject: finalSubject,
      stats: {
        totalCategories: categorizedNews.length,
        categoriesWithContent,
        totalArticles: stats.totalArticles,
        avgArticlesPerCategory,
      },
    };
  },
});