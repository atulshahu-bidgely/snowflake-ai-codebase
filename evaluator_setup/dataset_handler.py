import csv
from langsmith import Client
from dotenv import load_dotenv

load_dotenv(override=True)
client = Client()

print("Connecting to LangSmith...")
dataset = client.create_dataset("energy-agent-weekly")
print(f"Dataset created: {dataset.id}")

with open("Golden_questions.csv") as f:
    examples = list(csv.DictReader(f))

print(f"Loaded {len(examples)} rows from CSV")

client.create_examples(
    inputs =[{"question": e["input"], "category": e["category"]}                                              for e in examples],
    outputs=[{"min": e["min"], "max": e["max"], "directory": e["directory"], "instructions": e["instructions"]} for e in examples],
    dataset_id=dataset.id,
)
print(f"✅ Created dataset with {len(examples)} examples")