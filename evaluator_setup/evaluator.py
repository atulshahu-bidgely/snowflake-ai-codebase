import os
import re
import json
import time
import boto3
import requests
from datetime import datetime, timezone
from langsmith import Client as LangSmithClient, get_current_run_tree, traceable
from langsmith.evaluation import evaluate
from pathlib import Path
from dotenv import load_dotenv, find_dotenv


def _load_env() -> list[str]:
    """Load .env explicitly instead of relying on the current working directory.

    A bare load_dotenv() only checks the cwd, so running this script from the
    project root (where it lives) missed the real .env nested under
    snowflake/snowflake-ai-codebase/. We mirror server.js's explicit-path
    approach, but merge EVERY project .env so vars split across files (e.g.
    Bedrock in one, Snowflake/LangSmith in another) all resolve.

    Precedence: real shell env > $ENV_FILE > first .env that defines a key.
    Set ENV_FILE to force a specific file.
    """
    here = Path(__file__).resolve().parent
    loaded: list[str] = []

    explicit = os.getenv("ENV_FILE")
    if explicit and Path(explicit).is_file():
        load_dotenv(explicit, override=True)  # explicit file wins over other .envs
        loaded.append(explicit)

    candidates: list[Path] = []
    for pat in ("**/.env", "**/.env.*"):
        candidates += sorted(here.glob(pat))
    for p in candidates:
        if "node_modules" in p.parts or not p.is_file():
            continue
        load_dotenv(p, override=False)  # fill gaps; don't clobber shell or ENV_FILE
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

BACKEND_URL     = os.getenv("REACT_APP_BACKEND_URL", "http://localhost:3001")
AGENT_NAME      = os.getenv("AGENT_NAME", "")
AGENT_NAME2     = AGENT_NAME.split(".")[-1] if "." in AGENT_NAME else AGENT_NAME
BEDROCK_MODEL   = os.getenv("BEDROCK_JUDGE_MODEL", "anthropic.claude-sonnet-4-5")
AWS_REGION      = os.getenv("AWS_REGION", "us-east-1")


def _looks_like_bare_model_id(model_id: str) -> bool:
    """True for a plain foundation-model ID that Bedrock won't invoke on-demand.
    Newer Claude models require an inference-profile ID/ARN. Profiles either
    start with 'arn:', contain 'inference-profile', or carry a region prefix
    (us./eu./apac.)."""
    if not model_id or model_id.startswith("arn:") or "inference-profile" in model_id:
        return False
    if model_id.split(".", 1)[0] in ("us", "eu", "apac"):
        return False
    return model_id.startswith("anthropic.")


# Surface the resolved judge config so precedence problems are obvious. A stale
# shell export beats values from .env, which is the usual reason this is wrong.
print(f"🤖 Bedrock judge: model={BEDROCK_MODEL} | region={AWS_REGION}")
if _looks_like_bare_model_id(BEDROCK_MODEL):
    print("⚠️  BEDROCK_JUDGE_MODEL looks like a bare model ID — newer Claude models "
          "can't be invoked on-demand. Set it to an inference-profile ID/ARN, e.g.\n"
          "    arn:aws:bedrock:us-west-2:<acct>:application-inference-profile/<id>\n"
          "    If it's exported in your shell, that overrides .env — run: unset BEDROCK_JUDGE_MODEL")

ls_client = LangSmithClient()

# Last error string from bedrock_complete(), surfaced into the judge's comment
# so failures are visible in LangSmith instead of a generic "unavailable".
_last_bedrock_error: str | None = None



