"""Shows what the AI has cost this month against the spending limit.

    npm run ai:usage                  (from the project folder)
    .venv/bin/python -m app.ai_usage  (from backend/)

Point it at the production database by running it on the server, or with DATABASE_URL set to that database.
"""

from app.init_db import initialize_database
from app.services import ai_budget, llm


def main() -> None:
    initialize_database()
    limits = ai_budget.budget()
    month = ai_budget.usage()
    print(f"AI use for {month.month} (UTC)")
    print(f"  Requests:      {month.requests}")
    print(f"  Tokens:        {month.input_tokens:,} in, {month.output_tokens:,} out")
    if limits.input_price is None or limits.output_price is None:
        print("  Cost:          unknown (set AI_INPUT_PRICE_PER_MILLION and AI_OUTPUT_PRICE_PER_MILLION)")
    else:
        # Worked out again at today's prices, so a price change shows at once.
        print(f"  Cost:          ${ai_budget.cost_of(month.input_tokens, month.output_tokens, limits):.2f}")
    if limits.limit_usd is None:
        print("  Limit:         none (set AI_MONTHLY_BUDGET_USD to add one)")
    else:
        share = month.cost_usd / limits.limit_usd * 100 if limits.limit_usd else 100
        print(f"  Limit:         ${limits.limit_usd:.2f} a month, {share:.0f}% used")
    stopped = ai_budget.refusal()
    print(f"  AI features:   {'paused: ' + stopped if stopped else 'on' if llm.is_configured() else 'off (no OPENAI_API_KEY)'}")


if __name__ == "__main__":
    main()
