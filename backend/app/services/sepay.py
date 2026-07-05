"""SePay payment helpers."""

from datetime import datetime, timedelta
from decimal import Decimal
import re
from urllib.parse import quote

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.payment import Payment

BANK_CODES: dict[str, str] = {
    "MB": "MB",
    "MBBank": "MB",
    "MB Bank": "MB",
    "Techcombank": "TCB",
    "TCB": "TCB",
    "Vietcombank": "VCB",
    "VCB": "VCB",
    "BIDV": "BIDV",
    "Agribank": "AGR",
    "VietinBank": "CTG",
    "CTG": "CTG",
    "ACB": "ACB",
    "VPBank": "VPB",
    "VPB": "VPB",
    "TPBank": "TPB",
    "TPB": "TPB",
    "Sacombank": "STB",
    "STB": "STB",
    "HDBank": "HDB",
    "HDB": "HDB",
    "OCB": "OCB",
    "MSB": "MSB",
    "SHB": "SHB",
    "VIB": "VIB",
    "SeABank": "SEAB",
    "SEAB": "SEAB",
}

PAYMENT_CODE_RE = re.compile(r"\bLUMIN(\d+)\b", re.IGNORECASE)


def is_sepay_enabled() -> bool:
    return settings.PAYMENT_PROVIDER.lower() == "sepay"


def get_bank_code(bank_name: str) -> str:
    return BANK_CODES.get(bank_name, "MB")


def generate_transfer_content(payment_id: int) -> str:
    return f"LUMIN{payment_id}"


def extract_transfer_content(payload: dict) -> str | None:
    """Extract the LUMIN payment code from SePay payload fields."""
    for field in ("code", "content", "description"):
        value = payload.get(field)
        if not value:
            continue
        text = str(value).strip()
        match = PAYMENT_CODE_RE.search(text)
        if match:
            return f"LUMIN{match.group(1)}"
    return None


def calculate_qr_amount(db_amount: Decimal) -> int:
    if settings.SEPAY_TEST_AMOUNT > 0:
        return settings.SEPAY_TEST_AMOUNT

    divisor = max(settings.PAYMENT_AMOUNT_DIVISOR, 1)
    return max(int(db_amount) // divisor, 1)


def build_qr_url(
    bank_account: str,
    bank_name: str,
    amount: int,
    transfer_content: str,
    account_name: str,
) -> str:
    bank_code = get_bank_code(bank_name)
    return (
        f"https://img.vietqr.io/image/{bank_code}-{bank_account}-compact2.png"
        f"?amount={amount}"
        f"&addInfo={quote(transfer_content)}"
        f"&accountName={quote(account_name)}"
    )


def create_sepay_payment_data(payment_id: int, db_amount: Decimal) -> dict:
    if not settings.SEPAY_BANK_ACCOUNT or not settings.SEPAY_BANK_NAME:
        raise ValueError("SePay bank account is not configured.")

    transfer_content = generate_transfer_content(payment_id)
    qr_amount = calculate_qr_amount(db_amount)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.PAYMENT_EXPIRES_MINUTES)

    return {
        "transfer_content": transfer_content,
        "qr_data_url": build_qr_url(
            bank_account=settings.SEPAY_BANK_ACCOUNT,
            bank_name=settings.SEPAY_BANK_NAME,
            amount=qr_amount,
            transfer_content=transfer_content,
            account_name=settings.SEPAY_ACCOUNT_NAME,
        ),
        "qr_amount": qr_amount,
        "display_amount": int(db_amount),
        "expires_at": expires_at,
        "bank_info": get_bank_info(qr_amount, transfer_content),
        "is_test_mode": settings.SEPAY_TEST_AMOUNT > 0 or settings.PAYMENT_AMOUNT_DIVISOR > 1,
        "amount_divisor": settings.PAYMENT_AMOUNT_DIVISOR,
    }


def get_bank_info(amount: int, transfer_content: str | None) -> dict:
    return {
        "bank_name": settings.SEPAY_BANK_NAME,
        "bank_code": get_bank_code(settings.SEPAY_BANK_NAME),
        "account_number": settings.SEPAY_BANK_ACCOUNT,
        "account_name": settings.SEPAY_ACCOUNT_NAME,
        "amount": amount,
        "transfer_content": transfer_content,
    }


def get_payment_response_extras(payment: Payment) -> dict:
    transfer_content = payment.transfer_content or generate_transfer_content(payment.id)
    qr_amount = calculate_qr_amount(payment.amount)
    qr_data_url = payment.qr_data_url
    if not qr_data_url and settings.SEPAY_BANK_ACCOUNT and settings.SEPAY_BANK_NAME:
        qr_data_url = build_qr_url(
            bank_account=settings.SEPAY_BANK_ACCOUNT,
            bank_name=settings.SEPAY_BANK_NAME,
            amount=qr_amount,
            transfer_content=transfer_content,
            account_name=settings.SEPAY_ACCOUNT_NAME,
        )
    return {
        "qr_amount": qr_amount,
        "qr_data_url": qr_data_url,
        "display_amount": int(payment.amount),
        "bank_info": get_bank_info(qr_amount, transfer_content),
        "is_test_mode": settings.SEPAY_TEST_AMOUNT > 0 or settings.PAYMENT_AMOUNT_DIVISOR > 1,
        "amount_divisor": settings.PAYMENT_AMOUNT_DIVISOR,
    }


async def enrich_payment_with_sepay(payment: Payment, db: AsyncSession) -> None:
    if not is_sepay_enabled():
        return

    await db.flush()
    data = create_sepay_payment_data(payment.id, payment.amount)
    payment.provider = "SEPAY"
    payment.status = "PENDING"
    payment.transfer_content = data["transfer_content"]
    payment.qr_data_url = data["qr_data_url"]
    payment.expires_at = data["expires_at"]


def verify_sepay_webhook(payload: dict, payment: Payment) -> dict:
    transfer_type = payload.get("transferType", "")
    if transfer_type != "in":
        return {"valid": False, "error": "Ignored: not incoming transfer"}

    account_number = str(payload.get("accountNumber", "")).strip()
    if settings.SEPAY_BANK_ACCOUNT and account_number != settings.SEPAY_BANK_ACCOUNT:
        return {"valid": False, "error": f"Account mismatch: {account_number}"}

    transfer_content = extract_transfer_content(payload)
    if transfer_content != payment.transfer_content:
        return {
            "valid": False,
            "error": f"Content mismatch: expected {payment.transfer_content}, received {transfer_content}",
        }

    received_amount = Decimal(str(payload.get("transferAmount", 0)))
    expected_amount = Decimal(calculate_qr_amount(payment.amount))
    if received_amount < expected_amount * Decimal("0.99"):
        return {
            "valid": False,
            "error": f"Amount mismatch: expected {expected_amount}, received {received_amount}",
        }

    return {
        "valid": True,
        "error": None,
        "sepay_transaction_id": str(payload.get("id", "")),
    }