def get_bedrock_client():
    """Returns a Bedrock runtime client.

    Uses the EVAL_ACCESS_API_KEY / EVAL_SECRET_API_KEY credentials directly.
    STS AssumeRole is used ONLY when ARN_KEY is a real IAM role ARN (contains
    ':role/'); a Bedrock inference-profile ARN in ARN_KEY is ignored (it belongs
    in BEDROCK_JUDGE_MODEL, not here). This matches the verified test.py flow,
    where same-account access needs no role assumption.
    """
    access_key = os.getenv("EVAL_ACCESS_API_KEY")
    secret_key = os.getenv("EVAL_SECRET_API_KEY")
    arn        = os.getenv("ARN_KEY")
    ext_id     = os.getenv("ID_KEY")

    base_kwargs = dict(
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=AWS_REGION,
    )

    # Only assume a role when ARN_KEY is an actual IAM role ARN. A common
    # misconfiguration is putting the Bedrock inference-profile ARN here, which
    # makes sts:AssumeRole fail with AccessDenied — ignore non-role ARNs and use
    # the IAM user's own credentials directly instead.
    if arn and ":role/" not in arn:
        print(f"⚠️  ARN_KEY is not an IAM role ARN ({arn}); ignoring it and using direct credentials. "
              f"(If this is your Bedrock inference profile, put it in BEDROCK_JUDGE_MODEL.)")
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
    """Calls Amazon Bedrock Converse API and returns the response text.

    Uses temperature=0 so the judge is deterministic/reproducible, and retries
    transient failures (throttling, timeouts) with linear backoff.
    """
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
    try:
        res = requests.post(
            f"{BACKEND_URL}/api/agents/{AGENT_NAME2}/messages",
            json={
                "messages": [{"role": "user", "content": [{"type": "text", "text": inputs["question"]}]}],
                "tool_choice": {"type": "auto"},
                "stream": True,
                # Backend selects the category card from metadata.category
                # (server.js: requestBody.metadata?.category). Sending it under
                # any other key makes the agent run the query raw / uncategorized.
                "metadata": {"category": inputs.get("category")},
            },
            stream=True,
            timeout=120,
        )
        res.raise_for_status()

        # Parse SSE stream
        answer_text   = ""
        tool_content  = ""
        input_tokens  = None
        output_tokens = None
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
                    elif current_event in ("response.tool_result", "response.tool_use"):
                        tool_content += raw
                    elif current_event == "response":
                        tokens = data.get("metadata", {}).get("usage", {}).get("tokens_consumed", [])
                        if tokens:
                            input_tokens  = tokens[0].get("input_tokens",  {}).get("total")
                            output_tokens = tokens[0].get("output_tokens", {}).get("total")
                except Exception:
                    pass

        outputs = {
            "answer":        answer_text.strip(),
            "tool_content":  tool_content,
            "input_tokens":  input_tokens,
            "output_tokens": output_tokens,
        }

        # Populate LangSmith Tokens column via usage_metadata.
        # NOTE: credits/cost are written by server.js to its OWN LangSmith run
        # ('snowflake-agent-proxy'), NOT to this eval run — and only after up to
        # 300s of ACCOUNT_USAGE polling. So this run will not show Snowflake cost
        # unless the backend is wired to write to this run's id (see README/notes).
        if input_tokens is not None or output_tokens is not None:
            outputs["usage_metadata"] = {
                "input_tokens":  input_tokens  or 0,
                "output_tokens": output_tokens or 0,
                "total_tokens":  (input_tokens or 0) + (output_tokens or 0),
            }

        return outputs
    except Exception as e:
        print(f"⚠️  Agent call failed: {e}")
        return {"answer": ""}


# ── Evaluator helpers ───────────────────────────────────────────────────────

_MISSING = {"", "none", "null", "n/a", "na", "nan"}


def _clean(val):
    """Normalize a dataset cell. Treats 'None'/'null'/''/'N/A' (the literal
    strings that show up in the CSV) as a missing value -> None."""
    if val is None:
        return None
    if isinstance(val, str) and val.strip().lower() in _MISSING:
        return None
    return val


def _field(example, *names):
    """Fetch the first present, non-missing field by name, checking both the
    dataset's outputs and inputs (column->key mapping varies by upload)."""
    for src in ((example.outputs or {}), (example.inputs or {})):
        for n in names:
            if n in src:
                cleaned = _clean(src[n])
                if cleaned is not None:
                    return cleaned
    return None


def _category(example) -> str:
    return str(_field(example, "category") or "").strip().lower()


def _response_text(run) -> str:
    """Lower-cased concatenation of tool output + final answer."""
    out = run.outputs or {}
    return f"{out.get('tool_content', '') or ''}\n{out.get('answer', '') or ''}".lower()


def _extract_numbers(text: str) -> list[float]:
    """Pull every numeric value from text, handling thousands separators,
    decimals and signs (e.g. '1,234.5', '-12', '3.14')."""
    nums: list[float] = []
    pattern = r'-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?'
    for m in re.findall(pattern, text):
        try:
            nums.append(float(m.replace(",", "")))
        except ValueError:
            pass
    return nums


def _parse_judge_json(text: str) -> dict | None:
    """Robustly extract a JSON object from an LLM response, tolerating code
    fences and surrounding prose. Tries the largest balanced-looking match first."""
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


# ── Evaluators ────────────────────────────────────────────────────────────────

