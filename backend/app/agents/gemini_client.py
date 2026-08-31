import os
import time
import json
import logging
from typing import Any, Optional, Dict, List
from google import genai
from google.genai import types
from langsmith import traceable
from app.config import settings
from app.db import execute

logger = logging.getLogger("quizloop.gemini_client")
flow_logger = logging.getLogger("quizloop.prompts_and_flows")

_client_instance: Optional[genai.Client] = None

def get_client() -> genai.Client:
    global _client_instance
    if _client_instance is not None:
        return _client_instance

    vertex_errors: List[str] = []

    # Prefer Vertex AI when a GCP project is configured (billing runs against
    # GCP credits). Falls back to the Gemini Developer API key.
    if settings.google_cloud_project:
        # Clear stale service account credentials so Google Cloud SDK uses authenticated ADC credentials
        if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
            del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]

        # Try default credentials
        try:
            _client_instance = genai.Client(
                vertexai=True,
                project=settings.google_cloud_project,
                location=settings.google_cloud_location
            )
            return _client_instance
        except Exception as e:
            vertex_errors.append(f"Vertex ADC: {e}")

        # Fallback to active gcloud session token
        try:
            import subprocess
            from google.oauth2.credentials import Credentials
            token = subprocess.check_output("gcloud auth print-access-token", shell=True, text=True).strip()
            creds = Credentials(token=token)
            _client_instance = genai.Client(
                vertexai=True,
                project=settings.google_cloud_project,
                location=settings.google_cloud_location,
                credentials=creds
            )
            return _client_instance
        except Exception as e:
            vertex_errors.append(f"Vertex gcloud: {e}")

    if settings.gemini_api_key:
        _client_instance = genai.Client(api_key=settings.gemini_api_key)
        return _client_instance

    raise ValueError(
        "Could not initialize a Gemini client. "
        + ("; ".join(vertex_errors) + ". " if vertex_errors else "")
        + "Neither Vertex AI nor GEMINI_API_KEY is available."
    )


def _format_contents_for_logging(contents: List[Any]) -> str:
    """Format contents list into human-readable prompt logs."""
    formatted_parts = []
    for item in contents:
        if isinstance(item, types.Content):
            role = item.role or "user"
            parts_desc = []
            for p in (item.parts or []):
                if hasattr(p, "text") and p.text:
                    parts_desc.append(f"Text:\n{p.text}")
                elif hasattr(p, "file_data") and p.file_data:
                    parts_desc.append(f"File: {getattr(p.file_data, 'file_uri', 'unknown_uri')}")
                else:
                    parts_desc.append(str(p))
            formatted_parts.append(f"[{role.upper()}]:\n" + "\n".join(parts_desc))
        elif isinstance(item, str):
            formatted_parts.append(f"[USER]:\n{item}")
        else:
            formatted_parts.append(str(item))
    return "\n\n".join(formatted_parts)

