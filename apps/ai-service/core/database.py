from pymongo import MongoClient
from core.config import get_settings

_sync_client = None


def get_mongo_client() -> MongoClient:
    global _sync_client
    if _sync_client is None:
        settings = get_settings()
        _sync_client = MongoClient(
            settings.MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=5000,
            connect=False,
        )
    return _sync_client


def get_database():
    settings = get_settings()
    client = get_mongo_client()
    return client[settings.MONGODB_DB_NAME]

