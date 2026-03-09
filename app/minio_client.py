# backend/app/minio_client.py
import os
import uuid
import io
import mimetypes
from dotenv import load_dotenv
from minio import Minio
from minio.error import S3Error

load_dotenv()

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "surveillance")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() in ("true", "1", "yes")

# init client
minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)

def ensure_bucket_exists(bucket_name: str = MINIO_BUCKET):
    if not minio_client.bucket_exists(bucket_name):
        minio_client.make_bucket(bucket_name)
    return bucket_name

def upload_bytes_to_minio(data: bytes, filename: str | None = None, content_type: str | None = None, bucket_name: str = MINIO_BUCKET) -> str:
    """
    Upload raw bytes to minio and return an HTTP URL to the object.
    """
    try:
        ensure_bucket_exists(bucket_name)

        # choose filename
        ext = ""
        if content_type:
            ext = mimetypes.guess_extension(content_type) or ""
        name = (filename or str(uuid.uuid4())) + ext
        # minio expects a file-like object
        file_obj = io.BytesIO(data)
        file_obj.seek(0)
        file_size = len(data)

        # upload
        minio_client.put_object(bucket_name, name, file_obj, file_size, content_type=content_type or "application/octet-stream")

        # Return HTTP URL (works if MinIO is accessible at MINIO_ENDPOINT)
        scheme = "https" if MINIO_SECURE else "http"
        return f"{scheme}://{MINIO_ENDPOINT}/{bucket_name}/{name}"

    except S3Error as e:
        print("MinIO upload failed:", e)
        raise

def upload_fileobj_to_minio(fileobj, filename: str, content_type: str | None = None, bucket_name: str = MINIO_BUCKET) -> str:
    """Upload a file-like object, return URL."""
    data = fileobj.read()
    return upload_bytes_to_minio(data, filename=filename, content_type=content_type, bucket_name=bucket_name)
