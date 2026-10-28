import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException

import sql_rag
from rag_api import Quota, verify_token


class RagLocalTests(unittest.TestCase):
    def test_embedding_cache_avoids_second_embedding_request(self):
        with tempfile.TemporaryDirectory() as directory:
            cache_path = sql_rag.CACHE_PATH
            sql_rag.CACHE_PATH = __import__("pathlib").Path(directory) / "cache.json"
            try:
                client = Mock()
                client.embeddings.create.return_value = SimpleNamespace(
                    data=[SimpleNamespace(embedding=[0.1, 0.2])]
                )
                first = sql_rag.question_embedding(client, "Which schools have most students?")
                second = sql_rag.question_embedding(client, "Which schools have most students?")
                self.assertEqual(first, second)
                client.embeddings.create.assert_called_once()
            finally:
                sql_rag.CACHE_PATH = cache_path

    def test_quota_enforces_hour_and_day_without_external_storage(self):
        quota = Quota(hourly=1, daily=2)
        now = datetime(2026, 10, 28, tzinfo=timezone.utc)
        quota.consume("user-1", now)
        with self.assertRaises(HTTPException) as hourly_error:
            quota.consume("user-1", now + timedelta(minutes=1))
        self.assertIn("Hourly", hourly_error.exception.detail)
        quota.consume("user-1", now + timedelta(hours=2))

    def test_token_verification_returns_user_id_without_live_auth_call(self):
        response = Mock(status_code=200)
        response.json.return_value = {"id": "user-123"}
        with patch.dict(
            "os.environ",
            {
                "RAG_SUPABASE_URL": "https://auth.example.test",
                "RAG_SUPABASE_ANON_KEY": "public-test-key",
            },
            clear=False,
        ):
            get = Mock(return_value=response)
            self.assertEqual(verify_token("token", get=get), "user-123")
            get.assert_called_once()

    def test_rag_result_contains_sql_and_source_summaries(self):
        records = [{
            "properties": {
                "source_id": "knowledge-01",
                "text": "Schools connect to students through school_id.",
            },
            "score": 0.9,
        }]
        with patch.object(sql_rag, "question_embedding", return_value=[0.1]), \
             patch.object(sql_rag, "retrieve_context", return_value=records), \
             patch.object(sql_rag, "generate_sql", return_value="SELECT 1;"):
            result = sql_rag.run_rag("How are schools connected?")
        self.assertEqual(result["sql"], "SELECT 1;")
        self.assertEqual(result["sources"][0]["id"], "knowledge-01")


if __name__ == "__main__":
    unittest.main()
