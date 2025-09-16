# AI News Automation System

A comprehensive AI-powered news automation system that delivers daily curated digests of AI infrastructure and cloud supply-chain news.

## Features

- 📰 **Multi-source News Aggregation**: Fetches from TechCrunch, VentureBeat, Ars Technica, The Information, and AI News
- 🏷️ **Intelligent Categorization**: Organizes news into 6 key categories:
  - CSP & Industry
  - SI/Networking  
  - GPU/CPU & Market Commodities
  - Structural Components
  - AI Legislation/Policy
  - AI Startups & Funding
- 🤖 **AI-Powered Summaries**: Uses OpenAI to generate concise, business-focused article summaries
- 📧 **Professional Email Delivery**: Sends formatted HTML digests with deduplication
- ⏰ **Daily Automation**: Scheduled delivery at 8:00am PDT
- 🔄 **Smart Deduplication**: Ensures articles only appear in their primary category

## Technology Stack

- **Framework**: Mastra (workflow orchestration)
- **AI**: OpenAI GPT for summarization
- **Email**: ReplitMail integration
- **Database**: PostgreSQL 
- **Deployment**: Replit (with automated publishing)
- **Scheduling**: Cron-based time triggers

## System Architecture

The system operates through a 5-step workflow:

1. **News Fetching**: Retrieves articles from RSS/Atom feeds
2. **Deduplication**: Removes duplicate articles across sources  
3. **Categorization**: Classifies articles using keyword matching
4. **AI Summarization**: Generates business-focused summaries
5. **Email Delivery**: Formats and sends professional digest

## Configuration

The system is configured for:
- **Schedule**: Daily at 8:00am PDT
- **Email**: melissaxu311@gmail.com
- **Content Limit**: 5 articles per category for optimal digest length

## Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Configure environment variables for OpenAI API key
4. Set up email delivery credentials  
5. Deploy to Replit for automated scheduling

Generated on 9/16/2025 by AI News Automation System
