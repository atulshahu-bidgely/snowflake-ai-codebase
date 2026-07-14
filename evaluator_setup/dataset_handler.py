import csv
from langsmith import Client
from dotenv import load_dotenv

load_dotenv(override=True)
client = Client()

# ── CONFIG ────────────────────────────────────────────────────────────────────
# One dataset per metric, each fed from its own golden-questions CSV. Flip a
# metric off here to skip it. Must stay in step with evaluator.py's registry.
# This script CREATES/POPULATES datasets (initial setup); it does not clear
# existing examples — use dataset_updater.py to replace contents.
METRICS_TO_RUN = {
    "guardrail": True,
    "accuracy":  True,
    "relevance": True,
    "language":  True,
}

METRIC_DATASETS = {
    "guardrail": {"csv": "golden_questions-guardrails.csv", "dataset": "energy-ami-agent-guardrails"},
    "accuracy":  {"csv": "golden_questions-accuracy.csv",   "dataset": "energy-ami-agent-accuracy"},
    "relevance": {"csv": "golden_questions-relevance.csv",  "dataset": "energy-ami-agent-relevance"},
    "language":  {"csv": "golden_questions-language.csv",   "dataset": "energy-ami-agent-language"},
}


def handle_dataset(csv_path: str, dataset_name: str) -> int:
    """Get-or-create a dataset and load examples from its CSV."""
    existing = [d for d in client.list_datasets() if d.name == dataset_name]
    if existing:
        dataset = existing[0]
        print(f"Found existing dataset: {dataset_name} ({dataset.id})")
    else:
        dataset = client.create_dataset(dataset_name)
        print(f"Dataset created: {dataset.id}")

    with open(csv_path) as f:
        examples = list(csv.DictReader(f))

    print(f"Loaded {len(examples)} rows from {csv_path}")

    # pilot + agent travel in the inputs so the evaluator can route each row to
    # its own ENERGY_AMI_AGENT_<pilot> agent.
    client.create_examples(
        inputs=[{
            "question": e["input"],
            "category": e.get("category", ""),
            "pilot":    e.get("pilot", ""),
            "agent":    e.get("agent", ""),
        } for e in examples],
        outputs=[{"instructions": e.get("instructions", "")} for e in examples],
        dataset_id=dataset.id,
    )
    print(f"✅ Loaded dataset '{dataset_name}' with {len(examples)} examples")
    return len(examples)


if __name__ == "__main__":
    print("Connecting to LangSmith...")
    enabled = [m for m, on in METRICS_TO_RUN.items() if on]
    if not enabled:
        raise SystemExit("No metrics enabled — set at least one True in METRICS_TO_RUN.")

    for metric in enabled:
        cfg = METRIC_DATASETS[metric]
        print(f"\n── {metric.upper()} ──────────────────────────────")
        handle_dataset(cfg["csv"], cfg["dataset"])

    print(f"\n✅ Done — handled {len(enabled)} dataset(s): {', '.join(enabled)}")
