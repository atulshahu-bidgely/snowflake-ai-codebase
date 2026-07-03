import csv
from langsmith import Client
from dotenv import load_dotenv

load_dotenv(override=True)

# ── CONFIG ────────────────────────────────────────────────────────────────────
# One dataset per metric, each fed from its own golden-questions CSV. Flip a
# metric off here to skip it. Must stay in step with evaluator.py's registry.
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

client = Client()


def update_dataset(csv_path: str, dataset_name: str) -> int:
    """Replace a dataset's contents with the rows from its CSV."""
    existing = [d for d in client.list_datasets() if d.name == dataset_name]
    if existing:
        dataset = existing[0]
        print(f"Found existing dataset: {dataset_name}")
    else:
        dataset = client.create_dataset(dataset_name)
        print(f"Created new dataset: {dataset_name}")

    # Delete existing examples
    existing_examples = list(client.list_examples(dataset_id=dataset.id))
    if existing_examples:
        client.delete_examples(example_ids=[e.id for e in existing_examples])
        print(f"Cleared {len(existing_examples)} old examples")

    # Upload fresh examples from CSV
    with open(csv_path) as f:
        examples = list(csv.DictReader(f))

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
    print(f"✅ Dataset '{dataset_name}' updated with {len(examples)} examples")
    if examples:
        first = examples[0]
        print("   First example uploaded:")
        for key, value in first.items():
            print(f"     {key}: {value}")
        if len(examples) > 1:
            print("   ...")
    return len(examples)


if __name__ == "__main__":
    enabled = [m for m, on in METRICS_TO_RUN.items() if on]
    if not enabled:
        raise SystemExit("No metrics enabled — set at least one True in METRICS_TO_RUN.")

    for metric in enabled:
        cfg = METRIC_DATASETS[metric]
        print(f"\n── {metric.upper()} ──────────────────────────────")
        update_dataset(cfg["csv"], cfg["dataset"])

    print(f"\n✅ Done — updated {len(enabled)} dataset(s): {', '.join(enabled)}")
