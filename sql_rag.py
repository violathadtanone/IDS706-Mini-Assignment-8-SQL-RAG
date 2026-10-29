"""Retrieve SQL knowledge from Neo4j and generate PostgreSQL with OpenAI.

This script only reads Neo4j and OpenAI. It never executes generated SQL or
writes to Supabase. Question embeddings are cached locally for retryable runs.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from neo4j import GraphDatabase
from openai import OpenAI


EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
DEFAULT_GENERATION_MODEL = "gpt-6-luna"
NEO4J_INDEX = "knowledge_embeddings"
TOP_K = 3
CACHE_PATH = Path(__file__).with_name(".cache") / "sql_rag_embeddings.json"

NEO4J_SEARCH = """
MATCH (node:Knowledge)
SEARCH node IN (
  VECTOR INDEX knowledge_embeddings
  FOR $embedding
  LIMIT 3
) SCORE AS score
RETURN node.id AS id, node.text AS text, score
ORDER BY score DESC
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("question", help="The SQL question to answer")
    return parser.parse_args()


def load_cache() -> dict[str, Any]:
    try:
        return json.loads(CACHE_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def save_cache(cache: dict[str, Any]) -> None:
    CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache), encoding="utf-8")


def question_embedding(client: OpenAI, question: str) -> list[float]:
    cache = load_cache()
    question_key = hashlib.sha256(question.encode("utf-8")).hexdigest()
    cached = cache.get(question_key)
    if (
        isinstance(cached, dict)
        and cached.get("model") == EMBEDDING_MODEL
        and cached.get("dimensions") == EMBEDDING_DIMENSIONS
        and isinstance(cached.get("embedding"), list)
    ):
        print("Using cached question embedding.")
        return cached["embedding"]

    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=question,
        dimensions=EMBEDDING_DIMENSIONS,
    )
    embedding = response.data[0].embedding
    cache[question_key] = {
        "model": EMBEDDING_MODEL,
        "dimensions": EMBEDDING_DIMENSIONS,
        "embedding": embedding,
    }
    save_cache(cache)
    print("Cached new question embedding locally.")
    return embedding


def retrieve_context(embedding: list[float]) -> list[dict[str, Any]]:
    uri = os.environ["NEO4J_URI"]
    username = os.environ["NEO4J_USERNAME"]
    password = os.environ["NEO4J_PASSWORD"]
    database = os.getenv("NEO4J_DATABASE")

    driver = GraphDatabase.driver(uri, auth=(username, password))
    try:
        session_kwargs = {"database": database} if database else {}
        with driver.session(**session_kwargs) as session:
            result = session.run(NEO4J_SEARCH, embedding=embedding)
            return [record.data() for record in result]
    finally:
        driver.close()


def source_text(properties: dict[str, Any]) -> str:
    return next(
        (
            value
            for key in ("text", "content", "knowledge", "description")
            if isinstance(value := properties.get(key), str)
        ),
        json.dumps(
            {key: value for key, value in properties.items() if "embedding" not in key.lower()},
            ensure_ascii=False,
        ),
    )


def source_id(properties: dict[str, Any], number: int, element_id: str | None = None) -> str:
    for key in ("source_id", "knowledge_id", "id", "slug", "title"):
        value = properties.get(key)
        if value is not None and str(value).strip():
            return str(value)
    return element_id or f"Knowledge-{number}"


def context_text(records: list[dict[str, Any]]) -> str:
    chunks = []
    for number, record in enumerate(records, start=1):
        properties = record.get("properties") or {}
        if record.get("text") is not None:
            properties = {"id": record.get("id"), "text": record.get("text")}
        chunks.append(
            f"[{source_id(properties, number, record.get('element_id'))}] {source_text(properties)}"
        )
    return "\n".join(chunks)


def source_summaries(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sources = []
    for number, record in enumerate(records, start=1):
        properties = record.get("properties") or {}
        if record.get("text") is not None:
            properties = {"id": record.get("id"), "text": record.get("text")}
        snippet = " ".join(source_text(properties).split())
        sources.append({
            "id": source_id(properties, number, record.get("element_id")),
            "snippet": snippet[:240],
        })
    return sources


def generate_sql(client: OpenAI, model: str, question: str, context: str) -> str:
    prompt = (
        "Write one read-only PostgreSQL SELECT statement for the question. "
        "Return SQL only; no markdown or explanation. Use the retrieved context.\n"
        f"Question: {question}\nContext:\n{context}"
    )
    response = client.responses.create(
        model=model,
        input=prompt,
        max_output_tokens=250,
    )
    return response.output_text.strip()


def run_rag(question: str, client: OpenAI | None = None) -> dict[str, Any]:
    load_dotenv(dotenv_path=Path(__file__).with_name(".env"))
    openai_client = client or OpenAI(
        api_key=os.environ["OPENAI_API_KEY"],
        max_retries=0,
    )
    generation_model = os.getenv("OPENAI_SQL_MODEL", DEFAULT_GENERATION_MODEL)
    embedding = question_embedding(openai_client, question)
    records = retrieve_context(embedding)
    if not records:
        raise RuntimeError(f"No Knowledge nodes returned from {NEO4J_INDEX}.")
    return {
        "sql": generate_sql(openai_client, generation_model, question, context_text(records)),
        "sources": source_summaries(records),
        "model": generation_model,
    }


def main() -> None:
    args = parse_args()
    load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

    api_key = os.environ["OPENAI_API_KEY"]
    generation_model = os.getenv("OPENAI_SQL_MODEL", DEFAULT_GENERATION_MODEL)
    client = OpenAI(api_key=api_key, max_retries=0)

    # This is a read-only availability check. Only one generation call follows.
    client.models.retrieve(generation_model)
    print(f"Generation model available: {generation_model}")

    result = run_rag(args.question, client=client)
    print("\nGenerated PostgreSQL SQL:\n")
    print(result["sql"])
    print("\nRetrieved sources:")
    for source in result["sources"]:
        print(f'- {source["id"]}: {source["snippet"]}')
    print("\nGenerated SQL was not executed.")


if __name__ == "__main__":
    main()
