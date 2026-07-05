"""Webhook endpoints for payment providers."""

import logging
import secrets

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_db
from app.models.payment import Payment
from app.services.payment_confirm import confirm_payment_success
from app.services.sepay import extract_transfer_content, verify_sepay_webhook

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Webhooks"])


def _auth_failed_response() -> JSONResponse:
    return JSONResponse(status_code=401, content={"success": False})


def _verify_sepay_api_key(request: Request) -> bool:
    expected = settings.SEPAY_WEBHOOK_API_KEY.strip()
    if not expected:
        return True

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Apikey "):
        return False
    return secrets.compare_digest(auth[7:], expected)


@router.post("/webhooks/sepay", summary="SePay IPN Webhook")
async def sepay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Receive SePay transfer events and acknowledge every non-auth case."""
    if not _verify_sepay_api_key(request):
        logger.warning("SePay webhook unauthorized")
        return _auth_failed_response()

    try:
        payload = await request.json()
    except Exception:
        logger.warning("SePay webhook invalid JSON")
        return {"success": True}

    logger.info("SePay webhook received: %s", payload)

    if payload.get("transferType") != "in":
        logger.info("SePay webhook ignored: not incoming")
        return {"success": True}

    transfer_content = extract_transfer_content(payload)
    if not transfer_content:
        logger.warning("SePay webhook ignored: cannot extract payment code from %s", payload)
        return {"success": True}

    result = await db.execute(
        select(Payment)
        .where(Payment.transfer_content == transfer_content)
        .where(Payment.status.in_(["CREATED", "PENDING"]))
    )
    payment = result.scalar_one_or_none()

    if not payment:
        logger.warning("SePay webhook ignored: payment not found for %s", transfer_content)
        return {"success": True}

    verification = verify_sepay_webhook(payload, payment)
    if not verification["valid"]:
        logger.warning(
            "SePay webhook ignored for payment %s: %s",
            payment.id,
            verification["error"],
        )
        return {"success": True}

    try:
        await confirm_payment_success(
            payment,
            db,
            sepay_transaction_id=verification.get("sepay_transaction_id"),
        )
        await db.commit()
        await db.refresh(payment)
        logger.info("SePay payment confirmed: %s", payment.id)
    except Exception:
        await db.rollback()
        logger.exception("SePay payment confirmation failed for payment %s", payment.id)

    return {"success": True}
