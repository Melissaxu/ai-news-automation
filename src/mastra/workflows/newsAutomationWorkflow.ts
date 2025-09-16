import { createWorkflow, createStep } from "../inngest";
import { z } from "zod";

// Import all the tools we created
import { newsFetchingTool } from "../tools/newsFetchingTool";
import { categorizationTool } from "../tools/categorizationTool";
import { deduplicationTool } from "../tools/deduplicationTool";
import { emailFormatterTool } from "../tools/emailFormatterTool";

// Import the summarization agent
import { summarizationAgent } from "../agents/summarizationAgent";

// Import email utility
import { sendEmail } from "../../utils/replitmail";

import { RuntimeContext } from "@mastra/core/di";

const runtimeContext = new RuntimeContext();

// Step 1: Fetch news from all sources
const fetchNewsStep = createStep({
  id: "fetch-ai-infrastructure-news",
  description: "Fetches the latest AI infrastructure and supply chain news from curated sources",
  inputSchema: z.object({
    recipientEmail: z.string().email().default("xumeng@microsoft.com").describe("Email address to send the digest to"),
    maxArticlesPerSource: z.number().default(5).describe("Maximum articles per source"),
    hoursBack: z.number().default(48).describe("Hours to look back for articles"),
  }),
  outputSchema: z.object({
    articles: z.array(z.any()),
    totalArticles: z.number(),
    sourceCount: z.number(),
    errors: z.array(z.string()).optional(),
    recipientEmail: z.string().email(),
  }),
  execute: async ({ inputData }) => {
    const { recipientEmail, maxArticlesPerSource, hoursBack } = inputData;
    
    const result = await newsFetchingTool.execute({
      context: { maxArticlesPerSource, hoursBack },
      runtimeContext,
      tracingContext: {}
    });

    return {
      ...result,
      recipientEmail,
    };
  }
});

// Step 2: Deduplicate articles
const deduplicateStep = createStep({
  id: "deduplicate-articles",
  description: "Remove duplicate news articles across sources",
  inputSchema: z.object({
    articles: z.array(z.any()),
    totalArticles: z.number(),
    sourceCount: z.number(),
    errors: z.array(z.string()).optional(),
    recipientEmail: z.string().email(),
  }),
  outputSchema: z.object({
    uniqueArticles: z.array(z.any()),
    duplicatesRemoved: z.number(),
    originalCount: z.number(),
    duplicateGroups: z.array(z.any()),
    sourceCount: z.number(),
    errors: z.array(z.string()).optional(),
    recipientEmail: z.string().email(),
  }),
  execute: async ({ inputData }) => {
    const { articles, sourceCount, errors, recipientEmail } = inputData;
    
    const result = await deduplicationTool.execute({
      context: { articles, similarityThreshold: 0.7 },
      runtimeContext,
      tracingContext: {}
    });

    return {
      ...result,
      sourceCount,
      errors,
      recipientEmail,
    };
  }
});

// Step 3: Categorize articles
const categorizeStep = createStep({
  id: "categorize-articles",
  description: "Categorize articles into the 6 specified buckets",
  inputSchema: z.object({
    uniqueArticles: z.array(z.any()),
    duplicatesRemoved: z.number(),
    originalCount: z.number(),
    duplicateGroups: z.array(z.any()),
    sourceCount: z.number(),
    errors: z.array(z.string()).optional(),
    recipientEmail: z.string().email(),
  }),
  outputSchema: z.object({
    categorizedNews: z.array(z.any()),
    uncategorizedArticles: z.array(z.any()),
    totalCategorized: z.number(),
    categoryStats: z.record(z.number()),
    duplicatesRemoved: z.number(),
    sourceCount: z.number(),
    errors: z.array(z.string()).optional(),
    recipientEmail: z.string().email(),
  }),
  execute: async ({ inputData }) => {
    const { uniqueArticles, duplicatesRemoved, sourceCount, errors, recipientEmail } = inputData;
    
    const result = await categorizationTool.execute({
      context: { articles: uniqueArticles, allowMultipleCategories: false },
      runtimeContext,
      tracingContext: {}
    });

    return {
      ...result,
      duplicatesRemoved,
      sourceCount,
      errors,
      recipientEmail,
    };
  }
});

