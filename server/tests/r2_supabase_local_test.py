"""
Local integration test: Cloudflare R2 upload + Supabase insert/select.

Usage:
  python server/tests/r2_supabase_local_test.py

This script:
  1) Generates a tiny JPEG in-memory and uploads it to R2
  2) Inserts a record into Supabase (photos) with the R2 public URL
  3) Retrieves the record and validates the URL matches
  4) Prints a structured summary with ✅/❌
"""

import io
import os
import sys
import traceback
from datetime import datetime, timezone
from uuid import uuid4

from dotenv import load_dotenv
from PIL import Image
import boto3
from botocore.exceptions import ClientError
from supabase import create_client, Client


def load_env():
    """Load environment variables from server/.env if present."""
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_path = os.path.join(base_dir, ".env")
    load_dotenv(env_path, override=True)


def make_test_image_bytes() -> bytes:
    """Create a small in-memory JPEG for testing uploads."""
    img = Image.new("RGB", (64, 64), color=(220, 40, 40))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80, optimize=True)
    return buf.getvalue()


def build_r2_client():
    """Create a boto3 S3 client pointing to Cloudflare R2 from env."""
    access_key = os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    bucket_name = os.getenv("R2_BUCKET") or os.getenv("R2_BUCKET_NAME")
    account_id = os.getenv("R2_ACCOUNT_ID")
    public_url = (
        os.getenv("R2_PUBLIC_BASE_URL") or os.getenv("R2_PUBLIC_URL") or ""
    ).rstrip("/")

    missing = [
        k
        for k, v in {
            "R2_ACCESS_KEY_ID": access_key,
            "R2_SECRET_ACCESS_KEY": secret_key,
            "R2_BUCKET": bucket_name,
            "R2_ACCOUNT_ID": account_id,
        }.items()
        if not v
    ]
    if missing:
        raise RuntimeError(f"Missing R2 env vars: {', '.join(missing)}")

    endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        region_name="auto",
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
    )
    return client, bucket_name, public_url, endpoint_url


def build_supabase_client() -> Client:
    """Create a Supabase client using service role key for admin insert/select."""
    url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv(
        "SUPABASE_SERVICE_KEY"
    )
    if not url or not service_key:
        missing = []
        if not url:
            missing.append("SUPABASE_URL")
        if not service_key:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
        raise RuntimeError(f"Missing Supabase env vars: {', '.join(missing)}")
    return create_client(url, service_key)


def main() -> int:
    load_env()
    results = {
        "upload": {"ok": False, "message": "", "url": "", "key": ""},
        "insert": {"ok": False, "message": "", "id": ""},
        "retrieve": {"ok": False, "message": ""},
    }

    # 1) Upload to R2
    try:
        r2, bucket, public_base, endpoint_url = build_r2_client()
        key = f"test-photos/{uuid4().hex}_sample.jpg"
        body = make_test_image_bytes()
        r2.upload_fileobj(io.BytesIO(body), bucket, key)
        file_url = (
            f"{public_base}/{key}" if public_base else f"{endpoint_url}/{bucket}/{key}"
        )
        results["upload"].update(
            ok=True, url=file_url, key=key, message="Upload succeeded"
        )
    except Exception as e:
        results["upload"]["message"] = f"{type(e).__name__}: {e}"
        # fall through to report

    # 2) Insert into Supabase
    try:
        if not results["upload"]["ok"]:
            raise RuntimeError("Upload step failed; skipping insert")
        sb = build_supabase_client()
        payload = {
            # Align with your Supabase schema
            "file_name": os.path.basename(results["upload"]["key"]),
            "caption": "Local integration test",
            "latitude": 37.7749,
            "longitude": -122.4194,
            "r2_url": results["upload"]["url"],
            "r2_path": results["upload"]["key"],
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }
        resp = sb.table("photos").insert(payload).execute()
        if getattr(resp, "data", None):
            photo_id = resp.data[0].get("id")
            results["insert"].update(
                ok=True, id=str(photo_id), message="Insert succeeded"
            )
        else:
            # Supabase python lib error shape varies; include best-effort detail
            results["insert"]["message"] = f"Insert returned no data; resp={resp}"
    except Exception as e:
        results["insert"]["message"] = f"{type(e).__name__}: {e}"

    # 3) Retrieve and validate
    try:
        if not results["insert"]["ok"]:
            raise RuntimeError("Insert step failed; skipping retrieval")
        sb = build_supabase_client()
        resp = (
            sb.table("photos")
            .select("*")
            .eq("id", results["insert"]["id"])
            .maybe_single()
            .execute()
        )
        row = getattr(resp, "data", None)
        if (
            row
            and str(row.get("id")) == results["insert"]["id"]
            and (row.get("r2_url") or "").strip() == results["upload"]["url"]
        ):
            results["retrieve"].update(ok=True, message="URL matched")
        else:
            results["retrieve"][
                "message"
            ] = f"Retrieved row did not match expected URL. row={row}"
    except Exception as e:
        results["retrieve"]["message"] = f"{type(e).__name__}: {e}"

    # 4) Structured output
    def mark(ok: bool) -> str:
        return "✅" if ok else "❌"

    print("-------- Local Integration Test (R2 + Supabase) --------")
    print(f"{mark(results['upload']['ok'])} Upload: {results['upload']['message']}")
    if results["upload"]["ok"]:
        print(f"    URL: {results['upload']['url']}")
        print(f"    KEY: {results['upload']['key']}")
    print(
        f"{mark(results['insert']['ok'])} Supabase insert: {results['insert']['message']}"
    )
    if results["insert"]["ok"]:
        print(f"    ID: {results['insert']['id']}")
    print(
        f"{mark(results['retrieve']['ok'])} Retrieval: {results['retrieve']['message']}"
    )
    print("--------------------------------------------------------")

    # Exit non-zero if any step failed
    ok_all = (
        results["upload"]["ok"]
        and results["insert"]["ok"]
        and results["retrieve"]["ok"]
    )
    return 0 if ok_all else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print("Unexpected error in test runner:")
        traceback.print_exc()
        sys.exit(2)
