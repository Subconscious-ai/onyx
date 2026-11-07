import type { IconFunctionComponent } from "@opal/types";
import {
  SvgLineChartUp,
  SvgBullhorn,
  SvgCode,
  SvgLightbulbSimple,
  SvgPieChart,
} from "@opal/icons";

export interface BuildPrompt {
  id: string;
  /** Sentence-length description shown in the expanded prompt list */
  summary: string;
  /** Full prompt text inserted into the input bar */
  fullText: string;
}

export interface UseCaseDomain {
  id: string;
  label: string;
  icon: IconFunctionComponent;
  prompts: BuildPrompt[];
}

export const useCaseDomains: UseCaseDomain[] = [
  {
    id: "market-research",
    label: "Market research",
    icon: SvgPieChart,
    prompts: [
      {
        id: "market-pricing",
        summary:
          "Find what simulated buyers would pay, with a priced pilot first",
        fullText:
          "Run a pricing study with Expected Parrot: would simulated US coffee drinkers buy a 12 oz canned cold brew at $2.49, $2.99 or $3.49? Two segments, students and office workers, 20 respondents each.",
      },
      {
        id: "market-concept",
        summary: "Test an ad or concept image on two simulated segments",
        fullText:
          "I attached our new ad. Test it with Expected Parrot on 20 simulated shoppers, 10 under 30 and 10 over 50: how appealing it is (1 to 5), the main message they take away, and whether they would try the product. Chart appeal by group.",
      },
      {
        id: "market-conjoint",
        summary: "Run a conjoint to see which features drive choice by segment",
        fullText:
          "Run a choice-based conjoint with Expected Parrot for a meal-kit subscription. Attributes: price per meal ($8, $10, $12), meals per week (3, 5), delivery (weekly, every two weeks). Two segments, single adults and parents of young children, 15 respondents each. Show attribute importance by segment.",
      },
      {
        id: "market-message",
        summary: "Compare two messages for clarity and appeal",
        fullText:
          "Compare two onboarding messages with Expected Parrot, 'Set up your account in three steps.' and 'Create your profile, connect your bank, and start saving.', on simulated new and experienced users. Ask how clear and how motivating each one is and chart the results.",
      },
    ],
  },
  {
    id: "engineering",
    label: "Engineering",
    icon: SvgCode,
    prompts: [
      {
        id: "eng-oncall",
        summary:
          "Track on-call rotations and post each week's schedule to Slack",
        fullText:
          "Spin up an on-call rotation tracker from PagerDuty and Slack. Every week send a message in Slack for who is on-call for the week.",
      },
      {
        id: "eng-sprint-health",
        summary: "Build a sprint health dashboard from your Linear cycle data",
        fullText:
          "Build a sprint health dashboard from your Linear cycle data.",
      },
      {
        id: "eng-release-notes",
        summary: "Generate release notes from a milestone's merged PRs",
        fullText: "Generate release notes from this milestone's merged PRs.",
      },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    icon: SvgLineChartUp,
    prompts: [
      {
        id: "sales-account-brief",
        summary:
          "Build a one-page account brief before every call from Salesforce, Slack, and Gong",
        fullText:
          "Build a one-page account brief before every call — from Salesforce, Slack, and Gong.",
      },
      {
        id: "sales-winloss",
        summary:
          "Turn this quarter's closed-won deals into a win/loss dashboard",
        fullText:
          "Turn this quarter's closed-won deals into a win/loss dashboard.",
      },
      {
        id: "sales-battlecard",
        summary:
          "Build a competitor battlecard from recent lost-deal call transcripts",
        fullText:
          "Build a competitor battlecard from recent lost-deal call transcripts.",
      },
      {
        id: "sales-pipeline-tracker",
        summary:
          "Spin up a pipeline tracker that flags deals with no activity in 14 days",
        fullText:
          "Spin up a pipeline tracker that flags deals with no activity in 14 days.",
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: SvgBullhorn,
    prompts: [
      {
        id: "marketing-seo",
        summary:
          "Turn sales-call transcripts into an SEO keyword research report",
        fullText:
          "Turn sales-call transcripts into an SEO keyword research report.",
      },
      {
        id: "marketing-customer-story",
        summary:
          "Assemble a customer-story one-pager from interview transcripts",
        fullText:
          "Assemble a customer-story one-pager from interview transcripts.",
      },
      {
        id: "marketing-social-posts",
        summary: "Draft on-brand social posts from this product launch doc",
        fullText: "Draft on-brand social posts from this product launch doc.",
      },
    ],
  },
  {
    id: "product",
    label: "Product",
    icon: SvgLightbulbSimple,
    prompts: [
      {
        id: "product-daily-brief",
        summary:
          "Brief me on everything that happened across my projects today",
        fullText:
          "Brief me for the day — tell me everything that happened for every project I was working on.",
      },
      {
        id: "product-prototype",
        summary: "Turn this PRD into a clickable prototype to test with users",
        fullText:
          "Turn this PRD into a clickable prototype to test with users.",
      },
      {
        id: "product-roadmap",
        summary: "Spin up a roadmap tracker from your Linear projects",
        fullText: "Spin up a roadmap tracker from your Linear projects.",
      },
      {
        id: "product-feature-matrix",
        summary: "Build a competitor feature-comparison matrix",
        fullText: "Build a competitor feature-comparison matrix.",
      },
    ],
  },
];
