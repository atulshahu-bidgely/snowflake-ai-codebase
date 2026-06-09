import csv
from langsmith import Client
from dotenv import load_dotenv

load_dotenv(override=True)

DATASET_NAME = "energy-agent-weekly"
client       = Client()

# Get or create dataset
existing = [d for d in client.list_datasets() if d.name == DATASET_NAME]
if existing:
    dataset = existing[0]
    print(f"Found existing dataset: {DATASET_NAME}")
else:
    dataset = client.create_dataset(DATASET_NAME)
    print(f"Created new dataset: {DATASET_NAME}")

# Delete existing examples
existing_examples = list(client.list_examples(dataset_id=dataset.id))
if existing_examples:
    client.delete_examples(example_ids=[e.id for e in existing_examples])
    print(f"Cleared {len(existing_examples)} old examples")

# Upload fresh examples from CSV
with open("Golden_questions.csv") as f:
    examples = list(csv.DictReader(f))

client.create_examples(
    inputs =[{"question": e["input"], "category": e["category"]}                                               for e in examples],
    outputs=[{"min": e["min"], "max": e["max"], "directory": e["directory"], "instructions": e["instructions"]} for e in examples],
    dataset_id=dataset.id,
)
print(f"✅ Dataset '{DATASET_NAME}' updated with {len(examples)} examples")
if examples:
    first = examples[0]
    print(f"\n   First example uploaded:")
    for key, value in first.items():
        print(f"     {key}: {value}")
    if len(examples) > 1:
        print(f"   ...")