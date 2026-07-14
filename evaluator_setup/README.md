# Evaluator Setup

LangSmith-based evaluation harness for the Energy AMI agent. It runs golden-question datasets against the live agent and scores each answer with a Bedrock (Claude) LLM judge across three metrics: guardrails, accuracy, and relevance.

## Files

- `evaluator.py` — main entry point. Syncs each enabled metric's CSV into its LangSmith dataset, calls the agent for every example, judges the response with Bedrock, and logs results as a LangSmith experiment.
- `dataset_handler.py` — one-time setup script. Creates each metric's LangSmith dataset (if missing) and populates it from CSV without clearing existing examples.
- `dataset_updater.py` — replaces a dataset's contents: deletes all existing examples and re-uploads fresh rows from the CSV.
- `golden_questions-accuracy.csv` — questions graded on factual/data correctness (78 rows).
- `golden_questions-guardrails.csv` — questions graded on safe handling of disallowed/out-of-scope/fabrication-risk requests (15 rows).
- `golden_questions-relevance.csv` — questions graded on whether the answer stays on-topic and responsive (7 rows).

Each CSV has columns: `input`, `category`, `instructions` (grading guidance for the judge), `pilot`, `agent`.

## How it works

1. `evaluator.py` loads `.env` file(s) for credentials and config.
2. For each enabled metric (`guardrail`, `accuracy`, `relevance` — toggle in `METRICS_TO_RUN`), if `SYNC_DATASETS` is `True`, the matching CSV is uploaded to LangSmith, replacing the dataset's contents.
3. Each dataset row is sent to the agent via `POST {BACKEND_URL}/api/agents/{agent}/messages` (agent name comes from the row, e.g. `ENERGY_AMI_AGENT_TEST`, falling back to `RAW_AGENT_NAME`/`AGENT_NAME`). The response is streamed, and the final answer text plus the last executed SQL are captured.
4. A Bedrock model (default `anthropic.claude-sonnet-4-5`) judges the answer against a per-metric rubric (0.0 / 0.5 / 1.0) and returns a score + one-line reason.
5. Results are logged to a LangSmith experiment per metric; `final_sql` is also recorded as an informational column.

## Requirements

- Python packages: `boto3`, `requests`, `python-dotenv`, `langsmith`.
- A `.env` file (or `ENV_FILE` env var) providing:
  - `LANGSMITH_API_KEY` (required)
  - `EVAL_ACCESS_API_KEY`, `EVAL_SECRET_API_KEY` — AWS credentials for Bedrock
  - `ARN_KEY`, `ID_KEY` — optional, for STS AssumeRole into a Bedrock IAM role
  - `REACT_APP_BACKEND_URL` — agent backend URL (default `http://localhost:3000`)
  - `BEDROCK_JUDGE_MODEL` (default `anthropic.claude-sonnet-4-5`), `AWS_REGION` (default `us-east-1`)
  - `AGENT_CONNECT_TIMEOUT` (10s), `AGENT_READ_TIMEOUT` (600s), `AGENT_RETRIES` (2), `EVAL_MAX_CONCURRENCY` (160)
  - `RAW_AGENT_NAME` / `AGENT_NAME` — fallback agent name if a dataset row doesn't specify one

## Usage

Initial dataset setup (create + populate, does not touch existing examples):
```bash
python dataset_handler.py
```

Replace dataset contents from CSV:
```bash
python dataset_updater.py
```

Run the evals:
```bash
python evaluator.py
```

Toggle which metrics run by editing `METRICS_TO_RUN` at the top of `evaluator.py` (or `dataset_handler.py` / `dataset_updater.py`). Set `SYNC_DATASETS = False` in `evaluator.py` to evaluate against whatever is currently in LangSmith without re-uploading the CSVs. Set `N` (`num_repetitions`) > 1 to get a score distribution for stochastic agents.

Results appear in LangSmith under Datasets & Testing, one experiment per metric (`ami-guardrails-*`, `ami-accuracy-*`, `ami-relevance-*`).
