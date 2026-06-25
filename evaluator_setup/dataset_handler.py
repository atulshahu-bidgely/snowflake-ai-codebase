import csv
from langsmith import Client
from dotenv import load_dotenv

load_dotenv(override=True)
client = Client()

# Fresh dataset for the per-pilot ENERGY_AMI_AGENT_* experiment
# (replaces the old "energy-agent-weekly-railway" demo dataset).
DATASET_NAME = "energy-ami-agent-pilots"

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

# pilot + agent travel in the inputs so the evaluator can route each row to its
# own ENERGY_AMI_AGENT_<pilot> agent.
client.create_examples(
    inputs =[{
        "question": e["input"],
        "category": e.get("category", ""),
        "pilot":    e.get("pilot", ""),
        "agent":    e.get("agent", ""),
    } for e in examples],
    outputs=[{"instructions": e.get("instructions", "")} for e in examples],
    dataset_id=dataset.id,
)
print(f"✅ Created dataset with {len(examples)} examples")