def llm_judge(run, example) -> dict:
    """Graded semantic evaluation (0.0 / 0.5 / 1.0) via Bedrock, grounded in the
    retrieved tool data. Skipped for 'Get Data' (use range_accuracy)."""
    if _category(example) == "get data":
        return {"key": "llm_judge", "score": None, "comment": "Skipped — Get Data uses range_accuracy"}

    question     = _field(example, "question", "input") or ""
    out          = run.outputs or {}
    answer       = out.get("answer", "")
    tool_content = out.get("tool_content", "") or ""
    instructions = _field(example, "instructions") or ""

    if not answer:
        return {"key": "llm_judge", "score": 0, "comment": "No answer returned"}

    tool_block = f"\nRETRIEVED TOOL DATA (the answer should be grounded in this):\n{tool_content[:4000]}" if tool_content else ""
    guide_block = f"\nEXPECTED-ANSWER GUIDANCE:\n{instructions}" if instructions else ""

    prompt = f"""You are a strict evaluator for an AI energy-data assistant.

QUESTION:
{question}

ASSISTANT ANSWER:
{answer}{tool_block}{guide_block}

Score how well the answer addresses the question AND satisfies the guidance:
- 1.0  Fully correct, complete, and consistent with the retrieved data / guidance.
- 0.5  Partially correct — on-topic but incomplete, vague, or missing part of the guidance.
- 0.0  Incorrect, irrelevant, contradicts the retrieved data, or invents numbers.

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


def range_accuracy(run, example) -> dict:
    """Pass if ANY numeric value in the answer falls within [min, max]. Only for
    'Get Data'. Avoids the old nums[0] bug where a year or date was scored
    instead of the actual figure."""
    if _category(example) != "get data":
        return {"key": "range_accuracy", "score": None, "comment": "Skipped — non-Get-Data uses llm_judge"}

    raw_min = _field(example, "min")
    raw_max = _field(example, "max")
    if raw_min is None or raw_max is None:
        return {"key": "range_accuracy", "score": None, "comment": "No numeric min/max defined for this row"}

    answer = (run.outputs or {}).get("answer", "")
    nums   = _extract_numbers(answer)
    if not nums:
        return {"key": "range_accuracy", "score": None, "comment": "No number found in answer"}

    try:
        min_v = float(raw_min)
        max_v = float(raw_max)
    except (ValueError, TypeError):
        return {"key": "range_accuracy", "score": None, "comment": f"Invalid min/max in dataset: {raw_min!r}, {raw_max!r}"}
    if min_v > max_v:
        min_v, max_v = max_v, min_v

    matches = [n for n in nums if min_v <= n <= max_v]
    if matches:
        return {"key": "range_accuracy", "score": 1,
                "comment": f"Matched {matches[0]} in [{min_v} – {max_v}] (candidates: {nums})"}

    closest = min(nums, key=lambda n: min(abs(n - min_v), abs(n - max_v)))
    return {"key": "range_accuracy", "score": 0,
            "comment": f"No value in [{min_v} – {max_v}]; closest was {closest} (candidates: {nums})"}


def directory_check(run, example) -> dict:
    """Checks expected directory/directories appear in the response. Accepts a
    single string or a list; requires all of them."""
    actual    = _response_text(run)
    directory = _field(example, "directory")
    if directory is None:
        return {"key": "directory_check", "score": None, "comment": "No directory defined for this row"}
    dirs = [directory] if isinstance(directory, str) else list(directory or [])
    dirs = [d.lower().strip() for d in dirs if d and str(d).strip()]
    if not dirs:
        return {"key": "directory_check", "score": None, "comment": "No directory defined"}

    missing = [d for d in dirs if d not in actual]
    score   = 1 if not missing else 0
    return {"key": "directory_check", "score": score,
            "comment": "Found all expected director(ies)" if score else f"Missing: {missing}"}


def string_match(run, example) -> dict:
    """Fraction of required strings present in the response (0.0–1.0). Runs for
    all categories. Graded coverage gives more signal than the old all-or-nothing
    pass/fail while still scoring 1.0 when everything matches.

    Dataset field `response` (alias `expected_strings`): the substrings that MUST
    appear in the output. A list OR comma-separated string, e.g.
    ["kWh", "solar"] or "kWh, solar". Skipped (score None) when not defined.
    """
    actual   = _response_text(run)
    expected = _field(example, "response", "expected_strings")
    if expected is None:
        return {"key": "string_match", "score": None, "comment": "No required strings defined for this row"}
    if isinstance(expected, str):
        items = expected.split(",")
    elif isinstance(expected, (list, tuple)):
        items = expected
    else:
        items = [expected]
    # Drop blanks and 'None'/'null'-like tokens (case-insensitive) within the list.
    expected = [str(s).strip() for s in items if _clean(s) is not None]
    if not expected:
        return {"key": "string_match", "score": None, "comment": "No required strings defined for this row"}

    missing = [s for s in expected if s.lower() not in actual]
    found   = len(expected) - len(missing)
    score   = round(found / len(expected), 3)
    comment = (f"All {len(expected)} string(s) found" if not missing
               else f"{found}/{len(expected)} found — missing: {missing}")
    return {"key": "string_match", "score": score, "comment": comment}


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"🚀 Starting weekly eval — agent: {AGENT_NAME2}")
    print(f"📡 Backend: {BACKEND_URL}\n")

    evaluate(
        run_agent,
        data="energy-agent-weekly",
        evaluators=[range_accuracy, llm_judge, directory_check, string_match],
        experiment_prefix="weekly",
        max_concurrency=2,
    )

    # Flush any buffered tracing payloads so runs are fully submitted before the
    # process exits (otherwise runs can appear unfinished in LangSmith).
    # run_agent's run already ends when it returns — right after the stream — so
    # latency is correct without the old end_time patch (which only ever produced
    # 409 "payloads already received" conflicts).
    try:
        ls_client.flush()
    except Exception as e:
        print(f"⚠️  LangSmith flush failed: {e}")

    print("✅ Eval complete — view results in LangSmith → Datasets & Testing → energy-agent-weekly")