// Step 4: Generate summaries with AI agent
const summarizeStep = createStep({
  id: "generate-summaries",
  description: "Generate summaries and supply-chain impact analysis for each article",
  inputSchema: z.object({
    categorizedNews: z.array(z.any()),
    uncategorizedArticles: z.array(z.any()),
    totalCategorized: z.number(),
    categoryStats: z.record(z.number()),
    duplicatesRemoved: z.number(),
    sourceCount: z.number(),
    errors: z.array(z.string()).optional(),
    recipientEmail: z.string().email(),
  }),
  outputSchema: z.object({
    summarizedNews: z.array(z.any()),
    duplicatesRemoved: z.number(),
    sourceCount: z.number(),
    errors: z.array(z.string()).optional(),
    recipientEmail: z.string().email(),
    totalArticles: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { categorizedNews, duplicatesRemoved, sourceCount, errors, recipientEmail } = inputData;
    
    const summarizedNews = [];
    let totalArticles = 0;

    // Process each category
    for (const categoryGroup of categorizedNews) {
      const summarizedArticles = [];
      
      // Limit to top 5 articles per category to keep digest manageable
      const articlesToProcess = categoryGroup.articles.slice(0, 5);
      totalArticles += articlesToProcess.length;
      
      for (const article of articlesToProcess) {
        try {
          // Generate concise summary using the AI agent
          const prompt = `Provide a concise 2-3 sentence summary of this news article focusing on the key business facts and implications:

Title: ${article.title}
Description: ${article.description}
Source: ${article.source}

Focus on what happened, who is involved, and why it matters for the tech industry. Be specific and avoid generic statements.`;

          const response = await summarizationAgent.generate([
            { role: "user", content: prompt }
          ], {
            resourceId: "daily-digest-summarization",
            threadId: `article-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            maxSteps: 2,
          });

          // Use the AI-generated summary directly
          const aiSummary = response.text.trim();
          
          summarizedArticles.push({
            ...article,
            summary: aiSummary || article.description.substring(0, 150) + "..."
            // Removed impact field completely since user doesn't want category info
          });
          
        } catch (error) {
          // If summarization fails, use article description as summary
          summarizedArticles.push({
            ...article,
            summary: article.description || "Summary not available."
            // Removed impact field completely since user doesn't want category info
          });
        }
      }
      
      summarizedNews.push({
        category: categoryGroup.category,
        articles: summarizedArticles
      });
    }

    return {
      summarizedNews,
      duplicatesRemoved,
      sourceCount,
      errors,
      recipientEmail,
      totalArticles,
    };
  }
});

// Step 5: Format and send email
const sendDigestStep = createStep({
  id: "send-daily-digest",
  description: "Format the daily digest and send via email",
  inputSchema: z.object({
    summarizedNews: z.array(z.any()),
    duplicatesRemoved: z.number(),
    sourceCount: z.number(),
    errors: z.array(z.string()).optional(),
    recipientEmail: z.string().email(),
    totalArticles: z.number(),
  }),
  outputSchema: z.object({
    emailSent: z.boolean(),
    messageId: z.string().optional(),
    error: z.string().optional(),
    stats: z.object({
      totalArticles: z.number(),
      sourceCount: z.number(),
      duplicatesRemoved: z.number(),
      categoriesWithContent: z.number(),
    }),
  }),
  execute: async ({ inputData }) => {
    const { summarizedNews, duplicatesRemoved, sourceCount, errors, recipientEmail, totalArticles } = inputData;
    
    // Ensure we have a valid recipient email
    const finalRecipientEmail = recipientEmail || "xumeng@microsoft.com";
    
    try {
      // Calculate stats
      const categoriesWithContent = summarizedNews.filter((cat: any) => cat.articles.length > 0).length;
      const stats = {
        totalArticles,
        sourceCount,
        duplicatesRemoved,
        categoriesWithContent,
      };

      // Format the email
      const emailContent = await emailFormatterTool.execute({
        context: { 
          categorizedNews: summarizedNews,
          stats,
        },
        runtimeContext,
        tracingContext: {}
      });

      // Send the email to primary address for daily automation
      const emailResult = await sendEmail({
        to: 'melissaxu311@gmail.com',
        subject: emailContent.subject,
        html: emailContent.htmlContent,
        text: emailContent.plainTextContent,
      });

      return {
        emailSent: true,
        messageId: emailResult.messageId,
        stats,
      };
      
    } catch (error) {
      return {
        emailSent: false,
        error: String(error),
        stats: {
          totalArticles,
          sourceCount,
          duplicatesRemoved,
          categoriesWithContent: 0,
        },
      };
    }
  }
});

// Create the main workflow
export const newsAutomationWorkflow = createWorkflow({
  id: "daily-ai-news-automation",
  description: "Daily AI infrastructure and supply-chain news automation that delivers curated, categorized digests",
  inputSchema: z.object({}), // Empty for time-based workflows
  outputSchema: z.object({
    success: z.boolean(),
    emailSent: z.boolean(),
    stats: z.object({
      totalArticles: z.number(),
      sourceCount: z.number(),
      duplicatesRemoved: z.number(),
      categoriesWithContent: z.number(),
    }),
    error: z.string().optional(),
  }),
})
  .then(fetchNewsStep)
  .then(deduplicateStep)
  .then(categorizeStep)
  .then(summarizeStep)
  .then(sendDigestStep)
  .commit();