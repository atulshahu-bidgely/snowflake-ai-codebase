import csv
from langsmith import Client
from dotenv import load_dotenv

load_dotenv(override=True)
client = Client()

DATASET_NAME = "energy-agent-weekly-railway"

print("Connecting to LangSmith...")
existing = [d for d in client.list_datasets() if d.name == DATASET_NAME]
if existing:
    dataset = existing[0]
    print(f"Found existing dataset: {DATASET_NAME} ({dataset.id})")
else:
    dataset = client.create_dataset(DATASET_NAME)
    print(f"Dataset created: {dataset.id}")

with open("Golden_questions.csv") as f:
    examples = list(csv.DictReader(f))

print(f"Loaded {len(examples)} rows from CSV")

client.create_examples(
    inputs =[{"question": e["input"], "category": e.get("category", "")} for e in examples],
    outputs=[{"instructions": e.get("instructions", "")}                 for e in examples],
    dataset_id=dataset.id,
)
print(f"✅ Created dataset with {len(examples)} examples")
