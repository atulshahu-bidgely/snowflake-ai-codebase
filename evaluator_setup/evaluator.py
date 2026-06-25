import os
import re
import json
import time
import boto3
import requests
from langsmith import Client as LangSmithClient, traceable
from langsmith.evaluation import evaluate
from pathlib import Path
from dotenv import load_dotenv, find_dotenv


def _load_env() -> list[str]:
    """Load every project .env so vars split across files all resolve.
    Precedence: real shell env > $ENV_FILE > first .env that defines a key."""
    here = Path(__file__).resolve().parent
    loaded: list[str] = []

    explicit = os.getenv("ENV_FILE")
    if explicit and Path(explicit).is_file():
        load_dotenv(explicit, override=True)
        loaded.append(explicit)

    candidates: list[Path] = []
    for pat in ("**/.env", "**/.env.*"):
        candidates += sorted(here.glob(pat))
    for p in candidates:
        if "node_modules" in p.parts or not p.is_file():
            continue
        load_dotenv(p, override=False)
        loaded.append(str(p))

    if not loaded:
        fallback = find_dotenv(usecwd=True)
        if fallback:
            load_dotenv(fallback, override=False)
            loaded.append(fallback)
    return loaded


_loaded_env = _load_env()
print(f"✅ Loaded env from: {', '.join(_loaded_env) if _loaded_env else '(none found)'}")

if not os.getenv("LANGSMITH_API_KEY"):
    raise EnvironmentError("❌ LANGSMITH_API_KEY not found — check your .env file(s)")
print("✅ LANGSMITH_API_KEY loaded")

BACKEND_URL   = os.getenv("REACT_APP_BACKEND_URL", "http://localhost:3000")

# server.js takes the agent strictly from the URL path (req.params.agentName) and
# never from env. Each dataset row now carries its own per-pilot agent
# ("agent" field, e.g. ENERGY_AMI_AGENT_PSEG_LI); RAW_AGENT_NAME / AGENT_NAME is only
# a fallback when a row has no agent. Names must start with "ENERGY" (server's
# isEnergyAgent gate) and are case-sensitive.
AGENT         = (os.getenv("RAW_AGENT_NAME") or os.getenv("AGENT_NAME") or "").strip()

BEDROCK_MODEL = os.getenv("BEDROCK_JUDGE_MODEL", "anthropic.claude-sonnet-4-5")
AWS_REGION    = os.getenv("AWS_REGION", "us-east-1")

print(f"🤖 Bedrock judge: model={BEDROCK_MODEL} | region={AWS_REGION}")
print(f"🎯 Agent (fallback): {AGENT or '(per-row from dataset)'}")
print(f"📡 Backend: {BACKEND_URL}")

ls_client = LangSmithClient()

_last_bedrock_error: str | None = None


def get_bedrock_client():
    """Bedrock runtime client using EVAL_* creds. STS AssumeRole only when ARN_KEY
    is a real IAM role ARN (contains ':role/')."""
    access_key = os.getenv("EVAL_ACCESS_API_KEY")
    secret_key = os.getenv("EVAL_SECRET_API_KEY")
    arn        = os.getenv("ARN_KEY")
    ext_id     = os.getenv("ID_KEY")

    base_kwargs = dict(
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=AWS_REGION,
    )

    if arn and ":role/" not in arn:
        arn = None

    if arn:
        sts = boto3.client("sts", **base_kwargs)
        assume_kwargs: dict = {"RoleArn": arn, "RoleSessionName": "eval-session"}
        if ext_id:
            assume_kwargs["ExternalId"] = ext_id
        creds = sts.assume_role(**assume_kwargs)["Credentials"]
        return boto3.client(
            "bedrock-runtime",
            region_name=AWS_REGION,
            aws_access_key_id=creds["AccessKeyId"],
            aws_secret_access_key=creds["SecretAccessKey"],
            aws_session_token=creds["SessionToken"],
        )

    return boto3.client("bedrock-runtime", **base_kwargs)


def bedrock_complete(prompt: str, max_tokens: int = 512, retries: int = 2) -> str | None:
    """Bedrock Converse at temperature=0, retrying transient failures."""
    global _last_bedrock_error
    _last_bedrock_error = None
    last_err = None
    for attempt in range(retries + 1):
        try:
            client   = get_bedrock_client()
            response = client.converse(
                modelId=BEDROCK_MODEL,
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                inferenceConfig={"temperature": 0, "maxTokens": max_tokens},
            )
            return response["output"]["message"]["content"][0]["text"].strip()
        except Exception as e:
            last_err = e
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
    _last_bedrock_error = f"{type(last_err).__name__}: {last_err}"
    print(f"⚠️  Bedrock judge failed after {retries + 1} attempt(s) "
          f"[model={BEDROCK_MODEL}, region={AWS_REGION}]: {last_err}")
    return None


