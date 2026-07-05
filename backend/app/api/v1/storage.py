"""Storage API - handle file uploads to S3-compatible storage."""

import os
from uuid import uuid4

import boto3
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, get_db
from app.models.user_account import UserAccount
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/storage", tags=["Storage"])


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
        region_name="auto",
    )

@router.post("/upload", response_model=ApiResponse, summary="Upload file (Avatar/Certificate) to S3/R2")
async def upload_file(
    file: UploadFile = File(...),
    folder: str = Form(..., description="e.g. avatars, certificates"),
    current_user: UserAccount = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not all(
        [
            settings.S3_ENDPOINT_URL,
            settings.S3_ACCESS_KEY_ID,
            settings.S3_SECRET_ACCESS_KEY,
            settings.S3_BUCKET_NAME,
        ]
    ):
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "S3/R2 storage is not fully configured.")

    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No filename provided.")

    allowed_folders = ["avatars", "certificates"]
    if folder not in allowed_folders:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Folder must be one of {allowed_folders}")

    ext = os.path.splitext(file.filename)[1]
    safe_filename = f"{uuid4().hex}{ext}"
    
    # Path inside the bucket: avatars/user_id/uuid.ext
    s3_key = f"{folder}/{current_user.id}/{safe_filename}"
    content_type = file.content_type or "application/octet-stream"

    try:
        import asyncio
        # Upload using boto3 in a separate thread to not block the event loop
        await asyncio.to_thread(
            get_s3_client().upload_fileobj,
            file.file,
            settings.S3_BUCKET_NAME,
            s3_key,
            ExtraArgs={"ContentType": content_type}
        )
    except Exception as e:
        print(f"Error uploading to S3: {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Lỗi tải file lên máy chủ lưu trữ.")

    # Construct a public URL. R2 usually needs a custom public domain, while
    # Supabase Storage can still use the legacy public object URL format.
    if settings.S3_PUBLIC_BASE_URL:
        file_url = f"{settings.S3_PUBLIC_BASE_URL.rstrip('/')}/{s3_key}"
    elif settings.SUPABASE_URL:
        file_url = f"{settings.SUPABASE_URL.rstrip('/')}/storage/v1/object/public/{settings.S3_BUCKET_NAME}/{s3_key}"
    else:
        file_url = f"s3://{settings.S3_BUCKET_NAME}/{s3_key}"

    # If it's an avatar, update the user account directly
    if folder == "avatars":
        current_user.avatar_url = file_url
        await db.commit()

    return ApiResponse(
        data={"file_url": file_url},
        message="Upload thành công",
    )