@traceable(run_type="llm", name="GeminiFlashClient")
async def generate_gemini_content(
    contents: List[Any],
    system_instruction: Optional[str] = None,
    thinking_budget: Optional[int] = None,
    thinking_level: Optional[str] = None,
    enable_grounding: bool = False,
    response_schema: Optional[Any] = None,
    session_id: Optional[str] = None,
    node_name: str = "llm_node",
    model_name: Optional[str] = None,
    cached_content: Optional[str] = None
) -> str:
    """
    Unified client for Gemini 3.7 Flash generation with:
    - Thinking configuration (budget or dynamic level)
    - Google Search Grounding (selective)
    - Gemini Context Caching
    - Token tracking & PostgreSQL persistence
    - LangSmith tracing
    - Detailed local Prompt & Flow logging
    """
    client = get_client()
    target_model = model_name or settings.gemini_model_name
    
    tools = []
    if enable_grounding and not response_schema:
        tools.append(types.Tool(google_search=types.GoogleSearch()))

    # 2. Build Thinking Config
    thinking_config = None
    if thinking_budget is not None:
        thinking_config = types.ThinkingConfig(thinking_budget=thinking_budget)
    elif thinking_level is not None:
        thinking_config = types.ThinkingConfig(thinking_level=thinking_level)

    # 3. Build GenerateContentConfig
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        cached_content=cached_content,
        tools=tools if tools else None,
        thinking_config=thinking_config,
        response_mime_type="application/json" if response_schema else None,
        response_schema=response_schema,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        max_output_tokens=16384,
    )

    # 4. Log Outgoing Prompt & Configuration Flow
    prompt_str = _format_contents_for_logging(contents)
    flow_log_entry = (
        f"=== [LLM REQUEST] Node: '{node_name}' | Session: '{session_id or 'none'}' | Model: '{target_model}' ===\n"
        f"Thinking Budget: {thinking_budget} | Grounding: {enable_grounding} | Cache: {cached_content or 'None'}\n"
        f"--- SYSTEM INSTRUCTION ---\n{system_instruction or '[None]'}\n"
        f"--- PROMPT CONTENTS ---\n{prompt_str}\n"
    )
    flow_logger.info(flow_log_entry)

    start_time = time.time()
    logger.info(f"Calling Gemini ({target_model}) for node '{node_name}'...")

    response = await client.aio.models.generate_content(
        model=target_model,
        contents=contents,
        config=config
    )
    
    duration_ms = int((time.time() - start_time) * 1000)

    # 5. Extract Token Telemetry
    prompt_tokens = 0
    thought_tokens = 0
    output_tokens = 0
    total_tokens = 0

    if hasattr(response, "usage_metadata") and response.usage_metadata:
        usage = response.usage_metadata
        prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
        output_tokens = getattr(usage, "candidates_token_count", 0) or 0
        total_tokens = getattr(usage, "total_token_count", 0) or (prompt_tokens + output_tokens)
        
        # Check thought token count if available
        candidates_details = getattr(usage, "candidates_tokens_details", None)
        if candidates_details and len(candidates_details) > 0:
            thought_tokens = getattr(candidates_details[0], "thought_token_count", 0) or 0

    logger.info(
        f"Gemini response for '{node_name}' in {duration_ms}ms. "
        f"Tokens: [Prompt: {prompt_tokens}, Thoughts: {thought_tokens}, Output: {output_tokens}, Total: {total_tokens}]"
    )

    text = response.text
    if not text:
        raise RuntimeError("No text content returned from Gemini model.")

    # 6. Log LLM Response & Telemetry Flow
    response_log_entry = (
        f"=== [LLM RESPONSE] Node: '{node_name}' | Session: '{session_id or 'none'}' | Latency: {duration_ms}ms ===\n"
        f"Tokens -> Prompt: {prompt_tokens}, Thoughts: {thought_tokens}, Output: {output_tokens}, Total: {total_tokens}\n"
        f"--- RESPONSE CONTENT ---\n{text}\n"
    )
    flow_logger.info(response_log_entry)

    # 7. Persist Token Metrics to Database Asynchronously
    if session_id:
        try:
            # Atomic session token count increment
            await execute(
                """
                UPDATE sessions 
                SET input_tokens = input_tokens + $1,
                    output_tokens = output_tokens + $2,
                    thought_tokens = thought_tokens + $3,
                    total_tokens = total_tokens + $4,
                    updated_at = NOW()
                WHERE id = $5
                """,
                prompt_tokens, output_tokens, thought_tokens, total_tokens, session_id
            )

            # Insert ledger log entry
            await execute(
                """
                INSERT INTO token_usage_logs 
                (session_id, node_name, model_name, prompt_tokens, thought_tokens, output_tokens, total_tokens, latency_ms)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """,
                session_id, node_name, target_model, prompt_tokens, thought_tokens, output_tokens, total_tokens, duration_ms
            )
        except Exception as e:
            logger.warning(f"Failed to record token usage in DB: {e}")

    return text
