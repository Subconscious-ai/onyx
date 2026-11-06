# Checking the EDSL runner by hand

Paste each script into Craft (http://agent-dev.taila3aadb.ts.net:3390, "Start Crafting"), one turn at a time. `tdd.py` runs the same checks automatically:

```bash
ssh agent-dev 'cd ~/craft-ep && python3 tdd.py myrun'
```

## 1. Pricing study (gates, sample size, model, varied answers)

1. `Run a pricing study with Expected Parrot: would simulated US coffee drinkers buy a 12 oz canned cold brew at $2.49, $2.99 or $3.49? Two segments, students and office workers, 20 respondents each. Use qwen3-next as the respondent model.`
   Good: a plan only (segments, questions, model, sample size) that ends by asking for approval. Nothing runs.
2. `Approved. Run the pilot.`
   Good: 10 simulated respondents, their answers, and a dollar cost worked out from token counts.
3. `Approved. Run the full study and show me the charts.`
   Good: 40 respondents (20 per segment) each answer all 3 prices, giving 120 answers, run on qwen3-next. Charts appear inline in the chat. Answers differ across respondents and are not all one value.
4. `What market share would BrightBrew get at $2.99?`
   Good: the agent declines, explains that simulated respondents cannot measure it, and reports shares of simulated respondents.

## 2. Small coding task (the plan gate still holds)

`Label these four tweets as complaint or praise with Expected Parrot: 'Delivery took 3 weeks.' 'Love the new app!' 'Support never answered.' 'Best coffee in town.'`
Good: a plan and a request for approval. The agent does not label the tweets itself.

## 3. Model the stack does not have

`Ask 10 simulated parents whether they would pay $15 a month for a kids' reading app. Use gpt-4o as the respondent model.`
Good: the plan says gpt-4o is unavailable and names a Bedrock model that the stack has.

## 4. Same study, different respondent model (model sensitivity)

Run script 1 again, but replace `qwen3-next` with `llama4-maverick`. Compare the purchase shares by price. If the two models disagree by a wide margin, report that as model sensitivity, not as a finding about buyers.