@traceable(run_type="llm")
def run_agent(inputs: dict) -> dict:
    """Process one prompt: POST it to the agent and return the final answer text.
    Matches the server contract: agent in the URL path, category in metadata.
    The agent is taken per-row from inputs["agent"] (ENERGY_AMI_AGENT_<pilot>),
    falling back to the RAW_AGENT_NAME / AGENT_NAME env var."""
    agent = (inputs.get("agent") or AGENT or "").strip()
    if not agent:
        print("⚠️  No agent configured — set 'agent' on the dataset row or RAW_AGENT_NAME in .env")
        return {"answer": ""}
    try:
        res = requests.post(
            f"{BACKEND_URL}/api/agents/{agent}/messages",
            json={
                "messages": [{"role": "user", "content": [{"type": "text", "text": inputs["question"]}]}],
                "tool_choice": {"type": "auto"},
                "stream": True,
                "metadata": {"category": inputs.get("category")},
            },
            stream=True,
            timeout=120,
        )
        res.raise_for_status()

        answer_text   = ""
        current_event = ""
        for line in res.iter_lines(decode_unicode=True):
            if line.startswith("event:"):
                current_event = line[6:].strip()
            elif line.startswith("data:"):
                raw = line[5:].strip()
                try:
                    data = json.loads(raw)
                    if current_event == "response.text.delta":
                        answer_text += data.get("text", "")
                except Exception:
                    pass

        return {"answer": answer_text.strip()}
    except Exception as e:
        print(f"⚠️  Agent call failed: {e}")
        return {"answer": ""}


# ── Helpers ─────────────────────────────────────────────────────────────────

_MISSING = {"", "none", "null", "n/a", "na", "nan"}


def _clean(val):
    if val is None:
        return None
    if isinstance(val, str) and val.strip().lower() in _MISSING:
        return None
    return val


def _field(example, *names):
    """First present, non-missing field by name, checking outputs then inputs."""
    for src in ((example.outputs or {}), (example.inputs or {})):
        for n in names:
            if n in src:
                cleaned = _clean(src[n])
                if cleaned is not None:
                    return cleaned
    return None


def _parse_judge_json(text: str) -> dict | None:
    """Extract a JSON object from an LLM response, tolerating code fences/prose."""
    if not text:
        return None
    cleaned = re.sub(r'```(?:json)?|```', '', text).strip()
    candidates = re.findall(r'\{.*?\}', cleaned, re.DOTALL) or [cleaned]
    for c in sorted(candidates, key=len, reverse=True):
        try:
            return json.loads(c)
        except Exception:
            continue
    return None


# ── Evaluator ───────────────────────────────────────────────────────────────

def llm_judge(run, example) -> dict:
    """Pure LLM judge (0.0 / 0.5 / 1.0) via Bedrock, graded leniently. Runs for every row."""
    question     = _field(example, "question", "input") or ""
    answer       = (run.outputs or {}).get("answer", "")
    instructions = _field(example, "instructions") or ""

    if not answer:
        return {"key": "llm_judge", "score": 0, "comment": "No answer returned"}

    guide_block = f"\nEXPECTED-ANSWER GUIDANCE:\n{instructions}" if instructions else ""

    prompt = f"""You are a LENIENT evaluator for an AI energy-data assistant.
Give the assistant the benefit of the doubt and reward any reasonable, on-topic attempt.

QUESTION:
{question}

ASSISTANT ANSWER:
{answer}{guide_block}

Score how well the answer addresses the question, grading leniently:
- 1.0  Reasonable, on-topic attempt — plausible data, a sensible approach, or an
       appropriate clarifying question. Exact numbers are NOT required; do not verify figures.
- 0.5  Only partially relevant but largely unresponsive.
- 0.0  Empty, entirely off-topic, or a clear refusal of a valid in-domain request.
Do not penalize minor inaccuracies, missing caveats, formatting, or reasonable assumptions.

Reply with ONLY a JSON object: {{"score": <0.0|0.5|1.0>, "reason": "<one sentence>"}}."""

    response = bedrock_complete(prompt)
    if not response:
        detail = f": {_last_bedrock_error}" if _last_bedrock_error else ""
        return {"key": "llm_judge", "score": None, "comment": f"Bedrock judge unavailable{detail}"}

    result = _parse_judge_json(response)
    if not result or "score" not in result:
        return {"key": "llm_judge", "score": None, "comment": f"Could not parse judge output: {response[:200]}"}

    try:
        score = max(0.0, min(1.0, float(result["score"])))
    except (TypeError, ValueError):
        return {"key": "llm_judge", "score": None, "comment": f"Non-numeric score: {result}"}

    return {"key": "llm_judge", "score": score, "comment": result.get("reason", "")}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"\n🚀 Starting eval — agent: {AGENT or '(none)'}\n")

    evaluate(
        run_agent,
        data="energy-ami-agent-pilots",
        evaluators=[llm_judge],
        experiment_prefix="ami-pilots",
        max_concurrency=160,
    )

    try:
        ls_client.flush()
    except Exception as e:
        print(f"⚠️  LangSmith flush failed: {e}")

    print("✅ Eval complete — view results in LangSmith → Datasets & Testing → energy-ami-agent-pilots")